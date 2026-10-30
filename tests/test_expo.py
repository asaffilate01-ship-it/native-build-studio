import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from test_plans import make_config

from native_factory.config import load_config
from native_factory.expo import save_build_evidence, validate_resolved_config
from native_factory.factory import NativeFactory
from native_factory.models import ConfigError
from native_factory.process import ProcessRunner
from native_factory.source_inspection import inspect_source


class ExpoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = load_config(make_config(self.root, "expo", "eas"))
        self.app = self.config.get_app("test-app")

    def record(self, platform="ANDROID", status="FINISHED"):
        return {"id": "build-123", "platform": platform, "status": status,
                "artifacts": {"buildUrl": "https://example.test/app.aab"},
                "private_field": "not-for-evidence"}

    def resolved(self):
        return {"name": "Test App", "version": "1.0.0",
                "ios": {"bundleIdentifier": "com.example.testapp"},
                "android": {"package": "com.example.testapp"},
                "extra": {"eas": {"projectId": "project-123"}}}

    def test_completed_builds_have_sanitized_evidence(self):
        save_build_evidence(json.dumps([self.record()]), self.root, "android", True)
        evidence = (self.root / "eas-builds.json").read_text()
        self.assertNotIn("private_field", evidence)
        self.assertIn("requested_not_verified", evidence)
        self.assertIn("build-123", evidence)

    def test_incomplete_failed_or_partial_builds_never_pass(self):
        for records, platform in [
            ([], "android"), ([self.record(status="IN_QUEUE")], "android"),
            ([self.record(status="ERRORED")], "android"),
            ([self.record()], "all"), ([self.record(), self.record()], "all"),
            ([{**self.record(), "artifacts": {}}], "android"),
        ]:
            with self.subTest(records=records), self.assertRaises(ConfigError):
                save_build_evidence(json.dumps(records), self.root, platform, False)

    def test_both_platforms_must_finish(self):
        save_build_evidence(json.dumps([self.record(), self.record("IOS")]),
                            self.root, "all", False)

    def test_invalid_evidence_is_rejected(self):
        for raw in ("not json", "{}", '[null]'):
            with self.subTest(raw=raw), self.assertRaises(ConfigError):
                save_build_evidence(raw, self.root, "all", False)

    def test_resolved_identity_and_project_are_required(self):
        validate_resolved_config(json.dumps(self.resolved()), self.app, "all")
        for value in (None, {}, {**self.resolved(), "extra": {}},
                      {**self.resolved(), "android": {"package": "another.app.id"}}):
            with self.subTest(value=value), self.assertRaises(ConfigError):
                validate_resolved_config(json.dumps(value), self.app, "all")

    def test_dynamic_config_is_preserved_and_mismatch_prevents_cloud_build(self):
        for filename in ("app.config.js", "app.config.ts"):
            with self.subTest(filename=filename):
                source = self.config.work_dir / self.app.slug / "source"
                source.mkdir(parents=True, exist_ok=True)
                (source / "package.json").write_text(json.dumps({"dependencies": {
                    "expo": "*", "react-native": "*"}}))
                dynamic_text = "export default ({ config }) => ({ ...config });\n"
                (source / filename).write_text(dynamic_text)
                Path(self.app.assets.icon).write_bytes(b"icon")
                Path(self.app.assets.splash).write_bytes(b"splash")
                factory = NativeFactory(self.config, self.root, ProcessRunner())
                with patch.object(factory, "_checkout"), patch.object(
                    factory.runner, "run", side_effect=["", json.dumps(self.resolved()),
                                                         json.dumps([self.record()])]
                ) as run:
                    factory.build("test-app", "android")
                    self.assertIn("--wait", run.call_args.args[0])
                    self.assertNotIn("--no-wait", run.call_args.args[0])
                self.assertEqual((source / filename).read_text(), dynamic_text)
                with patch.object(factory, "_checkout"), patch.object(
                    factory.runner, "run", side_effect=["", json.dumps({})]
                ) as run, self.assertRaises(ConfigError):
                    factory.build("test-app", "android")
                self.assertEqual(run.call_count, 2)
                self.assertFalse((source.parent / "artifacts/eas-builds.json").exists())
                (source / filename).unlink()

    def test_source_recommendation_does_not_execute_scripts(self):
        for dependencies, engine in [({"expo": "*", "react-native": "*"}, "expo"),
                                     ({"react-dom": "*"}, "capacitor"),
                                     ({"react-native": "*"}, "manual"), ({}, "manual")]:
            (self.root / "package.json").write_text(json.dumps({
                "dependencies": dependencies, "scripts": {"postinstall": "exit 99"}}))
            self.assertEqual(inspect_source(self.root)["engine"], engine)

    def test_runner_capture_keeps_output_out_of_log(self):
        runner = ProcessRunner()
        with patch("native_factory.process.subprocess.run") as run:
            run.return_value.stdout = '{"ok":true}'
            self.assertEqual(runner.run(["example"], cwd=self.root, capture=True), '{"ok":true}')
            self.assertNotIn('ok', str(runner.commands))


if __name__ == "__main__":
    unittest.main()
