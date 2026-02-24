"""Routes d'authentification et de gestion de profil utilisateur."""
from flask import Blueprint, jsonify, request, g

from services.auth import (
    verify_login,
    update_last_login,
    change_password,
    update_phone,
    update_email,
)
from services.jwt_auth import make_access_token
from services.rbac import require_authenticated


def create_auth_blueprint(data_dir: str) -> Blueprint:
    """Crée le blueprint d'authentification."""
    bp = Blueprint("auth_bp", __name__, url_prefix="/api/auth")

    @bp.get("/me")
    @require_authenticated
    def auth_me():
        u = g.user or {}
        return jsonify({"ok": True, "user": {
            "id": u.get("id"),
            "name": u.get("name"),
            "role": u.get("role"),
            "modules": u.get("modules", []),
            "phone": u.get("phone", ""),
            "email": u.get("email", ""),
        }})

    @bp.post("/login")
    def auth_login():
        """Login et obtention d'un JWT."""
        body = request.get_json(silent=True) or {}
        username = str(body.get("username") or body.get("login") or body.get("id") or "").strip()
        password = str(body.get("password") or "").strip()

        if not username or not password:
            return jsonify({"ok": False, "code": "BAD_REQUEST", "message": "username/password requis"}), 400

        u = verify_login(data_dir, username, password)
        if not u:
            return jsonify({"ok": False, "code": "UNAUTHORIZED", "message": "Utilisateur introuvable"}), 401

        try:
            update_last_login(data_dir, u.get("id"))
        except Exception:
            pass

        token = make_access_token(u)
        return jsonify({"ok": True, "token": token, "user": {"id": u.get("id"), "name": u.get("name"), "role": u.get("role"), "modules": u.get("modules", [])}})

    @bp.post("/change-password")
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
        ok, msg = change_password(data_dir, uid, old_pw, new_pw)
        if not ok:
            return jsonify({"ok": False, "code": "UNAUTHORIZED", "message": msg}), 401

        return jsonify({"ok": True})

    @bp.post("/update-phone")
    @require_authenticated
    def auth_update_phone():
        body = request.get_json(silent=True) or {}
        phone = str(body.get("phone") or "").strip()
        uid = str((g.user or {}).get("id") or "").strip()
        ok, msg = update_phone(data_dir, uid, phone)
        if not ok:
            return jsonify({"ok": False, "code": "BAD_REQUEST", "message": msg}), 400
        return jsonify({"ok": True})

    @bp.post("/update-email")
    @require_authenticated
    def auth_update_email():
        body = request.get_json(silent=True) or {}
        email = str(body.get("email") or "").strip()
        uid = str((g.user or {}).get("id") or "").strip()
        ok, msg = update_email(data_dir, uid, email)
        if not ok:
            return jsonify({"ok": False, "code": "BAD_REQUEST", "message": msg}), 400
        return jsonify({"ok": True})

    return bp
