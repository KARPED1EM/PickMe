from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Protocol

from .classrooms import ClassroomsState
from .data_manager import DataManager


class StorageBackend(Protocol):
    """Abstract persistence strategy used by the application."""

    mode: str
    location_hint: str

    def load(self, request_data: dict[str, Any] | None = None) -> ClassroomsState:
        """Return a ClassroomsState representing the current data state."""

    def save(self, state: ClassroomsState) -> None:
        """Persist the provided state (no-op for some backends)."""


class FileStorageBackend:
    """Persist data on the local filesystem (single-user desktop mode)."""

    mode = "filesystem"

    def __init__(self, user_dir: Path, default_data_dir: Path | None = None) -> None:
        DataManager.configure(user_dir, default_data_dir)
        self._lock = threading.RLock()
        self.location_hint = str(DataManager.user_data_dir())
        self._default_payload = _load_default_payload(default_data_dir)

    def load(self, request_data: dict[str, Any] | None = None) -> ClassroomsState:
        with self._lock:
            data = DataManager.get_students_data()
        return ClassroomsState.from_payload(data, fallback=self._default_payload)

    def save(self, state: ClassroomsState) -> None:
        payload = state.serialize()
        with self._lock:
            DataManager.save_students_data(payload)


class BrowserStorageBackend:
    """Persist data inside the user's browser (multi-user server mode)."""

    mode = "browser"
    location_hint = "浏览器存储 (localStorage)"

    def __init__(self, default_data_dir: Path | None = None) -> None:
        self._default_payload = _load_default_payload(default_data_dir)

    def load(self, request_data: dict[str, Any] | None = None) -> ClassroomsState:
        if request_data:
            payload = request_data.get("payload")
            if isinstance(payload, (str, dict)):
                return ClassroomsState.from_payload(
                    payload, fallback=self._default_payload
                )
        return ClassroomsState.from_payload(None, fallback=self._default_payload)

    def save(self, state: ClassroomsState) -> None:
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


def _load_default_payload(default_data_dir: Path | None) -> str:
    payload = DataManager.DEFAULT_PAYLOAD
    if default_data_dir:
        candidate = default_data_dir / DataManager.DEFAULT_FILE
        if candidate.exists():
            try:
                return candidate.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                return candidate.read_text(encoding="utf-8", errors="ignore")
    return payload
