"""User preferences management subsystem.

This module provides a unified interface for managing user preferences
across different storage backends (filesystem and browser localStorage).
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Protocol

DEFAULT_PREFERENCES = {
    "theme": "light",
    "language": "zh-CN",
}


class PreferencesBackend(Protocol):
    """Abstract preferences persistence strategy."""

    mode: str

    def load(self, request_data: dict[str, Any] | None = None) -> dict[str, Any]:
        """Load user preferences."""

    def save(self, preferences: dict[str, Any]) -> None:
        """Save user preferences."""


class FilePreferencesBackend:
    """Persist preferences on the local filesystem (desktop mode)."""

    mode = "filesystem"
    PREFERENCES_FILE = "preferences.json"

    def __init__(self, user_dir: Path) -> None:
        user_dir.mkdir(parents=True, exist_ok=True)
        self._preferences_path = user_dir / self.PREFERENCES_FILE
        self._lock = threading.RLock()

    def load(self, request_data: dict[str, Any] | None = None) -> dict[str, Any]:
        with self._lock:
            if not self._preferences_path.exists():
                return DEFAULT_PREFERENCES.copy()
            try:
                content = self._preferences_path.read_text(encoding="utf-8")
                data = json.loads(content)
                if isinstance(data, dict):
                    return {**DEFAULT_PREFERENCES, **data}
            except (OSError, json.JSONDecodeError):
                pass
        return DEFAULT_PREFERENCES.copy()

    def save(self, preferences: dict[str, Any]) -> None:
        with self._lock:
            try:
                content = json.dumps(preferences, ensure_ascii=False, indent=2)
                self._preferences_path.write_text(content, encoding="utf-8")
            except OSError:
                pass


class BrowserPreferencesBackend:
    """Persist preferences in the user's browser (server mode)."""

    mode = "browser"

    def load(self, request_data: dict[str, Any] | None = None) -> dict[str, Any]:
        if request_data:
            preferences = request_data.get("preferences")
            if isinstance(preferences, dict):
                return {**DEFAULT_PREFERENCES, **preferences}
        return DEFAULT_PREFERENCES.copy()

    def save(self, preferences: dict[str, Any]) -> None:
        # Persistence happens client-side; nothing to do on the server.
        pass


def create_preferences_backend(
    mode: str,
    user_dir: Path | None = None,
) -> PreferencesBackend:
    """Create a preferences backend based on storage mode."""
    normalized = mode.strip().lower()
    if normalized in {"filesystem", "file", "local"}:
        if user_dir is None:
            raise ValueError("user_dir required for filesystem preferences backend")
        return FilePreferencesBackend(user_dir)
    if normalized in {"browser", "client", "localstorage", "client-storage"}:
        return BrowserPreferencesBackend()
    # Default to browser mode
    return BrowserPreferencesBackend()
