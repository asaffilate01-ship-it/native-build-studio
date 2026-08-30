import plistlib
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

from native_factory.config import load_config
from native_factory.factory import NativeFactory
from native_factory.onboarding import onboard_capacitor_app
from native_factory.readiness import app_readiness, has_failures, toolchain_doctor


def png(path: Path, width: int, height: int) -> None:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    raw = b"\x00" + b"\x00\x00\x00" * width
    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw * height))
    data += chunk(b"IEND", b"")
    path.write_bytes(data)


class OnboardingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.config_path = self.root / "config" / "apps.yml"
        self.icon = self.root / "icon.png"
        self.splash = self.root / "splash.png"
        self.google_services = self.root / "google-services.json"
        png(self.icon, 1024, 1024)
        png(self.splash, 2732, 2732)
        self.google_services.write_text("{}\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_onboard_creates_loadable_hosted_app(self) -> None:
        onboard_capacitor_app(
            self.config_path,
            slug="haccora",
            display_name="Haccora",
            repo="https://github.com/example/haccora.git",
            app_id="uk.co.haccora.app",
            icon=self.icon,
            splash=self.splash,
            capabilities=("camera", "push"),
            google_services_json=self.google_services,
            suite="haccora",
            app_role="main",
            store={
                "brand_name": "Haccora",
                "legal_owner": "iTechLounge Ltd",
                "support_url": "https://haccora.co.uk/support",
                "privacy_url": "https://haccora.co.uk/privacy",
                "account_deletion_url": "https://haccora.co.uk/delete-account",
                "google_developer_name": "Haccora",
            },
        )
        app = load_config(self.config_path).get_app("haccora")
        self.assertEqual(app.native.runner, "github-macos")
        self.assertEqual(app.native.capabilities, ("camera", "push"))
        self.assertEqual(app.suite, "haccora")
        self.assertEqual(app.store.google_developer_name, "Haccora")

        readiness = app_readiness(app, platform="all", submit=True)
        self.assertFalse(has_failures(readiness))
        self.assertTrue(any(item.level == "INFO" for item in readiness))

        doctor = toolchain_doctor(app, "all")
        self.assertFalse(has_failures(doctor))
        self.assertTrue(any(item.label == "native runner" for item in doctor))

        wrapper = self.root / "wrapper"
        app_dir = wrapper / "ios" / "App" / "App"
        project_dir = wrapper / "ios" / "App" / "App.xcodeproj"
        app_dir.mkdir(parents=True)
        project_dir.mkdir(parents=True)
        (app_dir / "AppDelegate.swift").write_text(
            "import UIKit\nclass AppDelegate: UIResponder, UIApplicationDelegate {\n}\n",
            encoding="utf-8",
        )
        (project_dir / "project.pbxproj").write_text(
            "buildSettings = {\n};\n", encoding="utf-8"
        )
        NativeFactory._apply_ios_entitlements(app, wrapper)
        with (app_dir / "App.entitlements").open("rb") as source:
            self.assertEqual(plistlib.load(source)["aps-environment"], "production")
        delegate = (app_dir / "AppDelegate.swift").read_text(encoding="utf-8")
        self.assertIn("capacitorDidRegisterForRemoteNotifications", delegate)

    def test_runtime_identity_distinguishes_role_apps(self) -> None:
        onboard_capacitor_app(
            self.config_path,
            slug="haccora-kitchen",
            suite="haccora",
            app_role="kitchen",
            display_name="Haccora Kitchen",
            repo="https://github.com/example/haccora.git",
            app_id="uk.co.haccora.kitchen",
            icon=self.icon,
            splash=self.splash,
        )
        app = load_config(self.config_path).get_app("haccora-kitchen")
        web_dir = self.root / "dist"
        web_dir.mkdir()
        (web_dir / "index.html").write_text(
            "<html><head></head><body></body></html>", encoding="utf-8"
        )
        NativeFactory._inject_runtime_identity(app, web_dir)
        runtime = (web_dir / "native-factory-runtime.js").read_text(encoding="utf-8")
        self.assertIn('"role":"kitchen"', runtime)
        self.assertIn("native-factory-runtime.js", (web_dir / "index.html").read_text())


if __name__ == "__main__":
    unittest.main()
