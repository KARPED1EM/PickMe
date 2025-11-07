from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .classrooms import ClassroomsState
from .draw_service import DrawError, DrawRequest, DrawService
from .metadata import load_app_metadata
from .storage import UnifiedStorage
from .user_data import DEFAULT_UUID, UserData

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
    "uuid_missing": "缺少用户标识",
    "migrate_target_not_found": "目标 UID 不存在，请检查输入是否正确",
    "migrate_missing_params": "缺少迁移参数",
    "migrate_invalid_uuid": "无效的 UID 格式",
}

ActionHandler = Callable[[UserData, ClassroomsState, dict[str, Any]], JSONResponse]


def create_app(
    app_data_dir: Path,
    app_run_mode: str,
) -> FastAPI:
    app_base_dir = Path(__file__).resolve().parent
    templates = Jinja2Templates(directory=str(app_base_dir / "templates"))
    templates.env.globals["url_path_for"] = (
        lambda name, **kw: f"/{name}/{kw.get('path','')}".rstrip("/")
    )
    app = FastAPI()
    static_dir = app_base_dir / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
    storage = UnifiedStorage(app_run_mode, app_data_dir)
    app.state.storage = storage
    app.state.storage_mode = storage.mode
    if storage.mode == "desktop":
        storage.ensure_user(DEFAULT_UUID)
    app_meta = load_app_metadata()
    app.state.app_meta = app_meta
    draw_service = DrawService()

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

    def extract_uuid(data: dict[str, Any]) -> str:
        if storage.mode == "desktop":
            return DEFAULT_UUID
        candidate = data.get("uuid") or data.get("user_id") or data.get("id")
        if isinstance(candidate, str):
            try:
                return storage.normalize_user_id(candidate)
            except ValueError as exc:
                raise ValueError("uuid_missing") from exc
        raise ValueError("uuid_missing")

    def build_response(
        user_data: UserData,
        *,
        result: dict[str, Any] | None = None,
        status: int = 200,
        persist: bool = False,
        touch: str | None = "access",
    ) -> JSONResponse:
        now = current_timestamp()
        state = user_data.classrooms
        if touch == "modified":
            state.mark_current_modified(now)
            user_data.touch_modified()
        else:
            state.mark_current_accessed(now)
        user_data.touch_accessed()
        user_data.runtime["active_class_id"] = state.current_class_id
        if persist:
            storage.save_user(user_data)
        payload = user_data.to_dict()
        runtime_payload = payload.setdefault("runtime", {})
        runtime_payload["last_synced_at"] = now
        body: dict[str, Any] = {"uuid": user_data.user_id, "data": payload}
        if result is not None:
            body["result"] = result
        return JSONResponse(status_code=status, content=body)

    def error_response(message: str, status: int = 400) -> JSONResponse:
        return JSONResponse(status_code=status, content={"message": message})

    def parse_student_id(data: dict[str, Any], key: str = "student_id") -> int:
        """Parse and validate student_id from request data."""
        raw_id = data.get(key)
        if raw_id is None:
            raise ValueError("student_missing")
        try:
            return int(raw_id)
        except (TypeError, ValueError):
            raise ValueError("student_missing")

    def handle_set_cooldown(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
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
            user_data,
            result={"type": "set_cooldown", "cooldown_days": cms.pick_cooldown},
            persist=True,
            touch="modified",
        )

    def handle_clear_cooldown(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        cms.clear_all_cooldowns()
        return build_response(
            user_data,
            result={"type": "clear_cooldown", "class_id": state.current_class_id},
            persist=True,
            touch="modified",
        )

    def handle_random_pick(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        request = DrawRequest.from_payload(data)
        outcome = draw_service.execute(
            user_data.user_id, state, request, timestamp=current_timestamp()
        )
        return build_response(
            user_data,
            result=outcome.to_payload(),
            persist=True,
            touch="modified",
        )

    def handle_student_create(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        name = data.get("name")
        group = data.get("group")
        student_id = None
        raw_id = data.get("student_id")
        if raw_id is not None:
            try:
                student_id = int(raw_id)
            except (TypeError, ValueError):
                raise ValueError("id_required")
        student = cms.create_student(name, group, student_id)
        return build_response(
            user_data,
            result={
                "type": "create_student",
                "class_id": state.current_class_id,
                "student_id": student.student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_delete(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = parse_student_id(data)
        if not cms.remove_student(student_id):
            raise KeyError("student_missing")
        return build_response(
            user_data,
            result={
                "type": "delete_student",
                "class_id": state.current_class_id,
                "student_id": student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_update(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = parse_student_id(data)
        name = data.get("name")
        group = data.get("group")
        new_id = None
        raw_new_id = data.get("new_id")
        if raw_new_id is not None:
            try:
                new_id = int(raw_new_id)
            except (TypeError, ValueError):
                raise ValueError("id_required")
        student = cms.update_student(student_id, name, group, new_id)
        return build_response(
            user_data,
            result={
                "type": "update_student",
                "class_id": state.current_class_id,
                "student_id": student.student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_force_cooldown(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = parse_student_id(data)
        student = cms.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        cms.force_cooldown(student)
        return build_response(
            user_data,
            result={
                "type": "force_cooldown",
                "class_id": state.current_class_id,
                "student_id": student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_release_cooldown(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = parse_student_id(data)
        student = cms.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        cms.force_end_cooldown(student)
        return build_response(
            user_data,
            result={
                "type": "release_cooldown",
                "class_id": state.current_class_id,
                "student_id": student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_history_clear(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = parse_student_id(data)
        student = cms.get_student_by_id(student_id)
        if not student:
            raise KeyError("student_missing")
        cms.clear_student_history(student)
        return build_response(
            user_data,
            result={
                "type": "clear_history",
                "class_id": state.current_class_id,
                "student_id": student_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_student_history_remove(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        student_id = parse_student_id(data)
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
            user_data,
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
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
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
            user_data,
            result={
                "type": "history_note",
                "class_id": state.current_class_id,
                "entry": entry.serialize(),
            },
            persist=True,
            touch="modified",
        )

    def handle_history_delete(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        cms = state.current_cms
        entry_id = str(data.get("entry_id") or "").strip()
        if not entry_id:
            raise ValueError("history_missing")
        if not cms.remove_history_record(entry_id):
            raise ValueError("history_missing")
        return build_response(
            user_data,
            result={
                "type": "history_delete",
                "class_id": state.current_class_id,
                "entry_id": entry_id,
            },
            persist=True,
            touch="modified",
        )

    def handle_class_switch(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        class_id = str(data.get("class_id") or "").strip()
        if not class_id:
            raise ValueError("class_missing")
        state.set_current(class_id, current_timestamp())
        return build_response(
            user_data,
            result={"type": "class_switch", "class_id": class_id},
            persist=True,
            touch=None,
        )

    def handle_class_create(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ValueError("class_name_required")
        classroom = state.create_class(
            name, timestamp=current_timestamp(), set_current=True
        )
        return build_response(
            user_data,
            result={"type": "class_create", "class_id": classroom.class_id},
            persist=True,
            touch="modified",
        )

    def handle_class_delete(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        class_id = str(data.get("class_id") or "").strip()
        if not class_id:
            raise ValueError("class_missing")
        state.remove_class(class_id, timestamp=current_timestamp())
        return build_response(
            user_data,
            result={"type": "class_delete", "class_id": class_id},
            persist=True,
            touch=None,
        )

    def handle_class_reorder(
        user_data: UserData, state: ClassroomsState, data: dict[str, Any]
    ) -> JSONResponse:
        raw_order = data.get("order")
        if not isinstance(raw_order, list):
            raise ValueError("class_order_invalid")
        try:
            order = [str(item).strip() for item in raw_order if str(item).strip()]
        except Exception as exc:
            raise ValueError("class_order_invalid") from exc
        if not order:
            raise ValueError("class_order_invalid")
        state.reorder(order)
        return build_response(
            user_data,
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
        initial_payload: dict[str, Any] = {}
        initial_uuid: str | None = None
        if storage.mode == "desktop":
            user_data, normalized_uuid, _ = storage.ensure_user(DEFAULT_UUID)
            initial_payload = user_data.to_dict()
            initial_uuid = normalized_uuid
        context = {
            "request": request,
            "initial_data": json.dumps(initial_payload, ensure_ascii=False),
            "initial_uuid": initial_uuid or "",
            "storage_location": storage.location_hint,
            "storage_mode": storage.mode,
            "app_meta": app_meta,
        }
        return templates.TemplateResponse("index.html", context)

    @app.post("/data/session")
    async def open_session(request: Request) -> JSONResponse:
        data = await request_json(request)
        requested_uuid = None
        if isinstance(data, dict):
            candidate = data.get("uuid") or data.get("user_id")
            if isinstance(candidate, str) and candidate.strip():
                requested_uuid = candidate.strip().lower()
        user_data, normalized_uuid, created = storage.ensure_user(requested_uuid)
        payload = user_data.to_dict()
        return JSONResponse(
            {
                "uuid": normalized_uuid,
                "data": payload,
                "created": created,
                "storage_mode": storage.mode,
                "location": storage.location_hint,
            }
        )

    @app.get("/data/export")
    async def export_data(request: Request) -> Response:
        query_uuid = request.query_params.get("uuid")
        try:
            uuid_value = extract_uuid({"uuid": query_uuid})
        except ValueError:
            return error_response(translate_error("uuid_missing"))
        user_data = storage.load_user(uuid_value)
        content = storage.export_user(user_data)
        timestamp_label = time.strftime("%Y%m%d-%H%M%S")
        filename = f"pickme-data-{timestamp_label}.json"
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        }
        return Response(content=content, media_type="application/json", headers=headers)

    @app.post("/data/import")
    async def import_data(request: Request) -> JSONResponse:
        data = await request_json(request)
        if not data:
            return error_response("未检测到导入数据", status=400)
        try:
            uuid_value = extract_uuid(data)
        except ValueError:
            return error_response(translate_error("uuid_missing"), status=400)
        raw_payload = data.get("data")
        if raw_payload is None:
            return error_response("未提供导入数据", status=400)
        parsed_payload = raw_payload
        if isinstance(raw_payload, str):
            text_payload = raw_payload.strip()
            if not text_payload:
                return error_response("导入文件为空", status=400)
            try:
                parsed_payload = json.loads(text_payload)
            except json.JSONDecodeError:
                return error_response("导入文件格式不正确", status=400)
        if not isinstance(parsed_payload, (dict, list)):
            return error_response("导入文件格式不正确", status=400)
        user_data, normalized_uuid, _ = storage.ensure_user(uuid_value)
        if isinstance(parsed_payload, dict) and isinstance(
            parsed_payload.get("classes"), dict
        ):
            try:
                imported = UserData.from_dict(
                    parsed_payload,
                    default_user_id=normalized_uuid,
                    strict=True,
                )
            except ValueError:
                return error_response("导入文件格式不正确", status=400)
            imported.user_id = normalized_uuid
            imported.touch_modified()
            storage.save_user(imported)
            payload = imported.to_dict()
            return JSONResponse(
                {
                    "uuid": imported.user_id,
                    "data": payload,
                    "message": "导入成功",
                }
            )
        try:
            state = ClassroomsState.from_payload(parsed_payload, allow_default=False)
        except ValueError:
            return error_response("导入文件格式不正确", status=400)
        user_data.classrooms = state
        user_data.touch_modified()
        storage.save_user(user_data)
        payload = user_data.to_dict()
        return JSONResponse(
            {
                "uuid": user_data.user_id,
                "data": payload,
                "message": "导入成功",
            }
        )

    @app.post("/data/migrate")
    async def migrate_user(request: Request) -> JSONResponse:
        """Migrate user data from old UID to new UID."""
        # Only allow in server mode
        if storage.mode != "server":
            return error_response("该功能仅在服务器模式下可用", status=400)

        data = await request_json(request)
        if not data:
            return error_response(translate_error("migrate_missing_params"), status=400)

        old_uuid = data.get("old_uuid")
        new_uuid = data.get("new_uuid")

        if not old_uuid or not new_uuid:
            return error_response(translate_error("migrate_missing_params"), status=400)

        # Normalize and validate both UUIDs
        try:
            old_uuid_normalized = storage.normalize_user_id(old_uuid)
            new_uuid_normalized = storage.normalize_user_id(new_uuid)
        except ValueError:
            return error_response(translate_error("migrate_invalid_uuid"), status=400)

        # Perform the migration
        try:
            storage._store.migrate_user_data(old_uuid_normalized, new_uuid_normalized)
            return JSONResponse(
                {
                    "success": True,
                    "new_uuid": new_uuid_normalized,
                    "message": "迁移成功",
                }
            )
        except ValueError as e:
            error_msg = str(e)
            if "does not exist" in error_msg:
                return error_response(
                    translate_error("migrate_target_not_found"), status=400
                )
            return error_response(f"迁移失败: {error_msg}", status=400)

    @app.post("/actions")
    async def handle_action(request: Request) -> JSONResponse:
        data = await request_json(request)
        try:
            uuid_value = extract_uuid(data)
        except ValueError:
            return error_response(translate_error("uuid_missing"))
        action = str(data.get("action") or "").strip()
        if not action:
            return error_response(translate_error("action_missing"))
        handler = ACTIONS.get(action)
        if handler is None:
            return error_response(translate_error("unsupported_action"))
        user_data = storage.load_user(uuid_value)
        state = user_data.classrooms
        try:
            return handler(user_data, state, data)
        except DrawError as error:
            return error_response(translate_error(error.code), status=400)
        except ValueError as error:
            return error_response(translate_error(str(error)), status=400)
        except KeyError as error:
            return error_response(translate_error(str(error)), status=404)

    @app.get("/preferences")
    async def get_preferences(request: Request) -> JSONResponse:
        query_uuid = request.query_params.get("uuid")
        try:
            uuid_value = extract_uuid({"uuid": query_uuid})
        except ValueError:
            return error_response(translate_error("uuid_missing"))
        user_data = storage.load_user(uuid_value)
        return JSONResponse(
            {
                "uuid": user_data.user_id,
                "preferences": user_data.preferences,
            }
        )

    @app.post("/preferences")
    async def save_preferences(request: Request) -> JSONResponse:
        data = await request_json(request)
        try:
            uuid_value = extract_uuid(data)
        except ValueError:
            return error_response(translate_error("uuid_missing"))
        prefs = data.get("preferences")
        if not isinstance(prefs, dict):
            return error_response("Invalid preferences data", status=400)
        allowed_keys = {
            "theme",
            "language",
            "dismissed_intro_popup",
            "dismissed_draw_mode_tooltip",
        }
        for key in prefs.keys():
            if key not in allowed_keys:
                return error_response(f"Unknown preference key: {key}", status=400)
        if "theme" in prefs and not isinstance(prefs["theme"], str):
            return error_response("theme must be a string", status=400)
        if "language" in prefs and not isinstance(prefs["language"], str):
            return error_response("language must be a string", status=400)
        user_data = storage.load_user(uuid_value)
        updated = dict(user_data.preferences)
        for key, value in prefs.items():
            updated[key] = value
        user_data.preferences = updated
        user_data.touch_modified()
        storage.save_user(user_data)
        return JSONResponse(
            {
                "uuid": user_data.user_id,
                "preferences": user_data.preferences,
                "message": "Preferences saved successfully",
            }
        )

    return app
