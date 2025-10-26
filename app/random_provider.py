import secrets
from typing import List, Optional


def get_today_random(
    items: List[int], disabled: List[int], last_picked: Optional[int]
) -> Optional[int]:
    available = [x for x in items if x not in disabled]
    if last_picked is not None:
        available = [x for x in available if x != last_picked]
    if available:
        return secrets.choice(available)
    if last_picked is not None and last_picked not in disabled:
        return last_picked
    return None
