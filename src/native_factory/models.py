from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

Engine = Literal["capacitor", "expo"]
Runner = Literal["mac", "github-macos", "eas"]
Platform = Literal["ios", "android", "all"]

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$")
BUNDLE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*){2,}$")
CAPABILITIES = {"browser", "camera", "filesystem", "network", "preferences", "push", "share"}


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class Source:
    repo: str
    ref: str = "main"
    package_manager: Literal["npm", "pnpm", "yarn", "bun"] = "npm"
    install_command: str = "npm ci"
    build_command: str = "npm run build"
    web_dir: str = "dist"


@dataclass(frozen=True)
class Assets:
    icon: str
    splash: str
    google_services_json: str | None = None


@dataclass(frozen=True)
class Credentials:
    apple_key_id_env: str | None = None
    apple_issuer_id_env: str | None = None
    apple_private_key_b64_env: str | None = None
    match_password_env: str | None = None
    google_service_account_b64_env: str | None = None
    android_keystore_b64_env: str | None = None
    android_keystore_password_env: str | None = None
    android_key_alias_env: str | None = None
    android_key_password_env: str | None = None


@dataclass(frozen=True)
class Store:
    brand_name: str = ""
    legal_owner: str = ""
    support_url: str = ""
    privacy_url: str = ""
    account_deletion_url: str = ""
    apple_team_id: str = ""
    apple_app_id: str = ""
    apple_account_email: str = ""
    google_account_email: str = ""
    google_developer_name: str = ""
    play_track: str = "internal"
    locale: str = "en-GB"
    app_title: str = ""
    apple_subtitle: str = ""
    google_short_description: str = ""
    full_description: str = ""
    apple_keywords: str = ""
    promotional_text: str = ""
    release_notes: str = ""
    marketing_url: str = ""
    primary_category: str = ""
    secondary_category: str = ""
    copyright: str = ""
    contact_email: str = ""
    contact_phone: str = ""
    target_audience: str = ""
    age_rating_notes: str = ""
    marketing_notes: str = ""
    review_notes: str = ""
    review_contact_first_name: str = ""
    review_contact_last_name: str = ""
    compliance_notes: str = ""
    requires_login: bool = False
    allows_account_creation: bool = False
    contains_ads: bool = False
    uses_tracking: bool = False
    collects_personal_data: bool = False
    shares_personal_data: bool = False
    uses_encryption: bool = True
    user_generated_content: bool = False
    children_targeted: bool = False
    regulated_features: bool = False
    apple_bundle_registered: bool = False
    apple_app_record_created: bool = False
    google_app_record_created: bool = False
    play_app_signing_enabled: bool = False
    apple_privacy_confirmed: bool = False
    google_data_safety_confirmed: bool = False
    store_agreements_active: bool = False
    update_mode: Literal["internal-build", "appflow-live"] = "internal-build"
    appflow_app_id: str = ""
    appflow_channel: str = "production"
    android_production_rollout: float = 0.1


@dataclass(frozen=True)
class Native:
    engine: Engine
    runner: Runner
    display_name: str
    ios_bundle_id: str
    android_package: str
    version: str = "1.0.0"
    build_number: int = 1
    ios_package_manager: Literal["spm", "cocoapods"] = "spm"
    capabilities: tuple[str, ...] = ()
    eas_profile: str = "production"
    embed_web_assets: bool = True
    live_server_url: str | None = None


