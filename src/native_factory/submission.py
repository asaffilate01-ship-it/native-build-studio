from __future__ import annotations

import shutil
import struct
import tempfile
from dataclasses import fields
from pathlib import Path
from typing import Any

import yaml

from .models import App, ConfigError, Store

STORE_FIELDS = {item.name for item in fields(Store)}
BOOLEAN_STORE_FIELDS = {
    item.name for item in fields(Store) if item.type is bool or item.type == "bool"
}
FLOAT_STORE_FIELDS = {
    item.name for item in fields(Store) if item.type is float or item.type == "float"
}
STORE_ASSET_KINDS = {
    "apple-iphone": "Apple iPhone screenshots",
    "apple-ipad": "Apple iPad screenshots",
    "google-phone": "Google phone screenshots",
    "google-tablet": "Google tablet screenshots",
    "google-feature": "Google feature graphic",
}


def _image_dimensions(content: bytes) -> tuple[int, int] | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n") and len(content) >= 24:
        return struct.unpack(">II", content[16:24])
    if content.startswith(b"\xff\xd8"):
        offset = 2
        while offset + 9 < len(content):
            if content[offset] != 0xFF:
                offset += 1
                continue
            marker = content[offset + 1]
            offset += 2
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                continue
            if offset + 2 > len(content):
                break
            length = struct.unpack(">H", content[offset : offset + 2])[0]
            if marker in range(0xC0, 0xC4) and offset + 7 <= len(content):
                height, width = struct.unpack(">HH", content[offset + 3 : offset + 7])
                return width, height
            offset += max(length, 2)
    return None


def _atomic_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        yaml.safe_dump(data, handle, sort_keys=False, allow_unicode=True)
        temporary = Path(handle.name)
    temporary.replace(path)


def update_store(config_path: Path, slug: str, values: dict[str, Any]) -> None:
    try:
        data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigError(f"Could not read app manifest: {exc}") from exc
    record = next((item for item in data.get("apps", []) if item.get("slug") == slug), None)
    if record is None:
        raise ConfigError(f"Unknown app slug: {slug}")
    current = dict(record.get("store", {}))
    for key, value in values.items():
        if key not in STORE_FIELDS:
            continue
        if key in BOOLEAN_STORE_FIELDS:
            current[key] = bool(value)
        elif key in FLOAT_STORE_FIELDS:
            current[key] = float(value)
        else:
            current[key] = str(value).strip()
    record["store"] = current
    # Validate before replacing the real manifest.
    App.from_dict(record)
    _atomic_yaml(config_path, data)


def store_asset_root(factory_root: Path, app: App) -> Path:
    return factory_root / "store-assets" / app.slug / app.store.locale


def list_store_assets(factory_root: Path, app: App) -> dict[str, list[str]]:
    root = store_asset_root(factory_root, app)
    return {
        kind: sorted(path.name for path in (root / kind).glob("*") if path.is_file())
        for kind in STORE_ASSET_KINDS
    }


def save_store_assets(
    factory_root: Path, app: App, kind: str, uploads: list[Any]
) -> list[Path]:
    if kind not in STORE_ASSET_KINDS:
        raise ConfigError("Unknown store asset type")
    selected = [item for item in uploads if item and item.filename]
    if not selected:
        raise ConfigError("Choose at least one image")
    if kind == "google-feature" and len(selected) != 1:
        raise ConfigError("Google feature graphic accepts exactly one image")
    maximum = 10 if kind.startswith("apple-") else 8
    if len(selected) > maximum:
        raise ConfigError(f"{STORE_ASSET_KINDS[kind]} accepts at most {maximum} images")
    destination = store_asset_root(factory_root, app) / kind
    destination.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    for number, upload in enumerate(selected, start=1):
        suffix = Path(upload.filename).suffix.lower()
        if suffix not in (".png", ".jpg", ".jpeg"):
            raise ConfigError("Store images must be PNG or JPEG")
        content = upload.read()
        dimensions = _image_dimensions(content)
        if not dimensions:
            raise ConfigError(f"{upload.filename} is not a readable PNG/JPEG image")
        if kind == "google-feature" and dimensions != (1024, 500):
            raise ConfigError("Google feature graphic must be exactly 1024x500 pixels")
        name = "featureGraphic" if kind == "google-feature" else f"{number:02d}"
        target = destination / f"{name}{suffix}"
        target.write_bytes(content)
        saved.append(target)
    return saved


