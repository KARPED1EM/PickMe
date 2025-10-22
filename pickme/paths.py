from __future__ import annotations

import sys
from pathlib import Path

from platformdirs import user_data_dir

__all__ = ["application_paths"]


def application_paths() -> tuple[Path, Path, Path]:
    """Locate runtime directories for packaged or source runs."""
    project_root = Path(__file__).resolve().parents[1]
    base_dir = Path(getattr(sys, "_MEIPASS", project_root))
    package_dir = project_root / "app"
    if base_dir != project_root and (base_dir / "app").exists():
        package_dir = base_dir / "app"
    default_data_dir = package_dir / "data"
    user_dir = Path(user_data_dir("PickMe", "PickMe"))
    return package_dir, default_data_dir, user_dir
