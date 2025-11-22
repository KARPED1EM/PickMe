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
    "dismissed_draw_mode_tooltip": False,
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
    ("1", "韩宜恒", 11),  # L1_1 → 第11组
    ("2", "李哲", 14),  # L4_3 → 第14组
    ("3", "闫瑞祥", 19),  # L9_3 → 第19组
    ("4", "袁执戈", 12),  # L2_4 → 第12组
    ("5", "宋越扬", 12),  # L2_3 → 第12组
    ("6", "王剑涛", 5),  # R4_0 → 第5组
    ("7", "段天博", 1),  # R0_3 → 第1组
    ("8", "徐俊豪", 19),  # L9_2 → 第19组
    ("9", "刘梦飞", 8),  # R7_1 → 第8组
    ("10", "陈鑫", 13),  # L3_2 → 第13组
    ("11", "席传鑫", 14),  # L4_2 → 第14组
    ("12", "黄程", 8),  # R7_0 → 第8组
    ("13", "李星蒴", 4),  # R3_3 → 第4组
    ("14", "王志博", 14),  # L4_1 → 第14组
    ("15", "姚佳良", 3),  # R2_1 → 第3组
    ("16", "周佳旺", 6),  # R5_0 → 第6组
    ("17", "刘海燕", 10),  # L0_4 → 第10组
    ("18", "史景麟", 17),  # L7_4 → 第17组
    ("19", "韩雨辰", 18),  # L8_1 → 第18组
    ("20", "王梅文", 5),  # R4_1 → 第5组
    ("21", "刘佳欣", 6),  # R5_1 → 第6组
    ("22", "张年", 3),  # R2_2 → 第3组
    ("23", "吕济发", 6),  # R5_2 → 第6组
    ("24", "汪建杰", 9),  # R8_0 → 第9组
    ("25", "冯炳栋", 7),  # R6_1 → 第7组
    ("26", "黄仲秋", 18),  # L8_4 → 第18组
    ("27", "宣智超", 17),  # L7_1 → 第17组
    ("28", "曾凡政", 13),  # L3_4 → 第13组
    ("29", "谢岩", 2),  # R1_0 → 第2组
    ("30", "莫林丛", 9),  # L11_0 → 第9组（特殊）
    ("31", "吴冬凡", 7),  # R6_0 → 第7组
    ("32", "王生远", 17),  # L7_3 → 第17组
    ("33", "李建行", 1),  # R0_1 → 第1组
    ("34", "朱国栋", 16),  # L6_3 → 第16组
    ("35", "覃东", 4),  # R3_2 → 第4组
    ("36", "惠晨宇", 2),  # R1_2 → 第2组
    ("37", "朱磊", 2),  # R1_1 → 第2组
    ("38", "方启超", 9),  # R8_2 → 第9组
    ("39", "赵晟羽", 10),  # L0_3 → 第10组
    ("40", "赵明宽", 11),  # L1_3 → 第11组
    ("41", "戴佳乐", 1),  # R0_2 → 第1组
    ("42", "江文杰", 10),  # L0_1 → 第10组
    ("43", "陈维昊", 19),  # L9_1 → 第19组
    ("44", "曹杰", 12),  # L2_1 → 第12组
    ("45", "干雨琪", 5),  # R4_2 → 第5组
    ("46", "刘建成", 4),  # R3_0 → 第4组
    ("47", "杜文辉", 16),  # L6_1 → 第16组
    ("48", "郭炳清", 15),  # L5_4 → 第15组
    ("49", "粟嘉栋", 19),  # L9_0 → 第19组
    ("50", "郭思琦", 15),  # L5_1 → 第15组
    ("51", "周祎烁", 13),  # L3_1 → 第13组
    ("52", "王博", 1),  # R0_0 → 第1组
    ("53", "雷锦浩", 17),  # L7_2 → 第17组
    ("54", "曾宇宝", 9),  # R8_1 → 第9组
    ("55", "管中正", 7),  # R6_2 → 第7组
    ("56", "王留根", 4),  # R3_1 → 第4组
    ("57", "舒艾凌", 14),  # L4_4 → 第14组
    ("58", "楼飘豪", 11),  # L1_4 → 第11组
    ("59", "周谊华", 11),  # L1_2 → 第11组
    ("60", "王文洋", 3),  # R2_3 → 第3组
    ("61", "马学超", 2),  # R1_3 → 第2组
    ("63", "周朝乐", 17),  # L7_0 → 第17组
    ("64", "于成龙", 10),  # L0_2 → 第10组
    ("65", "王轩", 15),  # L5_2 → 第15组
    ("66", "孙塬东", 13),  # L3_3 → 第13组
    ("67", "王子赫", 16),  # L6_4 → 第16组
    ("68", "林贻胜", 19),  # L9_4 → 第19组
    ("69", "任明辉", 15),  # L5_3 → 第15组
    ("70", "张文开", 18),  # L8_2 → 第18组
    ("71", "侯国华", 12),  # L2_0 → 第12组
    ("72", "王一普", 12),  # L2_2 → 第12组
    ("73", "侯文浩", 16),  # L6_2 → 第16组
    ("74", "聂心雨", 18),  # L8_0 → 第18组
    ("75", "熊健", 3),  # R2_0 → 第3组
    ("76", "程浩", 8),  # R7_3 → 第8组
    ("77", "吴军鹏", 10),  # L0_0 → 第10组
    ("78", "赵燕军", 8),  # R7_2 → 第8组
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
        try:
            numeric_id = int(student_id)
        except (TypeError, ValueError):
            numeric_id = None
        entry_id = numeric_id if numeric_id is not None else str(student_id)
        students[str(entry_id)] = {
            "id": entry_id,
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
        payload["current_class_id"] = self.classrooms.current_class_id
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
        state = ClassroomsState.from_payload(unified, fallback=legacy)
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
        strict: bool = False,
    ) -> "UserData":
        if not isinstance(payload, dict):
            if strict:
                raise ValueError("invalid_user_data_payload")
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
        try:
            state = ClassroomsState.from_payload(
                payload,
                fallback=legacy_payload,
                allow_default=not strict,
            )
        except ValueError as error:
            raise ValueError("invalid_user_data_payload") from error
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

    def migrate_user_data(self, old_user_id: str, new_user_id: str) -> None:
        """Migrate user data from old_user_id to new_user_id.

        This operation checks if the target user_id exists, and if so,
        deletes the old user's data file. The frontend will then use
        the new user_id to load data from the target account.

        Args:
            old_user_id: The current user_id to migrate from
            new_user_id: The target user_id to migrate to

        Raises:
            ValueError: If new_user_id does not exist or old_user_id is invalid
        """
        with self._lock:
            # Normalize both user IDs
            old_normalized = _sanitize_uuid(old_user_id)
            new_normalized = _sanitize_uuid(new_user_id)

            if not old_normalized:
                raise ValueError("Invalid old user ID")
            if not new_normalized:
                raise ValueError("Invalid new user ID")

            # Check if the target user exists
            new_path = self.resolve_path(new_normalized)
            if not new_path.exists():
                raise ValueError("Target user ID does not exist")

            # Delete the old user's data file
            old_path = self.resolve_path(old_normalized)
            if old_path.exists():
                try:
                    old_path.unlink()
                except OSError as e:
                    raise ValueError(f"Failed to delete old user data: {e}") from e
