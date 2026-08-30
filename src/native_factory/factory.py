from __future__ import annotations

import base64
import json
import os
import plistlib
import shutil
import tempfile
from pathlib import Path

from .models import App, ConfigError, FactoryConfig, Platform
from .process import ProcessRunner
from .submission import copy_store_package

CAPABILITY_PLUGINS = {
    "browser": "@capacitor/browser@latest-8",
    "camera": "@capacitor/camera@latest-8",
    "filesystem": "@capacitor/filesystem@latest-8",
    "network": "@capacitor/network@latest-8",
    "preferences": "@capacitor/preferences@latest-8",
    "push": "@capacitor/push-notifications@latest-8",
    "share": "@capacitor/share@latest-8",
}


class NativeFactory:
    def __init__(self, config: FactoryConfig, template_root: Path, runner: ProcessRunner):
        self.config = config
        self.template_root = template_root
        self.runner = runner

    @staticmethod
    def _build_number(app: App) -> int:
        ci_run = os.getenv("FACTORY_CI_RUN_NUMBER")
        if not ci_run:
            return app.native.build_number
        try:
            value = int(ci_run)
        except ValueError as exc:
            raise ConfigError("FACTORY_CI_RUN_NUMBER must be an integer") from exc
        if value < 1:
            raise ConfigError("FACTORY_CI_RUN_NUMBER must be positive")
        return app.native.build_number + value

    def build(
        self,
        slug: str,
        platform: Platform = "all",
        *,
        submit: bool = False,
        upload_metadata: bool = False,
    ) -> list[str]:
        app = self.config.get_app(slug)
        if app.native.engine == "capacitor":
            self._build_capacitor(
                app, platform, submit=submit, upload_metadata=upload_metadata
            )
        else:
            self._build_expo(app, platform, submit=submit)
        return self.runner.commands

    def check_web(self, slug: str) -> Path:
        """Build and validate the web bundle without invoking native toolchains."""
        app = self.config.get_app(slug)
        source_dir = self.config.work_dir / app.slug / "source"
        self._checkout(app, source_dir)
        web_dir = self._build_web(app, source_dir)
        if not self.runner.dry_run:
            index = web_dir / "index.html"
            if not index.is_file():
                raise ConfigError(f"Web bundle is missing {index}")
            html = index.read_text(encoding="utf-8", errors="replace").lower()
            if "<head" not in html:
                raise ConfigError("dist/index.html requires a <head> for Capacitor injection")
        return web_dir

    def _checkout(self, app: App, destination: Path) -> None:
        if destination.exists() and not self.runner.dry_run:
            shutil.rmtree(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if app.source.repo.startswith(("./", "../", "/")):
            source = Path(app.source.repo).expanduser().resolve()
            if not source.exists():
                raise ConfigError(f"Local source does not exist: {source}")
            if not self.runner.dry_run:
                shutil.copytree(
                    source,
                    destination,
                    ignore=shutil.ignore_patterns("node_modules", ".git"),
                )
        else:
            clone_env: dict[str, str] = {}
            source_token = os.getenv("SOURCE_REPO_TOKEN")
            if source_token and app.source.repo.startswith("https://github.com/"):
                authorization = base64.b64encode(
                    f"x-access-token:{source_token}".encode()
                ).decode("ascii")
                clone_env = {
                    "GIT_CONFIG_COUNT": "1",
                    "GIT_CONFIG_KEY_0": "http.https://github.com/.extraheader",
                    "GIT_CONFIG_VALUE_0": f"AUTHORIZATION: basic {authorization}",
                }
            source_sha = os.getenv("FACTORY_SOURCE_SHA", "").strip()
            if source_sha:
                if not 7 <= len(source_sha) <= 40 or not all(
                    character in "0123456789abcdefABCDEF" for character in source_sha
                ):
                    raise ConfigError("FACTORY_SOURCE_SHA must be a Git commit SHA")
                self.runner.run(
                    [
                        "git",
                        "clone",
                        "--filter=blob:none",
                        "--no-checkout",
                        app.source.repo,
                        str(destination),
                    ],
                    cwd=destination.parent,
                    env=clone_env,
                )
                self.runner.run(
                    ["git", "fetch", "--depth", "1", "origin", source_sha],
                    cwd=destination,
                    env=clone_env,
                )
                self.runner.run(
                    ["git", "checkout", "--detach", source_sha],
                    cwd=destination,
                    env=clone_env,
                )
            else:
                self.runner.run(
                    [
                        "git",
                        "clone",
                        "--depth",
                        "1",
                        "--branch",
                        app.source.ref,
                        app.source.repo,
                        str(destination),
                    ],
                    cwd=destination.parent,
                    env=clone_env,
                )

    def _build_web(self, app: App, source_dir: Path) -> Path:
        self.runner.run(app.source.install_command, cwd=source_dir, shell=True)
        role_env = {
            "FACTORY_APP_SLUG": app.slug,
            "FACTORY_SUITE": app.suite,
            "FACTORY_APP_ROLE": app.app_role,
            "VITE_NATIVE_APP_SLUG": app.slug,
            "VITE_NATIVE_SUITE": app.suite,
            "VITE_NATIVE_APP_ROLE": app.app_role,
            "VITE_NATIVE_APP_ID": app.native.ios_bundle_id,
        }
        self.runner.run(
            app.source.build_command,
            cwd=source_dir,
            env=role_env,
            shell=True,
        )
        web_dir = source_dir / app.source.web_dir
        if not self.runner.dry_run and not web_dir.is_dir():
            raise ConfigError(f"Build did not create {web_dir}")
        if not self.runner.dry_run:
            self._inject_runtime_identity(app, web_dir)
        return web_dir

    @staticmethod
    def _inject_runtime_identity(app: App, web_dir: Path) -> None:
        values = {
            "slug": app.slug,
            "suite": app.suite,
            "role": app.app_role,
            "appId": app.native.ios_bundle_id,
            "displayName": app.native.display_name,
        }
        encoded = json.dumps(values, separators=(",", ":")).replace("<", "\\u003c")
        runtime_name = "native-factory-runtime.js"
        (web_dir / runtime_name).write_text(
            f"window.__NATIVE_FACTORY__={encoded};\n", encoding="utf-8"
        )
        index_path = web_dir / "index.html"
        if not index_path.is_file():
            raise ConfigError(f"Web bundle is missing {index_path}")
        html = index_path.read_text(encoding="utf-8")
        marker = f'<script src="./{runtime_name}"></script>'
        if marker not in html:
            location = html.lower().find("</head>")
            if location < 0:
                raise ConfigError("dist/index.html requires a closing </head> element")
            html = html[:location] + marker + "\n" + html[location:]
            index_path.write_text(html, encoding="utf-8")

    def _build_capacitor(
        self, app: App, platform: Platform, *, submit: bool, upload_metadata: bool
    ) -> None:
        root = self.config.work_dir / app.slug
        source_dir = root / "source"
        wrapper_dir = root / "wrapper"
        self._checkout(app, source_dir)
        web_dir = self._build_web(app, source_dir)

        if not self.runner.dry_run:
            if wrapper_dir.exists():
                shutil.rmtree(wrapper_dir)
            shutil.copytree(self.template_root / "capacitor", wrapper_dir)
            public_dir = wrapper_dir / "dist"
            shutil.copytree(web_dir, public_dir)
            self._write_capacitor_config(app, wrapper_dir)
            self._copy_assets(app, wrapper_dir)

        self.runner.run(["npm", "install", "--ignore-scripts"], cwd=wrapper_dir)
        plugins = [CAPABILITY_PLUGINS[name] for name in app.native.capabilities]
        if plugins:
            self.runner.run(
                ["npm", "install", "--save", "--ignore-scripts", *plugins], cwd=wrapper_dir
            )
        targets = ("ios", "android") if platform == "all" else (platform,)
        for target in targets:
            add_command = ["npx", "cap", "add", target]
            if target == "ios" and app.native.ios_package_manager == "cocoapods":
                add_command.extend(["--packagemanager", "CocoaPods"])
            self.runner.run(add_command, cwd=wrapper_dir)
            if not self.runner.dry_run:
                fastlane_source = wrapper_dir / "fastlane-templates" / target
                shutil.copytree(fastlane_source, wrapper_dir / target / "fastlane")
        if not self.runner.dry_run:
            factory_root = self.config.work_dir.parent.parent
            copy_store_package(factory_root, app, wrapper_dir)
        if "ios" in targets and not self.runner.dry_run:
            self._apply_ios_usage_descriptions(app, wrapper_dir)
            self._apply_ios_entitlements(app, wrapper_dir)
        if not self.runner.dry_run:
            self._copy_native_service_files(app, wrapper_dir, targets)
        self.runner.run(["npx", "capacitor-assets", "generate"], cwd=wrapper_dir)
        self.runner.run(["npx", "cap", "sync"], cwd=wrapper_dir)
        self.runner.run(["bundle", "install"], cwd=wrapper_dir)
        if "ios" in targets:
            self._fastlane_ios(app, wrapper_dir, submit, upload_metadata)
        if "android" in targets:
            self._fastlane_android(app, wrapper_dir, submit, upload_metadata)

    @staticmethod
    def _apply_ios_usage_descriptions(app: App, wrapper_dir: Path) -> None:
        descriptions: dict[str, str] = {}
        if "camera" in app.native.capabilities:
            descriptions.update(
                {
                    "NSCameraUsageDescription": (
                        f"{app.native.display_name} uses the camera to capture "
                        "documents and photos."
                    ),
                    "NSPhotoLibraryUsageDescription": (
                        f"{app.native.display_name} lets you select photos and documents."
                    ),
                    "NSPhotoLibraryAddUsageDescription": (
                        f"{app.native.display_name} can save exported images when you request it."
                    ),
                }
            )
        if not descriptions:
            return
        plist_path = wrapper_dir / "ios" / "App" / "App" / "Info.plist"
        if not plist_path.is_file():
            raise ConfigError(f"Generated iOS Info.plist was not found: {plist_path}")
        with plist_path.open("rb") as source:
            values = plistlib.load(source)
        values.update(descriptions)
        with plist_path.open("wb") as destination:
            plistlib.dump(values, destination)

    @staticmethod
    def _apply_ios_entitlements(app: App, wrapper_dir: Path) -> None:
        if "push" not in app.native.capabilities:
            return
        app_dir = wrapper_dir / "ios" / "App" / "App"
        entitlements_path = app_dir / "App.entitlements"
        with entitlements_path.open("wb") as destination:
            plistlib.dump({"aps-environment": "production"}, destination)

        project_path = wrapper_dir / "ios" / "App" / "App.xcodeproj" / "project.pbxproj"
        project = project_path.read_text(encoding="utf-8")
        setting = "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;"
        if setting not in project:
            project = project.replace(
                "buildSettings = {",
                f"buildSettings = {{\n\t\t\t\t{setting}",
            )
            project_path.write_text(project, encoding="utf-8")

        delegate_path = app_dir / "AppDelegate.swift"
        delegate = delegate_path.read_text(encoding="utf-8")
        marker = "capacitorDidRegisterForRemoteNotifications"
        if marker not in delegate:
            insertion = """

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }
"""
            close = delegate.rfind("\n}")
            if close < 0:
                raise ConfigError("Could not patch generated AppDelegate.swift for push")
            delegate = delegate[:close] + insertion + delegate[close:]
            delegate_path.write_text(delegate, encoding="utf-8")

    @staticmethod
    def _copy_native_service_files(
        app: App, wrapper_dir: Path, targets: tuple[str, ...]
    ) -> None:
        if (
            "android" in targets
            and "push" in app.native.capabilities
            and not app.assets.google_services_json
        ):
            raise ConfigError(
                "Android push requires assets.google_services_json in the app manifest"
            )
        if "android" in targets and app.assets.google_services_json:
            source = Path(app.assets.google_services_json)
            if not source.is_file():
                raise ConfigError(f"Missing Firebase Android config: {source}")
            shutil.copy2(source, wrapper_dir / "android" / "app" / "google-services.json")

    def _write_capacitor_config(self, app: App, wrapper_dir: Path) -> None:
        config: dict[str, object] = {
            "appId": app.native.ios_bundle_id,
            "appName": app.native.display_name,
            "webDir": "dist",
        }
        if app.native.live_server_url:
            config["server"] = {"url": app.native.live_server_url, "cleartext": False}
        if "push" in app.native.capabilities:
            config["plugins"] = {
                "PushNotifications": {
                    "presentationOptions": ["badge", "sound", "banner", "list"]
                }
            }
        (wrapper_dir / "capacitor.config.json").write_text(
            json.dumps(config, indent=2) + "\n", encoding="utf-8"
        )

    def _copy_assets(self, app: App, wrapper_dir: Path) -> None:
        resources = wrapper_dir / "resources"
        resources.mkdir(parents=True, exist_ok=True)
        for source_value, output_name in (
            (app.assets.icon, "icon.png"),
            (app.assets.splash, "splash.png"),
        ):
            source = Path(source_value).expanduser().resolve()
            if not source.is_file():
                raise ConfigError(f"Asset not found: {source}")
            shutil.copy2(source, resources / output_name)

    @staticmethod
    def _required_env(reference: str | None, label: str) -> str:
        if not reference:
            raise ConfigError(f"Missing credential reference: {label}")
        value = os.getenv(reference)
        if not value:
            raise ConfigError(f"Environment secret {reference} is not set ({label})")
        return value

    def _fastlane_ios(
        self, app: App, wrapper_dir: Path, submit: bool, upload_metadata: bool
    ) -> None:
        if self.runner.dry_run:
            self.runner.run(
                ["bundle", "exec", "fastlane", "ios", "release"],
                cwd=wrapper_dir / "ios",
            )
            return
        credentials = app.credentials
        with tempfile.TemporaryDirectory(prefix="native-factory-ios-") as temp:
            key_path = Path(temp) / "AuthKey.p8"
            key_path.write_bytes(
                base64.b64decode(
                    self._required_env(
                        credentials.apple_private_key_b64_env, "Apple private key"
                    )
                )
            )
            key_path.chmod(0o600)
            env = {
                "APP_IDENTIFIER": app.native.ios_bundle_id,
                "APP_VERSION": app.native.version,
                "BUILD_NUMBER": str(self._build_number(app)),
                "IOS_PACKAGE_MANAGER": app.native.ios_package_manager,
                "APPLE_KEY_ID": self._required_env(
                    credentials.apple_key_id_env, "Apple key ID"
                ),
                "APPLE_ISSUER_ID": self._required_env(
                    credentials.apple_issuer_id_env, "Apple issuer ID"
                ),
                "APPLE_KEY_FILE": str(key_path),
                "FACTORY_SUBMIT": "true" if submit else "false",
                "FACTORY_UPLOAD_METADATA": "true" if upload_metadata else "false",
            }
            if app.store.apple_team_id:
                env["APPLE_TEAM_ID"] = app.store.apple_team_id
            if credentials.match_password_env:
                env["MATCH_PASSWORD"] = self._required_env(
                    credentials.match_password_env, "match password"
                )
            match_token = os.getenv("MATCH_REPO_TOKEN") or os.getenv("SOURCE_REPO_TOKEN")
            if match_token:
                env["MATCH_GIT_BASIC_AUTHORIZATION"] = base64.b64encode(
                    f"x-access-token:{match_token}".encode()
                ).decode("ascii")
            self.runner.run(
                ["bundle", "exec", "fastlane", "ios", "release"],
                cwd=wrapper_dir / "ios",
                env=env,
            )

    def _fastlane_android(
        self, app: App, wrapper_dir: Path, submit: bool, upload_metadata: bool
    ) -> None:
        if self.runner.dry_run:
            self.runner.run(
                ["bundle", "exec", "fastlane", "android", "release"],
                cwd=wrapper_dir / "android",
            )
            return
        credentials = app.credentials
        with tempfile.TemporaryDirectory(prefix="native-factory-android-") as temp:
            temp_dir = Path(temp)
            service_path = temp_dir / "play-service-account.json"
            key_store_path = temp_dir / "upload.keystore"
            key_store_path.write_bytes(
                base64.b64decode(
                    self._required_env(
                        credentials.android_keystore_b64_env,
                        "Android upload keystore",
                    )
                )
            )
            key_store_path.chmod(0o600)
            env = {
                "ANDROID_PACKAGE": app.native.android_package,
                "ANDROID_VERSION_NAME": app.native.version,
                "ANDROID_VERSION_CODE": str(self._build_number(app)),
                "ANDROID_KEYSTORE_PATH": str(key_store_path),
                "ANDROID_KEYSTORE_PASSWORD": self._required_env(
                    credentials.android_keystore_password_env, "keystore password"
                ),
                "ANDROID_KEY_ALIAS": self._required_env(
                    credentials.android_key_alias_env, "key alias"
                ),
                "ANDROID_KEY_PASSWORD": self._required_env(
                    credentials.android_key_password_env, "key password"
                ),
                "FACTORY_SUBMIT": "true" if submit else "false",
                "FACTORY_UPLOAD_METADATA": "true" if upload_metadata else "false",
                "PLAY_TRACK": app.store.play_track,
            }
            if submit:
                service_path.write_bytes(
                    base64.b64decode(
                        self._required_env(
                            credentials.google_service_account_b64_env,
                            "Google service account",
                        )
                    )
                )
                service_path.chmod(0o600)
                env["SUPPLY_JSON_KEY"] = str(service_path)
            self.runner.run(
                ["bundle", "exec", "fastlane", "android", "release"],
                cwd=wrapper_dir / "android",
                env=env,
            )

    def _build_expo(self, app: App, platform: Platform, *, submit: bool) -> None:
        root = self.config.work_dir / app.slug
        source_dir = root / "source"
        self._checkout(app, source_dir)
        self.runner.run(app.source.install_command, cwd=source_dir, shell=True)
        if not self.runner.dry_run:
            app_json = source_dir / "app.json"
            if not app_json.is_file():
                raise ConfigError("EAS projects must contain app.json")
            data = json.loads(app_json.read_text(encoding="utf-8"))
            expo = data.setdefault("expo", {})
            expo.update({"name": app.native.display_name, "version": app.native.version})
            expo.setdefault("ios", {})["bundleIdentifier"] = app.native.ios_bundle_id
            expo.setdefault("android", {})["package"] = app.native.android_package
            effective_build_number = self._build_number(app)
            expo["ios"]["buildNumber"] = str(effective_build_number)
            expo["android"]["versionCode"] = effective_build_number
            assets_dir = source_dir / ".factory-assets"
            assets_dir.mkdir(exist_ok=True)
            shutil.copy2(app.assets.icon, assets_dir / "icon.png")
            shutil.copy2(app.assets.splash, assets_dir / "splash.png")
            expo["icon"] = "./.factory-assets/icon.png"
            expo["splash"] = {"image": "./.factory-assets/splash.png", "resizeMode": "contain"}
            app_json.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        command = [
            "npx", "eas-cli", "build", "--platform", platform, "--profile",
            app.native.eas_profile, "--non-interactive", "--no-wait",
        ]
        if submit:
            command.append("--auto-submit")
        self.runner.run(command, cwd=source_dir)
