import time
import uuid
from flask import Flask, jsonify, request, g
from flask_cors import CORS
import json
import os
import tempfile
from typing import Any, Dict, List, Tuple

from services.timetable_service import TimetableService
from services.timetable_repo import TimetableRepo
from services.timetable_rules import validate_move, apply_move, validate_delete, apply_delete
from services.auth import find_user, ensure_password_hashes, verify_login, update_last_login, change_password
from services.jwt_auth import decode_jwt, make_access_token
from services.rbac import require_roles, require_authenticated

app = Flask(__name__)
CORS(app)  # OK pour dev React (Vite)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
service = TimetableService(DATA_DIR)
repo = TimetableRepo(DATA_DIR)

# Ensure all users have a hashed password (defaults to 123456 when empty).
try:
    ensure_password_hashes(DATA_DIR)
except Exception:
    pass

# Draft (next official timetable) used during negotiation.
draft_repo = TimetableRepo(DATA_DIR, filename="nextTimetable.json")
# Ensure the draft exists, seeded from the current official timetable.
try:
    draft_repo.ensure_exists(seed_from=repo.read())
except Exception:
    # Do not crash startup if a JSON is temporarily invalid; routes will surface errors.
    pass

# Ensure users.json contains hashed passwords (fills empty password with default hash).
try:
    ensure_password_hashes(DATA_DIR)
except Exception:
    pass


# ----------------------------
# Auth/RBAC (simple)
# ----------------------------
@app.before_request
def _load_current_user():
    """Populate g.user from JWT.

    By default, all API endpoints (except /api/auth/login) require a valid
    Bearer token. This prevents direct, unauthenticated access to Flask routes.

    Dev-only fallback:
      - If ALLOW_HEADER_AUTH=1, X-User-Id can still be used.
    """
    if request.method == "OPTIONS":
        return None

    # Public endpoint
    if request.path.rstrip("/") in {"/api/auth/login"}:
        g.user = {}
        return None

    authz = request.headers.get("Authorization") or ""
    token = ""
    if authz.lower().startswith("bearer "):
        token = authz.split(" ", 1)[1].strip()

    if token:
        ok, payload, _err = decode_jwt(token)
        if ok and payload:
            uid = str(payload.get("sub") or "").strip()
            u = find_user(DATA_DIR, uid) if uid else None
            if u:
                # Trust role/name from users.json (server-side source of truth)
                g.user = u
                return None

    # Optional legacy header auth (dev / transition)
    allow_header = (os.environ.get("ALLOW_HEADER_AUTH") or "").strip() == "1"
    if allow_header:
        user_id = request.headers.get("X-User-Id") or request.headers.get("x-user-id")
        if user_id:
            u = find_user(DATA_DIR, str(user_id).strip())
            g.user = u or {}
            return None

    g.user = {}
    return None


@app.get("/api/auth/me")
@require_authenticated
def auth_me():
    u = g.user or {}
    # never expose passwords (we don't store any)
    return jsonify({"ok": True, "user": {"id": u.get("id"), "name": u.get("name"), "role": u.get("role"), "modules": u.get("modules", [])}})


@app.post("/api/auth/login")
def auth_login():
    """Login and get a JWT.

    Rules:
      - user must exist in users.json
      - login by id + password (hashed password stored in users.json)
    """
    body = request.get_json(silent=True) or {}
    username = str(body.get("username") or body.get("login") or body.get("id") or "").strip()
    password = str(body.get("password") or "").strip()

    if not username or not password:
        return jsonify({"ok": False, "code": "BAD_REQUEST", "message": "username/password requis"}), 400

    u = verify_login(DATA_DIR, username, password)
    if not u:
        return jsonify({"ok": False, "code": "UNAUTHORIZED", "message": "Utilisateur introuvable"}), 401

    # Update lastLogin on successful auth
    try:
        update_last_login(DATA_DIR, u.get("id"))
    except Exception:
        pass

    token = make_access_token(u)
    return jsonify({"ok": True, "token": token, "user": {"id": u.get("id"), "name": u.get("name"), "role": u.get("role"), "modules": u.get("modules", [])}})


