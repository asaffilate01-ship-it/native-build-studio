from __future__ import annotations

import json
import os
import urllib.error
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
        self, method: str, table: str, payload: Any, *, query: str = ""
    ) -> Any:
        endpoint = f"{self.url}/rest/v1/{table}{query}"
        data = json.dumps(payload).encode("utf-8")
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
            "legal_owner": app.store.legal_owner,
        }
        result = self._request(
            "POST", "native_organizations", payload, query="?on_conflict=slug"
        )
        if not isinstance(result, list) or not result or not result[0].get("id"):
            raise ConfigError("Supabase did not return the organisation ID")
        return result[0]

    def upsert_app(self, app: App) -> dict[str, Any]:
        organization = self.upsert_organization(app)
        payload = {
            "slug": app.slug,
            "organization_id": organization["id"],
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
        return self._request(
            "POST",
            "native_app_plans",
            {"app_slug": slug, "prompt": prompt, "plan_markdown": plan, "status": status},
        )

    def create_build_job(
        self, slug: str, platform: str, *, submit: bool, metadata: bool
    ) -> Any:
        # The SQL helper resolves the slug and keeps the public API free of internal UUIDs.
        return self._request(
            "POST",
            "rpc/queue_native_build",
            {
                "target_slug": slug,
                "target_platform": platform,
                "should_submit": submit,
                "should_upload_metadata": metadata,
            },
        )
