from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict, Optional, Tuple


# ---------------------------------------------------------------------------
# Minimal JWT (HS256) implementation (no external dependency)
# ---------------------------------------------------------------------------


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(txt: str) -> bytes:
    pad = "=" * (-len(txt) % 4)
    return base64.urlsafe_b64decode((txt + pad).encode("utf-8"))


def _sign(message: bytes, secret: str) -> str:
    sig = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return _b64url_encode(sig)


def get_jwt_secret() -> str:
    # Change this in production.
    return os.environ.get("JWT_SECRET", "CHANGE_ME_DEV_SECRET")


def encode_jwt(payload: Dict[str, Any], secret: Optional[str] = None) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    msg = f"{h}.{p}".encode("utf-8")
    s = _sign(msg, secret or get_jwt_secret())
    return f"{h}.{p}.{s}"


def decode_jwt(token: str, secret: Optional[str] = None) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    try:
        parts = (token or "").split(".")
        if len(parts) != 3:
            return False, None, "Token mal formé"
        h_b64, p_b64, sig = parts

        msg = f"{h_b64}.{p_b64}".encode("utf-8")
        expected = _sign(msg, secret or get_jwt_secret())
        if not hmac.compare_digest(expected, sig):
            return False, None, "Signature invalide"

        header = json.loads(_b64url_decode(h_b64).decode("utf-8"))
        if header.get("alg") != "HS256":
            return False, None, "Algorithme non supporté"

        payload = json.loads(_b64url_decode(p_b64).decode("utf-8"))
        exp = payload.get("exp")
        if exp is not None:
            try:
                if int(exp) < int(time.time()):
                    return False, None, "Token expiré"
            except Exception:
                return False, None, "Champ exp invalide"

        return True, payload, ""
    except Exception:
        return False, None, "Token invalide"


def make_access_token(user: Dict[str, Any], ttl_seconds: int = 24 * 3600) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user.get("id", "")),
        "name": user.get("name"),
        "role": str(user.get("role", "")),
        "modules": user.get("modules", []) or [],
        "iat": now,
        "exp": now + int(ttl_seconds),
    }
    return encode_jwt(payload)
