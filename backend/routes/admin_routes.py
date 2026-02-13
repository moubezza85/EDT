# admin_routes.py
from pathlib import Path
import os, json, tempfile
from flask import Blueprint, jsonify, request

from services.rbac import current_user

admin_bp = Blueprint("admin_bp", __name__, url_prefix="/api/admin")


@admin_bp.before_request
def _rbac_admin_only():
    # Allow CORS preflight requests through (browser sends OPTIONS before GET/PUT)
    if request.method == "OPTIONS":
        return None
    u = current_user()
    if not u or not u.get("id"):
        return jsonify({"ok": False, "code": "UNAUTHORIZED", "message": "Missing user. Send X-User-Id header."}), 401
    if str(u.get("role", "")).lower() != "admin":
        return jsonify({"ok": False, "code": "FORBIDDEN", "message": "Admin only"}), 403
    return None

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CATALOG_PATH = os.path.join(DATA_DIR, "catalog.json")
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
CONSTRAINTS_PATH = os.path.join(DATA_DIR, "constraints.json")
INDISPO_PATH = os.path.join(DATA_DIR, "indispo.json")

# -------------------- UTILS --------------------
def _ensure_defaults():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(CATALOG_PATH):
        _atomic_write_json(CATALOG_PATH, {"teachers": [], "groups": [], "modules": [], "assignments": []})
    if not os.path.exists(CONFIG_PATH):
        _atomic_write_json(CONFIG_PATH, {
            "nomEtablissement": "",
            "jours": ["lundi","mardi","mercredi","jeudi","vendredi","samedi"],
            "creneaux": [1,2,3,4],
            "typeSalle": [],
            "salles": [],
            "maxSessionsPerDayTeacher": 3,
            "maxSessionsPerDayGroup": 3
        })
    if not os.path.exists(CONSTRAINTS_PATH):
        _atomic_write_json(CONSTRAINTS_PATH, {"soft": {}})
    if not os.path.exists(INDISPO_PATH):
        _atomic_write_json(INDISPO_PATH, {"teachers": {}, "groups": {}, "rooms": {}})

def _read_json(path):
    _ensure_defaults()
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _atomic_write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="tmp_", suffix=".json", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    finally:
        try:
            if os.path.exists(tmp): os.remove(tmp)
        except: pass

def _norm_id(s):
    return s.strip() if isinstance(s, str) else ""

def _scope_key(scope: str):
    mapping = {"teachers": "teachers", "groups": "groups", "rooms": "rooms"}
    return mapping.get(scope)

def _get_catalog(): return _read_json(CATALOG_PATH)
def _save_catalog(cat): _atomic_write_json(CATALOG_PATH, cat)
def _get_config(): return _read_json(CONFIG_PATH)
def _save_config(cfg): _atomic_write_json(CONFIG_PATH, cfg)


def _norm_mode(x):
    m = (str(x or "").strip().upper())
    return "ONLINE" if m == "ONLINE" else "PRESENTIEL"

def _get_online_fusion_ids(cat: dict) -> set:
    fusions = cat.get("onlineFusions", []) or []
    ids = set()
    for f in fusions:
        fid = _norm_id((f or {}).get("id"))
        if fid:
            ids.add(fid)
    return ids

def _get_group_ids(cat: dict) -> set:
    gs = cat.get("groups", []) or []
    return set(_norm_id(g) for g in gs if _norm_id(g))

def _is_valid_group_or_fusion(cat: dict, group_id: str) -> bool:
    if not group_id:
        return False
    if group_id in _get_group_ids(cat):
        return True
    if group_id in _get_online_fusion_ids(cat):
        return True
    return False



# -------------------- CATALOG: TEACHERS --------------------
@admin_bp.get("/catalog/teachers")
def get_teachers():
    cat = _get_catalog()
    teachers = cat.get("teachers", [])
    out = [{"id": _norm_id(t.get("id")), "name": _norm_id(t.get("name"))} 
           for t in teachers if isinstance(t, dict) and t.get("id")]
    return jsonify({"teachers": sorted(out, key=lambda x: x["id"])})

