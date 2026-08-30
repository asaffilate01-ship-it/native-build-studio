from __future__ import annotations

import base64
import json
import os
import re
import secrets
import shutil
import subprocess
import threading
import webbrowser
from dataclasses import asdict
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory
from werkzeug.datastructures import FileStorage
from werkzeug.exceptions import HTTPException

from .config import load_config
from .control_plane import SupabaseControlPlane
from .models import CAPABILITIES, App, ConfigError
from .onboarding import onboard_capacitor_app
from .planner import write_plan_pack
from .readiness import app_readiness
from .submission import (
    BOOLEAN_STORE_FIELDS,
    FLOAT_STORE_FIELDS,
    STORE_FIELDS,
    generate_store_package,
    list_store_assets,
    release_blockers,
    save_store_assets,
    update_store,
    write_capacitor_brief,
)

REPOSITORY_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$")
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class StudioError(ValueError):
    pass


class StudioServices:
    def __init__(self, config_path: Path):
        self.config_path = config_path.resolve()
        self.root = self.config_path.parent.parent
        self.settings_path = self.root / ".factory" / "studio.json"

    def _config(self):
        if not self.config_path.is_file():
            return None
        return load_config(self.config_path)

    def apps(self) -> list[dict[str, Any]]:
        config = self._config()
        if not config:
            return []
        result = []
        for app in config.apps:
            result.append(
                {
                    "slug": app.slug,
                    "suite": app.suite,
                    "app_role": app.app_role,
                    "source": asdict(app.source),
                    "native": asdict(app.native),
                    "assets": asdict(app.assets),
                    "store": asdict(app.store),
                    "store_assets": list_store_assets(self.root, app),
                    "checks": [
                        asdict(check)
                        for check in app_readiness(app, platform="all", submit=True)
                    ],
                }
            )
        return result

    def get_app(self, slug: str) -> App:
        config = self._config()
        if not config:
            raise StudioError("No apps have been configured yet")
        return config.get_app(slug)

    def settings(self) -> dict[str, str]:
        if not self.settings_path.is_file():
            return {}
        try:
            data = json.loads(self.settings_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return {str(key): str(value) for key, value in data.items() if value}

    def save_settings(self, **values: str) -> None:
        current = self.settings()
        current.update({key: value for key, value in values.items() if value})
        self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        self.settings_path.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")

    def _asset_path(self, slug: str, name: str) -> Path:
        if not SLUG_RE.fullmatch(slug):
            raise StudioError("Invalid app slug")
        return self.root / "assets" / slug / name

    def save_asset(self, upload: FileStorage | None, slug: str, name: str) -> Path | None:
        if upload is None or not upload.filename:
            return None
        allowed = {
            "icon.png": ".png",
            "splash.png": ".png",
            "google-services.json": ".json",
        }
        suffix = Path(upload.filename).suffix.lower()
        if name not in allowed or suffix != allowed[name]:
            raise StudioError(f"{name} must be a {allowed.get(name, 'supported')} file")
        destination = self._asset_path(slug, name)
        destination.parent.mkdir(parents=True, exist_ok=True)
        upload.save(destination)
        return destination

    def onboard(self) -> str:
        form = request.form
        slug = form.get("slug", "").strip()
        replace = form.get("replace") == "true"
        existing = None
        if replace:
            try:
                existing = self.get_app(slug)
            except (ConfigError, StudioError):
                existing = None

        icon = self.save_asset(request.files.get("icon"), slug, "icon.png")
        splash = self.save_asset(request.files.get("splash"), slug, "splash.png")
        firebase = self.save_asset(
            request.files.get("google_services_json"), slug, "google-services.json"
        )
        if existing:
            icon = icon or Path(existing.assets.icon)
            splash = splash or Path(existing.assets.splash)
            firebase = firebase or (
                Path(existing.assets.google_services_json)
                if existing.assets.google_services_json
                else None
            )
        if not icon or not splash:
            raise StudioError("Icon and splash PNG files are required")

        capabilities = tuple(
            item for item in form.getlist("capabilities") if item in CAPABILITIES
        )
        store = asdict(existing.store) if existing else {}
        store.update({
            key: form.get(key, "").strip()
            for key in (
                "brand_name",
                "legal_owner",
                "support_url",
                "privacy_url",
                "account_deletion_url",
                "apple_team_id",
                "apple_app_id",
                "google_developer_name",
                "play_track",
            )
            if form.get(key, "").strip()
        })
        onboard_capacitor_app(
            self.config_path,
            slug=slug,
            display_name=form.get("display_name", "").strip(),
            repo=form.get("repo", "").strip(),
            app_id=form.get("app_id", "").strip(),
            icon=icon,
            splash=splash,
            runner=form.get("runner", "github-macos"),
            package_manager=form.get("package_manager", "bun"),
            source_ref=form.get("source_ref", "main").strip() or "main",
            web_dir=form.get("web_dir", "dist").strip() or "dist",
            ios_package_manager=form.get("ios_package_manager", "spm"),
            capabilities=capabilities,
            google_services_json=firebase,
            suite=form.get("suite", "").strip(),
            app_role=form.get("app_role", "main").strip() or "main",
            store=store,
            replace=replace,
        )
        return slug

    @staticmethod
    def _validate_repo(repository: str) -> str:
        value = repository.removeprefix("https://github.com/").removesuffix(".git")
        if not REPOSITORY_RE.fullmatch(value):
            raise StudioError("GitHub repository must be owner/repository")
        return value

    @staticmethod
    def _gh(
        arguments: list[str], *, input_value: str | None = None, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        if not shutil.which("gh"):
            raise StudioError("Install GitHub CLI and run: gh auth login")
        result = subprocess.run(
            ["gh", *arguments],
            input=input_value,
            text=True,
            capture_output=True,
            timeout=90,
            check=False,
        )
        if check and result.returncode:
            detail = result.stderr.strip() or "GitHub CLI command failed"
            raise StudioError(detail[:800])
        return result

    def github_status(self) -> dict[str, Any]:
        available = bool(shutil.which("gh"))
        authenticated = False
        if available:
            authenticated = self._gh(["auth", "status"], check=False).returncode == 0
        return {
            "installed": available,
            "authenticated": authenticated,
            "factory_repo": self.settings().get("factory_repo", ""),
        }

    @staticmethod
    def control_plane_status() -> dict[str, Any]:
        configured = SupabaseControlPlane.from_environment() is not None
        return {
            "configured": configured,
            "url": os.getenv("SUPABASE_URL", "") if configured else "",
            "openai_configured": bool(
                os.getenv("OPENAI_API_KEY") and os.getenv("OPENAI_MODEL")
            ),
        }

    def sync_control_plane(self) -> int:
        client = SupabaseControlPlane.from_environment(required=True)
        config = self._config()
        if not config:
            raise StudioError("Configure at least one app before syncing")
        for app in config.apps:
            client.upsert_app(app)
        return len(config.apps)

    def create_plan(self, slug: str, goals: str, call_ai: bool) -> dict[str, str]:
        app = self.get_app(slug)
        prompt_path, plan_path, content = write_plan_pack(
            self.root, app, goals=goals, call_ai=call_ai
        )
        client = SupabaseControlPlane.from_environment()
        if client:
            client.upsert_app(app)
            client.save_plan(
                slug,
                prompt=prompt_path.read_text(encoding="utf-8"),
                plan=content if call_ai else "",
                status="draft" if call_ai else "prompt_ready",
            )
        return {
            "prompt_path": str(prompt_path),
            "plan_path": str(plan_path) if plan_path else "",
        }

    def _git(self, arguments: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
        if not shutil.which("git"):
            raise StudioError("Install Git for Windows before publishing the factory")
        result = subprocess.run(
            ["git", *arguments],
            cwd=self.root,
            text=True,
            capture_output=True,
            timeout=90,
            check=False,
        )
        if check and result.returncode:
            detail = result.stderr.strip() or result.stdout.strip() or "Git command failed"
            raise StudioError(detail[:800])
        return result

    def publish_factory(
        self, repository: str, message: str, *, create_if_missing: bool = False
    ) -> str:
        repo = self._validate_repo(repository)
        exists = self._gh(
            ["repo", "view", repo, "--json", "nameWithOwner"], check=False
        )
        if exists.returncode and create_if_missing:
            self._gh(
                [
                    "repo",
                    "create",
                    repo,
                    "--private",
                    "--description",
                    "Native application build factory",
                ]
            )
        elif exists.returncode:
            raise StudioError("Factory repository was not found or is not accessible")
        if not (self.root / ".git").is_dir():
            self._git(["init", "--initial-branch", "main"])
        remote = self._git(["remote", "get-url", "origin"], check=False)
        expected_remote = f"https://github.com/{repo}.git"
        if remote.returncode:
            self._git(["remote", "add", "origin", expected_remote])
        elif remote.stdout.strip().removesuffix(".git") != expected_remote.removesuffix(".git"):
            raise StudioError(
                f"Git origin is {remote.stdout.strip()}, not the selected {expected_remote}"
            )

        safe_paths = [
            ".github",
            ".gitignore",
            "assets",
            "CHANGELOG.md",
            "config",
            "docs",
            "pyproject.toml",
            "README.md",
            "scripts",
            "src",
            "START_HERE.md",
            "START_NATIVE_FACTORY_STUDIO.cmd",
            "templates",
            "tests",
        ]
        existing = [item for item in safe_paths if (self.root / item).exists()]
        self._git(["add", "--", *existing])
        staged = self._git(["diff", "--cached", "--name-only"]).stdout.splitlines()
        unsafe = self._unsafe_staged_files(staged)
        if unsafe:
            self._git(["restore", "--staged", "--", *unsafe], check=False)
            raise StudioError("Refused credential-like files: " + ", ".join(unsafe))
        if not staged:
            self.save_settings(factory_repo=repo)
            return "No factory changes needed committing"

        identity = self._git(["config", "user.email"], check=False)
        if identity.returncode or not identity.stdout.strip():
            login = self._gh(["api", "user", "--jq", ".login"]).stdout.strip()
            self._git(["config", "user.name", login or "Native Factory Operator"])
            self._git(
                ["config", "user.email", f"{login or 'native-factory'}@users.noreply.github.com"]
            )
        clean_message = " ".join(message.split())[:120] or "Update native factory configuration"
        self._git(["commit", "--message", clean_message])
        self._git(["push", "--set-upstream", "origin", "HEAD:main"])
        self.save_settings(factory_repo=repo)
        return f"Committed and pushed {len(staged)} factory file(s)"

    @staticmethod
    def _unsafe_staged_files(staged: list[str]) -> list[str]:
        prohibited = (
            ".p8",
            ".p12",
            ".jks",
            ".keystore",
            ".mobileprovision",
            ".env",
        )
        unsafe = [name for name in staged if name.lower().endswith(prohibited)]
        unsafe.extend(
            name
            for name in staged
            if "service-account" in name.lower() or "authkey_" in name.lower()
        )
        return sorted(set(unsafe))

    def configure_credentials(self, slug: str) -> list[str]:
        self.get_app(slug)
        repository = self._validate_repo(request.form.get("factory_repo", ""))
        self.save_settings(factory_repo=repository)
        environments = [slug]
        if request.form.get("configure_production") == "true":
            environments.append(f"{slug}-production")
        for environment in environments:
            self._gh(
                ["api", "--method", "PUT", f"repos/{repository}/environments/{environment}"]
            )

        secret_values = {
            "APPLE_KEY_ID": request.form.get("apple_key_id", ""),
            "APPLE_ISSUER_ID": request.form.get("apple_issuer_id", ""),
            "MATCH_GIT_URL": request.form.get("match_git_url", ""),
            "MATCH_REPO_TOKEN": request.form.get("match_repo_token", ""),
            "MATCH_PASSWORD": request.form.get("match_password", ""),
            "ANDROID_KEYSTORE_PASSWORD": request.form.get("android_keystore_password", ""),
            "ANDROID_KEY_ALIAS": request.form.get("android_key_alias", ""),
            "ANDROID_KEY_PASSWORD": request.form.get("android_key_password", ""),
            "SOURCE_REPO_TOKEN": request.form.get("source_repo_token", ""),
            "REVIEW_USERNAME": request.form.get("review_username", ""),
            "REVIEW_PASSWORD": request.form.get("review_password", ""),
            "IONIC_TOKEN": request.form.get("ionic_token", ""),
            "SUPABASE_URL": request.form.get("callback_supabase_url", ""),
            "SUPABASE_SERVICE_ROLE_KEY": request.form.get(
                "callback_supabase_service_role_key", ""
            ),
        }
        secret_files = {
            "APPLE_PRIVATE_KEY_B64": self._validated_secret_file(
                request.files.get("apple_private_key"), (".p8",), "Apple private key"
            ),
            "ANDROID_KEYSTORE_B64": self._validated_secret_file(
                request.files.get("android_keystore"),
                (".jks", ".keystore"),
                "Android upload keystore",
            ),
            "GOOGLE_SERVICE_ACCOUNT_B64": self._validated_secret_file(
                request.files.get("google_service_account"),
                (".json",),
                "Google service account",
            ),
        }
        configured: list[str] = []
        for name, value in secret_values.items():
            if value:
                for environment in environments:
                    self._gh(
                        [
                            "secret", "set", name, "--env", environment,
                            "--repo", repository,
                        ],
                        input_value=value,
                    )
                configured.append(name)
        for name, content in secret_files.items():
            if content is not None:
                encoded = base64.b64encode(content).decode("ascii")
                for environment in environments:
                    self._gh(
                        [
                            "secret", "set", name, "--env", environment,
                            "--repo", repository,
                        ],
                        input_value=encoded,
                    )
                configured.append(name)
        for environment in environments:
            self._gh(
                [
                    "variable", "set", "MATCH_READONLY", "--env", environment,
                    "--repo", repository, "--body",
                    request.form.get("match_readonly", "true"),
                ]
            )
        return configured

    @staticmethod
    def _validated_secret_file(
        upload: FileStorage | None, suffixes: tuple[str, ...], label: str
    ) -> bytes | None:
        if upload is None or not upload.filename:
            return None
        if Path(upload.filename).suffix.lower() not in suffixes:
            raise StudioError(f"{label} must use: {', '.join(suffixes)}")
        content = upload.read()
        if not content:
            raise StudioError(f"{label} is empty")
        if label == "Apple private key" and b"PRIVATE KEY" not in content:
            raise StudioError("Apple private key does not look like a .p8 key")
        if label == "Google service account":
            try:
                values = json.loads(content)
            except json.JSONDecodeError as exc:
                raise StudioError("Google service account is not valid JSON") from exc
            if not isinstance(values, dict) or not values.get("client_email"):
                raise StudioError("Google service account JSON is missing client_email")
        return content

    def trigger_build(
        self, slug: str, platform: str, submit: bool, upload_metadata: bool = False
    ) -> None:
        self.get_app(slug)
        if platform not in ("ios", "android", "all"):
            raise StudioError("Invalid platform")
        repository = self._validate_repo(
            request.json.get("factory_repo", "") or self.settings().get("factory_repo", "")
        )
        self.save_settings(factory_repo=repository)
        self._gh(
            [
                "workflow",
                "run",
                "build-app.yml",
                "--repo",
                repository,
                "--field",
                f"app_slug={slug}",
                "--field",
                f"platform={platform}",
                "--field",
                f"submit={'true' if submit else 'false'}",
                "--field",
                f"metadata={'true' if upload_metadata else 'false'}",
            ]
        )

    def trigger_release(self, slug: str, payload: dict[str, Any]) -> None:
        app = self.get_app(slug)
        platform = str(payload.get("platform", ""))
        build_number = str(payload.get("tested_build_number", "")).strip()
        source_sha = str(payload.get("source_sha", "")).strip()
        qa_notes = str(payload.get("qa_notes", "")).strip()
        confirmation = str(payload.get("confirmation", "")).strip()
        if platform not in ("ios", "android"):
            raise StudioError("Choose Apple iOS or Google Android")
        if not build_number.isdigit() or int(build_number) < 1:
            raise StudioError("Enter the exact positive tested build number/version code")
        if not re.fullmatch(r"[0-9a-fA-F]{7,40}", source_sha):
            raise StudioError("Enter the tested Lovable/Git source commit SHA")
        if len(qa_notes) < 20:
            raise StudioError("Add meaningful real-device QA notes (at least 20 characters)")
        if confirmation != f"SUBMIT {slug}":
            raise StudioError(f"Confirmation must be exactly: SUBMIT {slug}")
        blockers = release_blockers(self.root, app, platform)
        if blockers:
            raise StudioError("Release is blocked: " + "; ".join(blockers))
        repository = self._validate_repo(
            str(payload.get("factory_repo", ""))
            or self.settings().get("factory_repo", "")
        )
        self.save_settings(factory_repo=repository)
        self._gh(
            [
                "workflow", "run", "promote-approved-build.yml", "--repo", repository,
                "--field", f"app_slug={slug}", "--field", f"platform={platform}",
                "--field", f"tested_build_number={build_number}",
                "--field", f"source_sha={source_sha}", "--field", f"qa_notes={qa_notes}",
                "--field", f"confirmation={confirmation}",
            ]
        )

    def save_store(self, slug: str, values: dict[str, Any]) -> None:
        self.get_app(slug)
        cleaned: dict[str, Any] = {}
        for key in STORE_FIELDS:
            if key in values:
                cleaned[key] = (
                    bool(values[key])
                    if key in BOOLEAN_STORE_FIELDS
                    else float(values[key])
                    if key in FLOAT_STORE_FIELDS
                    else values[key]
                )
        update_store(self.config_path, slug, cleaned)

    def save_store_asset_uploads(self, slug: str, kind: str) -> list[Path]:
        app = self.get_app(slug)
        return save_store_assets(self.root, app, kind, request.files.getlist("files"))

    def runs(self, repository: str) -> list[dict[str, Any]]:
        repo = self._validate_repo(repository or self.settings().get("factory_repo", ""))
        result = self._gh(
            [
                "run",
                "list",
                "--repo",
                repo,
                "--workflow",
                "build-app.yml",
                "--limit",
                "20",
                "--json",
                "databaseId,displayTitle,status,conclusion,createdAt,event,headBranch,url",
            ]
        )
        return json.loads(result.stdout or "[]")

    def download_run(self, run_id: int, repository: str) -> Path:
        repo = self._validate_repo(repository or self.settings().get("factory_repo", ""))
        destination = self.root / ".factory" / "downloads" / str(run_id)
        destination.mkdir(parents=True, exist_ok=True)
        self._gh(
            [
                "run",
                "download",
                str(run_id),
                "--repo",
                repo,
                "--dir",
                str(destination),
            ]
        )
        return destination

    @staticmethod
    def _source_repository(app: App) -> str:
        value = app.source.repo.removeprefix("https://github.com/").removesuffix(".git")
        if not REPOSITORY_RE.fullmatch(value):
            raise StudioError("The source must be a GitHub HTTPS repository")
        return value

    @staticmethod
    def bridge_workflow(
        factory_repo: str,
        slugs: list[str],
        branch: str,
        install_command: str = "bun install --frozen-lockfile",
        build_command: str = "bun run build",
        auto_submit: bool = True,
        upload_metadata: bool = False,
    ) -> str:
        slug_lines = " ".join(slugs)
        return f'''name: Update native apps

on:
  push:
    branches: [{json.dumps(branch)}]
  workflow_dispatch:

jobs:
  verify-and-dispatch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - uses: oven-sh/setup-bun@v2
      - run: corepack enable
      - run: {json.dumps(install_command)}
      - run: {json.dumps(build_command)}
      - name: Queue native builds
        env:
          GH_TOKEN: ${{{{ secrets.FACTORY_DISPATCH_TOKEN }}}}
          FACTORY_REPO: {factory_repo}
          APP_SLUGS: "{slug_lines}"
        run: |
          for app_slug in $APP_SLUGS; do
            gh api --method POST "repos/$FACTORY_REPO/dispatches" \\
              --field event_type=lovable-app-updated \\
	              --raw-field "client_payload[app_slug]=$app_slug" \\
	              --raw-field "client_payload[platform]=all" \\
	              --raw-field "client_payload[source_sha]=$GITHUB_SHA" \\
	              --raw-field "client_payload[submit]={'true' if auto_submit else 'false'}" \\
	              --raw-field "client_payload[metadata]={'true' if upload_metadata else 'false'}"
          done
'''

    def install_bridge(self, source_slug: str, slugs: list[str]) -> str:
        source_app = self.get_app(source_slug)
        source_repository = self._source_repository(source_app)
        factory_repository = self._validate_repo(request.form.get("factory_repo", ""))
        selected = [self.get_app(slug) for slug in slugs]
        if any(self._source_repository(app) != source_repository for app in selected):
            raise StudioError("Every selected app must use the same source repository")
        dispatch_token = request.form.get("dispatch_token", "")
        if not dispatch_token:
            raise StudioError("A restricted factory dispatch token is required")
        self._gh(
            ["secret", "set", "FACTORY_DISPATCH_TOKEN", "--repo", source_repository],
            input_value=dispatch_token,
        )
        branch = source_app.source.ref
        content = self.bridge_workflow(
            factory_repository,
            slugs,
            branch,
            source_app.source.install_command,
            source_app.source.build_command,
            request.form.get("auto_submit") == "true",
            request.form.get("upload_metadata") == "true",
        )
        endpoint = (
            f"repos/{source_repository}/contents/.github/workflows/"
            "native-factory-bridge.yml"
        )
        current = self._gh(["api", endpoint, "--jq", ".sha"], check=False)
        arguments = [
            "api",
            "--method",
            "PUT",
            endpoint,
            "--field",
            "message=Connect Lovable updates to native factory",
            "--field",
            f"content={base64.b64encode(content.encode()).decode('ascii')}",
        ]
        if current.returncode == 0 and current.stdout.strip():
            arguments.extend(["--field", f"sha={current.stdout.strip()}"])
        self._gh(arguments)
        self.save_settings(factory_repo=factory_repository)
        return source_repository


def create_studio_app(config_path: Path) -> Flask:
    static_dir = Path(__file__).resolve().parent / "studio_static"
    app = Flask(__name__, static_folder=str(static_dir), static_url_path="/static")
    app.config.update(MAX_CONTENT_LENGTH=100 * 1024 * 1024)
    csrf_token = secrets.token_urlsafe(32)
    services = StudioServices(config_path)

    @app.before_request
    def protect_mutations():
        if (
            request.method in MUTATING_METHODS
            and request.headers.get("X-Factory-CSRF") != csrf_token
        ):
            return jsonify({"ok": False, "error": "Invalid local session token"}), 403
        return None

    @app.after_request
    def secure_headers(response: Response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data: blob:; "
            "style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
        )
        return response

    @app.errorhandler(Exception)
    def handle_error(error: Exception):
        if isinstance(error, HTTPException):
            return jsonify({"ok": False, "error": error.description}), error.code
        if isinstance(error, (StudioError, ConfigError, OSError, ValueError)):
            return jsonify({"ok": False, "error": str(error)}), 400
        return jsonify({"ok": False, "error": "Unexpected local factory error"}), 500

    @app.get("/")
    def index():
        return send_from_directory(static_dir, "index.html")

    @app.get("/api/state")
    def state():
        return jsonify(
            {
                "ok": True,
                "csrf": csrf_token,
                "apps": services.apps(),
                "github": services.github_status(),
                "control_plane": services.control_plane_status(),
                "capabilities": sorted(CAPABILITIES),
                "config_path": str(services.config_path),
            }
        )

    @app.post("/api/apps")
    def add_app():
        slug = services.onboard()
        return jsonify({"ok": True, "slug": slug, "apps": services.apps()})

    @app.post("/api/factory/publish")
    def publish_factory():
        payload = request.get_json(silent=True) or {}
        message = services.publish_factory(
            str(payload.get("factory_repo", "")),
            str(payload.get("message", "")),
            create_if_missing=bool(payload.get("create_if_missing", False)),
        )
        return jsonify({"ok": True, "message": message})

    @app.post("/api/control-plane/sync")
    def sync_control_plane():
        count = services.sync_control_plane()
        return jsonify({"ok": True, "message": f"Synced {count} app(s) to Supabase"})

    @app.post("/api/apps/<slug>/credentials")
    def credentials(slug: str):
        configured = services.configure_credentials(slug)
        return jsonify({"ok": True, "configured": configured})

    @app.post("/api/apps/<slug>/build")
    def build(slug: str):
        payload = request.get_json(silent=True) or {}
        services.trigger_build(
            slug,
            str(payload.get("platform", "all")),
            bool(payload.get("submit", False)),
            bool(payload.get("metadata", False)),
        )
        return jsonify({"ok": True, "message": "Build queued in GitHub Actions"})

    @app.post("/api/apps/<slug>/release")
    def release(slug: str):
        services.trigger_release(slug, request.get_json(silent=True) or {})
        return jsonify(
            {"ok": True, "message": "Tested build queued for protected store submission"}
        )

    @app.get("/api/runs")
    def runs():
        return jsonify({"ok": True, "runs": services.runs(request.args.get("repo", ""))})

    @app.post("/api/runs/<int:run_id>/download")
    def download(run_id: int):
        payload = request.get_json(silent=True) or {}
        destination = services.download_run(run_id, str(payload.get("factory_repo", "")))
        return jsonify({"ok": True, "path": str(destination)})

    @app.post("/api/bridge")
    def bridge():
        slugs = request.form.getlist("slugs")
        if not slugs:
            raise StudioError("Select at least one app for the bridge")
        source = services.install_bridge(request.form.get("source_slug", ""), slugs)
        return jsonify({"ok": True, "source_repo": source})

    @app.patch("/api/apps/<slug>/store")
    def store(slug: str):
        services.save_store(slug, request.get_json(silent=True) or {})
        return jsonify({"ok": True, "apps": services.apps()})

    @app.post("/api/apps/<slug>/store-assets/<kind>")
    def store_assets(slug: str, kind: str):
        saved = services.save_store_asset_uploads(slug, kind)
        return jsonify({"ok": True, "saved": [item.name for item in saved], "apps": services.apps()})

    @app.post("/api/apps/<slug>/brief")
    def brief(slug: str):
        path = write_capacitor_brief(services.root, services.get_app(slug))
        return jsonify({"ok": True, "path": str(path)})

    @app.post("/api/apps/<slug>/plan")
    def plan(slug: str):
        payload = request.get_json(silent=True) or {}
        result = services.create_plan(
            slug, str(payload.get("goals", "")), bool(payload.get("call_ai", False))
        )
        return jsonify({"ok": True, **result})

    @app.post("/api/apps/<slug>/store-package")
    def store_package(slug: str):
        path = generate_store_package(services.root, services.get_app(slug))
        return jsonify({"ok": True, "path": str(path)})

    return app


def run_studio(config_path: Path, *, host: str = "127.0.0.1", port: int = 8787) -> None:
    from waitress import serve

    if host not in ("127.0.0.1", "localhost"):
        raise StudioError("Studio is local-only; use host 127.0.0.1")
    app = create_studio_app(config_path)
    url = f"http://127.0.0.1:{port}"
    print(f"Native Factory Studio: {url}")
    print("Keep this window open. Press Ctrl+C to stop.")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    serve(app, host="127.0.0.1", port=port, threads=4)