@app.post("/api/auth/change-password")
@require_authenticated
def auth_change_password():
    body = request.get_json(silent=True) or {}
    old_pw = str(body.get("oldPassword") or body.get("old_password") or "").strip()
    new_pw = str(body.get("newPassword") or body.get("new_password") or "").strip()
    confirm = str(body.get("confirmPassword") or body.get("confirm_password") or "").strip()

    if not old_pw or not new_pw or not confirm:
        return jsonify({"ok": False, "code": "BAD_REQUEST", "message": "Champs requis"}), 400
    if new_pw != confirm:
        return jsonify({"ok": False, "code": "BAD_REQUEST", "message": "Confirmation différente"}), 400

    uid = str((g.user or {}).get("id") or "").strip()
    ok, msg = change_password(DATA_DIR, uid, old_pw, new_pw)
    if not ok:
        return jsonify({"ok": False, "code": "UNAUTHORIZED", "message": msg}), 401

    return jsonify({"ok": True})

# Optionnel: idempotence basique en mémoire
_seen_commands = set()

# ----------------------------
# Helpers JSON (lecture/écriture)
# ----------------------------
def _path(filename: str) -> str:
    return os.path.join(DATA_DIR, filename)


def load_json(filename: str):
    path = _path(filename)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json_atomic(filename: str, data: Any):
    """Écriture atomique (évite les fichiers corrompus)."""
    os.makedirs(DATA_DIR, exist_ok=True)
    final_path = _path(filename)

    fd, tmp_path = tempfile.mkstemp(dir=DATA_DIR, prefix=filename, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, final_path)
    finally:
        try:
            os.remove(tmp_path)
        except FileNotFoundError:
            pass


def bad_request(message: str, code: str = "BAD_REQUEST"):
    return jsonify({"ok": False, "code": code, "message": message}), 400


def conflict(message: str, code: str = "CONSTRAINT_CONFLICT"):
    return jsonify({"ok": False, "code": code, "message": message}), 409


def _is_list_of_str(x) -> bool:
    return isinstance(x, list) and all(isinstance(i, str) for i in x)


def _is_list_of_int(x) -> bool:
    return isinstance(x, list) and all(isinstance(i, int) for i in x)


