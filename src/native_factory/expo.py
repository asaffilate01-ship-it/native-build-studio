"""Expo configuration validation and completed-build evidence."""
from __future__ import annotations

import json
from pathlib import Path

from .models import App, ConfigError, Platform


def validate_resolved_config(raw: str, app: App, platform: Platform) -> None:
    try:
        config = json.loads(raw)
        expected = {"name": app.native.display_name, "version": app.native.version}
        if not isinstance(config, dict):
            raise TypeError()
        for key, value in expected.items():
            if config.get(key) != value:
                raise ConfigError(f"Resolved Expo {key} must match the factory manifest")
        targets = ("ios", "android") if platform == "all" else (platform,)
        for target in targets:
            key = "bundleIdentifier" if target == "ios" else "package"
            value = app.native.ios_bundle_id if target == "ios" else app.native.android_package
            if config.get(target, {}).get(key) != value:
                raise ConfigError(f"Resolved Expo {target}.{key} must match the factory manifest")
        project = config.get("extra", {}).get("eas", {}).get("projectId")
        if not isinstance(project, str) or not project.strip():
            raise ConfigError("Link this source to an EAS project before building (extra.eas.projectId)")
    except (ValueError, AttributeError, TypeError) as exc:
        if isinstance(exc, ConfigError):
            raise
        raise ConfigError("Expo config did not return a valid configuration object") from exc


def save_build_evidence(raw: str, directory: Path, platform: Platform, submit: bool) -> None:
    try:
        records = json.loads(raw)
    except ValueError as exc:
        raise ConfigError("EAS returned invalid build evidence; completion is unverified") from exc
    if not isinstance(records, list) or not records or any(
        not isinstance(record, dict) for record in records
    ):
        raise ConfigError("EAS returned no build records; completion is unverified")
    # Keep only delivery evidence, never the full provider response or resolved config.
    builds = [{
        "id": item.get("id"), "platform": item.get("platform"), "status": item.get("status"),
        "artifact_url": (item.get("artifacts") or {}).get("buildUrl"),
    } for item in records]
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "eas-builds.json").write_text(json.dumps({
        "builds": builds,
        "submission": "requested_not_verified" if submit else "not_requested",
    }, indent=2) + "\n", encoding="utf-8")
    expected = {"IOS", "ANDROID"} if platform == "all" else {platform.upper()}
    actual = [item["platform"] for item in builds]
    if len(actual) != len(expected) or set(actual) != expected or any(
        item["status"] != "FINISHED" or not item["id"] or not item["artifact_url"]
        for item in builds
    ):
        raise ConfigError("EAS has not confirmed a finished binary for every requested platform")
