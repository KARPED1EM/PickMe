from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Protocol

from .data_manager import DataManager
from .students_cms import StudentsCms


class StorageBackend(Protocol):
    """Abstract persistence strategy used by the application."""

    mode: str
    location_hint: str

    def load(self, request_data: dict[str, Any] | None = None) -> StudentsCms:
        """Return a StudentsCms instance representing the current data state."""

    def save(self, cms: StudentsCms) -> None:
        """Persist the provided StudentsCms state (no-op for some backends)."""


class FileStorageBackend:
    """Persist data on the local filesystem (single-user desktop mode)."""

    mode = "filesystem"

    def __init__(self, user_dir: Path, default_data_dir: Path | None = None) -> None:
        DataManager.configure(user_dir, default_data_dir)
        self._lock = threading.RLock()
        self.location_hint = str(DataManager.user_data_dir())

    def load(self, request_data: dict[str, Any] | None = None) -> StudentsCms:
        with self._lock:
            data = DataManager.get_students_data()
        return StudentsCms.deserialize(data)

    def save(self, cms: StudentsCms) -> None:
        payload = cms.serialize()
        with self._lock:
            DataManager.save_students_data(payload)


class BrowserStorageBackend:
    """Persist data inside the user's browser (multi-user server mode)."""

    mode = "browser"
    location_hint = "浏览器本地存储 (localStorage)"

    def __init__(self, default_data_dir: Path | None = None) -> None:
        default_payload = DataManager.DEFAULT_PAYLOAD
        if default_data_dir:
            candidate = default_data_dir / DataManager.DEFAULT_FILE
            if candidate.exists():
                try:
                    default_payload = candidate.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    default_payload = candidate.read_text(
                        encoding="utf-8", errors="ignore"
                    )
        self._default_payload = default_payload

    def load(self, request_data: dict[str, Any] | None = None) -> StudentsCms:
        if request_data:
            payload = request_data.get("payload")
            if isinstance(payload, str):
                return StudentsCms.deserialize(payload)
            if isinstance(payload, dict):
                return StudentsCms.deserialize(json.dumps(payload, ensure_ascii=False))
        return StudentsCms.deserialize(self._default_payload)

    def save(self, cms: StudentsCms) -> None:
        # Persistence happens client side; nothing to do on the server.
        return


def create_storage_backend(
    mode: str | None,
    user_dir: Path,
    default_data_dir: Path | None,
) -> StorageBackend:
    normalized = (mode or "filesystem").strip().lower()
    if normalized in {"filesystem", "file", "local"}:
        return FileStorageBackend(user_dir, default_data_dir)
    if normalized in {"browser", "client", "localstorage", "client-storage"}:
        return BrowserStorageBackend(default_data_dir)
    if normalized == "auto":
        return FileStorageBackend(user_dir, default_data_dir)
    raise ValueError(f"Unsupported storage mode: {mode!r}")

