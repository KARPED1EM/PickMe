from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Iterable

from .classrooms import ClassroomsState
from .random_provider import get_today_random
from .student import Student
from .students_cms import DrawHistoryEntry, StudentsCms

ALGORITHM_LAST_NUM_KEY = "algorithm_last_num"
ALGORITHM_LAST_TIME_KEY = "algorithm_last_time"


class DrawError(Exception):
    """Error raised when a draw request cannot be fulfilled."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def _normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off", ""}:
            return False
    return False


def _serialize_student(student: Student) -> dict[str, Any]:
    return {
        "id": student.student_id,
        "name": student.name,
        "group": student.group,
    }


class DrawMode(str, Enum):
    SINGLE = "single"
    BATCH = "batch"
    GROUP = "group"

    @classmethod
    def from_value(cls, value: Any) -> "DrawMode":
        normalized = str(value or "single").strip().lower()
        if normalized in {"any", "student"}:
            normalized = "single"
        try:
            return cls(normalized)
        except ValueError as exc:  # noqa: BLE001
            raise DrawError("unsupported_random_mode") from exc


@dataclass(frozen=True)
class DrawRequest:
    mode: DrawMode
    ignore_cooldown: bool = False
    requested_count: Any | None = None

    @classmethod
    def from_payload(cls, payload: Any) -> "DrawRequest":
        data = payload if isinstance(payload, dict) else {}
        mode = DrawMode.from_value(data.get("mode"))
        ignore = _normalize_bool(data.get("ignore_cooldown"))
        count = data.get("count")
        if count is None:
            count = data.get("requested_count")
        return cls(mode=mode, ignore_cooldown=ignore, requested_count=count)


@dataclass
class DrawResult:
    mode: DrawMode
    class_id: str
    students: list[Student]
    ignore_cooldown: bool
    requested_count: int
    history_entry: DrawHistoryEntry
    pool_student_ids: list[str]
    pool_groups: list[int]
    group_value: int | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "mode": self.mode.value,
            "class_id": self.class_id,
            "ignore_cooldown": self.ignore_cooldown,
            "requested_count": self.requested_count,
            "history_entry_id": self.history_entry.entry_id,
            "students": [_serialize_student(student) for student in self.students],
            "pool": {
                "students": list(self.pool_student_ids),
                "groups": list(self.pool_groups),
            },
        }
        payload["pool_ids"] = list(self.pool_student_ids)
        if self.mode is DrawMode.SINGLE:
            payload["type"] = "student"
            payload["student_id"] = self.students[0].student_id if self.students else ""
        else:
            payload["type"] = self.mode.value
            payload["student_ids"] = [student.student_id for student in self.students]
        if self.group_value is not None:
            payload["group"] = self.group_value
        return payload


class DrawService:
    def execute(
        self,
        user_id: str,
        state: ClassroomsState,
        request: DrawRequest,
        *,
        timestamp: float | None = None,
    ) -> DrawResult:
        cms = state.current_cms
        moment = time.time() if timestamp is None else float(timestamp)
        if request.mode is DrawMode.GROUP:
            return self._draw_group(user_id, state, cms, request, moment)
        if request.mode is DrawMode.BATCH:
            return self._draw_batch(user_id, state, cms, request, moment)
        return self._draw_single(user_id, state, cms, request, moment)

    def _draw_single(
        self,
        user_id: str,
        state: ClassroomsState,
        cms: StudentsCms,
        request: DrawRequest,
        moment: float,
    ) -> DrawResult:
        pool = cms.eligible_students(ignore_cooldown=request.ignore_cooldown)
        if not pool:
            raise DrawError("no_students_available")
        classroom = state.current_class
        chosen = self._pick_student(
            user_id,
            classroom,
            cms,
            moment,
            request.ignore_cooldown,
        )
        cms.register_random_pick([chosen], timestamp=moment)
        entry = cms.record_history_entry(
            DrawHistoryEntry(
                mode=DrawMode.SINGLE.value,
                students=[_serialize_student(chosen)],
                requested_count=1,
                ignore_cooldown=request.ignore_cooldown,
            )
        )
        return DrawResult(
            mode=DrawMode.SINGLE,
            class_id=state.current_class_id,
            students=[chosen],
            ignore_cooldown=request.ignore_cooldown,
            requested_count=1,
            history_entry=entry,
            pool_student_ids=[student.student_id for student in pool],
            pool_groups=[],
            group_value=chosen.group,
        )

    def _draw_batch(
        self,
        user_id: str,
        state: ClassroomsState,
        cms: StudentsCms,
        request: DrawRequest,
        moment: float,
    ) -> DrawResult:
        pool = cms.eligible_students(ignore_cooldown=request.ignore_cooldown)
        available = len(pool)
        if not available:
            raise DrawError("no_students_available")
        count = self._normalize_batch_count(request.requested_count)
        if count > available:
            raise DrawError("batch_count_exceeds_available")
        classroom = state.current_class
        chosen: list[Student] = []
        selected_ids: set[int] = set()
        for _ in range(count):
            student = self._pick_student(
                user_id,
                classroom,
                cms,
                moment,
                request.ignore_cooldown,
                selected_ids,
            )
            chosen.append(student)
            selected_ids.add(student.student_id)
        cms.register_random_pick(chosen, timestamp=moment)
        entry = cms.record_history_entry(
            DrawHistoryEntry(
                mode=DrawMode.BATCH.value,
                students=[_serialize_student(student) for student in chosen],
                requested_count=count,
                ignore_cooldown=request.ignore_cooldown,
            )
        )
        return DrawResult(
            mode=DrawMode.BATCH,
            class_id=state.current_class_id,
            students=chosen,
            ignore_cooldown=request.ignore_cooldown,
            requested_count=count,
            history_entry=entry,
            pool_student_ids=[student.student_id for student in pool],
            pool_groups=[],
        )

    def _draw_group(
        self,
        user_id: str,
        state: ClassroomsState,
        cms: StudentsCms,
        request: DrawRequest,
        moment: float,
    ) -> DrawResult:
        groups = cms.eligible_groups(ignore_cooldown=request.ignore_cooldown)
        if not groups:
            raise DrawError("no_groups_available")
        candidates = [int(value) for value in groups]
        placeholder = secrets.choice(candidates)
        group_value = get_today_random(candidates, [], placeholder, user_id)
        if group_value is None:
            raise DrawError("no_groups_available")
        members = self._group_members(
            cms.get_students(),
            group_value,
            moment,
            cms.pick_cooldown,
            request.ignore_cooldown,
        )
        if not members:
            raise DrawError("no_students_available")
        cms.register_random_pick(members, timestamp=moment)
        entry = cms.record_history_entry(
            DrawHistoryEntry(
                mode=DrawMode.GROUP.value,
                students=[_serialize_student(student) for student in members],
                group=group_value,
                requested_count=len(members),
                ignore_cooldown=request.ignore_cooldown,
            )
        )
        return DrawResult(
            mode=DrawMode.GROUP,
            class_id=state.current_class_id,
            students=members,
            ignore_cooldown=request.ignore_cooldown,
            requested_count=len(members),
            history_entry=entry,
            pool_student_ids=[student.student_id for student in members],
            pool_groups=[int(value) for value in groups],
            group_value=group_value,
        )

    @staticmethod
    def _normalize_batch_count(value: Any) -> int:
        try:
            count = int(float(value))
        except (TypeError, ValueError):
            raise DrawError("batch_count_invalid")
        if count < 1:
            raise DrawError("batch_count_invalid")
        return count

    @staticmethod
    def _group_members(
        students: Iterable[Student],
        group_value: int,
        moment: float,
        cooldown_days: int,
        ignore_cooldown: bool,
    ) -> list[Student]:
        members: list[Student] = []
        for student in students:
            if student.group != group_value:
                continue
            if student.pickable(moment, cooldown_days, ignore_cooldown):
                members.append(student)
        return members

    @staticmethod
    def _same_day(first: float, second: float) -> bool:
        if first <= 0 or second <= 0:
            return False
        one = time.localtime(first)
        two = time.localtime(second)
        return one.tm_year == two.tm_year and one.tm_yday == two.tm_yday

    def _resolve_last_pick(self, classroom, moment: float) -> int | None:
        data = classroom.algorithm_data
        last_num = data.get(ALGORITHM_LAST_NUM_KEY)
        last_time = data.get(ALGORITHM_LAST_TIME_KEY)
        try:
            numeric = int(last_num)
        except (TypeError, ValueError):
            numeric = 0
        try:
            timestamp = float(last_time)
        except (TypeError, ValueError):
            timestamp = 0.0
        if numeric <= 0:
            return None
        if not self._same_day(moment, timestamp):
            return None
        return numeric

    @staticmethod
    def _update_last_pick(classroom, student_id: int, moment: float) -> None:
        data = classroom.algorithm_data
        data[ALGORITHM_LAST_NUM_KEY] = int(student_id)
        data[ALGORITHM_LAST_TIME_KEY] = float(moment)

    def _pick_student(
        self,
        user_id: str,
        classroom,
        cms: StudentsCms,
        moment: float,
        ignore_cooldown: bool,
        extra_disabled: set[int] | None = None,
    ) -> Student:
        students = cms.get_students()
        if not students:
            raise DrawError("no_students_available")
        lookup = {student.student_id: student for student in students}
        items = list(lookup.keys())
        disabled_set: set[int] = set(extra_disabled or ())
        if not ignore_cooldown:
            for student in students:
                if not student.pickable(moment, cms.pick_cooldown, False):
                    disabled_set.add(student.student_id)
        disabled = list(disabled_set)
        last_picked = self._resolve_last_pick(classroom, moment)
        if last_picked is not None and last_picked not in lookup:
            last_picked = None
        chosen_id = get_today_random(items, disabled, last_picked, user_id)
        if chosen_id is None:
            raise DrawError("no_students_available")
        student = lookup.get(chosen_id)
        if student is None:
            raise DrawError("no_students_available")
        self._update_last_pick(classroom, student.student_id, moment)
        return student
