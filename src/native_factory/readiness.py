from __future__ import annotations

import os
import platform as host_platform
import shutil
import struct
from dataclasses import dataclass
from pathlib import Path

from .models import App, Platform


@dataclass(frozen=True)
class Check:
    level: str
    label: str
    detail: str


def _png_dimensions(path: Path) -> tuple[int, int] | None:
    try:
        header = path.read_bytes()[:24]
    except OSError:
        return None
    if len(header) == 24 and header[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", header[16:24])
    return None


def app_readiness(
    app: App,
    *,
    platform: Platform = "all",
    submit: bool = False,
    strict_secrets: bool = False,
) -> list[Check]:
    checks: list[Check] = []
    checks.append(Check("PASS", "configuration", "App manifest and identifiers are valid"))

    store_fields = (
        ("brand name", app.store.brand_name, False),
        ("legal owner", app.store.legal_owner, False),
        ("support URL", app.store.support_url, True),
        ("privacy URL", app.store.privacy_url, True),
        ("account deletion URL", app.store.account_deletion_url, True),
        ("Google developer name", app.store.google_developer_name, False),
    )
    for label, value, requires_https in store_fields:
        if not value:
            checks.append(Check("WARN", label, "Not recorded in the app manifest"))
        elif requires_https and not value.startswith("https://"):
            checks.append(Check("FAIL", label, "A public HTTPS URL is required"))
        else:
            checks.append(Check("PASS", label, value))

    for label, value, minimum in (
        ("icon", app.assets.icon, 1024),
        ("splash", app.assets.splash, 2732),
    ):
        path = Path(value)
        if not path.is_file():
            checks.append(Check("FAIL", label, f"Missing asset: {path}"))
            continue
        size = _png_dimensions(path)
        if not size:
            checks.append(Check("FAIL", label, "Asset must be a PNG file"))
        elif size[0] != size[1] or min(size) < minimum:
            checks.append(
                Check(
                    "WARN",
                    label,
                    f"Found {size[0]}x{size[1]}; recommended square PNG at least {minimum}px",
                )
            )
        else:
            checks.append(Check("PASS", label, f"PNG {size[0]}x{size[1]}"))

    listing_fields = (
        ("store title", app.store.app_title or app.native.display_name),
        ("short description", app.store.google_short_description),
        ("full description", app.store.full_description),
        ("release notes", app.store.release_notes),
        ("contact email", app.store.contact_email),
        ("target audience", app.store.target_audience),
        ("review notes", app.store.review_notes),
    )
    for label, value in listing_fields:
        checks.append(
            Check(
                "PASS" if value else "WARN",
                label,
                "Recorded" if value else "Complete this in Store Listing",
            )
        )
    if app.store.update_mode == "appflow-live":
        if app.store.appflow_app_id:
            checks.append(
                Check("PASS", "live updates", f"Appflow app {app.store.appflow_app_id}")
            )
        else:
            checks.append(
                Check("FAIL", "live updates", "Appflow mode requires an Appflow App ID")
            )
    else:
        checks.append(
            Check("PASS", "update delivery", "Signed internal build on each source update")
        )

    repo = app.source.repo
    if repo.startswith("/"):
        level = "PASS" if Path(repo).exists() else "FAIL"
        checks.append(Check(level, "source", repo))
    elif repo.startswith(("https://", "git@")):
        checks.append(Check("PASS", "source", "Remote Git repository configured"))
    else:
        checks.append(Check("WARN", "source", "Repository format was not recognised"))

    if "push" in app.native.capabilities and platform in ("android", "all"):
        firebase = app.assets.google_services_json
        if firebase and Path(firebase).is_file():
            checks.append(Check("PASS", "Android push config", firebase))
        else:
            checks.append(
                Check(
                    "FAIL",
                    "Android push config",
                    "Provide google-services.json with --google-services-json",
                )
            )

    required: list[tuple[str | None, str]] = []
    if platform in ("ios", "all") and app.native.engine == "capacitor":
        required.extend(
            [
                (app.credentials.apple_key_id_env, "Apple API key ID"),
                (app.credentials.apple_issuer_id_env, "Apple issuer ID"),
                (app.credentials.apple_private_key_b64_env, "Apple private key"),
                ("MATCH_GIT_URL", "Fastlane Match repository"),
                ("MATCH_REPO_TOKEN", "Fastlane Match repository token"),
                (app.credentials.match_password_env, "Fastlane Match password"),
            ]
        )
    if platform in ("android", "all") and app.native.engine == "capacitor":
        required.extend(
            [
                (app.credentials.android_keystore_b64_env, "Android upload keystore"),
                (app.credentials.android_keystore_password_env, "Keystore password"),
                (app.credentials.android_key_alias_env, "Android key alias"),
                (app.credentials.android_key_password_env, "Android key password"),
            ]
        )
        if submit:
            required.append(
                (app.credentials.google_service_account_b64_env, "Google service account")
            )
    if app.native.engine == "expo":
        required.append(("EXPO_TOKEN", "Expo access token"))

    hosted = app.native.runner in ("github-macos", "eas")
    for reference, label in required:
        is_set = bool(reference and os.getenv(reference))
        if is_set:
            checks.append(Check("PASS", label, f"{reference} is available"))
        elif hosted and not strict_secrets:
            checks.append(
                Check("INFO", label, f"Configure {reference or 'a secret'} in the app environment")
            )
        else:
            checks.append(Check("FAIL", label, f"Missing {reference or 'credential reference'}"))

    checks.extend(
        [
            Check("MANUAL", "store record", "Create the app in App Store Connect and Play Console"),
            Check(
                "MANUAL",
                "privacy",
                "Complete privacy policy, Apple privacy and Play Data safety",
            ),
            Check(
                "MANUAL",
                "review access",
                "Provide a working reviewer account for gated apps",
            ),
            Check(
                "MANUAL",
                "device QA",
                "Test camera, push, uploads, deep links and offline startup",
            ),
        ]
    )
    return checks


def toolchain_doctor(app: App, platform: Platform = "all") -> list[Check]:
    checks: list[Check] = []

    def command(name: str, required: bool = True) -> None:
        found = shutil.which(name)
        checks.append(
            Check(
                "PASS" if found else ("FAIL" if required else "WARN"),
                name,
                found or "not found",
            )
        )

    command("git")
    command("node")
    command("npm")

    if app.native.engine == "expo":
        command("npx")
        return checks

    if app.native.runner == "github-macos" and os.getenv("GITHUB_ACTIONS") != "true":
        checks.append(
            Check(
                "INFO",
                "native runner",
                "Native Xcode/Android checks will run on GitHub-hosted macOS",
            )
        )
        return checks

    if host_platform.system() != "Darwin":
        checks.append(Check("FAIL", "macOS", "iOS Capacitor builds require macOS"))
        return checks

    command("bundle")
    command("ruby")
    if platform in ("ios", "all"):
        command("xcodebuild")
        if app.native.ios_package_manager == "cocoapods":
            command("pod")
    if platform in ("android", "all"):
        command("java")
        android_home = os.getenv("ANDROID_HOME") or os.getenv("ANDROID_SDK_ROOT")
        checks.append(
            Check("PASS" if android_home else "FAIL", "Android SDK", android_home or "not set")
        )
    return checks


def render_checks(checks: list[Check]) -> str:
    width = max((len(item.level) for item in checks), default=4)
    return "\n".join(
        f"{item.level:<{width}}  {item.label}: {item.detail}" for item in checks
    )


def has_failures(checks: list[Check]) -> bool:
    return any(item.level == "FAIL" for item in checks)