@admin_bp.post("/catalog/teachers")
def upsert_teacher():
    payload = request.get_json(silent=True) or {}
    tid, name = _norm_id(payload.get("id")), _norm_id(payload.get("name"))
    if not tid or not name:
        return jsonify({"error": "id et name requis"}), 400

    cat = _get_catalog()
    teachers = [t for t in cat.get("teachers", []) if isinstance(t, dict) and _norm_id(t.get("id")) != tid]
    teachers.append({"id": tid, "name": name})
    cat["teachers"] = teachers
    _save_catalog(cat)
    return jsonify({"ok": True})

@admin_bp.delete("/catalog/teachers/<tid>")
def delete_teacher(tid):
    tid = _norm_id(tid)
    cat = _get_catalog()
    cat["teachers"] = [t for t in cat.get("teachers", []) if not (isinstance(t, dict) and _norm_id(t.get("id")) == tid)]
    cat["assignments"] = [a for a in cat.get("assignments", []) if not (isinstance(a, dict) and _norm_id(a.get("teacher")) == tid)]
    _save_catalog(cat)
    return jsonify({"ok": True})

# -------------------- CATALOG: GROUPS & MODULES --------------------
@admin_bp.get("/catalog/groups")
def get_groups():
    return jsonify({"groups": _get_catalog().get("groups", [])})

@admin_bp.post("/catalog/groups")
def add_group():
    payload = request.get_json(silent=True) or {}
    gid = _norm_id(payload.get("id"))
    if not gid: return jsonify({"error": "id requis"}), 400
    cat = _get_catalog()
    groups = set(cat.get("groups", []))
    groups.add(gid)
    cat["groups"] = sorted(list(groups))
    _save_catalog(cat)
    return jsonify({"ok": True, "groups": cat["groups"]})

@admin_bp.delete("/catalog/groups/<gid>")
def delete_group(gid):
    gid = _norm_id(gid)
    cat = _get_catalog()
    cat["groups"] = [x for x in cat.get("groups", []) if x != gid]
    cat["assignments"] = [a for a in cat.get("assignments", []) if a.get("group") != gid]
    _save_catalog(cat)
    return jsonify({"ok": True})

@admin_bp.get("/catalog/modules")
def get_modules():
    return jsonify({"modules": _get_catalog().get("modules", [])})

@admin_bp.post("/catalog/modules")
def add_module():
    payload = request.get_json(silent=True) or {}
    mid = _norm_id(payload.get("id"))
    if not mid: return jsonify({"error": "id requis"}), 400
    cat = _get_catalog()
    modules = set(cat.get("modules", []))
    modules.add(mid)
    cat["modules"] = sorted(list(modules))
    _save_catalog(cat)
    return jsonify({"ok": True, "modules": cat["modules"]})

@admin_bp.delete("/catalog/modules/<mid>")
def delete_module(mid):
    mid = _norm_id(mid)
    cat = _get_catalog()
    cat["modules"] = [x for x in cat.get("modules", []) if x != mid]
    cat["assignments"] = [a for a in cat.get("assignments", []) if a.get("module") != mid]
    _save_catalog(cat)
    return jsonify({"ok": True})

# -------------------- CATALOG: ASSIGNMENTS --------------------
# -------------------- CATALOG: ASSIGNMENTS --------------------
@admin_bp.get("/catalog/assignments")
def get_assignments():
    # On renvoie tel quel; le front considérera mode absent => PRESENTIEL
    return jsonify({"assignments": _get_catalog().get("assignments", [])})


@admin_bp.post("/catalog/assignments")
def add_assignment():
    payload = request.get_json(silent=True) or {}
    g = _norm_id(payload.get("group"))
    m = _norm_id(payload.get("module"))
    t = _norm_id(payload.get("teacher"))
    mode = _norm_mode(payload.get("mode"))

    if not all([g, m, t]):
        return jsonify({"error": "group, module, teacher requis"}), 400

    cat = _get_catalog()

    # Validation groupe/fusion
    # - PRESENTIEL: on peut accepter uniquement groupes normaux (recommandé)
    # - ONLINE: on accepte groupe normal OU fusion
    if mode == "PRESENTIEL":
        if g not in _get_group_ids(cat):
            return jsonify({"error": "Groupe présentiel invalide (doit être un groupe existant)"}), 400
    else:
        if not _is_valid_group_or_fusion(cat, g):
            return jsonify({"error": "Groupe en ligne invalide (groupe ou fusion requis)"}), 400

    assigns = cat.get("assignments", []) or []

    # clé unique: (mode, group, module)
    assigns = [
        a for a in assigns
        if not (
            _norm_mode(a.get("mode")) == mode
            and _norm_id(a.get("group")) == g
            and _norm_id(a.get("module")) == m
        )
    ]

    assigns.append({"group": g, "module": m, "teacher": t, "mode": mode})
    cat["assignments"] = assigns
    _save_catalog(cat)
    return jsonify({"ok": True})


@admin_bp.delete("/catalog/assignments")
def delete_assignment():
    payload = request.get_json(silent=True) or {}
    g = _norm_id(payload.get("group"))
    m = _norm_id(payload.get("module"))
    mode = _norm_mode(payload.get("mode"))

    if not all([g, m]):
        return jsonify({"error": "group, module requis"}), 400

    cat = _get_catalog()
    assigns = cat.get("assignments", []) or []

    cat["assignments"] = [
        a for a in assigns
        if not (
            _norm_mode(a.get("mode")) == mode
            and _norm_id(a.get("group")) == g
            and _norm_id(a.get("module")) == m
        )
    ]
    _save_catalog(cat)
    return jsonify({"ok": True})

# # -------------------- CATALOG: ONLINE FUSIONS --------------------
# @admin_bp.get("/catalog/online-fusions")
# def get_online_fusions():
#     cat = _get_catalog()
#     return jsonify({"onlineFusions": cat.get("onlineFusions", [])})

# @admin_bp.put("/catalog/online-fusions")
# def put_online_fusions():
#     payload = request.get_json(silent=True) or {}
#     fusions = payload.get("onlineFusions", [])
#     if not isinstance(fusions, list):
#         return jsonify({"error": "onlineFusions doit être une liste"}), 400

#     # Validation minimale
#     cleaned = []
#     for f in fusions:
#         if not isinstance(f, dict):
#             continue
#         fid = _norm_id(f.get("id"))
#         groups = f.get("groupes", [])
#         if not fid or not isinstance(groups, list):
#             continue
#         groups_clean = [_norm_id(x) for x in groups if _norm_id(x)]
#         if len(groups_clean) < 1:
#             continue
#         cleaned.append({"id": fid, "groupes": groups_clean})

#     cat = _get_catalog()
#     cat["onlineFusions"] = cleaned
#     _save_catalog(cat)
#     return jsonify({"ok": True, "onlineFusions": cleaned})


# # -------------------- CATALOG: ONLINE FUSIONS --------------------
# @admin_bp.get("/catalog/online-fusions")
# def get_online_fusions():
#     cat = _get_catalog()
#     return jsonify({"onlineFusions": cat.get("onlineFusions", [])})


# @admin_bp.post("/catalog/online-fusions")
# def create_online_fusion():
#     payload = request.get_json(silent=True) or {}
#     fid = _norm_id(payload.get("id"))
#     groupes = payload.get("groupes", [])

#     if not fid:
#         return jsonify({"error": "id requis"}), 400
#     if not isinstance(groupes, list):
#         return jsonify({"error": "groupes doit être une liste"}), 400

#     cat = _get_catalog()
#     group_set = set(_norm_id(g) for g in (cat.get("groups", []) or []) if _norm_id(g))

