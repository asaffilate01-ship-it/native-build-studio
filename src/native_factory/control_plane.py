from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict
from pathlib import Path
from typing import Any

import yaml

from .models import App, ConfigError


class SupabaseControlPlane:
    """Small server-side Supabase REST client. Never expose its service key to Lovable."""

    def __init__(self, url: str, service_key: str):
        self.url = url.rstrip("/")
        self.service_key = service_key

    @classmethod
    def from_environment(cls, *, required: bool = False) -> SupabaseControlPlane | None:
        url = os.getenv("SUPABASE_URL", "").strip()
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if url and key:
            return cls(url, key)
        if required:
            raise ConfigError(
                "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the Python server"
            )
        return None

    def _request(
        self, method: str, table: str, payload: Any | None = None, *, query: str = ""
    ) -> Any:
        endpoint = f"{self.url}/rest/v1/{table}{query}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            endpoint,
            data=data,
            method=method,
            headers={
                "apikey": self.service_key,
                "Authorization": f"Bearer {self.service_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                content = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise ConfigError(f"Supabase request failed ({exc.code}): {detail[:500]}") from exc
        except urllib.error.URLError as exc:
            raise ConfigError(f"Could not reach Supabase: {exc.reason}") from exc
        return json.loads(content) if content else None

    def _download_storage_object(self, storage_path: str, destination: Path) -> None:
        quoted = urllib.parse.quote(storage_path, safe="/")
        request = urllib.request.Request(
            f"{self.url}/storage/v1/object/authenticated/native-app-assets/{quoted}",
            headers={
                "apikey": self.service_key,
                "Authorization": f"Bearer {self.service_key}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                content = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise ConfigError(
                f"Could not download protected app asset ({exc.code}): {detail[:300]}"
            ) from exc
        except urllib.error.URLError as exc:
            raise ConfigError(f"Could not download protected app asset: {exc.reason}") from exc
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)

    @staticmethod
    def _github_url(value: str) -> str:
        value = value.strip()
        if value.startswith(("https://", "http://", "git@", "/", "./", "../")):
            return value
        if value.count("/") == 1:
            return f"https://github.com/{value}.git"
        return value

    def hydrate_app_manifest(self, slug: str, output: Path) -> Path:
        """Create a one-app runtime manifest and download its protected assets.

        This removes the need to hand-edit config/apps.yml after an operator has
        completed the web control-plane forms. The generated file is ephemeral CI
        state and must never be committed.
        """
        apps = self._request(
            "GET",
            "native_apps",
            query=f"?slug=eq.{urllib.parse.quote(slug)}&active=eq.true&select=*&limit=1",
        )
        if not isinstance(apps, list) or not apps:
            raise ConfigError(f"Unknown or inactive app: {slug}")
        app = apps[0]
        app_id = urllib.parse.quote(str(app["id"]))
        listings = self._request(
            "GET",
            "store_listings",
            query=f"?app_id=eq.{app_id}&locale=eq.en-GB&select=*&limit=1",
        )
        connections = self._request(
            "GET", "app_connections", query=f"?app_id=eq.{app_id}&select=*"
        )
        assets = self._request(
            "GET",
            "app_assets",
            query=f"?app_id=eq.{app_id}&status=in.(uploaded,approved)&select=*&order=created_at.desc",
        )
        listing = listings[0] if isinstance(listings, list) and listings else {}
        connections_by_provider = {
            item.get("provider"): item
            for item in (connections if isinstance(connections, list) else [])
        }
        asset_rows = assets if isinstance(assets, list) else []
        latest: dict[str, dict[str, Any]] = {}
        repeated: dict[str, list[dict[str, Any]]] = {}
        for item in asset_rows:
            kind = str(item.get("asset_type", ""))
            latest.setdefault(kind, item)
            repeated.setdefault(kind, []).append(item)

        required = [kind for kind in ("app_icon", "splash") if kind not in latest]
        capabilities = app.get("capabilities") if isinstance(app.get("capabilities"), list) else []
        if "push" in capabilities and "firebase_android" not in latest:
            required.append("firebase_android (required because push is enabled)")
        if required:
            raise ConfigError("Upload required control-plane assets: " + ", ".join(required))

        runtime_root = output.parent / "runtime-assets" / slug

        def fetch(item: dict[str, Any], destination: Path) -> str:
            self._download_storage_object(str(item["storage_path"]), destination)
            return str(destination.resolve())

        icon_path = fetch(latest["app_icon"], runtime_root / "icon.png")
        splash_path = fetch(latest["splash"], runtime_root / "splash.png")
        firebase_path = None
        if "firebase_android" in latest:
            firebase_path = fetch(
                latest["firebase_android"], runtime_root / "google-services.json"
            )

        factory_root = output.parent.parent
        locale = str(listing.get("locale") or "en-GB")
        store_root = factory_root / "store-assets" / slug / locale
        asset_destinations = {
            "apple_screenshot": "apple-iphone",
            "google_screenshot": "google-phone",
            "google_feature_graphic": "google-feature",
        }
        for kind, folder in asset_destinations.items():
            for number, item in enumerate(reversed(repeated.get(kind, [])), start=1):
                suffix = Path(str(item.get("original_name", "asset.png"))).suffix.lower()
                if suffix not in (".png", ".jpg", ".jpeg"):
                    suffix = ".png"
                name = "featureGraphic" if kind == "google_feature_graphic" else f"{number:02d}"
                fetch(item, store_root / folder / f"{name}{suffix}")

        declarations = listing.get("declarations") if isinstance(listing.get("declarations"), dict) else {}
        release_checks = (
            listing.get("release_checks")
            if isinstance(listing.get("release_checks"), dict)
            else {}
        )
        apple = connections_by_provider.get("apple", {})
        google = connections_by_provider.get("google", {})
        contact_name = str(listing.get("contact_name") or "").strip().split(maxsplit=1)
        app_record = {
            "slug": app["slug"],
            "suite": app["suite"],
            "app_role": app["app_role"],
            "source": {
                "repo": self._github_url(str(app["source_repo"])),
                "ref": app.get("source_ref") or "main",
                "package_manager": app.get("package_manager") or "bun",
                "install_command": app.get("install_command") or "bun install --frozen-lockfile",
                "build_command": app.get("build_command") or "bun run build",
                "web_dir": app.get("web_dir") or "dist",
            },
            "native": {
                "engine": app["engine"],
                "runner": app["runner"],
                "display_name": app["display_name"],
                "ios_bundle_id": app["ios_bundle_id"],
                "android_package": app["android_package"],
                "version": app.get("version") or "1.0.0",
                "build_number": int(app.get("build_number") or 1),
                "capabilities": capabilities,
                "embed_web_assets": True,
            },
            "assets": {
                "icon": icon_path,
                "splash": splash_path,
                **({"google_services_json": firebase_path} if firebase_path else {}),
            },
            "credentials": {
                "apple_key_id_env": "APPLE_KEY_ID",
                "apple_issuer_id_env": "APPLE_ISSUER_ID",
                "apple_private_key_b64_env": "APPLE_PRIVATE_KEY_B64",
                "match_password_env": "MATCH_PASSWORD",
                "google_service_account_b64_env": "GOOGLE_SERVICE_ACCOUNT_B64",
                "android_keystore_b64_env": "ANDROID_KEYSTORE_B64",
                "android_keystore_password_env": "ANDROID_KEYSTORE_PASSWORD",
                "android_key_alias_env": "ANDROID_KEY_ALIAS",
                "android_key_password_env": "ANDROID_KEY_PASSWORD",
            },
            "store": {
                "brand_name": app.get("public_brand") or apple.get("account_name") or google.get("account_name") or "",
                "legal_owner": app.get("legal_owner") or "",
                "support_url": listing.get("support_url") or app.get("support_url") or "",
                "privacy_url": listing.get("privacy_url") or app.get("privacy_url") or "",
                "account_deletion_url": listing.get("account_deletion_url") or "",
                "apple_team_id": app.get("apple_team_id") or apple.get("external_id") or "",
                "apple_app_id": app.get("apple_app_id") or "",
                "google_developer_name": app.get("google_developer_name") or google.get("account_name") or "",
                "locale": locale,
                "app_title": listing.get("title") or app["display_name"],
                "apple_subtitle": listing.get("subtitle") or "",
                "google_short_description": listing.get("short_description") or "",
                "full_description": listing.get("full_description") or "",
                "apple_keywords": listing.get("keywords") or "",
                "promotional_text": listing.get("promotional_text") or "",
                "release_notes": listing.get("release_notes") or "",
                "marketing_url": listing.get("marketing_url") or "",
                "primary_category": listing.get("apple_category") or listing.get("google_category") or "",
                "contact_email": listing.get("contact_email") or "",
                "contact_phone": listing.get("contact_phone") or "",
                "target_audience": listing.get("audience") or "",
                "age_rating_notes": listing.get("age_rating_notes") or "",
                "copyright": listing.get("copyright") or "",
                "review_notes": listing.get("reviewer_notes") or "",
                "compliance_notes": listing.get("compliance_notes") or "",
                "marketing_notes": listing.get("marketing_notes") or "",
                "review_contact_first_name": contact_name[0] if contact_name else "",
                "review_contact_last_name": contact_name[1] if len(contact_name) > 1 else "",
                "requires_login": bool(declarations.get("account_creation")),
                "allows_account_creation": bool(declarations.get("account_creation")),
                "contains_ads": bool(declarations.get("ads")),
                "uses_tracking": bool(declarations.get("tracking")),
                "collects_personal_data": bool(declarations.get("personal_data")),
                "uses_encryption": bool(declarations.get("encryption", True)),
                "user_generated_content": bool(declarations.get("ugc")),
                "children_targeted": bool(declarations.get("children")),
                "regulated_features": bool(declarations.get("regulated")),
                "apple_bundle_registered": bool(release_checks.get("apple_bundle_registered")),
                "apple_app_record_created": bool(release_checks.get("apple_app_record_created")),
                "google_app_record_created": bool(release_checks.get("google_app_record_created")),
                "play_app_signing_enabled": bool(release_checks.get("play_app_signing_enabled")),
                "apple_privacy_confirmed": bool(release_checks.get("apple_privacy_confirmed")),
                "google_data_safety_confirmed": bool(release_checks.get("google_data_safety_confirmed")),
                "store_agreements_active": bool(release_checks.get("store_agreements_active")),
            },
        }
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            yaml.safe_dump({"work_dir": "../.factory/work", "apps": [app_record]}, sort_keys=False),
            encoding="utf-8",
        )
        return output

    def upsert_organization(self, app: App) -> dict[str, Any]:
        payload = {
            "slug": app.suite,
            "name": app.store.brand_name or app.suite.replace("-", " ").title(),
        }
        result = self._request(
            "POST", "organisations", payload, query="?on_conflict=slug"
        )
        if not isinstance(result, list) or not result or not result[0].get("id"):
            raise ConfigError("Supabase did not return the organisation ID")
        return result[0]

    def upsert_app(self, app: App) -> dict[str, Any]:
        organization = self.upsert_organization(app)
        payload = {
            "slug": app.slug,
            "org_id": organization["id"],
            "suite": app.suite,
            "app_role": app.app_role,
            "display_name": app.native.display_name,
            "source_repo": app.source.repo,
            "source_ref": app.source.ref,
            "engine": app.native.engine,
            "runner": app.native.runner,
            "ios_bundle_id": app.native.ios_bundle_id,
            "android_package": app.native.android_package,
            "credential_scope": app.slug,
            "legal_owner": app.store.legal_owner,
            "public_brand": app.store.brand_name,
            "support_url": app.store.support_url,
            "privacy_url": app.store.privacy_url,
            "apple_team_id": app.store.apple_team_id,
            "apple_app_id": app.store.apple_app_id,
            "google_developer_name": app.store.google_developer_name,
            "manifest": asdict(app),
            "store_record": asdict(app.store),
            "active": True,
        }
        result = self._request(
            "POST", "native_apps", payload, query="?on_conflict=slug"
        )
        return result[0] if isinstance(result, list) and result else payload

    def save_plan(
        self, slug: str, *, prompt: str, plan: str, status: str = "draft"
    ) -> Any:
        apps = self._request(
            "GET",
            "native_apps",
            query=f"?slug=eq.{urllib.parse.quote(slug)}&select=id,org_id",
        )
        if not isinstance(apps, list) or not apps:
            raise ConfigError(f"Native app {slug!r} is not present in Supabase")
        app = apps[0]
        existing = self._request(
            "GET",
            "native_app_plans",
            query=(
                f"?app_id=eq.{app['id']}&select=version&order=version.desc&limit=1"
            ),
        )
        version = int(existing[0]["version"]) + 1 if existing else 1
        return self._request(
            "POST",
            "native_app_plans",
            {
                "app_id": app["id"],
                "org_id": app["org_id"],
                "version": version,
                "prompt": prompt,
                "plan_markdown": plan,
                "status": status,
            },
        )

    def create_build_job(
        self, slug: str, platform: str, *, submit: bool, metadata: bool
    ) -> Any:
        apps = self._request(
            "GET",
            "native_apps",
            query=f"?slug=eq.{urllib.parse.quote(slug)}&select=id,org_id,active",
        )
        if not isinstance(apps, list) or not apps or not apps[0].get("active"):
            raise ConfigError(f"Unknown or inactive app: {slug}")
        app = apps[0]
        return self._request(
            "POST",
            "native_build_jobs",
            {
                "app_id": app["id"],
                "org_id": app["org_id"],
                "platform": platform,
                "destination": "internal",
                "submit_to_internal": submit,
                "upload_metadata": metadata,
                "status": "queued",
            },
        )
