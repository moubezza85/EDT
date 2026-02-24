from typing import Any, Dict, List, Optional


def _sid(s: Dict[str, Any]) -> str:
    """Retourne l'identifiant canonique d'une séance."""
    return s.get("id") or s.get("sessionId")


def _norm(x: Any) -> str:
    """Normalise une valeur string : strip + lowercase.

    Utilisé pour toutes les comparaisons (jour, salle, formateur, groupe)
    afin d'éviter les faux négatifs dus à la casse ou aux espaces.
    """
    return str(x or "").strip().lower()


def validate_move(
    sessions: List[Dict[str, Any]],
    session_id: str,
    to_jour: str,
    to_creneau: int,
    to_salle: str,
) -> Optional[Dict[str, Any]]:
    """Vérifie qu'un déplacement ne crée pas de conflit.

    Retourne None si OK, ou un dict d'erreur sinon.

    Ordre de validation intentionnel :
      1) conflit formateur
      2) conflit groupe
      3) conflit salle (en dernier) — évite de proposer une salle libre
         alors que le move est de toute façon impossible.
    """
    target = next((s for s in sessions if _sid(s) == session_id), None)
    if not target:
        return {"code": "NOT_FOUND", "message": "Session introuvable"}

    to_jour_n = _norm(to_jour)
    to_salle_n = _norm(to_salle)
    to_creneau_n = int(to_creneau)
    target_formateur_n = _norm(target.get("formateur"))
    target_groupe_n = _norm(target.get("groupe"))

    for s in sessions:
        if _sid(s) == session_id:
            continue
        if _norm(s.get("jour")) != to_jour_n:
            continue
        if int(s.get("creneau", 0) or 0) != to_creneau_n:
            continue

        # 1) conflit formateur
        if target_formateur_n and _norm(s.get("formateur")) == target_formateur_n:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit\u00a0: formateur d\u00e9j\u00e0 occup\u00e9 sur ce cr\u00e9neau",
                "details": {"conflictingSessionId": _sid(s), "kind": "teacher"},
            }

        # 2) conflit groupe
        if target_groupe_n and _norm(s.get("groupe")) == target_groupe_n:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit\u00a0: groupe d\u00e9j\u00e0 occup\u00e9 sur ce cr\u00e9neau",
                "details": {"conflictingSessionId": _sid(s), "kind": "group"},
            }

        # 3) conflit salle
        if _norm(s.get("salle")) == to_salle_n:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit\u00a0: salle d\u00e9j\u00e0 occup\u00e9e sur ce cr\u00e9neau",
                "details": {"conflictingSessionId": _sid(s), "kind": "room"},
            }

    return None


def apply_move(
    sessions: List[Dict[str, Any]],
    session_id: str,
    to_jour: str,
    to_creneau: int,
    to_salle: str,
) -> List[Dict[str, Any]]:
    """Applique le déplacement et retourne la nouvelle liste de sessions.

    Le jour est normalisé (à la casse) à l'écriture pour être cohérent
    avec les données déjà stockées.
    """
    out = []
    for s in sessions:
        if _sid(s) == session_id:
            ns = dict(s)
            ns["jour"] = _norm(to_jour)          # normalise à l'écriture
            ns["creneau"] = int(to_creneau)
            ns["salle"] = str(to_salle or "").strip()
            # garantit que le champ id est bien présent
            if "id" not in ns and ns.get("sessionId"):
                ns["id"] = ns["sessionId"]
            out.append(ns)
        else:
            out.append(s)
    return out


def validate_delete(
    sessions: List[Dict[str, Any]], session_id: str
) -> Optional[Dict[str, Any]]:
    target = next((s for s in sessions if _sid(s) == session_id), None)
    if not target:
        return {"code": "NOT_FOUND", "message": "Session introuvable"}
    return None


def apply_delete(
    sessions: List[Dict[str, Any]], session_id: str
) -> List[Dict[str, Any]]:
    return [s for s in sessions if _sid(s) != session_id]


