from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterable

from .students_cms import StudentsCms

CURRENT_VERSION = 2
DEFAULT_CLASS_NAME = "默认班级"


def _generate_id() -> str:
    return uuid.uuid4().hex


@dataclass
class Classroom:
    class_id: str
    name: str
    cms: StudentsCms
    created_at: float
    updated_at: float
    last_used_at: float
    order_index: int
    algorithm_data: dict[str, Any] = field(default_factory=dict)

    def students_count(self) -> int:
        return len(self.cms.get_students())

    def to_metadata(self) -> dict[str, Any]:
        return {
            "id": self.class_id,
            "name": self.name,
            "order": self.order_index,
            "student_count": self.students_count(),
            "cooldown_days": self.cms.pick_cooldown,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "last_used_at": self.last_used_at,
        }

    def to_payload(self) -> dict[str, Any]:
        algorithm_data = dict(self.algorithm_data)
        algorithm_data["cooldown_days"] = self.cms.pick_cooldown
        algorithm_data["history"] = self.cms.export_history()
        return {
            "id": self.class_id,
            "meta": {
                "name": self.name,
                "created_at": self.created_at,
                "updated_at": self.updated_at,
                "last_used_at": self.last_used_at,
                "order": self.order_index,
            },
            "algorithm_data": algorithm_data,
            "students": {
                str(student.student_id): student.serialize()
                for student in self.cms.get_students()
            },
        }


