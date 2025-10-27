from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .classrooms import ClassroomsState

USER_DATA_VERSION = 2
DATAFILE_SUFFIX = ".pickme.v2.json"
DEFAULT_UUID = "local"

DEFAULT_PREFERENCES: dict[str, Any] = {
    "dismissed_intro_popup": False,
    "theme": "system",
    "language": "zh-CN",
}

DEFAULT_RUNTIME: dict[str, Any] = {
    "active_class_id": "",
    "created_at": 0.0,
    "updated_at": 0.0,
    "last_accessed_at": 0.0,
}

DEFAULT_CLASS_ID = "class-ithm"
DEFAULT_CLASS_NAME = "杭州黑马 AI Python 就业 3期"
DEFAULT_CLASS_COOLDOWN = 3
DEFAULT_STUDENTS: list[tuple[str, str, int]] = [
    ("1", "韩宜恒", 4),
    ("2", "李哲", 4),
    ("3", "闫瑞祥", 19),
    ("4", "袁执戈", 17),
    ("5", "越扬", 17),
    ("6", "王剑涛", 6),
    ("7", "段天博", 16),
    ("8", "徐俊豪", 12),
    ("9", "刘梦飞", 12),
    ("10", "陈鑫", 17),
    ("11", "席传鑫", 18),
    ("12", "黄程", 12),
    ("13", "李星蒴", 7),
    ("14", "王志博", 18),
    ("15", "姚佳良", 14),
    ("16", "周佳旺", 1),
    ("17", "刘海燕", 1),
    ("18", "史景麟", 6),
    ("19", "韩雨辰", 13),
    ("20", "王梅文", 7),
    ("21", "刘佳欣", 1),
    ("22", "张年", 14),
    ("23", "吕济发", 18),
    ("24", "汪建杰", 15),
    ("25", "冯炳栋", 2),
    ("26", "黄仲秋", 14),
    ("27", "宣智超", 15),
    ("28", "曾凡政", 3),
    ("29", "谢岩", 10),
    ("30", "莫林丛", 13),
    ("31", "吴冬凡", 3),
    ("32", "王生远", 6),
    ("33", "李建行", 9),
    ("34", "朱国栋", 3),
    ("35", "覃东", 5),
    ("36", "惠晨宇", 9),
    ("37", "朱磊", 9),
    ("38", "方启超", 19),
    ("39", "赵晟羽", 1),
    ("40", "赵明宽", 11),
    ("41", "戴佳乐", 9),
    ("42", "江文杰", 10),
    ("43", "陈维昊", 12),
    ("44", "曹杰", 19),
    ("45", "干雨琪", 5),
    ("46", "刘建成", 7),
    ("47", "杜文辉", 11),
    ("48", "郭炳清", 2),
    ("49", "粟嘉栋", 10),
    ("50", "郭思琦", 13),
    ("51", "周祎烁", 17),
    ("52", "王博", 16),
    ("53", "雷锦浩", 15),
    ("54", "曾宇宝", 15),
    ("55", "管中正", 2),
    ("56", "王留根", 5),
    ("57", "舒艾凌", 8),
    ("58", "楼飘豪", 11),
    ("59", "周谊华", 8),
    ("60", "王文洋", 11),
    ("61", "马学超", 18),
    ("63", "周朝乐", 12),
    ("64", "于成龙", 10),
    ("65", "王轩", 13),
    ("66", "孙塬东", 17),
    ("67", "王子赫", 16),
    ("68", "林贻胜", 19),
    ("69", "任明辉", 2),
    ("70", "张文开", 8),
    ("71", "侯国华", 19),
    ("72", "王一普", 18),
    ("73", "侯文浩", 11),
    ("74", "聂心雨", 14),
    ("75", "熊健", 4),
    ("76", "程浩", 3),
    ("77", "吴军鹏", 10),
    ("78", "赵燕军", 16),
]


def _merge_dict(
    base: dict[str, Any],
    override: dict[str, Any] | None,
) -> dict[str, Any]:
    result = dict(base)
    if override:
        for key, value in override.items():
            result[key] = value
    return result


def _sanitize_uuid(value: str | None) -> str | None:
    if not value:
        return None
    candidate = str(value).strip().lower()
    if not candidate:
        return None
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-_")
    if not set(candidate) <= allowed:
        return None
    return candidate


def _now() -> float:
    return time.time()


def _default_unified_template() -> dict[str, Any]:
    students = {}
    for student_id, name, group in DEFAULT_STUDENTS:
        students[student_id] = {
            "name": name,
            "group": group,
            "total_picked_count": 0,
            "last_picked_at": 0.0,
            "pick_history": [],
            "cooldown_started_at": 0.0,
            "cooldown_expires_at": 0.0,
        }
    return {
        "version": USER_DATA_VERSION,
        "preferences": DEFAULT_PREFERENCES.copy(),
        "runtime": {
            "active_class_id": DEFAULT_CLASS_ID,
            "created_at": 0.0,
            "updated_at": 0.0,
            "last_accessed_at": 0.0,
        },
        "classes": {
            DEFAULT_CLASS_ID: {
                "meta": {
                    "name": DEFAULT_CLASS_NAME,
                    "order": 0,
                    "created_at": 0.0,
                    "updated_at": 0.0,
                    "last_used_at": 0.0,
                },
                "algorithm_data": {
                    "cooldown_days": DEFAULT_CLASS_COOLDOWN,
                    "history": {"entries": [], "updated_at": 0},
                },
                "students": students,
            }
        },
    }


