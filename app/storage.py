from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from .user_data import DEFAULT_UUID, UserData, UserDataStore


class UnifiedStorage:
    """Unified persistence interface for per-user JSON payloads."""

    def __init__(
        self,
        app_run_mode: str,
        app_data_dir: Path,
    ) -> None:
        self.mode = "desktop" if app_run_mode == "desktop" else "server"
        self._store = UserDataStore(app_data_dir)

    @property
    def location_hint(self) -> str:
        return self._store.location_hint

    def ensure_user(
        self,
        user_id: str | None = None,
    ) -> tuple[UserData, str, bool]:
        """Load existing data or create a new payload for the given user."""
        candidate = self._candidate_user_id(user_id)
        data, normalized, created = self._store.ensure(candidate)
        data.ensure_defaults()
        if self.mode == "desktop":
            normalized = DEFAULT_UUID
            data.user_id = DEFAULT_UUID
        return data, normalized, created

    def load_user(self, user_id: str) -> UserData:
        normalized = self.normalize_user_id(user_id)
        data = self._store.load(normalized)
        data.user_id = normalized
        data.ensure_defaults()
        return data

    def save_user(self, data: UserData) -> None:
        normalized = self.normalize_user_id(data.user_id)
        data.user_id = normalized
        data.ensure_defaults()
        self._store.save(data)

    def export_user(self, data: UserData) -> str:
        return json.dumps(data.to_dict(), ensure_ascii=False, indent=2)

    def with_user(
        self,
        user_id: str,
        handler: Callable[[UserData], Any],
    ) -> tuple[UserData, Any]:
        normalized = self.normalize_user_id(user_id)
        data = self._store.load(normalized)
        data.user_id = normalized
        data.ensure_defaults()
        result = handler(data)
        self.save_user(data)
        return data, result

    def _candidate_user_id(self, user_id: str | None) -> str | None:
        if self.mode == "desktop":
            return DEFAULT_UUID
        normalized = self._normalize_uuid(user_id)
        if normalized and self._is_valid_server_uuid(normalized):
            return normalized
        return None

    def normalize_user_id(self, user_id: str | None) -> str:
        if self.mode == "desktop":
            return DEFAULT_UUID
        normalized = self._normalize_uuid(user_id)
        if normalized and self._is_valid_server_uuid(normalized):
            return normalized
        raise ValueError("Invalid user_id")

    @staticmethod
    def _normalize_uuid(value: str | None) -> str | None:
        if not value:
            return None
        cleaned = str(value).strip().lower()
        return cleaned or None

    @staticmethod
    def _is_valid_server_uuid(value: str) -> bool:
        if len(value) != 32:
            return False
        for char in value:
            if char not in "0123456789abcdef":
                return False
        return True
