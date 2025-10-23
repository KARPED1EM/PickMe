from __future__ import annotations

import json
import random
import time
from pathlib import Path
from typing import Any, Callable

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .classrooms import ClassroomsState
from .students_cms import DrawHistoryEntry
from .storage import create_storage_backend

ERROR_TEXT = {
    "name_required": "姓名不能为空",
    "name_exists": "姓名已存在",
    "id_exists": "学号已存在",
    "id_required": "学号不能为空",
    "student_missing": "未找到指定学生",
    "history_missing": "未找到对应记录",
    "history_invalid": "无效的历史记录",
    "no_students_available": "当前没有可抽取的学生",
    "no_groups_available": "当前没有可抽取的小组",
    "unsupported_action": "不支持的操作",
    "unsupported_random_mode": "不支持的抽取模式",
    "batch_count_invalid": "抽取人数至少需要 1 人",
    "batch_count_exceeds_available": "可抽取人数不足",
    "history_note_too_long": "备注太长",
    "cooldown_invalid": "冷却时间必须至少为 1 天",
    "action_missing": "缺少操作指令",
    "class_missing": "未找到指定班级",
    "class_last": "至少需要保留一个班级",
    "class_name_required": "班级名称不能为空",
    "class_order_invalid": "班级排序数据无效",
}

ActionHandler = Callable[[ClassroomsState, dict[str, Any]], JSONResponse]


