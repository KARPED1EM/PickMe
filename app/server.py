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

from .storage import create_storage_backend
from .students_cms import StudentsCms

ERROR_TEXT = {
    "name_required": "姓名不能为空",
    "name_exists": "姓名已存在",
    "id_exists": "学号已存在",
    "id_required": "学号不能为空",
    "student_missing": "未找到该学生",
    "history_missing": "未找到对应记录",
    "history_invalid": "无效的历史记录",
    "no_students_available": "没有可抽取的学生",
    "no_groups_available": "没有可抽取的小组",
    "unsupported_action": "不支持的操作",
    "unsupported_random_mode": "不支持的抽取模式",
    "cooldown_invalid": "冷却天数必须至少为 1 天",
    "action_missing": "缺少操作指令",
}


ActionHandler = Callable[[StudentsCms, dict[str, Any]], JSONResponse]


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

    def success_response(
        cms: StudentsCms,
        result: dict[str, Any] | None = None,
        status: int = 200,
        persist: bool = False,
    ) -> JSONResponse:
        if persist:
            storage.save(cms)
        payload = cms.snapshot(current_timestamp())
        body: dict[str, Any] = {"payload": payload}
        if result is not None:
            body["result"] = result
        return JSONResponse(status_code=status, content=body)

    def error_response(message: str, status: int = 400) -> JSONResponse:
        return JSONResponse(status_code=status, content={"message": message})

    def run_single_random(cms: StudentsCms, ignore_cooldown: bool) -> JSONResponse:
        students = cms.eligible_students(ignore_cooldown=ignore_cooldown)
        if not students:
            raise ValueError("no_students_available")
        chosen = random.choice(students)
        cms.register_random_pick([chosen])
        result = {
            "type": "student",
            "student_id": chosen.student_id,
            "pool_ids": [student.student_id for student in students],
        }
        return success_response(cms, result, persist=True)

    def run_group_random(cms: StudentsCms, ignore_cooldown: bool) -> JSONResponse:
        groups = cms.eligible_groups(ignore_cooldown=ignore_cooldown)
        if not groups:
            raise ValueError("no_groups_available")
        group_value = random.choice(groups)
        now = current_timestamp()
        members = [
            student
            for student in cms.get_students()
            if student.group == group_value
            and student.pickable(now, cms.pick_cooldown, ignore_cooldown)
        ]
        if not members:
            raise ValueError("no_students_available")
        cms.register_random_pick(members)
        result = {
            "type": "group",
            "group": group_value,
            "student_ids": [student.student_id for student in members],
            "pool_ids": [student.student_id for student in members],
        }
        return success_response(cms, result, persist=True)

    def handle_set_cooldown(cms: StudentsCms, data: dict[str, Any]) -> JSONResponse:
        try:
            days = int(data.get("days"))
        except (TypeError, ValueError):
            raise ValueError("cooldown_invalid")
        if days < 1:
            raise ValueError("cooldown_invalid")
        cms.set_pick_cooldown(days)
        return success_response(cms, {"cooldown_days": cms.pick_cooldown}, persist=True)

    def handle_clear_cooldown(cms: StudentsCms, data: dict[str, Any]) -> JSONResponse:
        cms.clear_all_cooldowns()
        return success_response(cms, {"cleared": True}, persist=True)

    def handle_random_pick(cms: StudentsCms, data: dict[str, Any]) -> JSONResponse:
        mode = str(data.get("mode") or "any").lower()
        ignore_cooldown = bool(data.get("ignore_cooldown"))
        if mode == "group":
            return run_group_random(cms, ignore_cooldown)
        if mode == "any":
            return run_single_random(cms, ignore_cooldown)
        raise ValueError("unsupported_random_mode")

    def handle_student_force_cooldown(
        cms: StudentsCms, data: dict[str, Any]
    ) -> JSONResponse:
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        student = cms.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        cms.force_cooldown(student)
        return success_response(
            cms, {"type": "force_cooldown", "student_id": student_id}, persist=True
        )

    def handle_student_release_cooldown(
        cms: StudentsCms, data: dict[str, Any]
    ) -> JSONResponse:
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        student = cms.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        cms.force_end_cooldown(student)
        return success_response(
            cms, {"type": "release_cooldown", "student_id": student_id}, persist=True
        )

    def handle_student_update(cms: StudentsCms, data: dict[str, Any]) -> JSONResponse:
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        name = data.get("name")
        group = data.get("group")
        new_id = data.get("new_id")
        student = cms.update_student(student_id, name, group, new_id)
        return success_response(
            cms,
            {
                "type": "update_student",
                "student_id": student.student_id,
            },
            persist=True,
        )

    def handle_student_delete(cms: StudentsCms, data: dict[str, Any]) -> JSONResponse:
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        if not cms.remove_student(student_id):
            raise KeyError("student_missing")
        return success_response(
            cms, {"type": "delete_student", "student_id": student_id}, persist=True
        )

    def handle_student_history_clear(
        cms: StudentsCms, data: dict[str, Any]
    ) -> JSONResponse:
        student_id = str(data.get("student_id") or "").strip()
        if not student_id:
            raise ValueError("student_missing")
        student = cms.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        cms.clear_student_history(student)
        return success_response(
            cms, {"type": "clear_history", "student_id": student_id}, persist=True
        )

    def handle_student_history_remove(
        cms: StudentsCms, data: dict[str, Any]
    ) -> JSONResponse:
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
        return success_response(
            cms,
            {
                "type": "remove_history",
                "student_id": student_id,
                "timestamp": timestamp_value,
            },
            persist=True,
        )

    def handle_student_create(cms: StudentsCms, data: dict[str, Any]) -> JSONResponse:
        name = data.get("name")
        group = data.get("group")
        student_id = data.get("student_id")
        student = cms.create_student(name, group, student_id)
        return success_response(
            cms,
            {"type": "create_student", "student_id": student.student_id},
            persist=True,
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
    }

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request) -> HTMLResponse:
        cms = storage.load()
        initial_payload = cms.snapshot(current_timestamp())
        context = {
            "request": request,
            "initial_data": json.dumps(initial_payload, ensure_ascii=False),
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
        cms = storage.load(data)
        try:
            return handler(cms, data)
        except ValueError as error:
            return error_response(translate_error(str(error)), status=400)
        except KeyError as error:
            return error_response(translate_error(str(error)), status=404)

    return app
