from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
from shutil import move
from typing import Any
from urllib.parse import unquote

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


BASE_DIR = Path(__file__).resolve().parent
IMAGE_ROOT = Path(
    os.environ.get(
        "IMAGE_REVIEW_DATA_DIR",
        "/mnt/vmstorage/ShelfAnalytics /HelperApps/FrameAudit/data/unknown-products",
    )
)

USER_IMAGE_DIRECTORIES = {
    "user1": {
        "label": "Rouf",
        "path": IMAGE_ROOT / "folder_1",
    },
    "user2": {
        "label": "Sabina",
        "path": IMAGE_ROOT / "folder_2",
    },
    "user3": {
        "label": "Sabia",
        "path": IMAGE_ROOT / "folder_3",
    },
    "user4": {
        "label": "Tanisha",
        "path": IMAGE_ROOT / "folder_4",
    },
}

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
DELETED_DIRECTORY_NAME = "deleted"
YAML_FILE_NAME = "images.yaml"
UNDO_LOG_FILE_NAME = ".undo_log.yaml"


app = FastAPI(title="FrameAudit")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


def _user_config(user_id: str) -> dict[str, Any]:
    user_config = USER_IMAGE_DIRECTORIES.get(user_id)
    if user_config is None:
        raise HTTPException(status_code=404, detail="User folder is not configured.")
    return user_config


def _image_directory(user_id: str) -> Path:
    return _user_config(user_id)["path"]


def _validate_image_directory(user_id: str) -> None:
    image_directory = _image_directory(user_id)
    if not image_directory.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"Configured image directory does not exist: {image_directory}. "
                "Set IMAGE_REVIEW_DATA_DIR or edit USER_IMAGE_DIRECTORIES in main.py before using this user."
            ),
        )
    if not image_directory.is_dir():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Configured image directory is not a folder: {image_directory}. "
                "Set IMAGE_REVIEW_DATA_DIR or edit USER_IMAGE_DIRECTORIES in main.py before using this user."
            ),
        )


def _deleted_directory(user_id: str) -> Path:
    return _image_directory(user_id) / DELETED_DIRECTORY_NAME


def _yaml_file_path(user_id: str) -> Path:
    return _image_directory(user_id) / YAML_FILE_NAME


def _undo_log_path(user_id: str) -> Path:
    return _image_directory(user_id) / UNDO_LOG_FILE_NAME


def _list_images(user_id: str) -> list[Path]:
    _validate_image_directory(user_id)
    image_directory = _image_directory(user_id)
    return sorted(
        [
            path
            for path in image_directory.iterdir()
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ],
        key=lambda path: path.name.lower(),
    )


def _read_yaml_index(user_id: str) -> dict[str, Any]:
    yaml_path = _yaml_file_path(user_id)
    if not yaml_path.exists():
        return {}

    with yaml_path.open("r", encoding="utf-8") as yaml_file:
        data = yaml.safe_load(yaml_file) or {}

    return data if isinstance(data, dict) else {}


def _sync_yaml_index(user_id: str) -> dict[str, Any]:
    current_images = _list_images(user_id)
    current_names = {image_path.name for image_path in current_images}
    existing_payload = _read_yaml_index(user_id)
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
        "image_directory": str(_image_directory(user_id)),
        "total_images": len(current_images),
        "total_tracked_images": len(tracked_entries),
        "images": tracked_entries,
    }

    with _yaml_file_path(user_id).open("w", encoding="utf-8") as yaml_file:
        yaml.safe_dump(payload, yaml_file, sort_keys=False, allow_unicode=False)

    return payload


def _ensure_system_files(user_id: str) -> None:
    _validate_image_directory(user_id)
    _deleted_directory(user_id).mkdir(exist_ok=True)
    if not _undo_log_path(user_id).exists():
        with _undo_log_path(user_id).open("w", encoding="utf-8") as log_file:
            yaml.safe_dump({"history": []}, log_file, sort_keys=False)
    _sync_yaml_index(user_id)