class ClassroomsState:
    def __init__(
        self,
        classes: dict[str, Classroom],
        current_class_id: str,
        version: int = CURRENT_VERSION,
    ) -> None:
        if not classes:
            raise ValueError("classes_required")
        self._classes = classes
        try:
            numeric_version = int(version)
        except (TypeError, ValueError):
            numeric_version = CURRENT_VERSION
        self._version = max(numeric_version, CURRENT_VERSION)
        self._current_class_id = current_class_id
        if self._current_class_id not in self._classes:
            self._current_class_id = self._preferred_class_id()
        self._normalize_orders()

    @property
    def version(self) -> int:
        return self._version

    @property
    def current_class_id(self) -> str:
        return self._current_class_id

    @property
    def current_class(self) -> Classroom:
        return self._classes[self._current_class_id]

    @property
    def current_cms(self) -> StudentsCms:
        return self.current_class.cms

    def iter_classes(self) -> Iterable[Classroom]:
        return sorted(
            self._classes.values(),
            key=lambda classroom: (classroom.order_index, classroom.created_at),
        )

    def set_current(self, class_id: str, timestamp: float | None = None) -> Classroom:
        if class_id not in self._classes:
            raise KeyError("class_missing")
        self._current_class_id = class_id
        classroom = self._classes[class_id]
        classroom.last_used_at = timestamp or time.time()
        return classroom

    def mark_current_modified(self, timestamp: float | None = None) -> None:
        classroom = self.current_class
        when = timestamp or time.time()
        classroom.updated_at = when
        classroom.last_used_at = when

    def mark_current_accessed(self, timestamp: float | None = None) -> None:
        classroom = self.current_class
        classroom.last_used_at = timestamp or time.time()

    def rename_class(
        self, class_id: str, name: str, timestamp: float | None = None
    ) -> None:
        classroom = self._classes.get(class_id)
        if not classroom:
            raise KeyError("class_missing")
        classroom.name = name.strip() or DEFAULT_CLASS_NAME
        classroom.updated_at = timestamp or time.time()

    def create_class(
        self,
        name: str,
        *,
        cms: StudentsCms | None = None,
        timestamp: float | None = None,
        class_id: str | None = None,
        set_current: bool = True,
    ) -> Classroom:
        label = name.strip() or DEFAULT_CLASS_NAME
        new_id = (class_id or _generate_id()).strip()
        while not new_id or new_id in self._classes:
            new_id = _generate_id()
        when = timestamp or time.time()
        classroom = Classroom(
            class_id=new_id,
            name=label,
            cms=cms or StudentsCms(),
            created_at=when,
            updated_at=when,
            last_used_at=when,
            order_index=self._next_order_index(),
            algorithm_data={},
        )
        self._classes[new_id] = classroom
        if set_current:
            self._current_class_id = new_id
        self._version = max(self._version, CURRENT_VERSION)
        return classroom

    def remove_class(self, class_id: str, timestamp: float | None = None) -> None:
        if class_id not in self._classes:
            raise KeyError("class_missing")
        if len(self._classes) == 1:
            raise ValueError("class_last")
        self._classes.pop(class_id)
        if self._current_class_id == class_id:
            replacement = self._preferred_class_id()
            self.set_current(replacement, timestamp)
        self._normalize_orders()
        self._version = max(self._version, CURRENT_VERSION)

    def reorder(self, class_ids: Iterable[str]) -> None:
        order_map = {class_id: index for index, class_id in enumerate(class_ids)}
        for classroom in self._classes.values():
            if classroom.class_id in order_map:
                classroom.order_index = order_map[classroom.class_id]
        self._normalize_orders()
        self._version = max(self._version, CURRENT_VERSION)

    def get_class(self, class_id: str) -> Classroom:
        classroom = self._classes.get(class_id)
        if not classroom:
            raise KeyError("class_missing")
        return classroom

    def export(self, current_time: float | None = None) -> dict[str, Any]:
        snapshot_time = current_time or time.time()
        classes_meta: list[dict[str, Any]] = []
        classes_data: dict[str, Any] = {}
        for classroom in self.iter_classes():
            classes_meta.append(classroom.to_metadata())
            classes_data[classroom.class_id] = classroom.cms.export()
        current_class = self.current_class
        return {
            "version": self._version,
            "current_class_id": self._current_class_id,
            "current_class": {
                "id": current_class.class_id,
                "name": current_class.name,
                "payload": current_class.cms.snapshot(snapshot_time),
            },
            "classes": classes_meta,
            "classes_data": classes_data,
        }

    def serialize(self) -> str:
        payload = {
            "version": self._version,
            "current_class_id": self._current_class_id,
            "classes": self.to_unified_payload(),
        }
        return json.dumps(payload, ensure_ascii=False, indent=2)

    def to_unified_payload(self) -> dict[str, Any]:
        classes_payload: dict[str, Any] = {}
        for classroom in self.iter_classes():
            cms = classroom.cms
            students_map = {
                str(student.student_id): student.serialize()
                for student in cms.get_students()
            }
            algorithm_data = dict(classroom.algorithm_data)
            algorithm_data["cooldown_days"] = cms.pick_cooldown
            algorithm_data["history"] = cms.export_history()
            classes_payload[classroom.class_id] = {
                "meta": {
                    "name": classroom.name,
                    "created_at": classroom.created_at,
                    "updated_at": classroom.updated_at,
                    "last_used_at": classroom.last_used_at,
                    "order": classroom.order_index,
                },
                "algorithm_data": algorithm_data,
                "students": students_map,
            }
        return classes_payload

    def _next_order_index(self) -> int:
        return (
            max(
                (classroom.order_index for classroom in self._classes.values()),
                default=-1,
            )
            + 1
        )

    def _normalize_orders(self) -> None:
        for index, classroom in enumerate(self.iter_classes()):
            classroom.order_index = index

    def _preferred_class_id(self) -> str:
        classroom = min(
            self._classes.values(),
            key=lambda item: (item.order_index, item.created_at, item.class_id),
        )
        return classroom.class_id

    @classmethod
    def from_payload(
        cls,
        payload: str | dict[str, Any] | None,
        *,
        fallback: str | dict[str, Any] | None = None,
    ) -> "ClassroomsState":
        raw = cls._coerce_payload(payload)
        if cls._is_unified_format(raw):
            return cls._from_unified_format(raw)
        if cls._is_new_format(raw):
            return cls._from_new_format(raw)
        if cls._is_legacy_format(raw):
            return cls._from_legacy_format(raw)
        fallback_raw = cls._coerce_payload(fallback)
        if cls._is_unified_format(fallback_raw):
            return cls._from_unified_format(fallback_raw)
        if cls._is_new_format(fallback_raw):
            return cls._from_new_format(fallback_raw)
        if cls._is_legacy_format(fallback_raw):
            return cls._from_legacy_format(fallback_raw)
        return cls._default_state()

    @staticmethod
    def _coerce_payload(
        payload: str | dict[str, Any] | None,
    ) -> dict[str, Any] | list[Any] | None:
        if payload is None:
            return None
        if isinstance(payload, str):
            if not payload.strip():
                return None
            try:
                return json.loads(payload)
            except json.JSONDecodeError:
                return None
        if isinstance(payload, (dict, list)):
            return payload
        return None

    @staticmethod
    def _is_unified_format(raw: dict[str, Any] | list[Any] | None) -> bool:
        return isinstance(raw, dict) and isinstance(raw.get("classes"), dict)

    @staticmethod
    def _is_new_format(raw: dict[str, Any] | list[Any] | None) -> bool:
        return isinstance(raw, dict) and isinstance(raw.get("classes"), list)

    @staticmethod
    def _is_legacy_format(raw: dict[str, Any] | list[Any] | None) -> bool:
        if isinstance(raw, dict):
            return "students" in raw or "cooldown_days" in raw
        return isinstance(raw, list)

    @classmethod
    def _from_new_format(cls, raw: dict[str, Any]) -> "ClassroomsState":
        classes: dict[str, Classroom] = {}
        raw_classes_data = raw.get("classes_data")
        if not isinstance(raw_classes_data, dict):
            raw_classes_data = {}
        current_entry = raw.get("current_class")
        if not isinstance(current_entry, dict):
            current_entry = {}
        for index, item in enumerate(raw.get("classes", [])):
            if not isinstance(item, dict):
                continue
            class_id = str(item.get("id") or _generate_id())
            name = str(item.get("name") or DEFAULT_CLASS_NAME)
            created_at = cls._coerce_float(item.get("created_at"))
            updated_at = cls._coerce_float(item.get("updated_at"), default=created_at)
            last_used_at = cls._coerce_float(item.get("last_used_at"), default=0.0)
            order_index = cls._coerce_int(item.get("order"), default=index)
            data_blob = item.get("data")
            if data_blob is None:
                data_blob = raw_classes_data.get(class_id)
            if data_blob is None and str(current_entry.get("id") or "") == class_id:
                data_blob = current_entry.get("payload")
            cms = StudentsCms.deserialize(data_blob)
            classes[class_id] = Classroom(
                class_id=class_id,
                name=name,
                cms=cms,
                created_at=created_at,
                updated_at=updated_at,
                last_used_at=last_used_at,
                order_index=order_index,
                algorithm_data={},
            )
        if not classes:
            return cls._default_state()
        current_class_id = str(raw.get("current_class_id") or "")
        version = max(
            cls._coerce_int(raw.get("version"), default=CURRENT_VERSION),
            CURRENT_VERSION,
        )
        return cls(classes, current_class_id, version)

    @classmethod
    def _from_unified_format(cls, raw: dict[str, Any]) -> "ClassroomsState":
        classes_payload = raw.get("classes")
        if not isinstance(classes_payload, dict):
            return cls._default_state()
        active_class_id = str(raw.get("current_class_id") or "")
        classes: dict[str, Classroom] = {}
        now = time.time()
        for fallback_index, (class_id, class_payload) in enumerate(
            classes_payload.items()
        ):
            if not isinstance(class_payload, dict):
                continue
            meta = class_payload.get("meta")
            if not isinstance(meta, dict):
                meta = {}
            algorithm = class_payload.get("algorithm_data")
            if not isinstance(algorithm, dict):
                algorithm = {}
            algorithm_data = dict(algorithm)
            students_blob = class_payload.get("students")
            students_payload: list[dict[str, Any]] = []
            if isinstance(students_blob, dict):
                for student_key, student_entry in students_blob.items():
                    if not isinstance(student_entry, dict):
                        continue
                    normalized_entry = dict(student_entry)
                    if "id" not in normalized_entry:
                        fallback = student_key
                        if isinstance(fallback, str):
                            fallback = fallback.strip()
                        try:
                            normalized_entry["id"] = int(fallback)
                        except (TypeError, ValueError):
                            normalized_entry["id"] = fallback
                    students_payload.append(normalized_entry)
            elif isinstance(students_blob, list):
                for student_entry in students_blob:
                    if not isinstance(student_entry, dict):
                        continue
                    normalized_entry = dict(student_entry)
                    if "id" not in normalized_entry and "student_id" in normalized_entry:
                        normalized_entry["id"] = normalized_entry["student_id"]
                    students_payload.append(normalized_entry)
            cms_payload = {
                "cooldown_days": algorithm.get(
                    "cooldown_days", meta.get("cooldown_days", 3)
                ),
                "students": students_payload,
                "history": algorithm.get("history"),
            }
            cms = StudentsCms.deserialize(cms_payload)
            classroom = Classroom(
                class_id=str(class_id),
                name=str(meta.get("name") or DEFAULT_CLASS_NAME),
                cms=cms,
                created_at=cls._coerce_float(meta.get("created_at"), default=now),
                updated_at=cls._coerce_float(meta.get("updated_at"), default=now),
                last_used_at=cls._coerce_float(meta.get("last_used_at"), default=0.0),
                order_index=cls._coerce_int(meta.get("order"), default=fallback_index),
                algorithm_data=algorithm_data,
            )
            classes[classroom.class_id] = classroom
        if not classes:
            return cls._default_state()
        version = max(
            cls._coerce_int(raw.get("version"), default=CURRENT_VERSION),
            CURRENT_VERSION,
        )
        state = cls(classes, active_class_id, version)
        return state

    @classmethod
    def _from_legacy_format(cls, raw: dict[str, Any] | list[Any]) -> "ClassroomsState":
        cms = StudentsCms.deserialize(raw)
        now = time.time()
        class_id = _generate_id()
        classroom = Classroom(
            class_id=class_id,
            name=DEFAULT_CLASS_NAME,
            cms=cms,
            created_at=now,
            updated_at=now,
            last_used_at=now,
            order_index=0,
            algorithm_data={},
        )
        return cls({class_id: classroom}, class_id)

    @classmethod
    def _default_state(cls) -> "ClassroomsState":
        now = time.time()
        class_id = _generate_id()
        classroom = Classroom(
            class_id=class_id,
            name=DEFAULT_CLASS_NAME,
            cms=StudentsCms(),
            created_at=now,
            updated_at=now,
            last_used_at=now,
            order_index=0,
            algorithm_data={},
        )
        return cls({class_id: classroom}, class_id)

    @staticmethod
    def _coerce_float(value: Any, default: float | None = None) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return float(default or 0.0)

    @staticmethod
    def _coerce_int(value: Any, default: int | None = None) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return int(default or 0)
