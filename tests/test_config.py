import tempfile
import unittest
from pathlib import Path

from native_factory.config import load_config
from native_factory.models import ConfigError


def write_config(tmp_path: Path, app_blocks: str) -> Path:
    path = tmp_path / "apps.yml"
    path.write_text(f"work_dir: work\napps:\n{app_blocks}", encoding="utf-8")
    return path


def capacitor_block(slug: str = "demo-app", bundle: str = "com.example.demo") -> str:
    return f"""  - slug: {slug}
    source:
      repo: https://example.invalid/repo.git
    native:
      engine: capacitor
      runner: mac
      display_name: Demo
      ios_bundle_id: {bundle}
      android_package: {bundle}
    assets:
      icon: icon.png
      splash: splash.png
"""


class ConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_valid_config(self) -> None:
        config = load_config(write_config(self.tmp_path, capacitor_block()))
        self.assertEqual(config.get_app("demo-app").native.engine, "capacitor")
        self.assertEqual(config.work_dir, self.tmp_path / "work")

    def test_capacitor_cannot_use_eas(self) -> None:
        block = capacitor_block().replace("runner: mac", "runner: eas")
        with self.assertRaisesRegex(ConfigError, "EAS is for Expo"):
            load_config(write_config(self.tmp_path, block))

    def test_capacitor_requires_one_identifier(self) -> None:
        block = capacitor_block().replace(
            "android_package: com.example.demo", "android_package: com.example.android"
        )
        with self.assertRaisesRegex(ConfigError, "one appId"):
            load_config(write_config(self.tmp_path, block))

    def test_duplicate_bundle_ids_are_rejected(self) -> None:
        blocks = capacitor_block("first-app") + capacitor_block("second-app")
        with self.assertRaisesRegex(ConfigError, "Duplicate ios_bundle_id"):
            load_config(write_config(self.tmp_path, blocks))

    def test_live_url_requires_https(self) -> None:
        block = capacitor_block().replace(
            "display_name: Demo",
            "display_name: Demo\n"
            "      embed_web_assets: false\n"
            "      live_server_url: http://unsafe.test",
        )
        with self.assertRaisesRegex(ConfigError, "HTTPS"):
            load_config(write_config(self.tmp_path, block))


if __name__ == "__main__":
    unittest.main()
