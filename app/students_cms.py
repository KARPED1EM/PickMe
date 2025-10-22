import json
import time

from .student import Student


class StudentsCms:
    def __init__(self, pick_cooldown: int = 3) -> None:
        self.__students: dict[str, Student] = {}
        self.__pick_cooldown = pick_cooldown

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

    def register_random_pick(self, students: list[Student]) -> None:
        timestamp = time.time()
        for student in students:
            student.register_pick(timestamp)

    def force_cooldown(self, student: Student) -> None:
        student.set_last_pick(time.time())

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
        }

    def export(self) -> dict:
        return {
            "cooldown_days": self.__pick_cooldown,
            "students": [student.serialize() for student in self.__students.values()],
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
        if isinstance(raw, dict):
            manager.__pick_cooldown = raw.get("cooldown_days", 3)
            students_data = raw.get("students", [])
        else:
            students_data = raw
        for item in students_data:
            student = Student.deserialize(item)
            manager.add_student(student)
        return manager
