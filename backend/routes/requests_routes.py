# routes/requests_routes.py
from flask import Blueprint, jsonify, request
from typing import Any, Dict, List, Optional, Tuple

from services.change_requests_store import ChangeRequestsStore
from services.timetable_repo import TimetableRepo
from services.timetable_rules import (
    validate_move,
    apply_move,
    validate_delete,
    apply_delete,
    validate_insert,
    apply_insert,
)
from services.rbac import require_roles, current_user


def _read_catalog(data_dir: str) -> Dict[str, Any]:
    import json, os

    path = os.path.join(data_dir, "catalog.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _allowed_modules_for_teacher(data_dir: str, teacher_id: str) -> set:
    cat = _read_catalog(data_dir)
    assigns = cat.get("assignments", []) or []
    out = set()
    for a in assigns:
        if not isinstance(a, dict):
            continue
        if str(a.get("teacher", "")).strip() == str(teacher_id).strip():
            m = str(a.get("module", "")).strip()
            if m:
                out.add(m)
    return out


def _bad_request(message: str, code: str = "BAD_REQUEST", details: Optional[Dict[str, Any]] = None):
    payload = {"ok": False, "code": code, "message": message}
    if details:
        payload["details"] = details
    return jsonify(payload), 400


def _conflict(message: str, code: str = "CONSTRAINT_CONFLICT", details: Optional[Dict[str, Any]] = None):
    payload = {"ok": False, "code": code, "message": message}
    if details:
        payload["details"] = details
    return jsonify(payload), 409


def _sid(s: Dict[str, Any]) -> str:
    return s.get("id") or s.get("sessionId")


def _normalize_sessions(sessions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for s in sessions:
        # Keep core fields + virtual markers when present.
        row = {
            "id": s.get("id") or s.get("sessionId"),
            "formateur": s.get("formateur"),
            "groupe": s.get("groupe"),
            "module": s.get("module"),
            "jour": s.get("jour"),
            "creneau": s.get("creneau"),
            "salle": s.get("salle"),
        }
        if "_virtualState" in s:
            row["_virtualState"] = s.get("_virtualState")
        if "_virtualRequestId" in s:
            row["_virtualRequestId"] = s.get("_virtualRequestId")
        out.append(row)
    return out


def _get_session_or_none(sessions: List[Dict[str, Any]], session_id: str) -> Optional[Dict[str, Any]]:
    for s in sessions:
        if _sid(s) == session_id:
            return s
    return None


def _build_virtual_view(
    base_sessions: List[Dict[str, Any]],
    pending_requests: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Vue virtuelle simple (overlay).

    États:
      - sessions_base: NORMAL | MOVED_AWAY | TO_DELETE
      - sessions_extra: PROPOSED_DESTINATION (MOVE/CHANGE_ROOM) | INSERTED (INSERT)
    """
    # Index request par sessionId (PENDING). Si plusieurs: garder la plus récente (list() est déjà triée).
    by_session: Dict[str, Dict[str, Any]] = {}
    for r in pending_requests:
        sid = str(r.get("sessionId", "")).strip()
        if not sid:
            continue
        by_session[sid] = r

    sessions_base = []
    sessions_extra = []

    for s in base_sessions:
        sid = _sid(s)
        req = by_session.get(str(sid))
        if not req:
            ss = dict(s)
            ss["_virtualState"] = "NORMAL"
            sessions_base.append(ss)
            continue

        rtype = str(req.get("type", "")).upper()
        if rtype in ("MOVE", "CHANGE_ROOM"):
            # ancienne position affichée comme "moved away"
            ss = dict(s)
            ss["_virtualState"] = "MOVED_AWAY"
            ss["_virtualRequestId"] = req.get("id")
            sessions_base.append(ss)

            # destination proposée
            nd = req.get("newData") or {}
            dest = dict(s)
            dest["jour"] = nd.get("jour", s.get("jour"))
            dest["creneau"] = nd.get("creneau", s.get("creneau"))
            dest["salle"] = nd.get("salle", s.get("salle"))
            dest["_virtualState"] = "PROPOSED_DESTINATION"
            dest["_virtualRequestId"] = req.get("id")
            sessions_extra.append(dest)
        elif rtype == "DELETE":
            ss = dict(s)
            ss["_virtualState"] = "TO_DELETE"
            ss["_virtualRequestId"] = req.get("id")
            sessions_base.append(ss)
        else:
            # type inconnu => laisser normal
            ss = dict(s)
            ss["_virtualState"] = "NORMAL"
            sessions_base.append(ss)

    # INSERT: séances nouvelles qui n'existent pas dans base_sessions
    for r in pending_requests:
        if str(r.get("status")) != "PENDING":
            continue
        if str(r.get("type", "")).upper() != "INSERT":
            continue
        nd = r.get("newData") or {}
        # construire une pseudo-session
        ss = {
            "id": r.get("sessionId"),
            "formateur": nd.get("formateur"),
            "groupe": nd.get("groupe"),
            "module": nd.get("module"),
            "jour": nd.get("jour"),
            "creneau": nd.get("creneau"),
            "salle": nd.get("salle"),
            "_virtualState": "INSERTED",
            "_virtualRequestId": r.get("id"),
        }
        sessions_extra.append(ss)

    return {
        "sessionsBase": _normalize_sessions(sessions_base),
        "sessionsExtra": _normalize_sessions(sessions_extra),
        "raw": {
            # pour debug éventuel: états virtuels
            "sessionsBase": sessions_base,
            "sessionsExtra": sessions_extra,
        },
    }


def create_requests_blueprint(data_dir: str) -> Blueprint:
    """
    Factory: on injecte DATA_DIR depuis app.py
    """
    requests_bp = Blueprint("requests_bp", __name__)

    store = ChangeRequestsStore(data_dir)

    # Official timetable stays immutable during negotiation.
    official_repo = TimetableRepo(data_dir, filename="timetable.json")
    # Draft timetable is where approved changes are applied.
    repo = TimetableRepo(data_dir, filename="nextTimetable.json")

    # Ensure draft exists (seed from official) for backward compatibility.
    try:
        repo.ensure_exists(seed_from=official_repo.read())
    except Exception:
        pass

    # ----------------------------
    # TEACHER
    # ----------------------------

    @requests_bp.route("/api/teacher/timetable", methods=["GET"])
    @require_roles("formateur", "admin")
    def teacher_timetable():
        u = current_user()
        role = str(u.get("role", "")).lower()

        # formateur: ne pas accepter un teacherId arbitraire
        teacher_id = request.args.get("teacherId")
        if role == "formateur":
            teacher_id = u.get("id")

        if not teacher_id:
            return _bad_request("teacherId requis")

        data = repo.read()
        sessions = data.get("sessions", []) or []
        # Filtrer seulement les séances du formateur
        filtered = [s for s in sessions if str(s.get("formateur", "")).strip() == str(teacher_id).strip()]

        # Overlay des demandes PENDING de ce teacher
        pending = store.list(status="PENDING", teacher_id=str(teacher_id).strip())
        vv = _build_virtual_view(filtered, pending)

        return jsonify(
            {
                "ok": True,
                "draft": {
                    "week_start": data.get("week_start"),
                    "revision": int(data.get("revision", 1) or 1),
                },
                "version": data.get("version", 1),
                "sessions": _normalize_sessions(filtered),
                "virtual": {
                    "sessionsBase": vv["sessionsBase"],
                    "sessionsExtra": vv["sessionsExtra"],
                },
                "pendingRequests": pending,
            }
        )

    @requests_bp.route("/api/teacher/changes", methods=["GET"])
    @require_roles("formateur", "admin")
    def teacher_list_changes():
        u = current_user()
        role = str(u.get("role", "")).lower()

        teacher_id = request.args.get("teacherId")
        if role == "formateur":
            teacher_id = u.get("id")
        status = request.args.get("status")  # optional
        if not teacher_id:
            return _bad_request("teacherId requis")

        items = store.list(status=status, teacher_id=str(teacher_id).strip())
        return jsonify({"ok": True, "requests": items})

    @requests_bp.route("/api/teacher/changes", methods=["POST"])
    @require_roles("formateur")
    def teacher_create_change():
        body = request.get_json(force=True) or {}

        u = current_user()
        teacher_id = u.get("id")

        req_type = (body.get("type") or "MOVE").upper()
        session_id = body.get("sessionId")
        new_data = body.get("newData") or {}

        # INSERT: sessionId optionnel
        if req_type != "INSERT" and not session_id:
            return _bad_request("sessionId requis")

        data = repo.read()
        sessions = data.get("sessions", []) or []

        allowed_modules = _allowed_modules_for_teacher(data_dir, str(teacher_id).strip())

        # -----------------
        # INSERT (nouvelle séance)
        # -----------------
        if req_type == "INSERT":
            # newData attendu: {formateur,groupe,module,jour,creneau,salle}
            # formateur forcé = teacher
            new_data = dict(new_data)
            new_data["formateur"] = str(teacher_id).strip()

            module = str(new_data.get("module", "")).strip()
            if module and allowed_modules and module not in allowed_modules:
                return _bad_request(
                    "Vous ne pouvez ajouter que des séances de vos modules affectés",
                    code="FORBIDDEN",
                )

            # sessionId = identifiant proposé (sinon généré)
            if not session_id:
                import time, uuid

                session_id = f"TEACHER_NEW_{int(time.time())}_{uuid.uuid4().hex[:8]}"

            # Vérifier l'absence de conflits avant d'enregistrer la demande
            candidate = dict(new_data)
            candidate["id"] = str(session_id).strip()
            err = validate_insert(sessions, candidate)
            if err:
                return _bad_request(
                    err.get("message", "Conflit détecté"),
                    code=err.get("code", "CONSTRAINT_CONFLICT"),
                    details=err.get("details"),
                )

            created = store.upsert_pending_for_session(
                teacher_id=str(teacher_id).strip(),
                session_id=str(session_id).strip(),
                req_type=req_type,
                old_data={},
                new_data=new_data,
                supersede_previous=False,  # INSERT: on laisse plusieurs demandes (ids différents)
            )
            return jsonify({"ok": True, "request": created})

        # Pour MOVE/CHANGE_ROOM/DELETE: charger la session officielle
        target = _get_session_or_none(sessions, str(session_id))
        if not target:
            return _bad_request("Session introuvable", code="NOT_FOUND")

        if str(target.get("formateur", "")).strip() != str(teacher_id).strip():
            return _bad_request("Vous ne pouvez proposer que sur vos propres séances", code="FORBIDDEN")

        old_data = {
            "jour": target.get("jour"),
            "creneau": int(target.get("creneau")),
            "salle": target.get("salle"),
        }

        # DELETE
        if req_type == "DELETE":
            # Vérif conflit (optionnelle, mais cohérente)
            err = validate_delete(sessions, str(session_id).strip())
            if err:
                return _bad_request(
                    err.get("message", "Suppression invalide"),
                    code=err.get("code", "CONSTRAINT_CONFLICT"),
                    details=err.get("details"),
                )

            created = store.upsert_pending_for_session(
                teacher_id=str(teacher_id).strip(),
                session_id=str(session_id).strip(),
                req_type=req_type,
                old_data=old_data,
                new_data={"motif": new_data.get("motif")},
                supersede_previous=True,
            )
            return jsonify({"ok": True, "request": created})

        # CHANGE_ROOM
        if req_type == "CHANGE_ROOM":
            if not new_data.get("salle"):
                return _bad_request("newData.salle requis pour CHANGE_ROOM")
            new_data = {
                "jour": old_data["jour"],
                "creneau": old_data["creneau"],
                "salle": new_data.get("salle"),
                "motif": new_data.get("motif"),
            }
        else:
            # MOVE
            if not new_data.get("jour") or new_data.get("creneau") is None or not new_data.get("salle"):
                return _bad_request("newData.jour, newData.creneau, newData.salle requis pour MOVE")

            new_data = {
                "jour": str(new_data.get("jour")).strip().lower(),
                "creneau": int(new_data.get("creneau")),
                "salle": str(new_data.get("salle")).strip(),
                "motif": new_data.get("motif"),
            }

        # Vérifier l'absence de conflits avant d'enregistrer la demande
        err = validate_move(
            sessions,
            str(session_id).strip(),
            str(new_data.get("jour")).strip(),
            int(new_data.get("creneau")),
            str(new_data.get("salle")).strip(),
        )
        if err:
            return _bad_request(
                err.get("message", "Conflit détecté"),
                code=err.get("code", "CONSTRAINT_CONFLICT"),
                details=err.get("details"),
            )

        created = store.upsert_pending_for_session(
            teacher_id=str(teacher_id).strip(),
            session_id=str(session_id).strip(),
            req_type=req_type,
            old_data=old_data,
            new_data=new_data,
            supersede_previous=True,  # garde l’audit
        )
        return jsonify({"ok": True, "request": created})

    # ✅ NOUVEAU: Annuler (supprimer) une demande PENDING du formateur
    @requests_bp.route("/api/teacher/changes/<request_id>", methods=["DELETE"])
    @require_roles("formateur")
    def teacher_cancel_change(request_id: str):
        u = current_user()
        teacher_id = str(u.get("id", "")).strip()

        req = store.get(str(request_id))
        if not req:
            return _bad_request("Demande introuvable", code="NOT_FOUND")

        # sécurité: uniquement ses demandes
        if str(req.get("teacherId", "")).strip() != teacher_id:
            return jsonify({"ok": False, "code": "FORBIDDEN", "message": "Vous ne pouvez annuler que vos demandes"}), 403

        # annulation uniquement si PENDING
        if str(req.get("status")) != "PENDING":
            return _conflict("Annulation possible uniquement pour les demandes PENDING", code="INVALID_STATUS")

        data = store.load()
        items = data.get("requests", []) or []
        data["requests"] = [r for r in items if str(r.get("id")) != str(request_id)]
        store.save(data)

        return jsonify({"ok": True})

    # ----------------------------
    # ADMIN / DIRECTEUR
    # ----------------------------

    @requests_bp.route("/api/admin/changes", methods=["GET"])
    @require_roles("admin")
    def admin_list_changes():
        status = request.args.get("status")  # PENDING by default
        teacher_id = request.args.get("teacherId")
        session_id = request.args.get("sessionId")

        if not status:
            status = "PENDING"

        items = store.list(
            status=status,
            teacher_id=teacher_id.strip() if teacher_id else None,
            session_id=session_id.strip() if session_id else None,
        )
        return jsonify({"ok": True, "requests": items})

    @requests_bp.route("/api/admin/timetable/virtual", methods=["GET"])
    @require_roles("admin")
    def admin_virtual_timetable():
        data = repo.read()
        sessions = data.get("sessions", []) or []
        pending = store.list(status="PENDING")

        vv = _build_virtual_view(sessions, pending)
        return jsonify(
            {
                "ok": True,
                "draft": {
                    "week_start": data.get("week_start"),
                    "revision": int(data.get("revision", 1) or 1),
                },
                "version": data.get("version", 1),
                "sessions": _normalize_sessions(sessions),  # officiel
                "virtual": {
                    "sessionsBase": vv["sessionsBase"],
                    "sessionsExtra": vv["sessionsExtra"],
                },
                "pendingRequests": pending,
            }
        )

    def _validate_and_apply_request(current: Dict[str, Any], req: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
        sessions = current.get("sessions", []) or []
        session_id = str(req.get("sessionId"))
        rtype = str(req.get("type", "")).upper()
        nd = req.get("newData") or {}

        # MOVE / CHANGE_ROOM
        if rtype in ("MOVE", "CHANGE_ROOM"):
            to_jour = str(nd.get("jour", "")).strip().lower()
            to_creneau = nd.get("creneau", None)
            to_salle = str(nd.get("salle", "")).strip()
            if not session_id or not to_jour or to_creneau is None or not to_salle:
                return (False, {"ok": False, "code": "BAD_REQUEST", "message": "Demande invalide (newData incomplet)"})

            err = validate_move(sessions, session_id, to_jour, int(to_creneau), to_salle)
            if err:
                err["ok"] = False
                return (False, err)
            new_sessions = apply_move(sessions, session_id, to_jour, int(to_creneau), to_salle)
            return (True, {"version": int(current.get("version", 1)) + 1, "sessions": new_sessions})

        # DELETE
        if rtype == "DELETE":
            if not session_id:
                return (False, {"ok": False, "code": "BAD_REQUEST", "message": "Demande invalide (sessionId manquant)"})
            err = validate_delete(sessions, session_id)
            if err:
                err["ok"] = False
                return (False, err)
            new_sessions = apply_delete(sessions, session_id)
            return (True, {"version": int(current.get("version", 1)) + 1, "sessions": new_sessions})

        # INSERT
        if rtype == "INSERT":
            candidate = dict(nd)
            if "id" not in candidate and session_id:
                candidate["id"] = session_id
            err = validate_insert(sessions, candidate)
            if err:
                err["ok"] = False
                return (False, err)
            new_sessions = apply_insert(sessions, candidate)
            return (True, {"version": int(current.get("version", 1)) + 1, "sessions": new_sessions})

        return (False, {"ok": False, "code": "UNKNOWN_COMMAND", "message": "Type de demande inconnu"})

    @requests_bp.route("/api/admin/changes/<request_id>/simulate", methods=["POST"])
    @require_roles("admin")
    def admin_simulate_change(request_id: str):
        req = store.get(request_id)
        if not req:
            return _bad_request("Demande introuvable", code="NOT_FOUND")
        if str(req.get("status")) != "PENDING":
            return _bad_request("Seules les demandes PENDING peuvent être simulées", code="INVALID_STATUS")

        current = repo.read()
        ok, data_or_err = _validate_and_apply_request(current, req)
        if not ok:
            return _conflict(
                data_or_err.get("message", "Conflit"),
                code=data_or_err.get("code", "CONSTRAINT_CONFLICT"),
                details=data_or_err.get("details"),
            )

        return jsonify({"ok": True, "message": "Simulation OK", "newVersionWouldBe": data_or_err.get("version")})

    @requests_bp.route("/api/admin/changes/<request_id>/approve", methods=["POST"])
    @require_roles("admin")
    def admin_approve_change(request_id: str):
        body = request.get_json(force=True) or {}
        decided_by = body.get("decidedBy") or "ADMIN"

        req = store.get(request_id)
        if not req:
            return _bad_request("Demande introuvable", code="NOT_FOUND")
        if str(req.get("status")) != "PENDING":
            return _bad_request("Seules les demandes PENDING peuvent être approuvées", code="INVALID_STATUS")

        def do_update(current: Dict[str, Any]):
            ok, data_or_err = _validate_and_apply_request(current, req)
            if not ok:
                return (False, current, data_or_err)
            repo.write(data_or_err)
            return (True, data_or_err, {})

        ok, new_data, err_payload = repo.atomic_update(do_update)

        if not ok:
            msg = err_payload.get("message", "Conflit lors de l'approbation")
            store.set_status(request_id, status="REJECTED", decided_by=str(decided_by), reason=msg)
            return _conflict(msg, code=err_payload.get("code", "CONSTRAINT_CONFLICT"), details=err_payload.get("details"))

        store.set_status(request_id, status="APPROVED", decided_by=str(decided_by), reason=None)
        return jsonify(
            {
                "ok": True,
                "message": "Demande approuvée et appliquée",
                "version": new_data.get("version"),
                "sessions": _normalize_sessions(new_data.get("sessions", []) or []),
            }
        )

    @requests_bp.route("/api/admin/changes/<request_id>/reject", methods=["POST"])
    @require_roles("admin")
    def admin_reject_change(request_id: str):
        body = request.get_json(force=True) or {}
        decided_by = body.get("decidedBy") or "ADMIN"
        reason = body.get("reason") or "Rejected by admin"

        req = store.get(request_id)
        if not req:
            return _bad_request("Demande introuvable", code="NOT_FOUND")
        if str(req.get("status")) != "PENDING":
            return _bad_request("Seules les demandes PENDING peuvent être rejetées", code="INVALID_STATUS")

        updated = store.set_status(request_id, status="REJECTED", decided_by=str(decided_by), reason=str(reason))
        return jsonify({"ok": True, "request": updated})

    return requests_bp