def capacitor_ready_brief(app: App) -> str:
    capabilities = ", ".join(app.native.capabilities) or "none selected"
    return f"""# Capacitor-ready brief: {app.native.display_name}

Paste this brief into Lovable or ChatGPT and ask it to implement and verify every item.

## Fixed identity

- Suite: `{app.suite}`
- Role: `{app.app_role}`
- App slug: `{app.slug}`
- Permanent Apple Bundle ID / Android package: `{app.native.ios_bundle_id}`
- Production output directory: `{app.source.web_dir}`
- Native capabilities: {capabilities}

## Required changes

1. Keep the project installable with `{app.source.install_command}` and buildable with `{app.source.build_command}`.
2. Produce a static production bundle in `{app.source.web_dir}` with an `index.html` containing a closing `</head>`.
3. Make every screen responsive for 320px-wide phones through tablets. Respect iOS safe areas, the software keyboard, dark mode, text scaling and landscape.
4. Do not place Supabase service-role keys, Apple keys, Google service accounts or signing files in client code.
5. Persist authentication safely and restore sessions after the app resumes. Handle expired sessions and offline startup without a blank screen.
6. Read the role from `window.__NATIVE_FACTORY__.role` or `VITE_NATIVE_APP_ROLE`; use it to expose only the correct Customer, Driver, Kitchen or admin experience.
7. Use Capacitor-compatible HTTPS links. Test external links, file uploads, camera capture, sharing, downloads and back-button behaviour.
8. Add visible loading, empty, offline and error states. Never rely on hover-only controls.
9. Provide working support, privacy and account-deletion links inside the app.
10. Commit the completed changes to `{app.source.ref}`. Do not add native `ios/` or `android/` folders; the factory generates them.

## Acceptance test

- Run `{app.source.install_command}` then `{app.source.build_command}` on a clean checkout.
- Confirm `{app.source.web_dir}/index.html` exists.
- Test login/logout, account creation/deletion, every selected native capability, slow/offline network and app resume.
- Test as `{app.app_role}` using the injected runtime identity.
- Confirm there are no secrets, localhost URLs, mixed HTTP content or browser-only assumptions.
"""


def write_capacitor_brief(factory_root: Path, app: App) -> Path:
    path = factory_root / "briefs" / app.slug / "CAPACITOR_READY_BRIEF.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(capacitor_ready_brief(app), encoding="utf-8")
    return path


def _write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.strip() + "\n", encoding="utf-8")


def generate_store_package(factory_root: Path, app: App) -> Path:
    root = factory_root / "store-packages" / app.slug
    if root.exists():
        shutil.rmtree(root)
    locale = app.store.locale
    ios = root / "ios" / "fastlane"
    android = root / "android" / "fastlane"
    apple_values = {
        "name.txt": app.store.app_title or app.native.display_name,
        "subtitle.txt": app.store.apple_subtitle,
        "description.txt": app.store.full_description,
        "keywords.txt": app.store.apple_keywords,
        "promotional_text.txt": app.store.promotional_text,
        "release_notes.txt": app.store.release_notes,
        "support_url.txt": app.store.support_url,
        "marketing_url.txt": app.store.marketing_url,
    }
    google_values = {
        "title.txt": app.store.app_title or app.native.display_name,
        "short_description.txt": app.store.google_short_description,
        "full_description.txt": app.store.full_description,
    }
    for name, value in apple_values.items():
        if value:
            _write(ios / "metadata" / locale / name, value)
    for name, value in google_values.items():
        if value:
            _write(android / "metadata" / locale / name, value)
    if app.store.release_notes:
        _write(
            android / "metadata" / locale / "changelogs" / "default.txt",
            app.store.release_notes,
        )

    assets = store_asset_root(factory_root, app)
    copies = {
        "apple-iphone": ios / "screenshots" / locale,
        "apple-ipad": ios / "screenshots" / locale,
        "google-phone": android / "metadata" / locale / "images" / "phoneScreenshots",
        "google-tablet": android / "metadata" / locale / "images" / "tenInchScreenshots",
        "google-feature": android / "metadata" / locale / "images",
    }
    for kind, destination in copies.items():
        source = assets / kind
        if not source.is_dir():
            continue
        destination.mkdir(parents=True, exist_ok=True)
        for file in source.iterdir():
            if file.is_file():
                name = file.name
                if kind == "apple-ipad":
                    name = f"ipad-{name}"
                shutil.copy2(file, destination / name)

    flags = (
        "requires_login", "allows_account_creation", "contains_ads", "uses_tracking",
        "collects_personal_data", "shares_personal_data", "uses_encryption",
        "user_generated_content", "children_targeted", "regulated_features",
    )
    summary = [
        f"# Store hand-off: {app.native.display_name}", "",
        f"- Bundle/package ID: `{app.native.ios_bundle_id}`",
        f"- Brand account owner: {app.store.legal_owner or 'TO COMPLETE'}",
        f"- Locale: {locale}", f"- Category: {app.store.primary_category or 'TO COMPLETE'}",
        f"- Support: {app.store.support_url or 'TO COMPLETE'}",
        f"- Privacy: {app.store.privacy_url or 'TO COMPLETE'}",
        f"- Account deletion: {app.store.account_deletion_url or 'TO COMPLETE'}", "",
        "## Declarations", "",
    ]
    summary.extend(f"- {name.replace('_', ' ').title()}: {getattr(app.store, name)}" for name in flags)
    summary += [
        "", "## Reviewer notes", "", app.store.review_notes or "TO COMPLETE",
        "", "## Compliance notes", "", app.store.compliance_notes or "TO COMPLETE",
        "", "## Marketing notes", "", app.store.marketing_notes or "TO COMPLETE",
        "", "Reviewer usernames/passwords are GitHub Environment secrets, never stored here.",
    ]
    _write(root / "SUBMISSION_HANDOFF.md", "\n".join(summary))
    return root


