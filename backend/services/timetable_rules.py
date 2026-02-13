from typing import Dict, Any, List, Optional

def _sid(s: Dict[str, Any]) -> str:
    return s.get("id") or s.get("sessionId")

def validate_move(
    sessions: List[Dict[str, Any]],
    session_id: str,
    to_jour: str,
    to_creneau: int,
    to_salle: str
) -> Optional[Dict[str, Any]]:
    target = next((s for s in sessions if _sid(s) == session_id), None)
    if not target:
        return {"code": "NOT_FOUND", "message": "Session introuvable"}

    # IMPORTANT: l'ordre de validation est volontaire :
    # 1) conflit formateur
    # 2) conflit groupe
    # 3) conflit salle (en dernier) — afin d'éviter de proposer une salle
    #    alors que le move est impossible pour cause formateur/groupe.
    for s in sessions:
        if _sid(s) == session_id:
            continue
        if s.get("jour") != to_jour or int(s.get("creneau")) != int(to_creneau):
            continue

        if s.get("formateur") == target.get("formateur"):
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit: formateur déjà occupé sur ce créneau",
                "details": {"conflictingSessionId": _sid(s), "kind": "teacher"},
            }

        if s.get("groupe") == target.get("groupe"):
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit: groupe déjà occupé sur ce créneau",
                "details": {"conflictingSessionId": _sid(s), "kind": "group"},
            }

        if s.get("salle") == to_salle:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit: salle déjà occupée sur ce créneau",
                "details": {"conflictingSessionId": _sid(s), "kind": "room"},
            }

    return None


def apply_move(sessions: List[Dict[str, Any]], session_id: str, to_jour: str, to_creneau: int, to_salle: str) -> List[Dict[str, Any]]:
    out = []
    for s in sessions:
        if _sid(s) == session_id:
            ns = dict(s)
            ns["jour"] = to_jour
            ns["creneau"] = int(to_creneau)
            ns["salle"] = to_salle
            # normaliser id
            if "id" not in ns and ns.get("sessionId"):
                ns["id"] = ns["sessionId"]
            out.append(ns)
        else:
            out.append(s)
    return out

def validate_delete(sessions: List[Dict[str, Any]], session_id: str) -> Optional[Dict[str, Any]]:
    target = next((s for s in sessions if _sid(s) == session_id), None)
    if not target:
        return {"code": "NOT_FOUND", "message": "Session introuvable"}
    return None

def apply_delete(sessions: List[Dict[str, Any]], session_id: str) -> List[Dict[str, Any]]:
    return [s for s in sessions if _sid(s) != session_id]


def validate_insert(sessions: List[Dict[str, Any]], new_session: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Validate INSERT of a full session object.

    Required keys: formateur, groupe, module, jour, creneau, salle.
    id is optional; if provided must be unique.
    """

    if not isinstance(new_session, dict):
        return {"code": "BAD_REQUEST", "message": "Session invalide"}

    required = ["formateur", "groupe", "module", "jour", "creneau", "salle"]
    missing = [k for k in required if new_session.get(k) in (None, "")]
    if missing:
        return {"code": "BAD_REQUEST", "message": f"Champs manquants: {', '.join(missing)}"}

    sid = new_session.get("id") or new_session.get("sessionId")
    if sid:
        if any(_sid(s) == str(sid) for s in sessions):
            return {"code": "CONSTRAINT_CONFLICT", "message": "Conflit: id de séance déjà utilisé"}

    to_jour = str(new_session.get("jour", "")).strip().lower()
    to_creneau = int(new_session.get("creneau"))
    to_salle = str(new_session.get("salle", "")).strip()

    formateur = str(new_session.get("formateur", "")).strip()
    groupe = str(new_session.get("groupe", "")).strip()

    for s in sessions:
        if str(s.get("jour", "")).strip().lower() != to_jour:
            continue
        if int(s.get("creneau", 0) or 0) != to_creneau:
            continue

        if str(s.get("salle", "")).strip() == to_salle:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit: salle déjà occupée sur ce créneau",
                "details": {"conflictingSessionId": _sid(s)},
            }
        if str(s.get("formateur", "")).strip() == formateur:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit: formateur déjà occupé sur ce créneau",
                "details": {"conflictingSessionId": _sid(s)},
            }
        if str(s.get("groupe", "")).strip() == groupe:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit: groupe déjà occupé sur ce créneau",
                "details": {"conflictingSessionId": _sid(s)},
            }

    return None


def apply_insert(sessions: List[Dict[str, Any]], new_session: Dict[str, Any]) -> List[Dict[str, Any]]:
    ns = dict(new_session)
    # normalize
    if "id" not in ns and ns.get("sessionId"):
        ns["id"] = ns["sessionId"]
    ns["jour"] = str(ns.get("jour", "")).strip().lower()
    ns["creneau"] = int(ns.get("creneau"))
    return [*sessions, ns]

