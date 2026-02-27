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
    """Lit seances.json et retourne la liste. Supporte {"seances": [...]} ou [...]."""
    if not os.path.exists(SEANCES_PATH):
        return []
    with open(SEANCES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    return data.get("seances", [])


def _save_seances(seances):
    _atomic_write_json(SEANCES_PATH, {"seances": seances})


def _norm(s):
    return str(s).strip() if s is not None else ""


# ── Routes CRUD ──────────────────────────────────────────────────────────────
@seances_bp.get("/seances")
def get_seances():
    """Retourne la liste complète des séances."""
    return jsonify({"seances": _read_seances()})


@seances_bp.post("/seances")
def add_seance():
    """
    Ajoute une nouvelle séance.
    Format attendu :
    {
        "formateur": "V30169",
        "groupe": "IDOSR203",
        "module": "IDOSR_EGTS204",
        "volume": 1,
        "type_salle": "Cours"
    }
    """
    payload = request.get_json(silent=True) or {}
    formateur = _norm(payload.get("formateur"))
    groupe    = _norm(payload.get("groupe"))
    module    = _norm(payload.get("module"))
    type_salle = _norm(payload.get("type_salle"))
    volume    = int(payload.get("volume", 1))

    if not all([formateur, groupe, module, type_salle]):
        return jsonify({"ok": False, "error": "formateur, groupe, module, type_salle requis"}), 400
    if volume < 1:
        volume = 1

    seances = _read_seances()

    # Génère un id style "S" + nombre incrémenté
    existing_nums = []
    for s in seances:
        sid = _norm(s.get("id", ""))
        if sid.startswith("S") and sid[1:].isdigit():
            existing_nums.append(int(sid[1:]))
    next_num = max(existing_nums, default=0) + 1
    new_id = f"S{next_num}"

    seances.append({
        "id": new_id,
        "formateur": formateur,
        "groupe": groupe,
        "module": module,
        "volume": volume,
        "type_salle": type_salle,
    })
    _save_seances(seances)
    return jsonify({"ok": True, "id": new_id}), 201


@seances_bp.put("/seances/<seance_id>")
def update_seance(seance_id):
    """Met à jour les champs d'une séance (volume, type_salle, groupe, module)."""
    payload = request.get_json(silent=True) or {}
    seances = _read_seances()
    found = False
    for s in seances:
        if _norm(s.get("id")) == _norm(seance_id):
            if "volume" in payload:
                s["volume"] = max(1, int(payload["volume"]))
            if "type_salle" in payload:
                ts = _norm(payload["type_salle"])
                if ts:
                    s["type_salle"] = ts
            if "groupe" in payload:
                grp = _norm(payload["groupe"])
                if grp:
                    s["groupe"] = grp
            if "module" in payload:
                mod = _norm(payload["module"])
                if mod:
                    s["module"] = mod
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
    new_list = [s for s in seances if _norm(s.get("id")) != _norm(seance_id)]
    if len(new_list) == len(seances):
        return jsonify({"ok": False, "error": "Séance introuvable"}), 404
    _save_seances(new_list)
    return jsonify({"ok": True})
