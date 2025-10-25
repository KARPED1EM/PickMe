from __future__ import annotations

import os
import tempfile
from pathlib import Path


_MODULE_DIR = Path(__file__).resolve().parent
_DEFAULT_FILE = "pickme_state.json"
_DEFAULT_DATA_PATH = _MODULE_DIR / "data" / _DEFAULT_FILE
try:
    _DEFAULT_PAYLOAD = _DEFAULT_DATA_PATH.read_text(encoding="utf-8")
except OSError:
    _DEFAULT_PAYLOAD = "{}"


class StateManager:
    """Manages application state persistence to filesystem.
    
    Handles reading and writing the pickme_state.json file that contains
    classroom data, student information, and pick history.
    """

    DEFAULT_FILE = _DEFAULT_FILE
    DEFAULT_PAYLOAD = _DEFAULT_PAYLOAD

    _data_dir: Path | None = None
    _data_path: Path | None = None
    _default_data_path: Path | None = None

    @classmethod
    def configure(cls, user_dir: Path, default_data_dir: Path | None = None) -> None:
        """Configure the state manager with user and default data directories."""
        user_dir.mkdir(parents=True, exist_ok=True)
        cls._data_dir = user_dir
        cls._data_path = user_dir / cls.DEFAULT_FILE
        cls._default_data_path = (
            default_data_dir / cls.DEFAULT_FILE if default_data_dir else None
        )
        if not cls._data_path.exists():
            cls._write_default_state()

    @classmethod
    def user_data_dir(cls) -> Path:
        """Get the user data directory."""
        if cls._data_dir is None:
            raise RuntimeError("StateManager is not configured")
        return cls._data_dir

    @classmethod
    def state_file(cls) -> Path:
        """Get the path to the state file."""
        if cls._data_path is None:
            raise RuntimeError("StateManager is not configured")
        return cls._data_path

    @classmethod
    def load_state(cls) -> str:
        """Load the application state from the state file."""
        path = cls.state_file()
        try:
            raw = path.read_bytes()
        except (FileNotFoundError, OSError):
            return cls._write_default_state()
        for encoding in ("utf-8-sig", "utf-8"):
            try:
                return raw.decode(encoding)
            except UnicodeDecodeError:
                continue
        return cls._write_default_state()

    @classmethod
    def save_state(cls, data: str) -> None:
        """Save the application state to the state file."""
        path = cls.state_file()
        _atomic_write_text(path, data)

    @classmethod
    def _write_default_state(cls) -> str:
        """Write the default state to the state file."""
        path = cls.state_file()
        payload = cls._resolve_default_state()
        _atomic_write_text(path, payload)
        return payload

    @classmethod
    def _resolve_default_state(cls) -> str:
        """Resolve the default state from available sources."""
        candidates = [
            cls._default_data_path,
            _DEFAULT_DATA_PATH,
        ]
        for candidate in candidates:
            if candidate and candidate.exists():
                try:
                    return candidate.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    return candidate.read_text(encoding="utf-8", errors="ignore")
        return cls.DEFAULT_PAYLOAD


# Backward compatibility alias
DataManager = StateManager


def _atomic_write_text(path: Path, data: str, encoding: str = "utf-8") -> None:
    directory = path.parent
    directory.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(
        dir=str(directory), prefix=f".{path.name}.", suffix=".tmp"
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding=encoding) as temp_file:
            temp_file.write(data)
            temp_file.flush()
            try:
                os.fsync(temp_file.fileno())
            except OSError:
                pass
        temp_path.replace(path)
    finally:
        if temp_path.exists():
            temp_path.unlink()