#     groupes_clean = []
#     for g in groupes:
#         ng = _norm_id(g)
#         if ng and ng in group_set and ng not in groupes_clean:
#             groupes_clean.append(ng)

#     if len(groupes_clean) < 2:
#         return jsonify({"error": "Une fusion doit contenir au moins 2 groupes physiques valides"}), 400

#     fusions = cat.get("onlineFusions", []) or []

#     # éviter doublon id
#     if any(_norm_id(f.get("id")) == fid for f in fusions if isinstance(f, dict)):
#         return jsonify({"error": "Cette fusion existe déjà"}), 400

#     fusions.append({"id": fid, "groupes": groupes_clean})
#     cat["onlineFusions"] = fusions
#     _save_catalog(cat)

#     return jsonify({"ok": True})


# @admin_bp.delete("/catalog/online-fusions/<fid>")
# def delete_online_fusion(fid):
#     fid = _norm_id(fid)
#     cat = _get_catalog()
#     fusions = cat.get("onlineFusions", []) or []
#     cat["onlineFusions"] = [f for f in fusions if _norm_id((f or {}).get("id")) != fid]
#     _save_catalog(cat)
#     return jsonify({"ok": True})

# -------------------- CATALOG: ONLINE FUSIONS --------------------
@admin_bp.get("/catalog/online-fusions")
def get_online_fusions():
    cat = _get_catalog()
    return jsonify({"onlineFusions": cat.get("onlineFusions", [])})


@admin_bp.post("/catalog/online-fusions")
def create_online_fusion():
    payload = request.get_json(silent=True) or {}
    fid = _norm_id(payload.get("id"))
    groupes = payload.get("groupes", [])

    if not fid:
        return jsonify({"error": "id requis"}), 400
    if not isinstance(groupes, list):
        return jsonify({"error": "groupes doit être une liste"}), 400

    cat = _get_catalog()
    group_set = set(_norm_id(g) for g in (cat.get("groups", []) or []) if _norm_id(g))

    groupes_clean = []
    for g in groupes:
        ng = _norm_id(g)
        if ng and ng in group_set and ng not in groupes_clean:
            groupes_clean.append(ng)

    if len(groupes_clean) < 2:
        return jsonify({"error": "Une fusion doit contenir au moins 2 groupes physiques valides"}), 400

    fusions = cat.get("onlineFusions", []) or []

    # éviter doublon id
    if any(_norm_id(f.get("id")) == fid for f in fusions if isinstance(f, dict)):
        return jsonify({"error": "Cette fusion existe déjà"}), 400

    fusions.append({"id": fid, "groupes": groupes_clean})
    cat["onlineFusions"] = fusions
    _save_catalog(cat)

    return jsonify({"ok": True})


@admin_bp.delete("/catalog/online-fusions/<fid>")
def delete_online_fusion(fid):
    fid = _norm_id(fid)
    cat = _get_catalog()
    fusions = cat.get("onlineFusions", []) or []
    cat["onlineFusions"] = [f for f in fusions if _norm_id((f or {}).get("id")) != fid]
    _save_catalog(cat)
    return jsonify({"ok": True})

# -------------------- CONFIG: META & ROOMS --------------------
@admin_bp.get("/config/meta")
def get_config_meta():
    cfg = _get_config()
    return jsonify({k: cfg.get(k) for k in ["nomEtablissement", "jours", "creneaux", "maxSessionsPerDayTeacher", "maxSessionsPerDayGroup"]})

@admin_bp.put("/config/meta")
def put_config_meta():
    payload = request.get_json(silent=True) or {}
    cfg = _get_config()
    for k in ["nomEtablissement", "jours", "creneaux", "maxSessionsPerDayTeacher", "maxSessionsPerDayGroup"]:
        if k in payload: cfg[k] = payload[k]
    _save_config(cfg)
    return jsonify({"ok": True})

