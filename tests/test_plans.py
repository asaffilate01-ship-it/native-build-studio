import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from native_factory.config import load_config
from native_factory.factory import NativeFactory
from native_factory.process import ProcessRunner


def make_config(tmp_path: Path, engine: str, runner: str) -> Path:
    path = tmp_path / "apps.yml"
    path.write_text(
        f"""work_dir: work
apps:
  - slug: test-app
    source:
      repo: https://example.invalid/test.git
      install_command: npm ci
      build_command: npm run build
      web_dir: dist
    native:
      engine: {engine}
      runner: {runner}
      display_name: Test App
      ios_bundle_id: com.example.testapp
      android_package: com.example.testapp
    assets:
      icon: icon.png
      splash: splash.png
""",
        encoding="utf-8",
    )
    return path


class PlanTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_capacitor_plan_uses_cap_and_fastlane(self) -> None:
        config = load_config(make_config(self.tmp_path, "capacitor", "mac"))
        runner = ProcessRunner(dry_run=True)
        factory = NativeFactory(config, self.tmp_path / "templates", runner)
        plan = "\n".join(factory.build("test-app", "ios"))
        self.assertIn("cap add ios", plan)
        self.assertNotIn("CocoaPods", plan)
        self.assertIn("cap sync", plan)
        self.assertIn("fastlane ios release", plan)
        self.assertNotIn("eas-cli", plan)

    def test_expo_plan_uses_eas(self) -> None:
        config = load_config(make_config(self.tmp_path, "expo", "eas"))
        runner = ProcessRunner(dry_run=True)
        factory = NativeFactory(config, self.tmp_path / "templates", runner)
        plan = "\n".join(factory.build("test-app", "android", submit=True))
        self.assertIn("eas-cli build --platform android", plan)
        self.assertIn("--auto-submit", plan)
        self.assertNotIn("fastlane", plan)

    def test_capability_plan_installs_native_plugins(self) -> None:
        path = make_config(self.tmp_path, "capacitor", "github-macos")
        content = path.read_text(encoding="utf-8").replace(
            "display_name: Test App", "display_name: Test App\n      capabilities: [camera, share]"
        )
        path.write_text(content, encoding="utf-8")
        config = load_config(path)
        runner = ProcessRunner(dry_run=True)
        factory = NativeFactory(config, self.tmp_path / "templates", runner)
        plan = "\n".join(factory.build("test-app", "android"))
        self.assertIn("@capacitor/camera@latest-8", plan)
        self.assertIn("@capacitor/share@latest-8", plan)

    def test_ci_run_number_is_added_to_manifest_base(self) -> None:
        config = load_config(make_config(self.tmp_path, "capacitor", "github-macos"))
        app = config.get_app("test-app")
        with patch.dict("os.environ", {"FACTORY_CI_RUN_NUMBER": "41"}):
            self.assertEqual(NativeFactory._build_number(app), 42)

    def test_exact_source_sha_is_checked_out_for_reproducible_build(self) -> None:
        config = load_config(make_config(self.tmp_path, "capacitor", "github-macos"))
        runner = ProcessRunner(dry_run=True)
        factory = NativeFactory(config, self.tmp_path / "templates", runner)
        with patch.dict("os.environ", {"FACTORY_SOURCE_SHA": "a1b2c3d4e5f6"}):
            plan = "\n".join(factory.build("test-app", "android"))
        self.assertIn("--no-checkout", plan)
        self.assertIn("fetch --depth 1 origin a1b2c3d4e5f6", plan)
        self.assertIn("checkout --detach a1b2c3d4e5f6", plan)


if __name__ == "__main__":
    unittest.main()