def normalize_sessions(sessions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized = []
    for s in sessions:
        normalized.append({
            "id": s.get("id") or s.get("sessionId"),
            "formateur": s.get("formateur"),
            "groupe": s.get("groupe"),
            "module": s.get("module"),
            "jour": s.get("jour"),
            "creneau": s.get("creneau"),
            "salle": s.get("salle"),
        })
    return normalized


# ----------------------------
# API existantes
# ----------------------------
@app.route("/api/timetable", methods=["GET"])
@require_roles("admin", "surveillant", "formateur")
def get_timetable():
    data = load_json("timetable.json")

    if isinstance(data, dict):
        sessions = data.get("sessions", [])
        version = int(data.get("version", 1))
    else:
        sessions = data
        version = 1

    return jsonify({"version": version, "sessions": normalize_sessions(sessions)})


@app.get("/api/next-timetable")
@require_roles("admin", "formateur")
def get_next_timetable():
    """Draft timetable (next official). Read-only for formateurs."""
    data = draft_repo.read()
    sessions = data.get("sessions", []) or []
    return jsonify(
        {
            "week_start": data.get("week_start"),
            "revision": int(data.get("revision", 1) or 1),
            "version": int(data.get("version", 1) or 1),
            "sessions": normalize_sessions(sessions),
        }
    )


@app.route("/api/timetable/move", methods=["POST"])
@require_roles("admin")
def move_session():
    payload = request.get_json(force=True) or {}

    session_id = payload.get("sessionId")
    to_jour = payload.get("toJour")
    to_creneau = payload.get("toCreneau")
    to_salle = payload.get("toSalle")

    if not session_id or not to_jour or to_creneau is None or not to_salle:
        return bad_request("Paramètres manquants")

    ok, msg, sessions = service.move(session_id, to_jour, int(to_creneau), to_salle)
    if not ok:
        return jsonify({"ok": False, "error": msg}), 409

    return jsonify({"ok": True, "sessions": normalize_sessions(sessions)})


@app.route("/api/config", methods=["GET"])
@require_authenticated
def get_config():
    return jsonify(load_json("config.json"))


@app.route("/api/catalog", methods=["GET"])
@require_authenticated
def get_catalog():
    return jsonify(load_json("catalog.json"))


@app.route("/api/seances", methods=["GET"])
@require_roles("admin")
def get_seances():
    return jsonify({"seances": load_json("seances.json")})


@app.route("/api/timetable/commands", methods=["POST"])
@require_roles("admin")
def timetable_commands():
    # scope=official|draft
    scope = (request.args.get("scope") or "official").strip().lower()
    if scope not in {"official", "draft"}:
        return bad_request("scope invalide (official|draft)")

    target_repo = draft_repo if scope == "draft" else repo

    body = request.get_json(force=True) or {}
    command_id = body.get("commandId")
    expected_version = body.get("expectedVersion")
    cmd_type = body.get("type")
    payload = body.get("payload") or {}

    if not command_id or expected_version is None or not cmd_type:
        return bad_request("Paramètres manquants")

    seen_key = f"{scope}:{command_id}"
    if seen_key in _seen_commands:
        data = target_repo.read()
        return jsonify({"ok": True, "version": data["version"], "sessions": data["sessions"], "warnings": []})

    def do_update(current):
        if int(current["version"]) != int(expected_version):
            return (False, current, {
                "ok": False,
                "code": "VERSION_MISMATCH",
                "message": "L'emploi du temps a changé. Rechargez.",
                "serverVersion": current["version"]
            })

        sessions = current["sessions"]

        if cmd_type == "MOVE_SESSION":
            session_id = payload.get("sessionId")
            to_jour = payload.get("toJour")
            to_creneau = payload.get("toCreneau")
            to_salle = payload.get("toSalle")

            if not session_id or not to_jour or to_creneau is None or not to_salle:
                return (False, current, {"ok": False, "code": "BAD_REQUEST", "message": "Payload incomplet"})

            err = validate_move(sessions, session_id, to_jour, int(to_creneau), to_salle)
            if err:
                err["ok"] = False
                err["version"] = current["version"]
                return (False, current, err)

            new_sessions = apply_move(sessions, session_id, to_jour, int(to_creneau), to_salle)
            new_data = {"version": int(current["version"]) + 1, "sessions": new_sessions}
            target_repo.write(new_data)
            return (True, new_data, {})

        if cmd_type == "DELETE_SESSION":
            session_id = payload.get("sessionId")
            if not session_id:
                return (False, current, {"ok": False, "code": "BAD_REQUEST", "message": "Payload incomplet"})

            err = validate_delete(sessions, session_id)
            if err:
                err["ok"] = False
                err["version"] = current["version"]
                return (False, current, err)

            new_sessions = apply_delete(sessions, session_id)
            new_data = {"version": int(current["version"]) + 1, "sessions": new_sessions}
            target_repo.write(new_data)
            return (True, new_data, {})

        return (False, current, {"ok": False, "code": "UNKNOWN_COMMAND", "message": "Type de commande inconnu"})

    ok, data_or_current, err_payload = target_repo.atomic_update(do_update)

    if not ok:
        return jsonify(err_payload), 409

    _seen_commands.add(seen_key)
    return jsonify({
        "ok": True,
        "version": data_or_current["version"],
        "sessions": data_or_current["sessions"],
        "warnings": []
    })


@app.route("/api/rooms/available", methods=["GET"])
@require_roles("admin", "formateur", "surveillant")
def rooms_available():
    jour = request.args.get("jour")
    creneau = request.args.get("creneau", type=int)
    scope = (request.args.get("scope") or "official").strip().lower()

    if not jour or creneau is None:
        return bad_request("jour/creneau requis")

    # RBAC: scope=draft est réservé à l'admin
    if scope not in {"official", "draft"}:
        return bad_request("scope invalide (official|draft)")

    if scope == "draft":
        from services.rbac import current_user
        role = str((current_user() or {}).get("role", "")).strip().lower()
        if role != "admin":
            return jsonify({"ok": False, "code": "FORBIDDEN", "message": "scope=draft réservé à l'admin"}), 403

    cfg = load_json("config.json")

    # salles depuis config
    salles_cfg = cfg.get("salles", [])  # [{id,type}] ou ancien ["S1","S2"]

    filename = "nextTimetable.json" if scope == "draft" else "timetable.json"
    data = load_json(filename)
    sessions = data.get("sessions", []) if isinstance(data, dict) else data

    # 1) salles occupées sur (jour, creneau)
    occupied = set()
    for s in sessions:
        # Draft/virtuel: une séance marquée MOVED_AWAY ne bloque plus l'ancien créneau
        if str(s.get("_virtualState", "")).strip() == "MOVED_AWAY":
            continue
        if (
            str(s.get("jour", "")).strip().lower() == str(jour).strip().lower()
            and int(s.get("creneau", 0) or 0) == int(creneau)
        ):
            salle = str(s.get("salle", "")).strip()
            if salle:
                occupied.add(salle)

    # 2) extraire UNIQUEMENT les salles physiques (≠ VIRTUEL)
    salle_ids = []
    for r in salles_cfg:
        if isinstance(r, dict):
            rid = str(r.get("id", "")).strip()
            rtype = str(r.get("type", "")).strip().upper()
            if not rid:
                continue
            # 🔴 on ignore explicitement les salles virtuelles
            if rtype == "VIRTUELLE":
                continue
            salle_ids.append(rid)
        else:
            # ancien format string → considéré comme salle physique
            rid = str(r).strip()
            if rid:
                salle_ids.append(rid)

    # dédoublonnage stable
    seen = set()
    salle_ids = [x for x in salle_ids if not (x in seen or seen.add(x))]

    # 3) salles libres = physiques - occupées
    available = [rid for rid in salle_ids if rid not in occupied]

    return jsonify({
        "ok": True,
        "availableRooms": available,
        "occupiedRooms": sorted(list(occupied))
    })


@app.route("/api/teachers", methods=["GET"])
@require_authenticated
def get_teachers():
    catalog = load_json("catalog.json")
    teachers = catalog.get("teachers", []) or []
    # sécurité minimale : garantir id/name
    out = []
    for t in teachers:
        tid = str(t.get("id", "")).strip()
        name = str(t.get("name", "")).strip()
        if tid:
            out.append({"id": tid, "name": name})
    return jsonify({"ok": True, "teachers": out})



@app.route("/api/timetable/sessions", methods=["POST"])
@require_roles("admin")
def add_session():
    scope = (request.args.get("scope") or "official").strip().lower()
    if scope not in {"official", "draft"}:
        return bad_request("scope invalide (official|draft)")

    payload = request.get_json(force=True) or {}

    required = ["formateur", "groupe", "module", "jour", "creneau", "salle"]
    missing = [k for k in required if payload.get(k) in [None, ""]]
    if missing:
        return bad_request(f"Champs manquants: {', '.join(missing)}")

    formateur = str(payload["formateur"]).strip()
    groupe = str(payload["groupe"]).strip()
    module = str(payload["module"]).strip()
    jour = str(payload["jour"]).strip().lower()
    creneau = int(payload["creneau"])
    salle = str(payload["salle"]).strip()

    # IMPORTANT: scope=official => timetable.json ; scope=draft => nextTimetable.json
    target_repo = draft_repo if scope == "draft" else repo
    target_repo.ensure_exists(seed_from=repo.read())

    data = target_repo.read()
    sessions = data.get("sessions", []) if isinstance(data, dict) else data
    version = int(data.get("version", 1)) if isinstance(data, dict) else 1

    for s in sessions:
        sj = str(s.get("jour", "")).strip().lower()
        sc = int(s.get("creneau", 0) or 0)
        if sj == jour and sc == creneau:
            if str(s.get("salle", "")).strip() == salle:
                return conflict("Conflit: salle déjà occupée sur ce créneau")
            if str(s.get("formateur", "")).strip() == formateur:
                return conflict("Conflit: formateur déjà occupé sur ce créneau")
            if str(s.get("groupe", "")).strip() == groupe:
                return conflict("Conflit: groupe déjà occupé sur ce créneau")

    new_id = f"SES_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    new_session = {
        "id": new_id,
        "formateur": formateur,
        "groupe": groupe,
        "module": module,
        "jour": jour,
        "creneau": creneau,
        "salle": salle,
    }

    sessions.append(new_session)
    # preserve draft metadata if any
    out = dict(data)
    out["version"] = version + 1
    out["sessions"] = sessions
    target_repo.write(out)

    return jsonify({"ok": True, "version": out["version"], "session": new_session})


# # ----------------------------
# # NOUVEAU : Admin JSON (GET/PUT)
# # ----------------------------
# def _validate_config(cfg: Dict[str, Any]) -> Tuple[bool, str]:
#     if not isinstance(cfg, dict):
#         return False, "config doit être un objet JSON."
#     if "jours" in cfg and not _is_list_of_str(cfg["jours"]):
#         return False, "config.jours doit être une liste de chaînes."
#     if "creneaux" in cfg and not _is_list_of_int(cfg["creneaux"]):
#         return False, "config.creneaux doit être une liste d'entiers."
#     if "salles" in cfg and not _is_list_of_str(cfg["salles"]):
#         return False, "config.salles doit être une liste de chaînes."
#     return True, ""


# def _validate_catalog(cat: Dict[str, Any]) -> Tuple[bool, str]:
#     if not isinstance(cat, dict):
#         return False, "catalog doit être un objet JSON."
#     # validation minimale (MVP)
#     for key in ["trainers", "groups", "modules", "assignments"]:
#         if key in cat and not isinstance(cat[key], list):
#             return False, f"catalog.{key} doit être une liste."
#     return True, ""


# def _validate_indispo(ind: Any) -> Tuple[bool, str]:
#     # Souvent un dict: { "14017": { "lundi":[1,2], ... } }
#     if not isinstance(ind, dict):
#         return False, "indispo doit être un objet JSON (dictionnaire)."
#     return True, ""


# def _validate_constraints(cst: Any) -> Tuple[bool, str]:
#     if not isinstance(cst, dict):
#         return False, "constraints doit être un objet JSON (dictionnaire)."
#     return True, ""


# @app.route("/api/admin/config", methods=["GET", "PUT"])
# def admin_config():
#     if request.method == "GET":
#         return jsonify(load_json("config.json"))

#     payload = request.get_json(force=True)
#     ok, msg = _validate_config(payload)
#     if not ok:
#         return bad_request(msg, code="VALIDATION_ERROR")

#     save_json_atomic("config.json", payload)
#     return jsonify({"ok": True})


# @app.route("/api/admin/catalog", methods=["GET", "PUT"])
# def admin_catalog():
#     if request.method == "GET":
#         return jsonify(load_json("catalog.json"))

#     payload = request.get_json(force=True)
#     ok, msg = _validate_catalog(payload)
#     if not ok:
#         return bad_request(msg, code="VALIDATION_ERROR")

#     save_json_atomic("catalog.json", payload)
#     return jsonify({"ok": True})


# @app.route("/api/admin/indispo", methods=["GET", "PUT"])
# def admin_indispo():
#     if request.method == "GET":
#         return jsonify(load_json("indispo.json"))

#     payload = request.get_json(force=True)
#     ok, msg = _validate_indispo(payload)
#     if not ok:
#         return bad_request(msg, code="VALIDATION_ERROR")

