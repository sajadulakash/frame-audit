from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hmac import compare_digest
import json
import os
from pathlib import Path
import secrets
from shutil import move
from threading import RLock
from typing import Any
from urllib.parse import unquote
from uuid import uuid4

import yaml
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ANNOTATOR_CONFIG_PATH = Path(
    os.environ.get(
        "FRAMEAUDIT_CONFIG_PATH",
        Path.home() / ".config" / "frameaudit" / "annotators.json",
    )
).expanduser()

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
DELETED_DIRECTORY_NAME = "deleted"
YAML_FILE_NAME = "images.yaml"
UNDO_LOG_FILE_NAME = ".undo_log.yaml"
ADMIN_SESSION_LIFETIME = timedelta(hours=8)

_CONFIG_LOCK = RLock()
_SESSION_LOCK = RLock()
_ADMIN_SESSIONS: dict[str, datetime] = {}


app = FastAPI(title="FrameAudit")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AnnotatorCreateRequest(BaseModel):
    name: str


class AnnotatorUpdateRequest(BaseModel):
    name: str | None = None


class TaskCreateRequest(BaseModel):
    name: str
    folder_path: str
    delete_labels: list[str] = Field(default_factory=list)


class TaskUpdateRequest(BaseModel):
    name: str | None = None
    folder_path: str | None = None
    delete_labels: list[str] | None = None


def _normalized_name(value: str, label: str = "Name") -> str:
    name = " ".join(value.split())
    if not name:
        raise HTTPException(status_code=422, detail=f"{label} is required.")
    if len(name) > 80:
        raise HTTPException(
            status_code=422,
            detail=f"{label} must be 80 characters or fewer.",
        )
    return name


def _normalized_folder_path(value: str) -> Path:
    raw_path = value.strip()
    if not raw_path:
        raise HTTPException(status_code=422, detail="Folder path is required.")

    folder_path = Path(raw_path).expanduser()
    if not folder_path.is_absolute():
        raise HTTPException(
            status_code=422,
            detail="Folder path must be an absolute path.",
        )

    folder_path = folder_path.resolve()
    if not folder_path.exists():
        raise HTTPException(
            status_code=422,
            detail=f"Folder does not exist: {folder_path}",
        )
    if not folder_path.is_dir():
        raise HTTPException(
            status_code=422,
            detail=f"Path is not a folder: {folder_path}",
        )
    return folder_path


def _normalized_delete_labels(labels: list[str] | None) -> list[str]:
    if labels is None:
        return []

    normalized_labels: list[str] = []
    seen_labels: set[str] = set()
    for value in labels:
        label = " ".join(str(value).split())
        if not label:
            continue
        if len(label) > 80:
            raise HTTPException(
                status_code=422,
                detail="Delete labels must be 80 characters or fewer.",
            )
        label_key = label.casefold()
        if label_key in seen_labels:
            continue
        seen_labels.add(label_key)
        normalized_labels.append(label)

    return normalized_labels


def _legacy_task_id(annotator_id: str) -> str:
    clean_id = "".join(character for character in annotator_id if character.isalnum())
    return "task_" + (clean_id[-12:] or uuid4().hex[:12])