def _unified_to_legacy(payload: dict[str, Any]) -> dict[str, Any]:
    classes_payload = payload.get("classes", {})
    classes: list[dict[str, Any]] = []
    classes_data: dict[str, Any] = {}
    runtime = (
        payload.get("runtime", {}) if isinstance(payload.get("runtime"), dict) else {}
    )
    for class_id, class_entry in classes_payload.items():
        meta = class_entry.get("meta", {}) if isinstance(class_entry, dict) else {}
        algorithm = (
            class_entry.get("algorithm_data", {})
            if isinstance(class_entry, dict)
            else {}
        )
        students_map = (
            class_entry.get("students", {}) if isinstance(class_entry, dict) else {}
        )
        students_list: list[dict[str, Any]] = []
        for student_id, student_entry in students_map.items():
            students_list.append(
                {
                    "id": int(student_id),
                    "name": student_entry.get("name", ""),
                    "group": student_entry.get("group", 0),
                    "pick_count": student_entry.get("total_picked_count", 0),
                    "last_pick": student_entry.get("last_picked_at", 0.0),
                    "pick_history": student_entry.get("pick_history", []),
                    "cooldown_started_at": student_entry.get(
                        "cooldown_started_at", 0.0
                    ),
                    "cooldown_expires_at": student_entry.get(
                        "cooldown_expires_at", 0.0
                    ),
                }
            )
        class_payload = {
            "cooldown_days": algorithm.get("cooldown_days", DEFAULT_CLASS_COOLDOWN),
            "students": students_list,
            "history": algorithm.get("history", {"entries": [], "updated_at": 0}),
        }
        classes_data[class_id] = class_payload
        name_value = meta.get("name")
        if isinstance(name_value, str) and name_value.strip():
            class_name = name_value
        else:
            class_name = DEFAULT_CLASS_NAME
        classes.append(
            {
                "id": class_id,
                "name": class_name,
                "order": meta.get("order", 0),
                "created_at": meta.get("created_at", 0.0),
                "updated_at": meta.get("updated_at", 0.0),
                "last_used_at": meta.get("last_used_at", 0.0),
                "data": class_payload,
            }
        )
    current_id = runtime.get("active_class_id") or (
        classes[0]["id"] if classes else DEFAULT_CLASS_ID
    )
    current_class_entry = next(
        (item for item in classes if item["id"] == current_id), None
    )
    current_payload = classes_data.get(current_id) or {
        "cooldown_days": DEFAULT_CLASS_COOLDOWN,
        "students": [],
        "history": {"entries": [], "updated_at": 0},
    }
    current_class = {
        "id": current_id,
        "name": (
            current_class_entry["name"] if current_class_entry else DEFAULT_CLASS_NAME
        ),
        "payload": current_payload,
    }
    return {
        "version": payload.get("version", USER_DATA_VERSION),
        "current_class_id": current_id,
        "current_class": current_class,
        "classes": classes,
        "classes_data": classes_data,
        "runtime": runtime,
    }


