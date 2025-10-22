from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path


class DataManager:

    DEFAULT_FILE = "students_data.json"
    DEFAULT_PAYLOAD = json.dumps(
        {
            "version": 2,
            "current_class_id": "class-default",
            "classes": [
                {
                    "id": "class-default",
                    "name": "杭州黑马 AI Python 就业 3期",
                    "created_at": 0,
                    "updated_at": 0,
                    "last_used_at": 0,
                    "order": 0,
                    "data": {
                        "cooldown_days": 3,
                        "students": [],
                    },
                }
            ],
        },
        ensure_ascii=False,
    )

    _data_dir: Path | None = None
    _data_path: Path | None = None

    @classmethod
    def configure(cls, user_dir: Path, default_data_dir: Path | None = None) -> None:
        user_dir.mkdir(parents=True, exist_ok=True)
        if default_data_dir and not _directory_has_content(user_dir):
            _copy_default_data(default_data_dir, user_dir)
        cls._data_dir = user_dir
        cls._data_path = user_dir / cls.DEFAULT_FILE
        if not cls._data_path.exists():
            _atomic_write_text(cls._data_path, cls.DEFAULT_PAYLOAD)

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
        raw = path.read_bytes()
        try:
            return raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            return raw.decode("utf-8")

    @classmethod
    def save_students_data(cls, data: str) -> None:
        path = cls.data_file()
        _atomic_write_text(path, data)


def _atomic_write_text(path: Path, data: str, encoding: str = "utf-8") -> None:
    directory = path.parent
    directory.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(dir=str(directory), prefix=f".{path.name}.", suffix=".tmp")
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


def _directory_has_content(directory: Path) -> bool:
    return any(directory.iterdir())


def _copy_default_data(default_dir: Path, target_dir: Path) -> None:
    if not default_dir.exists():
        return
    for item in default_dir.iterdir():
        destination = target_dir / item.name
        if item.is_dir():
            shutil.copytree(item, destination, dirs_exist_ok=True)
        else:
            shutil.copy2(item, destination)
