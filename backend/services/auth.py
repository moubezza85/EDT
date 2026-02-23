import json
import os
import re
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from werkzeug.security import check_password_hash, generate_password_hash


DEFAULT_PASSWORD = "123456"


def _users_path(data_dir: str, filename: str = "users.json") -> str:
    return os.path.join(data_dir, filename)


def _save_users_atomic(data_dir: str, data: Dict[str, Any], filename: str = "users.json") -> None:
    os.makedirs(data_dir, exist_ok=True)
    final_path = _users_path(data_dir, filename)

    fd, tmp_path = tempfile.mkstemp(dir=data_dir, prefix=filename, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, final_path)
    finally:
        try:
            os.remove(tmp_path)
        except FileNotFoundError:
            pass


def load_users(data_dir: str, filename: str = "users.json") -> Dict[str, Any]:
    """Load users.json from data_dir.

    Supported formats:
      - {"users": [...]} (recommended)
      - [...] (legacy)  -> treated as users list
    """
    path = _users_path(data_dir, filename)
    if not os.path.exists(path):
        return {"users": []}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        data = {"users": data}
    if not isinstance(data, dict):
        return {"users": []}
    data.setdefault("users", [])
    if not isinstance(data["users"], list):
        data["users"] = []
    return data


def ensure_password_hashes(data_dir: str, default_password: str = DEFAULT_PASSWORD) -> Dict[str, Any]:
    """Ensure every user has a hashed password.

    If password is missing/empty, it is set to a hash of default_password.
    Writes users.json atomically if any update was needed.
    """
    data = load_users(data_dir)
    changed = False
    users = data.get("users", []) or []
    for u in users:
        if not isinstance(u, dict):
            continue
        pw = str(u.get("password") or "").strip()
        if not pw:
            u["password"] = generate_password_hash(default_password, method="pbkdf2:sha256")
            changed = True
    if changed:
        _save_users_atomic(data_dir, data)
    return data


def find_user(data_dir: str, user_id: str) -> Optional[Dict[str, Any]]:
    if not user_id:
        return None
    users = load_users(data_dir).get("users", []) or []
    for u in users:
        if str((u or {}).get("id", "")).strip() == str(user_id).strip():
            out = dict(u)
            out["id"] = str(out.get("id", "")).strip()
            out["name"] = str(out.get("name", out.get("id", ""))).strip()
            out["role"] = str(out.get("role", "")).strip().lower() or "formateur"
            # never leak password
            out.pop("password", None)
            return out
    return None


def _find_user_record(data_dir: str, user_id: str) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    data = load_users(data_dir)
    users = data.get("users", []) or []
    for u in users:
        if str((u or {}).get("id", "")).strip() == str(user_id).strip():
            return u, data
    return None, data


def verify_login(data_dir: str, user_id: str, password: str) -> Optional[Dict[str, Any]]:
    """Return normalized user (without password) if credentials are valid."""
    if not user_id or not password:
        return None

    rec, _data = _find_user_record(data_dir, user_id)
    if not rec or not isinstance(rec, dict):
        return None

    stored_hash = str(rec.get("password") or "").strip()
    if not stored_hash:
        return None

    if not check_password_hash(stored_hash, password):
        return None

    return {
        "id": str(rec.get("id", "")).strip(),
        "name": str(rec.get("name", rec.get("id", ""))).strip(),
        "role": str(rec.get("role", "")).strip().lower() or "formateur",
        "modules": rec.get("modules", []) or [],
    }


def update_last_login(data_dir: str, user_id: str) -> None:
    rec, data = _find_user_record(data_dir, user_id)
    if not rec or not isinstance(rec, dict):
        return
    rec["lastLogin"] = datetime.now(timezone.utc).isoformat()
    _save_users_atomic(data_dir, data)


def change_password(data_dir: str, user_id: str, old_password: str, new_password: str) -> Tuple[bool, str]:
    if not user_id:
        return False, "Utilisateur invalide"
    if not old_password or not new_password:
        return False, "Ancien et nouveau mot de passe requis"
    if len(new_password) < 6:
        return False, "Mot de passe trop court (min 6 caract\u00e8res)"

    rec, data = _find_user_record(data_dir, user_id)
    if not rec or not isinstance(rec, dict):
        return False, "Utilisateur introuvable"

    stored_hash = str(rec.get("password") or "").strip()
    if not stored_hash or not check_password_hash(stored_hash, old_password):
        return False, "Ancien mot de passe incorrect"

    rec["password"] = generate_password_hash(new_password, method="pbkdf2:sha256")
    rec["lastPasswordChange"] = datetime.now(timezone.utc).isoformat()
    _save_users_atomic(data_dir, data)
    return True, ""


def update_phone(data_dir: str, user_id: str, phone: str) -> Tuple[bool, str]:
    """Update the phone number for a user."""
    if not user_id:
        return False, "Utilisateur invalide"
    phone = str(phone or "").strip()
    if phone and not re.match(r"^[+\d\s\-(). ]{6,20}$", phone):
        return False, "Num\u00e9ro de t\u00e9l\u00e9phone invalide (6-20 caract\u00e8res)"
    rec, data = _find_user_record(data_dir, user_id)
    if not rec or not isinstance(rec, dict):
        return False, "Utilisateur introuvable"
    rec["phone"] = phone
    _save_users_atomic(data_dir, data)
    return True, ""


def update_email(data_dir: str, user_id: str, email: str) -> Tuple[bool, str]:
    """Update the email address for a user."""
    if not user_id:
        return False, "Utilisateur invalide"
    email = str(email or "").strip()
    if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return False, "Adresse email invalide"
    rec, data = _find_user_record(data_dir, user_id)
    if not rec or not isinstance(rec, dict):
        return False, "Utilisateur introuvable"
    rec["email"] = email
    _save_users_atomic(data_dir, data)
    return True, ""