def copy_store_package(factory_root: Path, app: App, wrapper_dir: Path) -> None:
    package = generate_store_package(factory_root, app)
    for target in ("ios", "android"):
        source = package / target / "fastlane"
        destination = wrapper_dir / target / "fastlane"
        if source.is_dir() and destination.is_dir():
            shutil.copytree(source, destination, dirs_exist_ok=True)


def release_blockers(factory_root: Path, app: App, platform: str) -> list[str]:
    required = {
        "legal owner": app.store.legal_owner,
        "store title": app.store.app_title,
        "full description": app.store.full_description,
        "release notes": app.store.release_notes,
        "support URL": app.store.support_url,
        "privacy URL": app.store.privacy_url,
        "review contact first name": app.store.review_contact_first_name,
        "review contact last name": app.store.review_contact_last_name,
        "review contact email": app.store.contact_email,
        "review contact phone": app.store.contact_phone,
        "target audience": app.store.target_audience,
        "compliance notes": app.store.compliance_notes,
    }
    blockers = [f"Complete {label}" for label, value in required.items() if not value]
    if app.store.allows_account_creation and not app.store.account_deletion_url:
        blockers.append("Complete account deletion URL")
    assets = list_store_assets(factory_root, app)
    if platform == "ios":
        if not app.store.apple_app_id:
            blockers.append("Complete Apple App Store ID")
        if not assets["apple-iphone"]:
            blockers.append("Upload at least one Apple iPhone screenshot")
        if not app.store.apple_bundle_registered:
            blockers.append("Confirm the Apple Bundle ID is registered")
        if not app.store.apple_app_record_created:
            blockers.append("Confirm the App Store Connect app record exists")
        if not app.store.apple_privacy_confirmed:
            blockers.append("Confirm Apple App Privacy answers")
    elif platform == "android":
        if not app.store.google_developer_name:
            blockers.append("Complete Google developer name")
        if len(assets["google-phone"]) < 2:
            blockers.append("Upload at least two Google phone screenshots")
        if not assets["google-feature"]:
            blockers.append("Upload the 1024x500 Google feature graphic")
        if not app.store.google_app_record_created:
            blockers.append("Confirm the Play Console app record exists")
        if not app.store.play_app_signing_enabled:
            blockers.append("Confirm Play App Signing is enabled")
        if not app.store.google_data_safety_confirmed:
            blockers.append("Confirm Google Data Safety answers")
    else:
        blockers.append("Production approval must target ios or android separately")
    if not app.store.store_agreements_active:
        blockers.append("Confirm developer agreements, tax and banking are active")
    return blockers
