from __future__ import annotations

import shutil
from pathlib import Path


class DataManager:

    DEFAULT_FILE = "students_data.json"
    DEFAULT_PAYLOAD = '{"cooldown_days":3,"students":[]}'

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
            cls._data_path.write_text(cls.DEFAULT_PAYLOAD, encoding="utf-8")

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
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data, encoding="utf-8")


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