@dataclass(frozen=True)
class App:
    slug: str
    source: Source
    native: Native
    assets: Assets
    credentials: Credentials = field(default_factory=Credentials)
    suite: str = ""
    app_role: str = "main"
    store: Store = field(default_factory=Store)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> App:
        try:
            native_values = dict(raw["native"])
            native_values["capabilities"] = tuple(native_values.get("capabilities", ()))
            app = cls(
                slug=str(raw["slug"]),
                source=Source(**raw["source"]),
                native=Native(**native_values),
                assets=Assets(**raw["assets"]),
                credentials=Credentials(**raw.get("credentials", {})),
                suite=str(raw.get("suite", raw["slug"])),
                app_role=str(raw.get("app_role", "main")),
                store=Store(**raw.get("store", {})),
            )
        except (KeyError, TypeError) as exc:
            raise ConfigError(f"Invalid app record: {exc}") from exc
        app.validate()
        return app

    def validate(self) -> None:
        errors: list[str] = []
        if not SLUG_RE.match(self.slug):
            errors.append("slug must be 3-50 lowercase letters, numbers, or hyphens")
        if self.suite and not SLUG_RE.match(self.suite):
            errors.append("suite must be 3-50 lowercase letters, numbers, or hyphens")
        if not self.app_role.strip():
            errors.append("app_role must not be empty")
        if self.native.engine == "capacitor" and self.native.runner not in (
            "mac",
            "github-macos",
        ):
            errors.append(
                "Capacitor apps require runner: mac or github-macos "
                "(EAS is for Expo/React Native)"
            )
        if (
            self.native.engine == "capacitor"
            and self.native.ios_bundle_id != self.native.android_package
        ):
            errors.append("Capacitor uses one appId; iOS and Android identifiers must match")
        if self.native.engine == "expo" and self.native.runner != "eas":
            errors.append("Expo apps require runner: eas in this starter")
        if not BUNDLE_RE.match(self.native.ios_bundle_id):
            errors.append(f"invalid iOS bundle ID: {self.native.ios_bundle_id}")
        if not BUNDLE_RE.match(self.native.android_package):
            errors.append(f"invalid Android package: {self.native.android_package}")
        if self.native.live_server_url and self.native.embed_web_assets:
            errors.append("choose embedded web assets or live_server_url, not both")
        if self.native.live_server_url and not self.native.live_server_url.startswith("https://"):
            errors.append("live_server_url must use HTTPS")
        if self.native.build_number < 1:
            errors.append("build_number must be positive")
        if self.store.play_track not in ("internal", "alpha", "beta", "production"):
            errors.append("play_track must be internal, alpha, beta, or production")
        if self.store.update_mode not in ("internal-build", "appflow-live"):
            errors.append("update_mode must be internal-build or appflow-live")
        if not 0 < self.store.android_production_rollout <= 1:
            errors.append("android_production_rollout must be greater than 0 and at most 1")
        limits = (
            ("app_title", self.store.app_title, 30),
            ("apple_subtitle", self.store.apple_subtitle, 30),
            ("google_short_description", self.store.google_short_description, 80),
            ("full_description", self.store.full_description, 4000),
            ("promotional_text", self.store.promotional_text, 170),
        )
        for label, value, maximum in limits:
            if len(value) > maximum:
                errors.append(f"{label} must be {maximum} characters or fewer")
        if len(self.store.apple_keywords.encode("utf-8")) > 100:
            errors.append("apple_keywords must be 100 UTF-8 bytes or fewer")
        for label, value in (
            ("support_url", self.store.support_url),
            ("privacy_url", self.store.privacy_url),
            ("account_deletion_url", self.store.account_deletion_url),
            ("marketing_url", self.store.marketing_url),
        ):
            if value and not value.startswith("https://"):
                errors.append(f"{label} must use HTTPS")
        unknown_capabilities = sorted(set(self.native.capabilities) - CAPABILITIES)
        if unknown_capabilities:
            errors.append("unknown capabilities: " + ", ".join(unknown_capabilities))
        if errors:
            raise ConfigError(f"{self.slug}: " + "; ".join(errors))


@dataclass(frozen=True)
class FactoryConfig:
    work_dir: Path
    apps: tuple[App, ...]

    def get_app(self, slug: str) -> App:
        for app in self.apps:
            if app.slug == slug:
                return app
        raise ConfigError(f"Unknown app slug: {slug}")

    def validate_unique_ids(self) -> None:
        for field_name in ("ios_bundle_id", "android_package"):
            values: dict[str, str] = {}
            for app in self.apps:
                value = getattr(app.native, field_name)
                if value in values:
                    raise ConfigError(
                        f"Duplicate {field_name} {value!r}: {values[value]} and {app.slug}"
                    )
                values[value] = app.slug
