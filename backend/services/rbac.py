from __future__ import annotations

from functools import wraps
from typing import Callable, Iterable, Optional, Set

from flask import g, jsonify, request


def _unauthorized(message: str = "Unauthorized"):
    return jsonify({"ok": False, "code": "UNAUTHORIZED", "message": message}), 401


def _forbidden(message: str = "Forbidden"):
    return jsonify({"ok": False, "code": "FORBIDDEN", "message": message}), 403


def current_user() -> dict:
    return getattr(g, "user", None) or {}


def require_roles(*roles: str):
    """Decorator: allow only given roles (lowercased)."""

    allowed: Set[str] = {str(r).strip().lower() for r in roles if r}

    def decorator(fn: Callable):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # IMPORTANT: allow CORS preflight (OPTIONS) without authentication.
            # Otherwise the browser will fail before sending the real request.
            if request.method == "OPTIONS":
                return ("", 204)
            u = current_user()
            if not u or not u.get("id"):
                return _unauthorized("Non authentifié. Envoyez un Bearer token.")

            role = str(u.get("role", "")).strip().lower()
            if role not in allowed:
                return _forbidden("Insufficient role")
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def require_authenticated(fn: Callable):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if request.method == "OPTIONS":
            return ("", 204)
        u = current_user()
        if not u or not u.get("id"):
            return _unauthorized("Non authentifié. Envoyez un Bearer token.")
        return fn(*args, **kwargs)

    return wrapper
