from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

import yaml

from .models import App, ConfigError

PACKAGE_COMMANDS = {
    "bun": ("bun install --frozen-lockfile", "bun run build"),
    "npm": ("npm ci", "npm run build"),
    "pnpm": ("pnpm install --frozen-lockfile", "pnpm run build"),
    "yarn": ("yarn install --frozen-lockfile", "yarn build"),
}

STANDARD_CREDENTIAL_REFS = {
    "apple_key_id_env": "APPLE_KEY_ID",
    "apple_issuer_id_env": "APPLE_ISSUER_ID",
    "apple_private_key_b64_env": "APPLE_PRIVATE_KEY_B64",
    "match_password_env": "MATCH_PASSWORD",
    "google_service_account_b64_env": "GOOGLE_SERVICE_ACCOUNT_B64",
    "android_keystore_b64_env": "ANDROID_KEYSTORE_B64",
    "android_keystore_password_env": "ANDROID_KEYSTORE_PASSWORD",
    "android_key_alias_env": "ANDROID_KEY_ALIAS",
    "android_key_password_env": "ANDROID_KEY_PASSWORD",
}


def onboard_capacitor_app(
    config_path: Path,
    *,
    slug: str,
    display_name: str,
    repo: str,
    app_id: str,
    icon: Path,
    splash: Path,
    runner: str = "github-macos",
    package_manager: str = "bun",
    source_ref: str = "main",
    web_dir: str = "dist",
    ios_package_manager: str = "spm",
    capabilities: tuple[str, ...] = (),
    google_services_json: Path | None = None,
    suite: str = "",
    app_role: str = "main",
    store: dict[str, str] | None = None,
    replace: bool = False,
) -> None:
    if package_manager not in PACKAGE_COMMANDS:
        raise ConfigError(f"Unsupported package manager: {package_manager}")
    install_command, build_command = PACKAGE_COMMANDS[package_manager]
    base = config_path.parent.resolve()

    repo_value = repo
    if repo.startswith(("./", "../", "/")):
        repo_value = os.path.relpath(Path(repo).expanduser().resolve(), base)

    def relative_or_original(value: Path) -> str:
        absolute = value.expanduser().resolve()
        return os.path.relpath(absolute, base)

    record: dict[str, Any] = {
        "slug": slug,
        "suite": suite or slug,
        "app_role": app_role,
        "source": {
            "repo": repo_value,
            "ref": source_ref,
            "package_manager": package_manager,
            "install_command": install_command,
            "build_command": build_command,
            "web_dir": web_dir,
        },
        "native": {
            "engine": "capacitor",
            "runner": runner,
            "display_name": display_name,
            "ios_bundle_id": app_id,
            "android_package": app_id,
            "version": "1.0.0",
            "build_number": 1,
            "ios_package_manager": ios_package_manager,
            "capabilities": list(dict.fromkeys(capabilities)),
            "embed_web_assets": True,
        },
        "assets": {
            "icon": relative_or_original(icon),
            "splash": relative_or_original(splash),
        },
        "credentials": STANDARD_CREDENTIAL_REFS.copy(),
        "store": store or {},
    }
    if google_services_json:
        record["assets"]["google_services_json"] = relative_or_original(
            google_services_json
        )
    App.from_dict(record)

    if config_path.exists():
        try:
            data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            raise ConfigError(f"Invalid YAML in {config_path}: {exc}") from exc
        if not isinstance(data, dict) or not isinstance(data.get("apps"), list):
            raise ConfigError("Existing config requires an apps list")
    else:
        data = {"work_dir": "../.factory/work", "apps": []}

    existing_index = next(
        (index for index, item in enumerate(data["apps"]) if item.get("slug") == slug),
        None,
    )
    if existing_index is not None and not replace:
        raise ConfigError(f"App slug already exists: {slug}")
    if any(
        item.get("slug") != slug
        and (
            item.get("native", {}).get("ios_bundle_id") == app_id
            or item.get("native", {}).get("android_package") == app_id
        )
        for item in data["apps"]
    ):
        raise ConfigError(f"App identifier already exists: {app_id}")

    if existing_index is None:
        data["apps"].append(record)
    else:
        data["apps"][existing_index] = record
    config_path.parent.mkdir(parents=True, exist_ok=True)
    content = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=config_path.parent, delete=False
    ) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    temporary.replace(config_path)
