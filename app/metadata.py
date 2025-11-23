from __future__ import annotations

import os
from dataclasses import dataclass, asdict

try:
    from importlib import metadata as importlib_metadata
except ImportError:
    import importlib_metadata

__all__ = ["AppMetadata", "load_app_metadata"]


@dataclass(frozen=True)
class AppMetadata:
    name: str = "Pick Me"
    version: str = "v2.3.2"
    developer: str = "KARPED1EM"
    license: str = "MIT License"
    repository: str = "https://github.com/KARPED1EM/PickMe"

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


def _resolve_version() -> str:
    for key in ("PICKME_VERSION", "APP_VERSION"):
        value = os.getenv(key)
        if value:
            return value
    try:
        return importlib_metadata.version("pickme")
    except importlib_metadata.PackageNotFoundError:
        return AppMetadata.version


def load_app_metadata() -> dict[str, str]:
    base = AppMetadata()
    data = base.as_dict()
    data["version"] = _resolve_version()
    return data
