import tempfile
import unittest
from pathlib import Path

from native_factory.models import App
from native_factory.planner import planning_prompt, write_plan_pack


class PlannerTests(unittest.TestCase):
    def app(self) -> App:
        return App.from_dict(
            {
                "slug": "haccora-driver",
                "suite": "haccora",
                "app_role": "driver",
                "source": {"repo": "https://github.com/example/haccora.git"},
                "native": {
                    "engine": "capacitor",
                    "runner": "github-macos",
                    "display_name": "Haccora Driver",
                    "ios_bundle_id": "uk.co.haccora.driver",
                    "android_package": "uk.co.haccora.driver",
                    "capabilities": ["camera", "push"],
                },
                "assets": {"icon": "icon.png", "splash": "splash.png"},
            }
        )

    def test_prompt_is_role_aware_and_requires_human_confirmation(self) -> None:
        prompt = planning_prompt(self.app(), "Drivers accept and deliver orders")
        self.assertIn("Role: driver", prompt)
        self.assertIn("Supabase tables, RLS policies", prompt)
        self.assertIn("HUMAN CONFIRMATION", prompt)

    def test_plan_pack_can_be_exported_without_api_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            prompt_path, plan_path, _ = write_plan_pack(
                Path(directory), self.app(), goals="UK pilot", call_ai=False
            )
            self.assertTrue(prompt_path.is_file())
            self.assertIsNone(plan_path)
            self.assertIn("UK pilot", prompt_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
