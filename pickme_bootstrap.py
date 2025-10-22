from __future__ import annotations

from pathlib import Path
import sys

from platformdirs import user_data_dir

__all__ = ["application_paths"]


def application_paths() -> tuple[Path, Path, Path]:
    """Locate runtime directories for packaged or source runs."""
    base_dir = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    project_dir = Path(__file__).resolve().parent
    package_dir = project_dir / "app"
    if base_dir != project_dir and (base_dir / "app").exists():
        package_dir = base_dir / "app"
    default_data_dir = package_dir / "data"
    user_dir = Path(user_data_dir("PickMe", "PickMe"))
    return package_dir, default_data_dir, user_dir