@dataclass
class UserData:
    """Runtime representation of a single user's unified data payload."""

    user_id: str
    classrooms: ClassroomsState
    preferences: dict[str, Any] = field(default_factory=dict)
    runtime: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    version: int = USER_DATA_VERSION

    def ensure_defaults(self) -> None:
        """Ensure runtime, preferences, and metadata use default fallbacks."""
        self.version = max(int(self.version or USER_DATA_VERSION), USER_DATA_VERSION)
        self.preferences = _merge_dict(DEFAULT_PREFERENCES, self.preferences)
        runtime_defaults = dict(DEFAULT_RUNTIME)
        runtime_defaults["active_class_id"] = self.classrooms.current_class_id
        if runtime_defaults["created_at"] <= 0.0:
            runtime_defaults["created_at"] = _now()
        if runtime_defaults["updated_at"] <= 0.0:
            runtime_defaults["updated_at"] = runtime_defaults["created_at"]
        if runtime_defaults["last_accessed_at"] <= 0.0:
            runtime_defaults["last_accessed_at"] = runtime_defaults["updated_at"]
        self.runtime = _merge_dict(runtime_defaults, self.runtime)
        if not self.runtime.get("active_class_id"):
            self.runtime["active_class_id"] = self.classrooms.current_class_id
        self.metadata = dict(self.metadata or {})

    def to_dict(self) -> dict[str, Any]:
        """Serialize the user data into the persisted JSON format."""
        self.ensure_defaults()
        runtime = dict(self.runtime)
        runtime["active_class_id"] = self.classrooms.current_class_id
        payload = {
            "version": self.version,
            "user_id": self.user_id,
            "preferences": self.preferences,
            "runtime": runtime,
            "classes": self.classrooms.to_unified_payload(),
        }
        if self.metadata:
            payload["meta"] = self.metadata
        return payload

    def touch_accessed(self) -> None:
        """Update runtime access timestamps."""
        moment = _now()
        self.runtime["last_accessed_at"] = moment
        if self.runtime.get("created_at", 0.0) <= 0.0:
            self.runtime["created_at"] = moment
        if self.runtime.get("updated_at", 0.0) <= 0.0:
            self.runtime["updated_at"] = moment

    def touch_modified(self) -> None:
        """Update modification timestamp."""
        moment = _now()
        self.runtime["updated_at"] = moment

    @classmethod
    def default(cls, user_id: str) -> "UserData":
        """Create a new default user dataset."""
        unified = _default_unified_template()
        legacy = _unified_to_legacy(unified)
        state = ClassroomsState.from_payload(legacy)
        data = cls(
            user_id=user_id,
            classrooms=state,
            preferences=unified.get("preferences", {}).copy(),
            runtime=unified.get("runtime", {}).copy(),
            metadata=unified.get("meta", {}),
            version=unified.get("version", USER_DATA_VERSION),
        )
        data.ensure_defaults()
        data.touch_modified()
        return data

    @classmethod
    def from_dict(
        cls,
        payload: dict[str, Any] | None,
        *,
        default_user_id: str = DEFAULT_UUID,
    ) -> "UserData":
        if not isinstance(payload, dict):
            payload = {}
        version = payload.get("version")
        try:
            version_value = int(version) if version is not None else USER_DATA_VERSION
        except (TypeError, ValueError):
            version_value = USER_DATA_VERSION
        user_id = (
            _sanitize_uuid(payload.get("user_id"))
            or _sanitize_uuid(default_user_id)
            or DEFAULT_UUID
        )
        preferences = payload.get("preferences")
        runtime = payload.get("runtime")
        metadata = payload.get("meta") or payload.get("metadata")
        legacy_payload = _unified_to_legacy(payload)
        state = ClassroomsState.from_payload(legacy_payload)
        data = cls(
            user_id=user_id,
            classrooms=state,
            preferences=preferences if isinstance(preferences, dict) else {},
            runtime=(
                legacy_payload.get("runtime", {})
                if isinstance(legacy_payload, dict)
                else {}
            ),
            metadata=metadata if isinstance(metadata, dict) else {},
            version=version_value,
        )
        data.ensure_defaults()
        return data


class UserDataStore:
    """Persistence layer for unified per-user data files."""

    def __init__(
        self,
        app_data_dir: Path,
    ) -> None:
        self._lock = threading.RLock()
        self._data_dir = app_data_dir
        self._data_dir.mkdir(parents=True, exist_ok=True)

    @property
    def location_hint(self) -> str:
        return str(self._data_dir)

    def resolve_path(self, user_id: str) -> Path:
        normalized = _sanitize_uuid(user_id)
        if not normalized:
            raise ValueError("Cannot resolve storage path for empty user_id")
        filename = f"{normalized}{DATAFILE_SUFFIX}"
        return self._data_dir / filename

    def generate_user_id(self) -> str:
        return uuid.uuid4().hex

    def ensure(
        self,
        user_id: str | None = None,
    ) -> tuple[UserData, str, bool]:
        normalized = _sanitize_uuid(user_id)
        if not normalized:
            normalized = self.generate_user_id()
        created = False
        with self._lock:
            path = self.resolve_path(normalized)
            if not path.exists():
                data = self._create_default(normalized)
                self._write_to_path(path, data.to_dict())
                created = True
            else:
                data = self._load_from_path(path, normalized)
        return data, normalized, created

    def bootstrap_user(self, user_id: str | None = None) -> UserData:
        data, _, _ = self.ensure(user_id)
        return data

    def load(self, user_id: str) -> UserData:
        data, _, _ = self.ensure(user_id)
        return data

    def save(self, data: UserData) -> None:
        with self._lock:
            normalized = _sanitize_uuid(data.user_id)
            if not normalized:
                raise ValueError("UserData missing persistent user_id")
            data.user_id = normalized
            path = self.resolve_path(normalized)
            payload = data.to_dict()
            self._write_to_path(path, payload)

    def _load_from_path(self, path: Path, user_id: str) -> UserData:
        try:
            raw = path.read_text(encoding="utf-8")
            payload = json.loads(raw)
        except (OSError, json.JSONDecodeError):
            payload = {}
        data = UserData.from_dict(payload, default_user_id=user_id)
        data.touch_accessed()
        return data

    def _create_default(self, user_id: str) -> UserData:
        data = UserData.default(user_id)
        data.touch_accessed()
        return data

    def _write_to_path(self, path: Path, payload: dict[str, Any]) -> None:
        directory = path.parent
        directory.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(path.suffix + ".tmp")
        try:
            temp_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            temp_path.replace(path)
        finally:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass
