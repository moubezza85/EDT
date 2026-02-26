# seances_routes.py
from pathlib import Path
import os, json, uuid, tempfile
from flask import Blueprint, jsonify, request
from services.rbac import current_user

seances_bp = Blueprint("seances_bp", __name__, url_prefix="/api/admin")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SEANCES_PATH = os.path.join(DATA_DIR, "seances.json")


# ── RBAC ────────────────────────────────────────────────────────────────────
@seances_bp.before_request
def _rbac_admin_only():
    if request.method == "OPTIONS":
        return None
    u = current_user()
    if not u or not u.get("id"):
        return jsonify({"ok": False, "code": "UNAUTHORIZED", "message": "Missing user."}), 401
    if str(u.get("role", "")).lower() != "admin":
        return jsonify({"ok": False, "code": "FORBIDDEN", "message": "Admin only"}), 403
    return None


# ── Utils ────────────────────────────────────────────────────────────────────
def _atomic_write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="tmp_", suffix=".json", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    finally:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except:
            pass


def _read_seances():
    if not os.path.exists(SEANCES_PATH):
        return []
    with open(SEANCES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Supporte format {"seances": [...]} ou directement [...]
    if isinstance(data, list):
        return data
    return data.get("seances", [])


def _save_seances(seances):
    _atomic_write_json(SEANCES_PATH, {"seances": seances})


# ── Routes CRUD ──────────────────────────────────────────────────────────────
@seances_bp.get("/seances")
def get_seances():
    """Retourne la liste complète des séances."""
    return jsonify({"seances": _read_seances()})


@seances_bp.post("/seances")
def add_seance():
    """Ajoute une nouvelle séance."""
    payload = request.get_json(silent=True) or {}
    teacher = (payload.get("teacher") or "").strip()
    group = (payload.get("group") or "").strip()
    module = (payload.get("module") or "").strip()
    mode = (payload.get("mode") or "PRESENTIEL").strip().upper()
    volume = int(payload.get("volume", 1))

    if not all([teacher, group, module]):
        return jsonify({"ok": False, "error": "teacher, group, module requis"}), 400
    if mode not in ("PRESENTIEL", "DISTANCIEL"):
        mode = "PRESENTIEL"
    if volume < 1:
        volume = 1

    seances = _read_seances()
    new_id = str(uuid.uuid4())[:8]
    seances.append({
        "id": new_id,
        "teacher": teacher,
        "group": group,
        "module": module,
        "mode": mode,
        "volume": volume,
    })
    _save_seances(seances)
    return jsonify({"ok": True, "id": new_id}), 201


@seances_bp.put("/seances/<seance_id>")
def update_seance(seance_id):
    """Met à jour le volume (ou d'autres champs) d'une séance."""
    payload = request.get_json(silent=True) or {}
    seances = _read_seances()
    found = False
    for s in seances:
        if s.get("id") == seance_id:
            if "volume" in payload:
                v = int(payload["volume"])
                s["volume"] = max(1, v)
            if "mode" in payload:
                m = str(payload["mode"]).strip().upper()
                if m in ("PRESENTIEL", "DISTANCIEL"):
                    s["mode"] = m
            if "group" in payload:
                s["group"] = str(payload["group"]).strip()
            if "module" in payload:
                s["module"] = str(payload["module"]).strip()
            found = True
            break
    if not found:
        return jsonify({"ok": False, "error": "Séance introuvable"}), 404
    _save_seances(seances)
    return jsonify({"ok": True})


@seances_bp.delete("/seances/<seance_id>")
def delete_seance(seance_id):
    """Supprime une séance par son id."""
    seances = _read_seances()
    new_list = [s for s in seances if s.get("id") != seance_id]
    if len(new_list) == len(seances):
        return jsonify({"ok": False, "error": "Séance introuvable"}), 404
    _save_seances(new_list)
    return jsonify({"ok": True})