def _read_undo_history(user_id: str) -> list[dict[str, Any]]:
    log_path = _undo_log_path(user_id)
    if not log_path.exists():
        return []
    with log_path.open("r", encoding="utf-8") as log_file:
        data = yaml.safe_load(log_file) or {}
    history = data.get("history", [])
    if not isinstance(history, list):
        return []
    return history


def _write_undo_history(user_id: str, history: list[dict[str, Any]]) -> None:
    with _undo_log_path(user_id).open("w", encoding="utf-8") as log_file:
        yaml.safe_dump({"history": history}, log_file, sort_keys=False, allow_unicode=False)


def _current_state(user_id: str) -> dict[str, Any]:
    _ensure_system_files(user_id)
    index_payload = _sync_yaml_index(user_id)
    image_entries = [
        {"number": entry["number"], "name": entry["name"]}
        for entry in index_payload["images"]
        if entry["present"]
    ]
    history = _read_undo_history(user_id)
    user_config = _user_config(user_id)
    return {
        "user_id": user_id,
        "user_label": user_config["label"],
        "images": image_entries,
        "total_images": len(image_entries),
        "total_tracked_images": index_payload["total_tracked_images"],
        "can_undo": bool(history),
        "last_deleted_name": history[-1]["original_name"] if history else None,
    }


def _safe_deleted_name(user_id: str, original_name: str) -> str:
    target = _deleted_directory(user_id) / original_name
    if not target.exists():
        return original_name

    stem = Path(original_name).stem
    suffix = Path(original_name).suffix
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"{stem}_{timestamp}{suffix}"


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/api/users")
def get_users() -> dict[str, Any]:
    return {
        "users": [
            {"id": user_id, "label": user_config["label"]}
            for user_id, user_config in USER_IMAGE_DIRECTORIES.items()
        ]
    }


@app.get("/api/users/{user_id}/state")
def get_state(user_id: str) -> dict[str, Any]:
    return _current_state(user_id)


@app.get("/api/users/{user_id}/images/{image_name:path}")
def get_image(user_id: str, image_name: str) -> FileResponse:
    decoded_name = Path(unquote(image_name)).name
    image_path = _image_directory(user_id) / decoded_name

    if not image_path.exists() or not image_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    if image_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image type.")

    return FileResponse(image_path)


@app.post("/api/users/{user_id}/delete/{image_name:path}")
def delete_image(user_id: str, image_name: str) -> dict[str, Any]:
    _ensure_system_files(user_id)
    decoded_name = Path(unquote(image_name)).name
    source_path = _image_directory(user_id) / decoded_name

    if not source_path.exists() or not source_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    if source_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported image type.")

    deleted_name = _safe_deleted_name(user_id, source_path.name)
    deleted_path = _deleted_directory(user_id) / deleted_name
    move(str(source_path), str(deleted_path))

    history = _read_undo_history(user_id)
    history.append(
        {
            "original_name": source_path.name,
            "deleted_name": deleted_name,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    _write_undo_history(user_id, history)

    state = _current_state(user_id)
    state["message"] = f"Moved {source_path.name} to {deleted_path.name}."
    return state


@app.post("/api/users/{user_id}/undo")
def undo_delete(user_id: str) -> dict[str, Any]:
    _ensure_system_files(user_id)
    history = _read_undo_history(user_id)
    if not history:
        raise HTTPException(status_code=400, detail="Nothing to undo.")

    last_entry = history.pop()
    deleted_path = _deleted_directory(user_id) / last_entry["deleted_name"]
    restored_path = _image_directory(user_id) / last_entry["original_name"]

    if not deleted_path.exists():
        raise HTTPException(status_code=404, detail="Deleted image file is missing.")
    if restored_path.exists():
        raise HTTPException(
            status_code=409,
            detail=f"Cannot restore because {restored_path.name} already exists.",
        )

    move(str(deleted_path), str(restored_path))
    _write_undo_history(user_id, history)

    state = _current_state(user_id)
    state["message"] = f"Restored {restored_path.name}."
    state["restored_name"] = restored_path.name
    return state
