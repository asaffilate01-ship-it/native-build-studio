from __future__ import annotations

import copy
from pathlib import Path

import yaml

from .models import App, ConfigError, FactoryConfig


def load_config(path: Path) -> FactoryConfig:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ConfigError(f"Config not found: {path}") from exc
    except yaml.YAMLError as exc:
        raise ConfigError(f"Invalid YAML in {path}: {exc}") from exc

    if not isinstance(raw, dict) or not isinstance(raw.get("apps"), list):
        raise ConfigError("Config requires an apps list")
    base = path.parent.resolve()
    work_dir_value = raw.get("work_dir", ".factory/work")
    work_dir = Path(work_dir_value)
    if not work_dir.is_absolute():
        work_dir = (base / work_dir).resolve()

    app_records = []
    for original in raw["apps"]:
        item = copy.deepcopy(original)
        repo = str(item.get("source", {}).get("repo", ""))
        if repo.startswith(("./", "../")):
            item["source"]["repo"] = str((base / repo).resolve())
        for key in (
            "icon",
            "splash",
            "google_services_json",
        ):
            value = item.get("assets", {}).get(key)
            if value:
                asset = Path(value)
                if not asset.is_absolute():
                    item["assets"][key] = str((base / asset).resolve())
        app_records.append(item)

    config = FactoryConfig(work_dir=work_dir, apps=tuple(App.from_dict(x) for x in app_records))
    config.validate_unique_ids()
    return config