#     save_json_atomic("indispo.json", payload)
#     return jsonify({"ok": True})


# @app.route("/api/admin/constraints", methods=["GET", "PUT"])
# def admin_constraints():
#     if request.method == "GET":
#         return jsonify(load_json("constraints.json"))

#     payload = request.get_json(force=True)
#     ok, msg = _validate_constraints(payload)
#     if not ok:
#         return bad_request(msg, code="VALIDATION_ERROR")

#     save_json_atomic("constraints.json", payload)
#     return jsonify({"ok": True})



# ----------------------------
# ADMIN JSON CRUD (RBAC)
# ----------------------------

@app.route("/api/admin/config", methods=["GET", "PUT"])
@require_roles("admin")
def admin_config():
    if request.method == "GET":
        return jsonify(load_json("config.json"))

    payload = request.get_json(force=True)
    ok, msg = _validate_config(payload)
    if not ok:
        return bad_request(msg, code="VALIDATION_ERROR")

    save_json_atomic("config.json", payload)
    return jsonify({"ok": True})


@app.route("/api/admin/catalog", methods=["GET", "PUT"])
@require_roles("admin")
def admin_catalog():
    if request.method == "GET":
        return jsonify(load_json("catalog.json"))

    payload = request.get_json(force=True)
    ok, msg = _validate_catalog(payload)
    if not ok:
        return bad_request(msg, code="VALIDATION_ERROR")

    save_json_atomic("catalog.json", payload)
    return jsonify({"ok": True})


@app.route("/api/admin/indispo", methods=["GET", "PUT"])
@require_roles("admin")
def admin_indispo():
    if request.method == "GET":
        return jsonify(load_json("indispo.json"))

    payload = request.get_json(force=True)
    ok, msg = _validate_indispo(payload)
    if not ok:
        return bad_request(msg, code="VALIDATION_ERROR")

    save_json_atomic("indispo.json", payload)
    return jsonify({"ok": True})


@app.route("/api/admin/constraints", methods=["GET", "PUT"])
@require_roles("admin")
def admin_constraints():
    if request.method == "GET":
        return jsonify(load_json("constraints.json"))

    payload = request.get_json(force=True)
    ok, msg = _validate_constraints(payload)
    if not ok:
        return bad_request(msg, code="VALIDATION_ERROR")

    save_json_atomic("constraints.json", payload)
    return jsonify({"ok": True})


# ----------------------------
# NOUVEAU : Génération (MVP) /api/generate/run
# ----------------------------
def _conflict_in_slot(slot_sessions: List[Dict[str, Any]], s: Dict[str, Any]) -> bool:
    # conflit salle / formateur / groupe sur le même slot
    for x in slot_sessions:
        if x.get("salle") == s.get("salle"):
            return True
        if x.get("formateur") == s.get("formateur"):
            return True
        if x.get("groupe") == s.get("groupe"):
            return True
    return False


