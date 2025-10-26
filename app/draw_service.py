from __future__ import annotations

import random
import time
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Iterable

from .classrooms import ClassroomsState
from .random_provider import get_today_random
from .student import Student
from .students_cms import DrawHistoryEntry, StudentsCms


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
    def __init__(self, rng: random.Random | None = None) -> None:
        self._rng = rng or random.Random()

    @staticmethod
    def _is_different_day(timestamp1: float, timestamp2: float) -> bool:
        """Check if two timestamps are from different days."""
        if timestamp1 <= 0 or timestamp2 <= 0:
            return True
        date1 = datetime.fromtimestamp(timestamp1).date()
        date2 = datetime.fromtimestamp(timestamp2).date()
        return date1 != date2

    @staticmethod
    def _extract_numeric_ids(students: list[Student]) -> list[int]:
        """Extract numeric student IDs from a list of students."""
        numeric_ids = []
        for student in students:
            if student.student_id.isdigit():
                try:
                    numeric_ids.append(int(student.student_id))
                except (TypeError, ValueError):
                    # Skip if conversion fails
                    continue
        return numeric_ids

    def execute(
        self,
        state: ClassroomsState,
        request: DrawRequest,
        *,
        timestamp: float | None = None,
    ) -> DrawResult:
        cms = state.current_cms
        moment = time.time() if timestamp is None else float(timestamp)
        if request.mode is DrawMode.GROUP:
            return self._draw_group(state, cms, request, moment)
        if request.mode is DrawMode.BATCH:
            return self._draw_batch(state, cms, request, moment)
        return self._draw_single(state, cms, request, moment)

    def _draw_single(
        self,
        state: ClassroomsState,
        cms: StudentsCms,
        request: DrawRequest,
        moment: float,
    ) -> DrawResult:
        pool = cms.eligible_students(ignore_cooldown=request.ignore_cooldown)
        if not pool:
            raise DrawError("no_students_available")
        
        # Prepare data for random_provider
        all_students = cms.get_students()
        all_student_ids = self._extract_numeric_ids(all_students)
        disabled_ids = self._extract_numeric_ids(
            [s for s in all_students if s not in pool]
        )
        
        # Get last selected info
        last_selected_id, last_selected_time = cms.get_last_random_selected()
        
        # Check if last selection was from a different day
        last_picked = last_selected_id
        if last_selected_id is not None and self._is_different_day(last_selected_time, moment):
            last_picked = None
        
        # Use random_provider to select
        selected_id = get_today_random(all_student_ids, disabled_ids, last_picked)
        if selected_id is None:
            raise DrawError("no_students_available")
        
        # Find the chosen student
        chosen = cms.get_student_by_id(str(selected_id))
        if chosen is None:
            raise DrawError("no_students_available")
        
        # Save the last selected number and time
        cms.set_last_random_selected(selected_id, moment)
        
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
        
        # Prepare data for random_provider
        all_students = cms.get_students()
        all_student_ids = self._extract_numeric_ids(all_students)
        
        # Get last selected info (initial state)
        last_selected_id, last_selected_time = cms.get_last_random_selected()
        
        # Check if last selection was from a different day
        last_picked = last_selected_id
        if last_selected_id is not None and self._is_different_day(last_selected_time, moment):
            last_picked = None
        
        # Draw multiple students by calling random_provider multiple times
        chosen = []
        selected_ids = []
        for _ in range(count):
            # Build disabled list with students already chosen and those on cooldown
            disabled_ids = self._extract_numeric_ids(
                [s for s in all_students if s not in pool or s in chosen]
            )
            
            # Use random_provider to select
            selected_id = get_today_random(all_student_ids, disabled_ids, last_picked)
            if selected_id is None:
                raise DrawError("no_students_available")
            
            # Find the chosen student
            student = cms.get_student_by_id(str(selected_id))
            if student is None:
                raise DrawError("no_students_available")
            
            chosen.append(student)
            selected_ids.append(selected_id)
            
            # Update last_picked for next iteration
            last_picked = selected_id
        
        # Save the last selected number and time (after all selections)
        if selected_ids:
            cms.set_last_random_selected(selected_ids[-1], moment)
        
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
        state: ClassroomsState,
        cms: StudentsCms,
        request: DrawRequest,
        moment: float,
    ) -> DrawResult:
        groups = cms.eligible_groups(ignore_cooldown=request.ignore_cooldown)
        if not groups:
            raise DrawError("no_groups_available")
        
        # Use random_provider to select a group
        # For groups, we pass a random number from the eligible groups as last_picked
        # but we don't use or save the algorithm state
        random_last_picked = self._rng.choice(groups)
        
        selected_group = get_today_random(groups, [], random_last_picked)
        if selected_group is None:
            raise DrawError("no_groups_available")
        
        group_value = selected_group
        members = self._group_members(
            cms.get_students(),
            group_value,
            moment,
            cms.pick_cooldown,
            request.ignore_cooldown,
        )
        if not members:
            raise DrawError("no_students_available")
        
        # Note: We do NOT save last_selected_number or time for group draws
        
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
