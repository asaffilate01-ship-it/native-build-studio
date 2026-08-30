from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict
from typing import Any

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
