"""Inspect source metadata without installing or executing customer code."""
from __future__ import annotations

import json
from pathlib import Path

from .models import ConfigError


def inspect_source(root: Path) -> dict[str, str]:
    try:
        package = json.loads((root / "package.json").read_text(encoding="utf-8"))
        if not isinstance(package, dict):
            raise TypeError("package.json must be an object")
        dependencies = {}
        for key in ("dependencies", "devDependencies"):
            values = package.get(key, {})
            if not isinstance(values, dict):
                raise TypeError(f"{key} must be an object")
            dependencies.update(values)
    except (OSError, ValueError, TypeError) as exc:
        raise ConfigError("Source requires a valid package.json at the selected project root") from exc
    if "expo" in dependencies and "react-native" in dependencies:
        return {"engine": "expo", "runner": "eas", "reason": "Expo and React Native detected"}
    if "react-native" in dependencies:
        return {"engine": "manual", "runner": "manual", "reason":
                "React Native detected; configure Expo/EAS before using the Expo route"}
    if "@capacitor/core" in dependencies or "react-dom" in dependencies or any(
        name in dependencies for name in ("vue", "@angular/core", "svelte")
    ):
        return {"engine": "capacitor", "runner": "github-macos", "reason":
                "Web app detected; verify that its build exports static assets with index.html"}
    return {"engine": "manual", "runner": "manual", "reason":
            "Source type is ambiguous; select the app package directory and verify its framework"}


def require_engine(root: Path, engine: str) -> None:
    result = inspect_source(root)
    if result["engine"] != engine:
        raise ConfigError(
            f"Selected engine {engine} does not match source: {result['reason']}. "
            f"Recommended route: {result['engine']}. No automatic conversion was performed."
        )