def _normalized_task(raw_task: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(raw_task, dict):
        return None
    if not all(isinstance(raw_task.get(key), str) for key in ("id", "name", "folder_path")):
        return None
    return {
        "id": raw_task["id"],
        "name": _normalized_name(raw_task["name"], "Task name"),
        "folder_path": raw_task["folder_path"],
        "delete_labels": _normalized_delete_labels(raw_task.get("delete_labels", [])),
        "created_at": raw_task.get("created_at"),
        "updated_at": raw_task.get("updated_at"),
    }


def _normalized_annotator(raw_annotator: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(raw_annotator, dict):
        return None
    if not all(isinstance(raw_annotator.get(key), str) for key in ("id", "name")):
        return None

    tasks: list[dict[str, Any]] = []
    raw_tasks = raw_annotator.get("tasks")
    if isinstance(raw_tasks, list):
        for raw_task in raw_tasks:
            task = _normalized_task(raw_task)
            if task is not None:
                tasks.append(task)
    elif isinstance(raw_annotator.get("folder_path"), str):
        timestamp = raw_annotator.get("created_at")
        tasks.append(
            {
                "id": _legacy_task_id(raw_annotator["id"]),
                "name": "Default task",
                "folder_path": raw_annotator["folder_path"],
                "delete_labels": _normalized_delete_labels(raw_annotator.get("delete_labels", [])),
                "created_at": timestamp,
                "updated_at": raw_annotator.get("updated_at", timestamp),
            }
        )

    return {
        "id": raw_annotator["id"],
        "name": _normalized_name(raw_annotator["name"], "Annotator name"),
        "tasks": tasks,
        "created_at": raw_annotator.get("created_at"),
        "updated_at": raw_annotator.get("updated_at"),
    }


def _read_annotators() -> list[dict[str, Any]]:
    with _CONFIG_LOCK:
        if not ANNOTATOR_CONFIG_PATH.exists():
            return []

        try:
            payload = json.loads(ANNOTATOR_CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise HTTPException(
                status_code=500,
                detail=f"Could not read annotator configuration: {error}",
            ) from error

        annotators = payload.get("annotators") if isinstance(payload, dict) else None
        if not isinstance(annotators, list):
            raise HTTPException(
                status_code=500,
                detail="Annotator configuration has an invalid format.",
            )

        valid_annotators: list[dict[str, Any]] = []
        for raw_annotator in annotators:
            annotator = _normalized_annotator(raw_annotator)
            if annotator is not None:
                valid_annotators.append(annotator)

        return valid_annotators


def _write_annotators(annotators: list[dict[str, Any]]) -> None:
    payload = {
        "version": 2,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "annotators": annotators,
    }

    with _CONFIG_LOCK:
        try:
            ANNOTATOR_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
            temporary_path = ANNOTATOR_CONFIG_PATH.with_suffix(
                ANNOTATOR_CONFIG_PATH.suffix + ".tmp"
            )
            temporary_path.write_text(
                json.dumps(payload, indent=2, ensure_ascii=True) + "\n",
                encoding="utf-8",
            )
            temporary_path.replace(ANNOTATOR_CONFIG_PATH)
        except OSError as error:
            raise HTTPException(
                status_code=500,
                detail=f"Could not save annotator configuration: {error}",
            ) from error


def _ensure_unique_annotator_name(
    annotators: list[dict[str, Any]],
    name: str,
    excluded_id: str | None = None,
) -> None:
    for annotator in annotators:
        if annotator["id"] == excluded_id:
            continue
        if annotator["name"].casefold() == name.casefold():
            raise HTTPException(
                status_code=409,
                detail="An annotator with this name already exists.",
            )


def _ensure_unique_task(
    annotators: list[dict[str, Any]],
    annotator_id: str,
    task_name: str,
    folder_path: Path,
    excluded_task_id: str | None = None,
) -> None:
    resolved_folder = str(folder_path)
    for annotator in annotators:
        for task in annotator.get("tasks", []):
            if task["id"] == excluded_task_id:
                continue
            if annotator["id"] == annotator_id and task["name"].casefold() == task_name.casefold():
                raise HTTPException(
                    status_code=409,
                    detail="This annotator already has a task with this name.",
                )
            if task["folder_path"] == resolved_folder:
                raise HTTPException(
                    status_code=409,
                    detail="This folder is already assigned to another task.",
                )


def _annotator_config(annotator_id: str) -> dict[str, Any]:
    for annotator in _read_annotators():
        if annotator["id"] == annotator_id:
            return annotator
    raise HTTPException(status_code=404, detail="Annotator is not configured.")


def _task_config(annotator_id: str, task_id: str) -> dict[str, Any]:
    annotator = _annotator_config(annotator_id)
    for task in annotator.get("tasks", []):
        if task["id"] == task_id:
            return task
    raise HTTPException(status_code=404, detail="Task is not configured.")


def _task_image_count(task: dict[str, Any]) -> tuple[bool, int]:
    folder_path = Path(task["folder_path"])
    folder_exists = folder_path.exists() and folder_path.is_dir()
    image_count = 0
    if folder_exists:
        image_count = sum(
            1
            for path in folder_path.iterdir()
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        )
    return folder_exists, image_count


def _admin_task_payload(task: dict[str, Any]) -> dict[str, Any]:
    folder_exists, image_count = _task_image_count(task)
    return {
        "id": task["id"],
        "name": task["name"],
        "folder_path": task["folder_path"],
        "folder_exists": folder_exists,
        "image_count": image_count,
        "delete_labels": _normalized_delete_labels(task.get("delete_labels", [])),
        "created_at": task.get("created_at"),
        "updated_at": task.get("updated_at"),
    }


def _admin_annotator_payload(annotator: dict[str, Any]) -> dict[str, Any]:
    task_payloads = [_admin_task_payload(task) for task in annotator.get("tasks", [])]
    return {
        "id": annotator["id"],
        "name": annotator["name"],
        "task_count": len(task_payloads),
        "image_count": sum(task["image_count"] for task in task_payloads),
        "tasks": task_payloads,
        "created_at": annotator.get("created_at"),
        "updated_at": annotator.get("updated_at"),
    }


def _image_directory(annotator_id: str, task_id: str) -> Path:
    return Path(_task_config(annotator_id, task_id)["folder_path"])


def _validate_image_directory(annotator_id: str, task_id: str) -> None:
    image_directory = _image_directory(annotator_id, task_id)
    if not image_directory.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Assigned folder does not exist: {image_directory}",
        )
    if not image_directory.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Assigned path is not a folder: {image_directory}",
        )


def _deleted_directory(annotator_id: str, task_id: str) -> Path:
    return _image_directory(annotator_id, task_id) / DELETED_DIRECTORY_NAME


def _yaml_file_path(annotator_id: str, task_id: str) -> Path:
    return _image_directory(annotator_id, task_id) / YAML_FILE_NAME


def _undo_log_path(annotator_id: str, task_id: str) -> Path:
    return _image_directory(annotator_id, task_id) / UNDO_LOG_FILE_NAME


def _list_images(annotator_id: str, task_id: str) -> list[Path]:
    _validate_image_directory(annotator_id, task_id)
    image_directory = _image_directory(annotator_id, task_id)
    return sorted(
        [
            path
            for path in image_directory.iterdir()
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ],
        key=lambda path: path.name.lower(),
    )


def _read_yaml_index(annotator_id: str, task_id: str) -> dict[str, Any]:
    yaml_path = _yaml_file_path(annotator_id, task_id)
    if not yaml_path.exists():
        return {}

    with yaml_path.open("r", encoding="utf-8") as yaml_file:
        data = yaml.safe_load(yaml_file) or {}

    return data if isinstance(data, dict) else {}


def _sync_yaml_index(annotator_id: str, task_id: str) -> dict[str, Any]:
    current_images = _list_images(annotator_id, task_id)
    current_names = {image_path.name for image_path in current_images}
    existing_payload = _read_yaml_index(annotator_id, task_id)
    existing_entries = existing_payload.get("images", [])

    tracked_entries: list[dict[str, Any]] = []
    tracked_names: set[str] = set()
    highest_number = 0

    if isinstance(existing_entries, list):
        for entry in existing_entries:
            if not isinstance(entry, dict):
                continue

            name = entry.get("name")
            number = entry.get("number")
            if not isinstance(name, str) or not isinstance(number, int):
                continue
            if number < 1 or name in tracked_names:
                continue

            tracked_names.add(name)
            highest_number = max(highest_number, number)
            tracked_entries.append(
                {
                    "number": number,
                    "name": name,
                    "present": name in current_names,
                }
            )

    for image_path in current_images:
        if image_path.name in tracked_names:
            continue

        highest_number += 1
        tracked_names.add(image_path.name)
        tracked_entries.append(
            {
                "number": highest_number,
                "name": image_path.name,
                "present": True,
            }
        )

    tracked_entries.sort(key=lambda entry: entry["number"])
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "image_directory": str(_image_directory(annotator_id, task_id)),
        "total_images": len(current_images),
        "total_tracked_images": len(tracked_entries),
        "images": tracked_entries,
    }

    with _yaml_file_path(annotator_id, task_id).open("w", encoding="utf-8") as yaml_file:
        yaml.safe_dump(payload, yaml_file, sort_keys=False, allow_unicode=False)

    return payload


