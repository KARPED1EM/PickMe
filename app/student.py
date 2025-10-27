import json
import uuid


_SECONDS_PER_DAY = 60 * 60 * 24


class Student:
    def __init__(
        self,
        name: str,
        group: int,
        last_pick: float = 0.0,
        pick_count: int = 0,
        pick_history: list[float] | None = None,
        student_id: int | None = None,
        cooldown_started_at: float = 0.0,
        cooldown_expires_at: float = 0.0,
    ) -> None:
        if student_id is None:
            # Generate a random numeric ID if not provided
            self.__id = abs(hash(uuid.uuid4())) % 1000000000
        else:
            self.__id = self.__parse_int(student_id)
        self.__name = name.strip()
        self.__group = max(0, self.__parse_int(group))
        self.__last_pick = float(last_pick or 0.0)
        self.__pick_count = self.__parse_int(pick_count)
        self.__pick_history: list[float] = []
        if pick_history:
            for value in pick_history:
                try:
                    self.__pick_history.append(float(value))
                except (TypeError, ValueError):
                    continue
        if not self.__pick_history and self.__last_pick:
            self.__pick_history.append(self.__last_pick)
        if self.__pick_count < len(self.__pick_history):
            self.__pick_count = len(self.__pick_history)
        self.__cooldown_started_at = self.__parse_float(cooldown_started_at)
        self.__cooldown_expires_at = self.__parse_float(cooldown_expires_at)
        if self.__cooldown_started_at < 0.0:
            self.__cooldown_started_at = 0.0
        if self.__cooldown_expires_at < self.__cooldown_started_at:
            self.__cooldown_expires_at = self.__cooldown_started_at

    @staticmethod
    def __parse_int(value) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def __parse_float(value) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @property
    def student_id(self) -> int:
        return self.__id

    @property
    def name(self) -> str:
        return self.__name

    @property
    def group(self) -> int:
        return self.__group

    @property
    def last_pick(self) -> float:
        return self.__last_pick

    @property
    def pick_count(self) -> int:
        return self.__pick_count

    @property
    def pick_history(self) -> list[float]:
        return list(self.__pick_history)

    @property
    def cooldown_started_at(self) -> float:
        return self.__cooldown_started_at

    @property
    def cooldown_expires_at(self) -> float:
        return self.__cooldown_expires_at

    def update(self, name: str, group: int) -> None:
        self.__name = name.strip()
        self.__group = max(0, self.__parse_int(group))

    def set_student_id(self, value: int) -> None:
        self.__id = self.__parse_int(value)

    def pickable(
        self, current_time: float, cooldown: int, ignore_cooldown: bool = False
    ) -> bool:
        if ignore_cooldown:
            return True
        return current_time >= self.__cooldown_expires_at

    def pick_cooldown_remaining(self, current_time: float, cooldown: int) -> float:
        if self.__cooldown_expires_at <= 0.0:
            return 0.0
        return max(0.0, self.__cooldown_expires_at - current_time)

    def apply_cooldown(self, start_timestamp: float, cooldown_days: int) -> None:
        duration_days = max(0, int(cooldown_days))
        if duration_days <= 0:
            self.force_pickable()
            return
        start_value = float(start_timestamp)
        if start_value < 0.0:
            start_value = 0.0
        self.__cooldown_started_at = start_value
        self.__cooldown_expires_at = start_value + duration_days * _SECONDS_PER_DAY

    def force_pickable(self) -> None:
        self.__cooldown_started_at = 0.0
        self.__cooldown_expires_at = 0.0

    def clear_history(self) -> None:
        self.__pick_history.clear()
        self.__pick_count = 0
        self.__last_pick = 0.0
        self.force_pickable()

    def remove_history_entry(self, timestamp: float, tolerance: float = 1e-6) -> bool:
        try:
            target = float(timestamp)
        except (TypeError, ValueError):
            return False
        index = None
        for position, value in enumerate(self.__pick_history):
            if abs(value - target) <= tolerance:
                index = position
                break
        if index is None:
            return False
        previous_last_pick = self.__last_pick
        removed_value = self.__pick_history.pop(index)
        if self.__pick_history:
            self.__last_pick = max(self.__pick_history)
        else:
            self.__last_pick = 0.0
        self.__pick_count = len(self.__pick_history)
        if (
            abs(previous_last_pick - removed_value) <= tolerance
            or abs(self.__cooldown_started_at - removed_value) <= tolerance
        ):
            self.force_pickable()
        return True

    def register_pick(self, timestamp: float, cooldown_days: int) -> None:
        value = float(timestamp)
        if value < 0.0:
            value = 0.0
        self.__last_pick = value
        self.__pick_count += 1
        self.__pick_history.append(value)
        self.apply_cooldown(value, cooldown_days)

    def to_dict(self, current_time: float, cooldown: int) -> dict:
        return {
            "id": self.__id,
            "name": self.__name,
            "group": self.__group,
            "last_pick": self.__last_pick,
            "cooldown_started_at": self.__cooldown_started_at,
            "cooldown_expires_at": self.__cooldown_expires_at,
            "remaining_cooldown": self.pick_cooldown_remaining(current_time, cooldown),
            "pick_count": self.__pick_count,
            "pick_history": list(self.__pick_history),
        }

    def serialize(self) -> dict:
        return {
            "id": self.__id,
            "name": self.__name,
            "group": self.__group,
            "last_pick": self.__last_pick,
            "pick_count": self.__pick_count,
            "pick_history": list(self.__pick_history),
            "cooldown_started_at": self.__cooldown_started_at,
            "cooldown_expires_at": self.__cooldown_expires_at,
        }

    @staticmethod
    def deserialize(data, default_cooldown_days: int | None = None) -> "Student":
        if isinstance(data, str):
            obj = json.loads(data)
        else:
            obj = data
        try:
            group_value = int(obj.get("group", 0))
        except (TypeError, ValueError):
            group_value = 0
        pick_history = obj.get("pick_history")
        if not isinstance(pick_history, list):
            pick_history = []
        pick_count = obj.get("pick_count")
        try:
            pick_count_value = int(pick_count)
        except (TypeError, ValueError):
            pick_count_value = 0
        name_value = str(obj.get("name", "")).strip()

        student_id_value = None
        raw_id = obj.get("id")
        if raw_id is not None:
            try:
                # Handle both int and string representations
                student_id_value = int(raw_id)
            except (TypeError, ValueError):
                # If conversion fails, let Student __init__ generate one
                student_id_value = None

        cooldown_started_at = obj.get("cooldown_started_at", 0.0)
        cooldown_expires_at = obj.get("cooldown_expires_at", 0.0)
        cooldown_payload = obj.get("cooldown")
        has_explicit_cooldown = False
        if isinstance(cooldown_payload, dict):
            has_explicit_cooldown = True
            cooldown_started_at = cooldown_payload.get(
                "started_at", cooldown_started_at
            )
            cooldown_expires_at = cooldown_payload.get(
                "expires_at", cooldown_expires_at
            )
        elif "cooldown_started_at" in obj or "cooldown_expires_at" in obj:
            has_explicit_cooldown = True
        student = Student(
            student_id=student_id_value,
            name=name_value,
            group=group_value,
            last_pick=obj.get("last_pick", 0.0),
            pick_count=pick_count_value,
            pick_history=pick_history,
            cooldown_started_at=cooldown_started_at,
            cooldown_expires_at=cooldown_expires_at,
        )
        if (
            not has_explicit_cooldown
            and student.cooldown_expires_at == 0.0
            and student.last_pick > 0.0
            and default_cooldown_days is not None
            and default_cooldown_days > 0
        ):
            student.apply_cooldown(student.last_pick, default_cooldown_days)
        return student
