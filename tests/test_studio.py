import io
import json
import struct
import subprocess
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest.mock import patch

from native_factory.config import load_config
from native_factory.studio import StudioServices, create_studio_app


def png_bytes(width: int, height: int) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    raw = b"\x00" + b"\x00\x00\x00" * width
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw * height))
        + chunk(b"IEND", b"")
    )


class StudioTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.config_path = self.root / "config" / "apps.yml"
        self.app = create_studio_app(self.config_path)
        self.client = self.app.test_client()
        state = self.client.get("/api/state").get_json()
        self.csrf = state["csrf"]

    def tearDown(self) -> None:
        self.temp.cleanup()

    def app_payload(self, slug: str, role: str, app_id: str) -> dict:
        return {
            "slug": slug,
            "suite": "haccora",
            "app_role": role,
            "display_name": f"Haccora {role.title()}",
            "app_id": app_id,
            "repo": "https://github.com/example/haccora.git",
            "source_ref": "main",
            "web_dir": "dist",
            "package_manager": "bun",
            "runner": "github-macos",
            "ios_package_manager": "spm",
            "capabilities": ["camera", "push"],
            "brand_name": "Haccora",
            "legal_owner": "iTechLounge Ltd",
            "support_url": "https://haccora.co.uk/support",
            "privacy_url": "https://haccora.co.uk/privacy",
            "account_deletion_url": "https://haccora.co.uk/delete-account",
            "google_developer_name": "Haccora",
            "play_track": "internal",
            "icon": (io.BytesIO(png_bytes(1024, 1024)), "icon.png"),
            "splash": (io.BytesIO(png_bytes(2732, 2732)), "splash.png"),
            "google_services_json": (io.BytesIO(b"{}\n"), "google-services.json"),
        }

    def add_app(self, slug: str, role: str, app_id: str):
        return self.client.post(
            "/api/apps",
            data=self.app_payload(slug, role, app_id),
            headers={"X-Factory-CSRF": self.csrf},
            content_type="multipart/form-data",
        )

    def test_studio_requires_csrf_for_writes(self) -> None:
        response = self.client.post("/api/apps", data={})
        self.assertEqual(response.status_code, 403)

    def test_studio_creates_multi_app_suite(self) -> None:
        first = self.add_app("haccora-customer", "customer", "uk.co.haccora.customer")
        self.assertEqual(first.status_code, 200, first.get_data(as_text=True))
        second = self.add_app("haccora-kitchen", "kitchen", "uk.co.haccora.kitchen")
        self.assertEqual(second.status_code, 200, second.get_data(as_text=True))
        config = load_config(self.config_path)
        self.assertEqual(len(config.apps), 2)
        self.assertEqual({app.suite for app in config.apps}, {"haccora"})
        self.assertEqual(
            {app.app_role for app in config.apps}, {"customer", "kitchen"}
        )

    def test_credentials_are_streamed_to_github_not_manifest(self) -> None:
        self.add_app("haccora-customer", "customer", "uk.co.haccora.customer")
        calls: list[tuple[list[str], str | None]] = []

        def fake_gh(arguments, *, input_value=None, check=True):
            calls.append((arguments, input_value))
            return subprocess.CompletedProcess(arguments, 0, "", "")

        with patch.object(StudioServices, "_gh", side_effect=fake_gh):
            response = self.client.post(
                "/api/apps/haccora-customer/credentials",
                data={
                    "factory_repo": "example/native-factory",
                    "apple_key_id": "KEY123",
                    "apple_private_key": (
                        io.BytesIO(b"-----BEGIN PRIVATE KEY-----\nprivate-key"),
                        "AuthKey.p8",
                    ),
                },
                headers={"X-Factory-CSRF": self.csrf},
                content_type="multipart/form-data",
            )
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        self.assertTrue(any(value == "KEY123" for _, value in calls))
        self.assertTrue(
            any(
                value
                == "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCnByaXZhdGUta2V5"
                for _, value in calls
            )
        )
        manifest = self.config_path.read_text(encoding="utf-8")
        self.assertNotIn("KEY123", manifest)
        self.assertNotIn("private-key", manifest)

    def test_bridge_covers_multiple_role_apps(self) -> None:
        workflow = StudioServices.bridge_workflow(
            "example/native-factory",
            ["haccora-customer", "haccora-kitchen"],
            "main",
        )
        self.assertIn("haccora-customer haccora-kitchen", workflow)
        self.assertIn("lovable-app-updated", workflow)
        self.assertIn("secrets.FACTORY_DISPATCH_TOKEN", workflow)
        self.assertNotIn("ghp_", workflow)

    def test_bridge_can_upload_each_change_to_internal_testing(self) -> None:
        workflow = StudioServices.bridge_workflow(
            "example/native-factory", ["haccora-customer"], "main", auto_submit=True
        )
        self.assertIn('client_payload[submit]=true', workflow)
        self.assertIn('client_payload[metadata]=false', workflow)
        self.assertIn('client_payload[source_sha]=$GITHUB_SHA', workflow)

    def test_store_workspace_generates_brief_and_submission_package(self) -> None:
        self.add_app("haccora-customer", "customer", "uk.co.haccora.customer")
        response = self.client.patch(
            "/api/apps/haccora-customer/store",
            json={
                "app_title": "Haccora",
                "apple_subtitle": "Order with confidence",
                "google_short_description": "Order and track from local brands.",
                "full_description": "A reliable way to order and track services.",
                "apple_keywords": "orders,tracking,local",
                "release_notes": "Initial testing release.",
                "contact_email": "support@haccora.co.uk",
                "target_audience": "UK adults",
                "requires_login": True,
                "uses_tracking": False,
            },
            headers={"X-Factory-CSRF": self.csrf},
        )
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        app = load_config(self.config_path).get_app("haccora-customer")
        self.assertEqual(app.store.app_title, "Haccora")
        self.assertTrue(app.store.requires_login)

        brief = self.client.post(
            "/api/apps/haccora-customer/brief",
            headers={"X-Factory-CSRF": self.csrf},
        )
        self.assertEqual(brief.status_code, 200)
        brief_path = Path(brief.get_json()["path"])
        self.assertIn("window.__NATIVE_FACTORY__", brief_path.read_text(encoding="utf-8"))

        package = self.client.post(
            "/api/apps/haccora-customer/store-package",
            headers={"X-Factory-CSRF": self.csrf},
        )
        self.assertEqual(package.status_code, 200)
        package_path = Path(package.get_json()["path"])
        self.assertEqual(
            (package_path / "ios/fastlane/metadata/en-GB/name.txt").read_text().strip(),
            "Haccora",
        )
        self.assertTrue((package_path / "SUBMISSION_HANDOFF.md").is_file())

    def test_store_limits_are_enforced(self) -> None:
        self.add_app("haccora-customer", "customer", "uk.co.haccora.customer")
        response = self.client.patch(
            "/api/apps/haccora-customer/store",
            json={"app_title": "x" * 31},
            headers={"X-Factory-CSRF": self.csrf},
        )
        self.assertEqual(response.status_code, 400)

    def test_release_requires_complete_listing_and_exact_tested_build(self) -> None:
        self.add_app("project-customer", "customer", "uk.co.project.customer")
        required = {
            "app_title": "Project Customer",
            "full_description": "A complete customer application description.",
            "release_notes": "Tested release candidate.",
            "contact_email": "review@example.com",
            "contact_phone": "+441234567890",
            "review_contact_first_name": "Test",
            "review_contact_last_name": "Reviewer",
            "target_audience": "UK adults",
            "compliance_notes": "Privacy and SDK declarations reviewed.",
            "apple_app_id": "1234567890",
            "apple_bundle_registered": True,
            "apple_app_record_created": True,
            "apple_privacy_confirmed": True,
            "store_agreements_active": True,
        }
        response = self.client.patch(
            "/api/apps/project-customer/store",
            json=required,
            headers={"X-Factory-CSRF": self.csrf},
        )
        self.assertEqual(response.status_code, 200)
        screenshot = self.client.post(
            "/api/apps/project-customer/store-assets/apple-iphone",
            data={"files": (io.BytesIO(png_bytes(1290, 2796)), "screen.png")},
            headers={"X-Factory-CSRF": self.csrf},
            content_type="multipart/form-data",
        )
        self.assertEqual(screenshot.status_code, 200, screenshot.get_data(as_text=True))

        calls: list[list[str]] = []

        def fake_gh(arguments, *, input_value=None, check=True):
            calls.append(arguments)
            return subprocess.CompletedProcess(arguments, 0, "", "")

        with patch.object(StudioServices, "_gh", side_effect=fake_gh):
            release = self.client.post(
                "/api/apps/project-customer/release",
                json={
                    "platform": "ios",
                    "tested_build_number": "42",
                    "source_sha": "a1b2c3d4e5f67890",
                    "qa_notes": "Tested login, camera and offline resume on two devices.",
                    "confirmation": "SUBMIT project-customer",
                    "factory_repo": "example/native-factory",
                },
                headers={"X-Factory-CSRF": self.csrf},
            )
        self.assertEqual(release.status_code, 200, release.get_data(as_text=True))
        self.assertTrue(any("promote-approved-build.yml" in call for call in calls))

    def test_studio_settings_contain_no_credentials(self) -> None:
        services = StudioServices(self.config_path)
        services.save_settings(factory_repo="example/native-factory")
        values = json.loads(services.settings_path.read_text(encoding="utf-8"))
        self.assertEqual(values, {"factory_repo": "example/native-factory"})

    def test_factory_publish_blocks_signing_and_service_account_files(self) -> None:
        unsafe = StudioServices._unsafe_staged_files(
            [
                "README.md",
                "assets/app/AuthKey_ABC.p8",
                "assets/app/upload.jks",
                "assets/app/play-service-account.json",
            ]
        )
        self.assertEqual(
            unsafe,
            [
                "assets/app/AuthKey_ABC.p8",
                "assets/app/play-service-account.json",
                "assets/app/upload.jks",
            ],
        )


if __name__ == "__main__":
    unittest.main()