def _generate_mvp_sessions() -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Générateur MVP:
    - lit seances.json: seances:[{id,formateur,groupe,module,volume}]
    - place les séances séquentiellement dans (jours×créneaux×salles)
    - évite conflits (salle/formateur/groupe) sur un même slot.
    """
    warnings: List[str] = []

    cfg = load_json("config.json")
    jours = cfg.get("jours", ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"])
    creneaux = cfg.get("creneaux", [1, 2, 3, 4])
    salles = cfg.get("salles", [])

    if not jours or not creneaux or not salles:
        raise ValueError("config.json doit contenir jours/creneaux/salles non vides.")

    seances_data = load_json("seances.json")
    seances = seances_data.get("seances", seances_data) if isinstance(seances_data, dict) else seances_data
    if not isinstance(seances, list) or len(seances) == 0:
        raise ValueError("seances.json est vide ou invalide (attendu: {seances:[...]}).")

    # Construire une liste de "sessions à placer" en fonction du volume
    tasks: List[Dict[str, Any]] = []
    for item in seances:
        # volume = nombre de séances (créneaux) à planifier
        vol = int(item.get("volume", 1) or 1)
        for i in range(vol):
            tasks.append({
                "id": item.get("id") or f"TASK_{uuid.uuid4().hex[:8]}_{i}",
                "formateur": item.get("formateur"),
                "groupe": item.get("groupe"),
                "module": item.get("module"),
            })

    # Index des sessions par slot (jour,creneau) pour check conflits
    by_slot: Dict[Tuple[str, int], List[Dict[str, Any]]] = {}
    for j in jours:
        for c in creneaux:
            by_slot[(j, int(c))] = []

    out_sessions: List[Dict[str, Any]] = []

    # Parcours des slots, essai de placer les tasks
    slot_list = [(j, int(c)) for j in jours for c in creneaux]
    slot_idx = 0

    for t in tasks:
        placed = False

        # On tente chaque slot à partir du slot_idx pour répartir
        tries = 0
        while tries < len(slot_list) and not placed:
            jour, creneau = slot_list[(slot_idx + tries) % len(slot_list)]
            slot_sessions = by_slot[(jour, creneau)]

            # essaye toutes les salles
            for salle in salles:
                candidate = {
                    "id": f"SES_GEN_{int(time.time())}_{uuid.uuid4().hex[:6]}",
                    "formateur": t.get("formateur"),
                    "groupe": t.get("groupe"),
                    "module": t.get("module"),
                    "jour": str(jour).lower(),
                    "creneau": int(creneau),
                    "salle": salle,
                }
                if not _conflict_in_slot(slot_sessions, candidate):
                    slot_sessions.append(candidate)
                    out_sessions.append(candidate)
                    placed = True
                    break

            tries += 1

        if not placed:
            warnings.append(f"Impossible de placer: {t.get('module')} ({t.get('groupe')}/{t.get('formateur')}).")

        slot_idx = (slot_idx + 1) % len(slot_list)

    return out_sessions, warnings


@app.route("/api/generate/run", methods=["POST"])
@require_roles("admin")
def generate_run():
    body = request.get_json(force=True) or {}

    # options MVP (compatibles avec votre page)
    strategy = str(body.get("strategy", "cp_sat"))
    max_seconds = int(body.get("maxSeconds", 10) or 10)
    seed = int(body.get("seed", 0) or 0)
    apply = bool(body.get("apply", True))

    # Pour l’instant: MVP generator (vous remplacerez selon strategy)
    # seed/max_seconds sont acceptés pour compatibilité mais non utilisés dans ce MVP.
    _ = (strategy, max_seconds, seed)

    try:
        sessions, warnings = _generate_mvp_sessions()
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 400

    if apply:
        # On applique via repo: version increment + write atomique
        def do_update(current):
            new_data = {"version": int(current["version"]) + 1, "sessions": sessions}
            repo.write(new_data)
            return (True, new_data, {})

        ok, data_or_current, err_payload = repo.atomic_update(do_update)
        if not ok:
            return jsonify(err_payload), 409

        return jsonify({
            "ok": True,
            "message": "Génération terminée et appliquée (timetable.json mis à jour).",
            "warnings": warnings,
            "version": data_or_current["version"],
            "sessions": data_or_current["sessions"],
        })

    # apply = False: on renvoie seulement le résultat
    return jsonify({
        "ok": True,
        "message": "Génération terminée (non appliquée).",
        "warnings": warnings,
        "sessions": sessions,
    })
    

from routes.reports_routes import reports_bp
app.register_blueprint(reports_bp)


from routes.admin_routes import admin_bp
app.register_blueprint(admin_bp)

from routes.requests_routes import create_requests_blueprint

requests_bp = create_requests_blueprint(DATA_DIR)
app.register_blueprint(requests_bp)


from routes.publish_routes import create_publish_blueprint

publish_bp = create_publish_blueprint(DATA_DIR)
app.register_blueprint(publish_bp)



print(app.url_map)
if __name__ == "__main__":
    app.run(debug=True)