@admin_bp.get("/config/rooms")
def get_rooms_and_types():
    cfg = _get_config()
    salles = [{"id": _norm_id(r.get("id")), "type": _norm_id(r.get("type"))} 
              for r in cfg.get("salles", []) if isinstance(r, dict) and r.get("id")]
    return jsonify({
        "typeSalle": [_norm_id(x) for x in cfg.get("typeSalle", []) if _norm_id(x)],
        "salles": sorted(salles, key=lambda x: x["id"])
    })

@admin_bp.post("/config/room-types")
def add_room_type():
    rid = _norm_id((request.get_json() or {}).get("id"))
    if not rid: return jsonify({"error": "id requis"}), 400
    cfg = _get_config()
    types = set(cfg.get("typeSalle", []))
    types.add(rid)
    cfg["typeSalle"] = sorted(list(types))
    _save_config(cfg)
    return jsonify({"ok": True})

@admin_bp.delete("/config/room-types/<type_id>")
def delete_room_type(type_id):
    type_id = _norm_id(type_id)
    cfg = _get_config()
    cfg["typeSalle"] = [t for t in cfg.get("typeSalle", []) if t != type_id]
    for r in cfg.get("salles", []):
        if r.get("type") == type_id: r["type"] = ""
    _save_config(cfg)
    return jsonify({"ok": True})

@admin_bp.post("/config/rooms")
def add_room():
    payload = request.get_json(silent=True) or {}
    rid, rtype = _norm_id(payload.get("id")), _norm_id(payload.get("type"))
    if not rid or not rtype: return jsonify({"error": "id et type requis"}), 400
    cfg = _get_config()
    if rtype not in cfg.get("typeSalle", []): return jsonify({"error": "typeSalle inconnu"}), 400
    rooms = [r for r in cfg.get("salles", []) if _norm_id(r.get("id")) != rid]
    rooms.append({"id": rid, "type": rtype})
    cfg["salles"] = rooms
    _save_config(cfg)
    return jsonify({"ok": True})

@admin_bp.delete("/config/rooms/<rid>")
def delete_room(rid):
    rid = _norm_id(rid)
    cfg = _get_config()
    cfg["salles"] = [r for r in cfg.get("salles", []) if _norm_id(r.get("id")) != rid]
    _save_config(cfg)
    return jsonify({"ok": True})

# -------------------- CONSTRAINTS & INDISPO --------------------
@admin_bp.get("/constraints/soft")
def get_soft_constraints():
    return jsonify({"soft": _read_json(CONSTRAINTS_PATH).get("soft", {})})

@admin_bp.put("/constraints/soft")
def put_soft_constraints():
    soft = (request.get_json() or {}).get("soft")
    if not isinstance(soft, dict): return jsonify({"error": "objet dict requis"}), 400
    _atomic_write_json(CONSTRAINTS_PATH, {"soft": soft})
    return jsonify({"ok": True})

@admin_bp.get("/indispo/<scope>")
def get_indispo_scope(scope):
    key = _scope_key(scope)
    if not key: return jsonify({"error": "scope invalide"}), 400
    return jsonify({key: _read_json(INDISPO_PATH).get(key, {})})

@admin_bp.get("/indispo/<scope>/<entity_id>")
def get_indispo_entity(scope, entity_id):
    key = _scope_key(scope)
    if not key: return jsonify({"error": "scope invalide"}), 400
    return jsonify(_read_json(INDISPO_PATH).get(key, {}).get(entity_id, {}))

@admin_bp.put("/indispo/<scope>/<entity_id>")
def put_indispo_entity(scope, entity_id):
    key = _scope_key(scope)
    if not key: return jsonify({"error": "scope invalide"}), 400
    payload = request.get_json(silent=True) or {}
    d = _read_json(INDISPO_PATH)
    d.setdefault(key, {})[entity_id] = payload
    _atomic_write_json(INDISPO_PATH, d)
    return jsonify({"ok": True})