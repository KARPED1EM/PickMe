import json
import time
import uuid
from typing import Any

from .student import Student


class DrawHistoryEntry:
    __slots__ = (
        "entry_id",
        "timestamp",
        "mode",
        "count",
        "requested_count",
        "ignore_cooldown",
        "group",
        "students",
        "note",
    )

    _SUPPORTED_MODES = {"single", "group", "batch"}

    def __init__(
        self,
        *,
        entry_id: str | None = None,
        timestamp: float | None = None,
        mode: str = "single",
        students: list[dict[str, Any]] | None = None,
        group: int | None = None,
        count: int | None = None,
        requested_count: int | None = None,
        ignore_cooldown: bool = False,
        note: str = "",
    ) -> None:
        self.entry_id = (entry_id or uuid.uuid4().hex).strip()
        self.timestamp = float(timestamp or time.time())
        normalized_mode = str(mode or "single").lower()
        if normalized_mode not in self._SUPPORTED_MODES:
            normalized_mode = "single"
        self.mode = normalized_mode
        self.students = self._normalize_students(students)
        self.group = self._normalize_group(group)
        self.count = (
            int(count)
            if isinstance(count, (int, float))
            else len(self.students)
        )
        self.requested_count = (
            int(requested_count)
            if isinstance(requested_count, (int, float))
            else self.count
        )
        self.ignore_cooldown = bool(ignore_cooldown)
        self.note = self._normalize_note(note)

    @staticmethod
    def _normalize_students(
        candidates: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        if not isinstance(candidates, list):
            return []
        normalized: list[dict[str, Any]] = []
        for item in candidates:
            if not isinstance(item, dict):
                continue
            student_id = str(item.get("id") or item.get("student_id") or "").strip()
            name = str(item.get("name") or "").strip()
            try:
                group_value = int(item.get("group", 0))
            except (TypeError, ValueError):
                group_value = 0
            normalized.append(
                {
                    "id": student_id,
                    "name": name,
                    "group": group_value,
                }
            )
        return normalized

    @staticmethod
    def _normalize_group(value: Any) -> int | None:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _normalize_note(value: Any) -> str:
        return str(value or "").strip()

    def serialize(self) -> dict[str, Any]:
        payload = {
            "id": self.entry_id,
            "timestamp": self.timestamp,
            "mode": self.mode,
            "count": self.count,
            "requested_count": self.requested_count,
            "ignore_cooldown": self.ignore_cooldown,
            "note": self.note,
            "students": [dict(item) for item in self.students],
        }
        if self.group is not None:
            payload["group"] = self.group
        return payload

    def update_note(self, note: str) -> None:
        self.note = self._normalize_note(note)

    @classmethod
    def from_payload(cls, payload: Any) -> "DrawHistoryEntry":
        if not isinstance(payload, dict):
            raise ValueError("history_invalid")
        timestamp_raw = payload.get("timestamp") or payload.get("time")
        try:
            timestamp_value = float(timestamp_raw)
        except (TypeError, ValueError):
            timestamp_value = time.time()
        return cls(
            entry_id=payload.get("id") or payload.get("entry_id"),
            timestamp=timestamp_value,
            mode=payload.get("mode") or payload.get("type") or "single",
            students=payload.get("students") or payload.get("members"),
            group=payload.get("group"),
            count=payload.get("count"),
            requested_count=payload.get("requested_count"),
            ignore_cooldown=payload.get("ignore_cooldown"),
            note=payload.get("note"),
        )


class StudentsCms:
    def __init__(self, pick_cooldown: int = 3) -> None:
        self.__students: dict[str, Student] = {}
        self.__pick_cooldown = pick_cooldown
        self.__history: list[DrawHistoryEntry] = []
        self.__history_updated_at: float = time.time()

    @staticmethod
    def __parse_int(value) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    @property
    def pick_cooldown(self) -> int:
        return self.__pick_cooldown

    def add_student(self, student: Student) -> None:
        self.__students[student.student_id] = student

    def generate_student_id(self) -> str:
        numeric = [
            int(student.student_id)
            for student in self.__students.values()
            if str(student.student_id).isdigit()
        ]
        base = max(numeric) + 1 if numeric else 1
        candidate = str(base)
        while candidate in self.__students:
            base += 1
            candidate = str(base)
        return candidate

    def create_student(
        self, name: str, group: int, student_id: str | None = None
    ) -> Student:
        name_value = str(name or "").strip()
        if not name_value:
            raise ValueError("name_required")
        group_value = self.__parse_int(group)
        custom_id = str(student_id or "").strip()
        new_id = custom_id or self.generate_student_id()
        if new_id in self.__students:
            raise ValueError("id_exists")
        if self.student_name_exists(name_value):
            raise ValueError("name_exists")
        student = Student(name=name_value, group=group_value, student_id=new_id)
        self.add_student(student)
        return student

    def remove_student(self, student_id: str) -> bool:
        return self.__students.pop(student_id, None) is not None

    def student_name_exists(self, name: str, exclude_id: str | None = None) -> bool:
        lowered = name.lower()
        for student in self.__students.values():
            if exclude_id and student.student_id == exclude_id:
                continue
            if student.name.lower() == lowered:
                return True
        return False

    def get_student_by_id(self, student_id: str) -> Student | None:
        return self.__students.get(student_id)

    def get_students(self) -> list[Student]:
        return list(self.__students.values())

    def history_entries(self) -> list[DrawHistoryEntry]:
        return list(self.__history)

    def record_history_entry(self, entry: DrawHistoryEntry) -> DrawHistoryEntry:
        self.__history.insert(0, entry)
        self.__sort_history()
        self.__touch_history(entry.timestamp)
        return entry

    def update_history_note(self, entry_id: str, note: str) -> DrawHistoryEntry:
        entry = self.__find_history_entry(entry_id)
        if not entry:
            raise KeyError("history_missing")
        entry.update_note(note)
        self.__touch_history()
        return entry

    def remove_history_record(self, entry_id: str) -> bool:
        lookup = str(entry_id or "").strip()
        if not lookup:
            return False
        for index, entry in enumerate(self.__history):
            if entry.entry_id == lookup:
                self.__history.pop(index)
                self.__touch_history()
                return True
        return False

    def export_history(self) -> dict[str, Any]:
        return {
            "entries": [entry.serialize() for entry in self.__history],
            "updated_at": self.__history_updated_at,
        }

    def load_history(self, payload: Any) -> None:
        data = payload if isinstance(payload, dict) else {}
        raw_entries = []
        if isinstance(payload, list):
            raw_entries = payload
        elif isinstance(data, dict):
            raw_entries = data.get("entries") or []
        entries: list[DrawHistoryEntry] = []
        if isinstance(raw_entries, list):
            for item in raw_entries:
                try:
                    entry = DrawHistoryEntry.from_payload(item)
                except ValueError:
                    continue
                entries.append(entry)
        self.__history = entries
        self.__sort_history()
        updated_at = time.time()
        if isinstance(data, dict):
            try:
                updated_at = float(data.get("updated_at"))
            except (TypeError, ValueError):
                updated_at = time.time()
        if not entries:
            updated_at = time.time()
        self.__history_updated_at = updated_at

    def __find_history_entry(self, entry_id: str) -> DrawHistoryEntry | None:
        lookup = str(entry_id or "").strip()
        if not lookup:
            return None
        for entry in self.__history:
            if entry.entry_id == lookup:
                return entry
        return None

    def __sort_history(self) -> None:
        self.__history.sort(key=lambda item: item.timestamp, reverse=True)

    def __touch_history(self, timestamp: float | None = None) -> None:
        now = time.time()
        target = float(timestamp) if timestamp is not None else now
        self.__history_updated_at = max(self.__history_updated_at, target, now)

    def set_pick_cooldown(self, days: int) -> None:
        self.__pick_cooldown = max(1, int(days))

    def sorted_students(self, search_term: str | None = None) -> list[Student]:
        items = self.__students.values()
        if search_term:
            lowered = search_term.lower()

            def matches(student: Student) -> bool:
                return any(
                    lowered in str(value).lower()
                    for value in (
                        student.student_id,
                        student.name,
                        student.group,
                        student.pick_count,
                    )
                )

            items = [student for student in items if matches(student)]
        return sorted(
            items,
            key=lambda student: (
                -student.pick_count,
                student.group,
                student.name.lower(),
                student.student_id.lower(),
            ),
        )

    def eligible_students(self, ignore_cooldown: bool = False) -> list[Student]:
        current_time = time.time()
        return [
            student
            for student in self.__students.values()
            if student.pickable(current_time, self.__pick_cooldown, ignore_cooldown)
        ]

    def eligible_groups(self, ignore_cooldown: bool = False) -> list[int]:
        current_time = time.time()
        groups: dict[int, list[Student]] = {}
        for student in self.__students.values():
            groups.setdefault(student.group, []).append(student)
        eligible = []
        for group_id, members in groups.items():
            if all(
                s.pickable(current_time, self.__pick_cooldown, ignore_cooldown)
                for s in members
            ):
                eligible.append(group_id)
        return sorted(eligible)

    def register_random_pick(
        self, students: list[Student], *, timestamp: float | None = None
    ) -> None:
        moment = time.time() if timestamp is None else float(timestamp)
        for student in students:
            student.register_pick(moment, self.__pick_cooldown)

    def force_cooldown(self, student: Student) -> None:
        student.apply_cooldown(time.time(), self.__pick_cooldown)

    def force_end_cooldown(self, student: Student) -> None:
        student.force_pickable()

    def clear_all_cooldowns(self) -> None:
        for student in self.__students.values():
            student.force_pickable()

    def clear_student_history(self, student: Student) -> None:
        student.clear_history()

    def remove_student_history_entry(self, student: Student, timestamp: float) -> bool:
        return student.remove_history_entry(timestamp)

    def update_student(
        self,
        student_id: str,
        name: str,
        group: int,
        new_id: str | None = None,
    ) -> Student:
        student = self.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        name_value = str(name or "").strip()
        if not name_value:
            raise ValueError("name_required")
        if self.student_name_exists(name_value, exclude_id=student_id):
            raise ValueError("name_exists")
        target_id = student.student_id
        if new_id is not None:
            candidate_id = str(new_id or "").strip()
            if not candidate_id:
                raise ValueError("id_required")
            if candidate_id != student.student_id and candidate_id in self.__students:
                raise ValueError("id_exists")
            target_id = candidate_id
        if target_id != student.student_id:
            self.__students.pop(student.student_id)
            student.set_student_id(target_id)
            self.__students[student.student_id] = student
        student.update(name_value, group)
        return student

    def snapshot(self, current_time: float) -> dict:
        items = []
        for student in self.sorted_students():
            payload = student.to_dict(current_time, self.__pick_cooldown)
            payload["is_cooling"] = payload["remaining_cooldown"] > 0
            items.append(payload)
        return {
            "cooldown_days": self.__pick_cooldown,
            "students": items,
            "generated_at": current_time,
            "history": self.export_history(),
        }

    def export(self) -> dict:
        return {
            "cooldown_days": self.__pick_cooldown,
            "students": [student.serialize() for student in self.__students.values()],
            "history": self.export_history(),
        }

    def serialize(self) -> str:
        return json.dumps(self.export(), ensure_ascii=False, indent=2)

    @staticmethod
    def deserialize(data: str | dict | list | None) -> "StudentsCms":
        manager = StudentsCms()
        if data is None:
            return manager
        if isinstance(data, str):
            if not data.strip():
                return manager
            try:
                raw = json.loads(data)
            except json.JSONDecodeError:
                raw = []
        elif isinstance(data, (dict, list)):
            raw = data
        else:
            raw = []
        history_payload = None
        if isinstance(raw, dict):
            manager.__pick_cooldown = raw.get("cooldown_days", 3)
            students_data = raw.get("students", [])
            history_payload = raw.get("history")
        else:
            students_data = raw
        for item in students_data:
            student = Student.deserialize(item, default_cooldown_days=manager.__pick_cooldown)
            manager.add_student(student)
        manager.load_history(history_payload)
        return manager