def validate_insert(
    sessions: List[Dict[str, Any]], new_session: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Valide l'insertion d'une nouvelle séance.

    Champs requis\u00a0: formateur, groupe, module, jour, creneau, salle.
    Ordre de validation : formateur \u2192 groupe \u2192 salle (cohérent avec validate_move).
    """
    if not isinstance(new_session, dict):
        return {"code": "BAD_REQUEST", "message": "Session invalide"}

    required = ["formateur", "groupe", "module", "jour", "creneau", "salle"]
    missing = [k for k in required if new_session.get(k) in (None, "")]
    if missing:
        return {"code": "BAD_REQUEST", "message": f"Champs manquants\u00a0: {', '.join(missing)}"}

    sid = new_session.get("id") or new_session.get("sessionId")
    if sid:
        if any(_sid(s) == str(sid) for s in sessions):
            return {"code": "CONSTRAINT_CONFLICT", "message": "Conflit\u00a0: id de s\u00e9ance d\u00e9j\u00e0 utilis\u00e9"}

    to_jour_n = _norm(new_session.get("jour", ""))
    to_creneau_n = int(new_session.get("creneau"))
    to_salle_n = _norm(new_session.get("salle", ""))
    formateur_n = _norm(new_session.get("formateur", ""))
    groupe_n = _norm(new_session.get("groupe", ""))

    for s in sessions:
        if _norm(s.get("jour", "")) != to_jour_n:
            continue
        if int(s.get("creneau", 0) or 0) != to_creneau_n:
            continue

        # 1) conflit formateur
        if formateur_n and _norm(s.get("formateur", "")) == formateur_n:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit\u00a0: formateur d\u00e9j\u00e0 occup\u00e9 sur ce cr\u00e9neau",
                "details": {"conflictingSessionId": _sid(s)},
            }

        # 2) conflit groupe
        if groupe_n and _norm(s.get("groupe", "")) == groupe_n:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit\u00a0: groupe d\u00e9j\u00e0 occup\u00e9 sur ce cr\u00e9neau",
                "details": {"conflictingSessionId": _sid(s)},
            }

        # 3) conflit salle
        if _norm(s.get("salle", "")) == to_salle_n:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit\u00a0: salle d\u00e9j\u00e0 occup\u00e9e sur ce cr\u00e9neau",
                "details": {"conflictingSessionId": _sid(s)},
            }

    return None


def apply_insert(
    sessions: List[Dict[str, Any]], new_session: Dict[str, Any]
) -> List[Dict[str, Any]]:
    ns = dict(new_session)
    if "id" not in ns and ns.get("sessionId"):
        ns["id"] = ns["sessionId"]
    ns["jour"] = _norm(ns.get("jour", ""))   # normalise à l'écriture
    ns["creneau"] = int(ns.get("creneau"))
    return [*sessions, ns]


def validate_reassign(
    sessions: List[Dict[str, Any]],
    session_id: str,
    new_groupe: str,
    new_module: str,
) -> Optional[Dict[str, Any]]:
    """Vérifie qu'un changement groupe/module ne crée pas de conflit.

    Formateur, jour, créneau et salle restent inchangés.
    On vérifie uniquement que le nouveau groupe n'est pas déjà
    occupé sur le même créneau par une autre séance.
    """
    target = next((s for s in sessions if _sid(s) == session_id), None)
    if not target:
        return {"code": "NOT_FOUND", "message": "Session introuvable"}
    if not new_groupe or not new_module:
        return {"code": "BAD_REQUEST", "message": "groupe et module requis"}

    jour_n = _norm(target.get("jour"))
    creneau_n = int(target.get("creneau", 0) or 0)
    groupe_n = _norm(new_groupe)

    for s in sessions:
        if _sid(s) == session_id:
            continue
        if _norm(s.get("jour")) != jour_n:
            continue
        if int(s.get("creneau", 0) or 0) != creneau_n:
            continue
        if groupe_n and _norm(s.get("groupe")) == groupe_n:
            return {
                "code": "CONSTRAINT_CONFLICT",
                "message": "Conflit\u00a0: groupe d\u00e9j\u00e0 occup\u00e9 sur ce cr\u00e9neau",
                "details": {"conflictingSessionId": _sid(s), "kind": "group"},
            }
    return None


def apply_reassign(
    sessions: List[Dict[str, Any]],
    session_id: str,
    new_groupe: str,
    new_module: str,
) -> List[Dict[str, Any]]:
    out = []
    for s in sessions:
        if _sid(s) == session_id:
            ns = dict(s)
            ns["groupe"] = str(new_groupe or "").strip()
            ns["module"] = str(new_module or "").strip()
            if "id" not in ns and ns.get("sessionId"):
                ns["id"] = ns["sessionId"]
            out.append(ns)
        else:
            out.append(s)
    return out
