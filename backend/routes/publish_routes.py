from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from flask import Blueprint, jsonify, request

from services.rbac import require_roles
from services.timetable_repo import TimetableRepo
from services.change_requests_store import ChangeRequestsStore


def _parse_yyyy_mm_dd(s: str) -> Optional[datetime]:
    try:
        return datetime.strptime(str(s).strip(), "%Y-%m-%d")
    except Exception:
        return None


def _monday_of(dt: datetime) -> datetime:
    # Monday = 0
    return dt - timedelta(days=dt.weekday())


def _load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_bytes_atomic(dest_path: str, content: bytes) -> None:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    tmp = dest_path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(content)
    os.replace(tmp, dest_path)


def _copy_file_atomic(src: str, dest: str) -> None:
    with open(src, "rb") as f:
        content = f.read()
    _write_bytes_atomic(dest, content)


def create_publish_blueprint(data_dir: str) -> Blueprint:
    """Admin-only actions to publish draft timetable into official timetable."""

    bp = Blueprint("publish_bp", __name__, url_prefix="/api/admin")

    official = TimetableRepo(data_dir, filename="timetable.json")
    draft = TimetableRepo(data_dir, filename="nextTimetable.json")
    requests_store = ChangeRequestsStore(data_dir)

    history_dir = Path(data_dir) / "history"
    history_dir.mkdir(parents=True, exist_ok=True)

    @bp.post("/publish")
    @require_roles("admin")
    def publish():
        """Publish (commit) the draft timetable.

        Body options:
          - week_start: "YYYY-MM-DD" (recommended)
            If absent, we use nextTimetable.json.week_start.
        """
        body = request.get_json(silent=True) or {}

        # Ensure draft exists.
        try:
            draft.ensure_exists(seed_from=official.read())
        except Exception:
            # Keep going; if JSON is invalid we will error on read.
            pass

        draft_data = draft.read()
        official_path = official.path
        draft_path = draft.path

        # Determine week_start (target week)
        ws = body.get("week_start") or draft_data.get("week_start")
        dt = _parse_yyyy_mm_dd(ws) if ws else None
        if not dt:
            return jsonify({"ok": False, "code": "BAD_REQUEST", "message": "week_start invalide (attendu YYYY-MM-DD)"}), 400
        monday = _monday_of(dt)
        yyyymmdd = monday.strftime("%Y%m%d")

        backup_path = str(history_dir / f"timetable_{yyyymmdd}.json")
        if not os.path.exists(official_path):
            # Ensure official exists (edge case)
            official.write({"version": 1, "sessions": []})

        # 1) Backup current official timetable
        _copy_file_atomic(official_path, backup_path)

        # 1-bis) Backup change requests then reset them
        try:
            req_path = requests_store.path
            # Ensure file exists (so we always have a snapshot)
            if not os.path.exists(req_path):
                requests_store.save({"requests": []})
            req_backup = str(history_dir / f"change_requests_{yyyymmdd}.json")
            _copy_file_atomic(req_path, req_backup)
            # Reset for the next negotiation cycle
            requests_store.save({"requests": []})
        except Exception:
            # Don't block publishing if housekeeping fails.
            pass

        # 2) Publish: draft -> official
        # Keep official schema minimal (do not keep draft-only metadata).
        new_official = {
            "version": int(draft_data.get("version", 1) or 1),
            "sessions": draft_data.get("sessions", []) or [],
        }
        official.write(new_official)

        # 3) Reset negotiation cycle:
        # - Mark remaining PENDING as SUPERSEDED (audit-friendly)
        # - Recreate nextTimetable.json from new official, week_start = monday + 7 days
        try:
            data = requests_store.load()
            reqs = data.get("requests", []) or []
            changed = False
            now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            for i, r in enumerate(reqs):
                if str(r.get("status")) == "PENDING":
                    rr = dict(r)
                    rr["status"] = "SUPERSEDED"
                    rr["decidedAt"] = now_iso
                    rr["decidedBy"] = "SYSTEM"
                    rr["decisionReason"] = f"Cycle published for week_start={monday.strftime('%Y-%m-%d')}"
                    reqs[i] = rr
                    changed = True
            if changed:
                data["requests"] = reqs
                requests_store.save(data)
        except Exception:
            # Don't block publishing on audit housekeeping.
            pass

        next_week = (monday + timedelta(days=7)).strftime("%Y-%m-%d")
        # Reset draft (revision++). If draft had a revision, increment it.
        new_revision = int(draft_data.get("revision", 1) or 1) + 1
        draft.write(
            {
                "week_start": next_week,
                "revision": new_revision,
                "version": new_official["version"],
                "sessions": new_official["sessions"],
            }
        )

        return jsonify(
            {
                "ok": True,
                "message": "Publication terminée",
                "backup": {"path": f"history/timetable_{yyyymmdd}.json", "week_start": monday.strftime("%Y-%m-%d")},
                "published": {"version": new_official["version"], "sessions": len(new_official["sessions"])},
                "next": {"week_start": next_week, "revision": new_revision},
            }
        )

    return bp