def _ensure_system_files(annotator_id: str, task_id: str) -> None:
    _validate_image_directory(annotator_id, task_id)
    _deleted_directory(annotator_id, task_id).mkdir(exist_ok=True)
    if not _undo_log_path(annotator_id, task_id).exists():
        with _undo_log_path(annotator_id, task_id).open("w", encoding="utf-8") as log_file:
            yaml.safe_dump({"history": []}, log_file, sort_keys=False)
    _sync_yaml_index(annotator_id, task_id)


def _read_undo_history(annotator_id: str, task_id: str) -> list[dict[str, Any]]:
    log_path = _undo_log_path(annotator_id, task_id)
    if not log_path.exists():
        return []
    with log_path.open("r", encoding="utf-8") as log_file:
        data = yaml.safe_load(log_file) or {}
    history = data.get("history", [])
    return history if isinstance(history, list) else []


def _write_undo_history(
    annotator_id: str,
    task_id: str,
    history: list[dict[str, Any]],
) -> None:
    with _undo_log_path(annotator_id, task_id).open("w", encoding="utf-8") as log_file:
        yaml.safe_dump({"history": history}, log_file, sort_keys=False, allow_unicode=False)


def _current_state(annotator_id: str, task_id: str) -> dict[str, Any]:
    _ensure_system_files(annotator_id, task_id)
    index_payload = _sync_yaml_index(annotator_id, task_id)
    image_entries = [
        {"number": entry["number"], "name": entry["name"]}
        for entry in index_payload["images"]
        if entry["present"]
    ]
    history = _read_undo_history(annotator_id, task_id)
    annotator = _annotator_config(annotator_id)
    task = _task_config(annotator_id, task_id)
    return {
        "user_id": annotator_id,
        "user_label": annotator["name"],
        "task_id": task_id,
        "task_label": task["name"],
        "images": image_entries,
        "total_images": len(image_entries),
        "total_tracked_images": index_payload["total_tracked_images"],
        "can_undo": bool(history),
        "last_deleted_name": history[-1]["original_name"] if history else None,
        "delete_labels": _normalized_delete_labels(task.get("delete_labels", [])),
    }


