import json
import os
import tempfile
import threading
from datetime import date, datetime
from typing import Any, Dict, Optional, Tuple


def _atomic_write_json(path: str, data: Any) -> None:
    """Atomic JSON writer (write tmp file then os.replace)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=os.path.dirname(path),
        prefix=os.path.basename(path),
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)
    finally:
        try:
            os.remove(tmp_path)
        except FileNotFoundError:
            pass


def _monday_of(d: date) -> date:
    # Monday is 0
    return d if d.weekday() == 0 else (d.fromordinal(d.toordinal() - d.weekday()))


def _parse_yyyy_mm_dd(s: str) -> Optional[date]:
    try:
        return datetime.strptime(str(s).strip(), "%Y-%m-%d").date()
    except Exception:
        return None

class TimetableRepo:
    """Small JSON repository for timetable files.

    Default file is timetable.json (official), but we also use it for
    nextTimetable.json (draft) without introducing a DB.
    """

    def __init__(self, data_dir: str, filename: str = "timetable.json"):
        self.data_dir = data_dir
        self.filename = filename
        self.path = os.path.join(data_dir, filename)
        self._lock = threading.Lock()

    def ensure_exists(self, *, seed_from: Optional[Dict[str, Any]] = None, week_start: Optional[str] = None) -> None:
        """Create the file if it doesn't exist.

        For nextTimetable.json we typically seed from official timetable.json.
        """
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        if os.path.exists(self.path):
            return

        base = seed_from or {"version": 1, "sessions": []}
        if isinstance(base, list):
            base = {"version": 1, "sessions": base}

        # For draft files we support extra metadata (week_start, revision)
        if self.filename.lower() in {"nexttimetable.json", "draft.json"}:
            ws = _parse_yyyy_mm_dd(week_start) if week_start else None
            if ws is None:
                ws = _monday_of(date.today())
            data = {
                "week_start": ws.strftime("%Y-%m-%d"),
                "revision": 1,
                "version": int(base.get("version", 1) or 1),
                "sessions": base.get("sessions", []) or [],
            }
            _atomic_write_json(self.path, data)
            return

        _atomic_write_json(self.path, base)

    def read(self) -> Dict[str, Any]:
        if not os.path.exists(self.path):
            self.ensure_exists()
        with open(self.path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            # compat legacy: liste simple -> on enveloppe
            return {"version": 1, "sessions": data}
        if "version" not in data:
            data["version"] = 1
        if "sessions" not in data:
            data["sessions"] = []

        # normalize optional draft fields
        if self.filename.lower() in {"nexttimetable.json", "draft.json"}:
            if "week_start" not in data:
                data["week_start"] = _monday_of(date.today()).strftime("%Y-%m-%d")
            if "revision" not in data:
                data["revision"] = 1
        return data

    def write(self, data: Dict[str, Any]) -> None:
        _atomic_write_json(self.path, data)

    def atomic_update(self, fn) -> Tuple[bool, Dict[str, Any], Dict[str, Any]]:
        """
        Exécute fn(current_data) sous verrou.
        Retour:
          ok, new_data, error_payload
        """
        with self._lock:
            current = self.read()
            return fn(current)
