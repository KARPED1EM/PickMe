import json
import random
import time

from flask import Flask, jsonify, render_template, request

from data_manager import DataManager
from students_cms import StudentsCms

app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False

cms = StudentsCms.deserialize(DataManager.get_students_data())

ERROR_TEXT = {
    "name_required": "姓名不能为空",
    "name_exists": "姓名已存在",
    "id_exists": "编号已存在",
    "id_required": "编号不能为空",
    "student_missing": "未找到该学生",
    "history_missing": "未找到对应记录",
    "history_invalid": "无效的历史记录",
}


def current_time() -> float:
    return time.time()


def request_json() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def translate_error(code: str) -> str:
    return ERROR_TEXT.get(code, code or "操作失败")


def success_response(result: dict | None = None, status: int = 200, save: bool = False):
    if save:
        DataManager.save_students_data(cms.serialize())
    payload = cms.snapshot(current_time())
    body = {"payload": payload}
    if result is not None:
        body["result"] = result
    return jsonify(body), status


def error_response(message: str, status: int = 400):
    return jsonify({"message": message}), status


@app.route("/")
def index():
    initial_payload = cms.snapshot(current_time())
    return render_template(
        "index.html",
        initial_data=json.dumps(initial_payload, ensure_ascii=False),
    )


@app.post("/actions")
def handle_action():
    data = request_json()
    action = data.get("action")
    if not action:
        return error_response("缺少指令", 400)
    try:
        if action == "set_cooldown":
            return handle_set_cooldown(data)
        if action == "clear_cooldown":
            return handle_clear_cooldown()
        if action == "random_pick":
            return handle_random_pick(data)
        if action == "student_force_cooldown":
            return handle_student_force_cooldown(data)
        if action == "student_release_cooldown":
            return handle_student_release_cooldown(data)
        if action == "student_update":
            return handle_student_update(data)
        if action == "student_delete":
            return handle_student_delete(data)
        if action == "student_create":
            return handle_student_create(data)
        if action == "student_history_clear":
            return handle_student_history_clear(data)
        if action == "student_history_remove":
            return handle_student_history_remove(data)
    except ValueError as error:
        return error_response(translate_error(str(error)), 400)
    except KeyError as error:
        return error_response(translate_error(str(error)), 404)
    return error_response("不支持的操作", 400)


def handle_set_cooldown(data: dict):
    try:
        days = int(data.get("days"))
    except (TypeError, ValueError):
        raise ValueError("冷却天数至少为1")
    if days < 1:
        raise ValueError("冷却天数至少为1")
    cms.set_pick_cooldown(days)
    return success_response({"cooldown_days": cms.pick_cooldown}, save=True)


def handle_clear_cooldown():
    cms.clear_all_cooldowns()
    return success_response({"cleared": True}, save=True)


def handle_random_pick(data: dict):
    mode = (data.get("mode") or "any").lower()
    ignore_cooldown = bool(data.get("ignore_cooldown"))
    if mode not in {"any", "group"}:
        raise ValueError("不支持的抽取模式")
    if mode == "group":
        return run_group_random(ignore_cooldown)
    return run_single_random(ignore_cooldown)


def run_single_random(ignore_cooldown: bool):
    students = cms.eligible_students(ignore_cooldown=ignore_cooldown)
    if not students:
        raise ValueError("没有可用的学生")
    chosen = random.choice(students)
    cms.register_random_pick([chosen])
    result = {
        "type": "single",
        "student_id": chosen.student_id,
        "pool_ids": [student.student_id for student in students],
    }
    return success_response(result, save=True)


def run_group_random(ignore_cooldown: bool):
    groups = cms.eligible_groups(ignore_cooldown=ignore_cooldown)
    if not groups:
        raise ValueError("没有可用的小组")
    group_value = random.choice(groups)
    current = current_time()
    members = [
        student
        for student in cms.get_students()
        if student.group == group_value
        and student.pickable(current, cms.pick_cooldown, ignore_cooldown)
    ]
    if not members:
        raise ValueError("没有可用的学生")
    cms.register_random_pick(members)
    result = {
        "type": "group",
        "group": group_value,
        "student_ids": [student.student_id for student in members],
        "pool_ids": [student.student_id for student in members],
    }
    return success_response(result, save=True)


def handle_student_force_cooldown(data: dict):
    student_id = str(data.get("student_id") or "").strip()
    if not student_id:
        raise ValueError("student_missing")
    student = cms.get_student_by_id(student_id)
    if not student:
        raise KeyError("student_missing")
    cms.force_cooldown(student)
    return success_response(
        {"type": "force_cooldown", "student_id": student_id}, save=True
    )


def handle_student_release_cooldown(data: dict):
    student_id = str(data.get("student_id") or "").strip()
    if not student_id:
        raise ValueError("student_missing")
    student = cms.get_student_by_id(student_id)
    if not student:
        raise KeyError("student_missing")
    cms.force_end_cooldown(student)
    return success_response(
        {"type": "release_cooldown", "student_id": student_id}, save=True
    )


def handle_student_update(data: dict):
    student_id = str(data.get("student_id") or "").strip()
    if not student_id:
        raise ValueError("student_missing")
    name = data.get("name")
    group = data.get("group")
    new_id = data.get("new_id")
    student = cms.update_student(student_id, name, group, new_id)
    return success_response(
        {
            "type": "update_student",
            "student_id": student.student_id,
        },
        save=True,
    )


def handle_student_delete(data: dict):
    student_id = str(data.get("student_id") or "").strip()
    if not student_id:
        raise ValueError("student_missing")
    if not cms.remove_student(student_id):
        raise KeyError("student_missing")
    return success_response(
        {"type": "delete_student", "student_id": student_id}, save=True
    )


def handle_student_history_clear(data: dict):
    student_id = str(data.get("student_id") or "").strip()
    if not student_id:
        raise ValueError("student_missing")
    student = cms.get_student_by_id(student_id)
    if not student:
        raise KeyError("student_missing")
    cms.clear_student_history(student)
    return success_response(
        {"type": "clear_history", "student_id": student_id}, save=True
    )


def handle_student_history_remove(data: dict):
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
        {
            "type": "remove_history",
            "student_id": student_id,
            "timestamp": timestamp_value,
        },
        save=True,
    )


def handle_student_create(data: dict):
    name = data.get("name")
    group = data.get("group")
    student_id = data.get("student_id")
    student = cms.create_student(name, group, student_id)
    return success_response(
        {"type": "create_student", "student_id": student.student_id}, save=True
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