def _safe_deleted_name(annotator_id: str, task_id: str, original_name: str) -> str:
    target = _deleted_directory(annotator_id, task_id) / original_name
    if not target.exists():
        return original_name

    stem = Path(original_name).stem
    suffix = Path(original_name).suffix
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"{stem}_{timestamp}{suffix}"


def _new_admin_session() -> str:
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    with _SESSION_LOCK:
        expired_tokens = [
            existing_token
            for existing_token, expires_at in _ADMIN_SESSIONS.items()
            if expires_at <= now
        ]
        for expired_token in expired_tokens:
            _ADMIN_SESSIONS.pop(expired_token, None)
        _ADMIN_SESSIONS[token] = now + ADMIN_SESSION_LIFETIME
    return token


def _require_admin(
    authorization: str | None = Header(default=None),
) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Admin authentication is required.")

    scheme, separator, token = authorization.partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid admin authorization.")

    with _SESSION_LOCK:
        expires_at = _ADMIN_SESSIONS.get(token)
        if expires_at is None or expires_at <= datetime.now(timezone.utc):
            _ADMIN_SESSIONS.pop(token, None)
            raise HTTPException(
                status_code=401,
                detail="Admin session has expired. Sign in again.",
            )
    return token


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(
        BASE_DIR / "static" / "index.html",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/users")
def get_users() -> dict[str, Any]:
    return {
        "users": [
            {
                "id": annotator["id"],
                "label": annotator["name"],
                "task_count": len(annotator.get("tasks", [])),
            }
            for annotator in _read_annotators()
        ]
    }


@app.get("/api/users/{annotator_id}/tasks")
def get_user_tasks(annotator_id: str) -> dict[str, Any]:
    annotator = _annotator_config(annotator_id)
    tasks = []
    for task in annotator.get("tasks", []):
        folder_exists, image_count = _task_image_count(task)
        tasks.append(
            {
                "id": task["id"],
                "label": task["name"],
                "folder_exists": folder_exists,
                "image_count": image_count,
                "delete_labels": _normalized_delete_labels(task.get("delete_labels", [])),
            }
        )
    return {
        "user_id": annotator["id"],
        "user_label": annotator["name"],
        "tasks": tasks,
    }


@app.post("/api/admin/login")
def admin_login(credentials: AdminLoginRequest) -> dict[str, str]:
    if not ADMIN_USERNAME or not ADMIN_PASSWORD:
        raise HTTPException(status_code=500, detail="Admin credentials are not configured.")

    valid_username = compare_digest(credentials.username, ADMIN_USERNAME)
    valid_password = compare_digest(credentials.password, ADMIN_PASSWORD)
    if not valid_username or not valid_password:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    return {
        "message": "Welcome Admin",
        "token": _new_admin_session(),
    }


@app.post("/api/admin/logout")
def admin_logout(
    token: str = Depends(_require_admin),
) -> dict[str, str]:
    with _SESSION_LOCK:
        _ADMIN_SESSIONS.pop(token, None)
    return {"message": "Signed out."}


@app.get("/api/admin/annotators")
def get_admin_annotators(
    _: str = Depends(_require_admin),
) -> dict[str, Any]:
    return {
        "annotators": [
            _admin_annotator_payload(annotator)
            for annotator in _read_annotators()
        ]
    }


@app.post("/api/admin/annotators", status_code=201)
def create_annotator(
    payload: AnnotatorCreateRequest,
    _: str = Depends(_require_admin),
) -> dict[str, Any]:
    annotators = _read_annotators()
    name = _normalized_name(payload.name, "Annotator name")
    _ensure_unique_annotator_name(annotators, name)

    timestamp = datetime.now(timezone.utc).isoformat()
    annotator = {
        "id": "ann_" + uuid4().hex[:12],
        "name": name,
        "tasks": [],
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    annotators.append(annotator)
    _write_annotators(annotators)
    return _admin_annotator_payload(annotator)


@app.patch("/api/admin/annotators/{annotator_id}")
def update_annotator(
    annotator_id: str,
    payload: AnnotatorUpdateRequest,
    _: str = Depends(_require_admin),
) -> dict[str, Any]:
    if payload.name is None:
        raise HTTPException(status_code=422, detail="No changes were provided.")

    annotators = _read_annotators()
    annotator = next((item for item in annotators if item["id"] == annotator_id), None)
    if annotator is None:
        raise HTTPException(status_code=404, detail="Annotator is not configured.")

    name = _normalized_name(payload.name, "Annotator name")
    _ensure_unique_annotator_name(annotators, name, excluded_id=annotator_id)

    annotator["name"] = name
    annotator["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_annotators(annotators)
    return _admin_annotator_payload(annotator)


@app.delete("/api/admin/annotators/{annotator_id}")
def delete_annotator(
    annotator_id: str,
    _: str = Depends(_require_admin),
) -> dict[str, str]:
    annotators = _read_annotators()
    remaining_annotators = [
        annotator
        for annotator in annotators
        if annotator["id"] != annotator_id
    ]
    if len(remaining_annotators) == len(annotators):
        raise HTTPException(status_code=404, detail="Annotator is not configured.")

    _write_annotators(remaining_annotators)
    return {"message": "Annotator removed."}


@app.post("/api/admin/annotators/{annotator_id}/tasks", status_code=201)
def create_task(
    annotator_id: str,
    payload: TaskCreateRequest,
    _: str = Depends(_require_admin),
) -> dict[str, Any]:
    annotators = _read_annotators()
    annotator = next((item for item in annotators if item["id"] == annotator_id), None)
    if annotator is None:
        raise HTTPException(status_code=404, detail="Annotator is not configured.")

    name = _normalized_name(payload.name, "Task name")
    folder_path = _normalized_folder_path(payload.folder_path)
    delete_labels = _normalized_delete_labels(payload.delete_labels)
    _ensure_unique_task(annotators, annotator_id, name, folder_path)

    timestamp = datetime.now(timezone.utc).isoformat()
    task = {
        "id": "task_" + uuid4().hex[:12],
        "name": name,
        "folder_path": str(folder_path),
        "delete_labels": delete_labels,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    annotator.setdefault("tasks", []).append(task)
    annotator["updated_at"] = timestamp
    _write_annotators(annotators)
    return _admin_task_payload(task)


@app.patch("/api/admin/annotators/{annotator_id}/tasks/{task_id}")
def update_task(
    annotator_id: str,
    task_id: str,
    payload: TaskUpdateRequest,
    _: str = Depends(_require_admin),
) -> dict[str, Any]:
    if payload.name is None and payload.folder_path is None and payload.delete_labels is None:
        raise HTTPException(status_code=422, detail="No changes were provided.")

    annotators = _read_annotators()
    annotator = next((item for item in annotators if item["id"] == annotator_id), None)
    if annotator is None:
        raise HTTPException(status_code=404, detail="Annotator is not configured.")
    task = next((item for item in annotator.get("tasks", []) if item["id"] == task_id), None)
    if task is None:
        raise HTTPException(status_code=404, detail="Task is not configured.")

    name = _normalized_name(payload.name, "Task name") if payload.name is not None else task["name"]
    folder_path = (
        _normalized_folder_path(payload.folder_path)
        if payload.folder_path is not None
        else Path(task["folder_path"])
    )
    delete_labels = (
        _normalized_delete_labels(payload.delete_labels)
        if payload.delete_labels is not None
        else _normalized_delete_labels(task.get("delete_labels", []))
    )
    _ensure_unique_task(
        annotators,
        annotator_id,
        name,
        folder_path,
        excluded_task_id=task_id,
    )

    timestamp = datetime.now(timezone.utc).isoformat()
    task["name"] = name
    task["folder_path"] = str(folder_path)
    task["delete_labels"] = delete_labels
    task["updated_at"] = timestamp
    annotator["updated_at"] = timestamp
    _write_annotators(annotators)
    return _admin_task_payload(task)


@app.delete("/api/admin/annotators/{annotator_id}/tasks/{task_id}")
def delete_task(
    annotator_id: str,
    task_id: str,
    _: str = Depends(_require_admin),
) -> dict[str, str]:
    annotators = _read_annotators()
    annotator = next((item for item in annotators if item["id"] == annotator_id), None)
    if annotator is None:
        raise HTTPException(status_code=404, detail="Annotator is not configured.")

    tasks = annotator.get("tasks", [])
    remaining_tasks = [task for task in tasks if task["id"] != task_id]
    if len(remaining_tasks) == len(tasks):
        raise HTTPException(status_code=404, detail="Task is not configured.")

    annotator["tasks"] = remaining_tasks
    annotator["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_annotators(annotators)
    return {"message": "Task removed."}


@app.get("/api/users/{annotator_id}/tasks/{task_id}/state")
def get_state(annotator_id: str, task_id: str) -> dict[str, Any]:
    return _current_state(annotator_id, task_id)


@app.get("/api/users/{annotator_id}/tasks/{task_id}/images/{image_name:path}")
def get_image(annotator_id: str, task_id: str, image_name: str) -> FileResponse:
    decoded_name = Path(unquote(image_name)).name
    image_path = _image_directory(annotator_id, task_id) / decoded_name

    if not image_path.exists() or not image_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    if image_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image type.")

    return FileResponse(image_path)


@app.post("/api/users/{annotator_id}/tasks/{task_id}/delete/{image_name:path}")
def delete_image(annotator_id: str, task_id: str, image_name: str) -> dict[str, Any]:
    _ensure_system_files(annotator_id, task_id)
    decoded_name = Path(unquote(image_name)).name
    source_path = _image_directory(annotator_id, task_id) / decoded_name

    if not source_path.exists() or not source_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    if source_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image type.")

    deleted_name = _safe_deleted_name(annotator_id, task_id, source_path.name)
    deleted_path = _deleted_directory(annotator_id, task_id) / deleted_name
    move(str(source_path), str(deleted_path))

    history = _read_undo_history(annotator_id, task_id)
    history.append(
        {
            "original_name": source_path.name,
            "deleted_name": deleted_name,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    _write_undo_history(annotator_id, task_id, history)

    state = _current_state(annotator_id, task_id)
    state["message"] = f"Moved {source_path.name} to {deleted_path.name}."
    return state


@app.post("/api/users/{annotator_id}/tasks/{task_id}/undo")
def undo_delete(annotator_id: str, task_id: str) -> dict[str, Any]:
    _ensure_system_files(annotator_id, task_id)
    history = _read_undo_history(annotator_id, task_id)
    if not history:
        raise HTTPException(status_code=400, detail="Nothing to undo.")

    last_entry = history.pop()
    deleted_path = _deleted_directory(annotator_id, task_id) / last_entry["deleted_name"]
    restored_path = _image_directory(annotator_id, task_id) / last_entry["original_name"]

    if not deleted_path.exists():
        raise HTTPException(status_code=404, detail="Deleted image file is missing.")
    if restored_path.exists():
        raise HTTPException(
            status_code=409,
            detail=f"Cannot restore because {restored_path.name} already exists.",
        )

    move(str(deleted_path), str(restored_path))
    _write_undo_history(annotator_id, task_id, history)

    state = _current_state(annotator_id, task_id)
    state["message"] = f"Restored {restored_path.name}."
    state["restored_name"] = restored_path.name
    return state
