import unittest
from unittest.mock import patch

from native_factory.control_plane import SupabaseControlPlane
from native_factory.models import App


def example_app() -> App:
    return App.from_dict(
        {
            "slug": "example-driver",
            "suite": "example-platform",
            "app_role": "driver",
            "source": {"repo": "https://github.com/example/platform.git"},
            "native": {
                "engine": "capacitor",
                "runner": "github-macos",
                "display_name": "Example Driver",
                "ios_bundle_id": "uk.co.example.driver",
                "android_package": "uk.co.example.driver",
            },
            "assets": {"icon": "icon.png", "splash": "splash.png"},
            "store": {
                "brand_name": "Example Platform",
                "legal_owner": "Example Platform Ltd",
                "support_url": "https://example.com/support",
                "privacy_url": "https://example.com/privacy",
            },
        }
    )


class ControlPlaneTests(unittest.TestCase):
    def test_sync_uses_lovable_schema_names(self) -> None:
        client = SupabaseControlPlane("https://example.supabase.co", "service-key")
        calls = []

        def fake_request(method, table, payload=None, *, query=""):
            calls.append((method, table, payload, query))
            if table == "organisations":
                return [{"id": "org-1", "slug": "example-platform"}]
            if table == "native_apps":
                return [{"id": "app-1", **(payload or {})}]
            return []

        with patch.object(client, "_request", side_effect=fake_request):
            client.upsert_app(example_app())

        self.assertEqual(calls[0][1], "organisations")
        app_payload = calls[1][2]
        self.assertEqual(app_payload["org_id"], "org-1")
        self.assertNotIn("organization_id", app_payload)
        self.assertEqual(app_payload["legal_owner"], "Example Platform Ltd")

    def test_plan_resolves_app_and_increments_version(self) -> None:
        client = SupabaseControlPlane("https://example.supabase.co", "service-key")

        def fake_request(method, table, payload=None, *, query=""):
            if method == "GET" and table == "native_apps":
                return [{"id": "app-1", "org_id": "org-1"}]
            if method == "GET" and table == "native_app_plans":
                return [{"version": 3}]
            if method == "POST" and table == "native_app_plans":
                return [payload]
            return []

        with patch.object(client, "_request", side_effect=fake_request):
            result = client.save_plan("example-driver", prompt="prompt", plan="plan")

        self.assertEqual(result[0]["app_id"], "app-1")
        self.assertEqual(result[0]["org_id"], "org-1")
        self.assertEqual(result[0]["version"], 4)


if __name__ == "__main__":
    unittest.main()
