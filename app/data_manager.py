from __future__ import annotations

import os
import tempfile
from pathlib import Path


_MODULE_DIR = Path(__file__).resolve().parent
_DEFAULT_FILE = "students_data.json"
_DEFAULT_DATA_PATH = _MODULE_DIR / "data" / _DEFAULT_FILE
try:
    _DEFAULT_PAYLOAD = _DEFAULT_DATA_PATH.read_text(encoding="utf-8")
except OSError:
    _DEFAULT_PAYLOAD = "{}"


class DataManager:

    DEFAULT_FILE = _DEFAULT_FILE
    DEFAULT_PAYLOAD = _DEFAULT_PAYLOAD

    _data_dir: Path | None = None
    _data_path: Path | None = None
    _default_data_path: Path | None = None

    @classmethod
    def configure(cls, user_dir: Path, default_data_dir: Path | None = None) -> None:
        user_dir.mkdir(parents=True, exist_ok=True)
        cls._data_dir = user_dir
        cls._data_path = user_dir / cls.DEFAULT_FILE
        cls._default_data_path = (
            default_data_dir / cls.DEFAULT_FILE if default_data_dir else None
        )
        if not cls._data_path.exists():
            cls._write_default_payload()

    @classmethod
    def user_data_dir(cls) -> Path:
        if cls._data_dir is None:
            raise RuntimeError("DataManager is not configured")
        return cls._data_dir

    @classmethod
    def data_file(cls) -> Path:
        if cls._data_path is None:
            raise RuntimeError("DataManager is not configured")
        return cls._data_path

    @classmethod
    def get_students_data(cls) -> str:
        path = cls.data_file()
        try:
            raw = path.read_bytes()
        except (FileNotFoundError, OSError):
            return cls._write_default_payload()
        for encoding in ("utf-8-sig", "utf-8"):
            try:
                return raw.decode(encoding)
            except UnicodeDecodeError:
                continue
        return cls._write_default_payload()

    @classmethod
    def save_students_data(cls, data: str) -> None:
        path = cls.data_file()
        _atomic_write_text(path, data)

    @classmethod
    def _write_default_payload(cls) -> str:
        path = cls.data_file()
        payload = cls._resolve_default_payload()
        _atomic_write_text(path, payload)
        return payload

    @classmethod
    def _resolve_default_payload(cls) -> str:
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