def create_app(
    user_data_dir: Path,
    default_data_dir: Path | None = None,
    storage_mode: str = "filesystem",
) -> FastAPI:
    base_dir = Path(__file__).resolve().parent
    templates = Jinja2Templates(directory=str(base_dir / "templates"))
    app = FastAPI()
    static_dir = base_dir / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
    storage = create_storage_backend(storage_mode, user_data_dir, default_data_dir)
    app.state.storage = storage

    def current_timestamp() -> float:
        return time.time()

    async def request_json(request: Request) -> dict[str, Any]:
        try:
            data = await request.json()
        except (json.JSONDecodeError, ValueError):
            data = {}
        return data if isinstance(data, dict) else {}

    def translate_error(code: str) -> str:
        return ERROR_TEXT.get(code, code or "操作失败")

    def build_response(
        state: ClassroomsState,
        *,
        result: dict[str, Any] | None = None,
        status: int = 200,
        persist: bool = False,
        touch: str | None = "access",
    ) -> JSONResponse:
        now = current_timestamp()
        if touch == "modified":
            state.mark_current_modified(now)
        elif touch == "access":
            state.mark_current_accessed(now)
        if persist:
            storage.save(state)
        payload = state.export(now)
        body: dict[str, Any] = {"state": payload}
        if result is not None:
            body["result"] = result
        return JSONResponse(status_code=status, content=body)

    def error_response(message: str, status: int = 400) -> JSONResponse:
        return JSONResponse(status_code=status, content={"message": message})

    def run_single_random(
        state: ClassroomsState, ignore_cooldown: bool
    ) -> JSONResponse:
        cms = state.current_cms
        students = cms.eligible_students(ignore_cooldown=ignore_cooldown)
        if not students:
            raise ValueError("no_students_available")
        chosen = random.choice(students)
        cms.register_random_pick([chosen])
        entry = cms.record_history_entry(
            DrawHistoryEntry(
                mode="single",
                students=[
                    {
                        "id": chosen.student_id,
                        "name": chosen.name,
                        "group": chosen.group,
                    }
                ],
                requested_count=1,
                ignore_cooldown=ignore_cooldown,
            )
        )
        result = {
            "type": "student",
            "class_id": state.current_class_id,
            "student_id": chosen.student_id,
            "pool_ids": [student.student_id for student in students],
            "history_entry_id": entry.entry_id,
        }
        return build_response(state, result=result, persist=True, touch="modified")

    def run_group_random(state: ClassroomsState, ignore_cooldown: bool) -> JSONResponse:
        cms = state.current_cms
        effective_ignore = bool(ignore_cooldown)
        groups = cms.eligible_groups(ignore_cooldown=effective_ignore)
        if not groups:
            raise ValueError("no_groups_available")
        group_value = random.choice(groups)
        now = current_timestamp()
        members = [
            student
            for student in cms.get_students()
            if student.group == group_value
            and student.pickable(now, cms.pick_cooldown, effective_ignore)
        ]
        if not members:
            raise ValueError("no_students_available")
        cms.register_random_pick(members)
        entry = cms.record_history_entry(
            DrawHistoryEntry(
                mode="group",
                students=[
                    {
                        "id": member.student_id,
                        "name": member.name,
                        "group": member.group,
                    }
                    for member in members
                ],
                group=group_value,
                requested_count=len(members),
                ignore_cooldown=effective_ignore,
            )
        )
        result = {
            "type": "group",
            "class_id": state.current_class_id,
            "group": group_value,
            "student_ids": [student.student_id for student in members],
            "pool_ids": [student.student_id for student in members],
            "history_entry_id": entry.entry_id,
        }
        return build_response(state, result=result, persist=True, touch="modified")

    def run_batch_random(
        state: ClassroomsState,
        ignore_cooldown: bool,
        requested_count: int,
    ) -> JSONResponse:
        cms = state.current_cms
        try:
            count = int(requested_count)
        except (TypeError, ValueError):
            raise ValueError("batch_count_invalid")
        if count < 1:
            raise ValueError("batch_count_invalid")
        students = cms.eligible_students(ignore_cooldown=ignore_cooldown)
        if not students:
            raise ValueError("no_students_available")
        if count > len(students):
            raise ValueError("batch_count_exceeds_available")
        chosen = random.sample(students, count)
        cms.register_random_pick(chosen)
        entry = cms.record_history_entry(
            DrawHistoryEntry(
                mode="batch",
                students=[
                    {
                        "id": student.student_id,
                        "name": student.name,
                        "group": student.group,
                    }
                    for student in chosen
                ],
                requested_count=count,
                ignore_cooldown=ignore_cooldown,
            )
        )
        result = {
            "type": "batch",
            "class_id": state.current_class_id,
            "student_ids": [student.student_id for student in chosen],
            "pool_ids": [student.student_id for student in students],
            "requested_count": count,
            "history_entry_id": entry.entry_id,
        }
        return build_response(state, result=result, persist=True, touch="modified")

    def handle_set_cooldown(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        try:
            days = int(data.get("days"))
        except (TypeError, ValueError):
            raise ValueError("cooldown_invalid")
        if days < 1:
            raise ValueError("cooldown_invalid")
        cms = state.current_cms
        cms.set_pick_cooldown(days)
        return build_response(
            state,
            result={"type": "set_cooldown", "cooldown_days": cms.pick_cooldown},
            persist=True,
            touch="modified",
        )

    def handle_clear_cooldown(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        cms.clear_all_cooldowns()
        return build_response(
            state,
            result={"type": "clear_cooldown", "class_id": state.current_class_id},
            persist=True,
            touch="modified",
        )

    def handle_random_pick(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        mode = str(data.get("mode") or "any").lower()
        ignore_cooldown = bool(data.get("ignore_cooldown"))
        if mode in {"any", "single", "student"}:
            return run_single_random(state, ignore_cooldown)
        if mode == "batch":
            return run_batch_random(state, ignore_cooldown, data.get("count"))
        if mode == "group":
            return run_group_random(state, ignore_cooldown)
        raise ValueError("unsupported_random_mode")

    def handle_student_create(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        name = data.get("name")
        group = data.get("group")
        student_id = data.get("student_id")
        student = cms.create_student(name, group, student_id)
        return build_response(
            state,
            result={
                "type": "create_student",
                "class_id": state.current_class_id,
                "student_id": student.student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_delete(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        if not cms.remove_student(student_id):
            raise KeyError("student_missing")
        return build_response(
            state,
            result={
                "type": "delete_student",
                "class_id": state.current_class_id,
                "student_id": student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_update(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        name = data.get("name")
        group = data.get("group")
        new_id = data.get("new_id")
        student = cms.update_student(student_id, name, group, new_id)
        return build_response(
            state,
            result={
                "type": "update_student",
                "class_id": state.current_class_id,
                "student_id": student.student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_force_cooldown(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        student = cms.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        cms.force_cooldown(student)
        return build_response(
            state,
            result={
                "type": "force_cooldown",
                "class_id": state.current_class_id,
                "student_id": student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_release_cooldown(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        student = cms.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        cms.force_end_cooldown(student)
        return build_response(
            state,
            result={
                "type": "release_cooldown",
                "class_id": state.current_class_id,
                "student_id": student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_history_clear(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        student = cms.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        cms.clear_student_history(student)
        return build_response(
            state,
            result={
                "type": "clear_history",
                "class_id": state.current_class_id,
                "student_id": student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_history_remove(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        student = cms.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        timestamp = data.get("timestamp")
        try:
            timestamp_value = float(timestamp)
        except (TypeError, ValueError):
            raise ValueError("history_invalid")
        if not cms.remove_student_history_entry(student, timestamp_value):
            raise ValueError("history_missing")
        return build_response(
            state,
            result={
                "type": "remove_history",
                "class_id": state.current_class_id,
                "student_id": student_id,
                "timestamp": timestamp_value,
            },
            persist=True,
            touch="modified",
        )

    def handle_history_note(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        entry_id = str(data.get("entry_id") or "").strip()
        if not entry_id:
            raise ValueError("history_missing")
        note_raw = data.get("note", "")
        note_value = str(note_raw or "").strip()
        if len(note_value) > 200:
            raise ValueError("history_note_too_long")
        entry = cms.update_history_note(entry_id, note_value)
        return build_response(
            state,
            result={
                "type": "history_note",
                "class_id": state.current_class_id,
                "entry": entry.serialize(),
            },
            persist=True,
            touch="modified",
        )

    def handle_history_delete(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        entry_id = str(data.get("entry_id") or "").strip()
        if not entry_id:
            raise ValueError("history_missing")
        if not cms.remove_history_record(entry_id):
            raise ValueError("history_missing")
        return build_response(
            state,
            result={
                "type": "history_delete",
                "class_id": state.current_class_id,
                "entry_id": entry_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_class_switch(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        class_id = str(data.get("class_id") or "").strip()
        if not class_id:
            raise ValueError("class_missing")
        state.set_current(class_id, current_timestamp())
        return build_response(
            state,
            result={"type": "class_switch", "class_id": class_id},
            persist=True,
            touch=None,
        )

    def handle_class_create(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ValueError("class_name_required")
        classroom = state.create_class(
            name, timestamp=current_timestamp(), set_current=True
        )
        return build_response(
            state,
            result={"type": "class_create", "class_id": classroom.class_id},
            persist=True,
            touch="modified",
        )

    def handle_class_delete(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        class_id = str(data.get("class_id") or "").strip()
        if not class_id:
            raise ValueError("class_missing")
        state.remove_class(class_id, timestamp=current_timestamp())
        return build_response(
            state,
            result={"type": "class_delete", "class_id": class_id},
            persist=True,
            touch=None,
        )

    def handle_class_reorder(
        state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        raw_order = data.get("order")
        if not isinstance(raw_order, list):
            raise ValueError("class_order_invalid")
        try:
            order = [str(item).strip() for item in raw_order if str(item).strip()]
        except Exception as exc:  # noqa: BLE001
            raise ValueError("class_order_invalid") from exc
        if not order:
            raise ValueError("class_order_invalid")
        state.reorder(order)
        return build_response(
            state,
            result={"type": "class_reorder"},
            persist=True,
            touch=None,
        )

    ACTIONS: dict[str, ActionHandler] = {
        "set_cooldown": handle_set_cooldown,
        "clear_cooldown": handle_clear_cooldown,
        "random_pick": handle_random_pick,
        "student_create": handle_student_create,
        "student_delete": handle_student_delete,
        "student_update": handle_student_update,
        "student_force_cooldown": handle_student_force_cooldown,
        "student_release_cooldown": handle_student_release_cooldown,
        "student_history_clear": handle_student_history_clear,
        "student_history_remove": handle_student_history_remove,
        "history_entry_note": handle_history_note,
        "history_entry_delete": handle_history_delete,
        "class_switch": handle_class_switch,
        "class_create": handle_class_create,
        "class_delete": handle_class_delete,
        "class_reorder": handle_class_reorder,
    }

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request) -> HTMLResponse:
        state = storage.load()
        initial_state = state.export(current_timestamp())
        context = {
            "request": request,
            "initial_data": json.dumps(initial_state, ensure_ascii=False),
            "user_data_path": storage.location_hint,
            "storage_mode": storage.mode,
        }
        return templates.TemplateResponse("index.html", context)

    @app.post("/actions")
    async def handle_action(request: Request) -> JSONResponse:
        data = await request_json(request)
        action = str(data.get("action") or "").strip()
        if not action:
            return error_response(translate_error("action_missing"))
        handler = ACTIONS.get(action)
        if handler is None:
            return error_response(translate_error("unsupported_action"))
        state = storage.load(data)
        try:
            return handler(state, data)
        except ValueError as error:
            return error_response(translate_error(str(error)), status=400)
        except KeyError as error:
            return error_response(translate_error(str(error)), status=404)

    return app
