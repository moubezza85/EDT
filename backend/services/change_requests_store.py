# services/change_requests_store.py
import json
import os
import tempfile
import threading
import time
import uuid
from typing import Any, Dict, List, Optional


def _now_iso() -> str:
    # ISO simple (sans timezone explicite) ; vous pouvez remplacer par datetime.utcnow().isoformat() + "Z"
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class ChangeRequestsStore:
    """
    Stockage fichier JSON: data/change_requests.json
    Format:
    {
      "requests": [
        {
          "id": "CR_...",
          "type": "MOVE" | "CHANGE_ROOM",
          "sessionId": "...",
          "teacherId": "...",
          "oldData": {"jour": "...", "creneau": 1, "salle": "S1"},
          "newData": {"jour": "...", "creneau": 2, "salle": "S2", "motif": "..."},
          "status": "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED",
          "submittedAt": "...",
          "decidedAt": "...",
          "decidedBy": "...",
          "decisionReason": "..."
        }
      ]
    }
    """

    def __init__(self, data_dir: str, filename: str = "change_requests.json"):
        self.path = os.path.join(data_dir, filename)
        self._lock = threading.Lock()

    # ------------- IO helpers -------------
    def _ensure_file(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        if not os.path.exists(self.path):
            self._atomic_write({"requests": []})

    def _atomic_write(self, data: Any) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(
            dir=os.path.dirname(self.path),
            prefix=os.path.basename(self.path),
            suffix=".tmp",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.path)
        finally:
            try:
                os.remove(tmp_path)
            except FileNotFoundError:
                pass

    def load(self) -> Dict[str, Any]:
        with self._lock:
            self._ensure_file()
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                # compat: si fichier était une liste
                return {"requests": data}
            if not isinstance(data, dict):
                return {"requests": []}
            data.setdefault("requests", [])
            if not isinstance(data["requests"], list):
                data["requests"] = []
            return data

    def save(self, data: Dict[str, Any]) -> None:
        with self._lock:
            data = data if isinstance(data, dict) else {"requests": []}
            data.setdefault("requests", [])
            self._atomic_write(data)

    # ------------- CRUD -------------
    def list(
        self,
        status: Optional[str] = None,
        teacher_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        data = self.load()
        items = data.get("requests", []) or []
        out = []
        for r in items:
            if status and str(r.get("status")) != status:
                continue
            if teacher_id and str(r.get("teacherId")) != str(teacher_id):
                continue
            if session_id and str(r.get("sessionId")) != str(session_id):
                continue
            out.append(r)
        # tri: plus récent d'abord
        out.sort(key=lambda x: str(x.get("submittedAt", "")), reverse=True)
        return out

    def get(self, request_id: str) -> Optional[Dict[str, Any]]:
        if not request_id:
            return None
        data = self.load()
        for r in data.get("requests", []) or []:
            if str(r.get("id")) == str(request_id):
                return r
        return None

    def upsert_pending_for_session(
        self,
        *,
        teacher_id: str,
        session_id: str,
        req_type: str,
        old_data: Dict[str, Any],
        new_data: Dict[str, Any],
        supersede_previous: bool = True,
    ) -> Dict[str, Any]:
        """
        Règle projet:
        - une seule demande PENDING par sessionId
        - si on repropose => on garde la dernière
        """
        with self._lock:
            self._ensure_file()
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                data = {"requests": data}
            if not isinstance(data, dict):
                data = {"requests": []}
            data.setdefault("requests", [])
            requests = data["requests"]

            # chercher une PENDING existante pour cette session
            existing_idx = None
            for i, r in enumerate(requests):
                if str(r.get("sessionId")) == str(session_id) and str(r.get("status")) == "PENDING":
                    existing_idx = i
                    break

            if existing_idx is not None:
                # soit on overwrite, soit on supersede et recréer
                if supersede_previous:
                    # conserver audit: marquer l'ancienne comme SUPERSEDED
                    old = dict(requests[existing_idx])
                    old["status"] = "SUPERSEDED"
                    old["decidedAt"] = _now_iso()
                    old["decidedBy"] = str(teacher_id)
                    old["decisionReason"] = "Superseded by a newer proposal"
                    requests[existing_idx] = old

                    new_req = {
                        "id": f"CR_{time.strftime('%Y%m%d')}_{uuid.uuid4().hex[:10]}",
                        "type": str(req_type),
                        "sessionId": str(session_id),
                        "teacherId": str(teacher_id),
                        "oldData": old_data or {},
                        "newData": new_data or {},
                        "status": "PENDING",
                        "submittedAt": _now_iso(),
                    }
                    requests.append(new_req)
                    data["requests"] = requests
                    self._atomic_write(data)
                    return new_req

                # overwrite direct (plus simple)
                r = dict(requests[existing_idx])
                r["type"] = str(req_type)
                r["teacherId"] = str(teacher_id)
                r["oldData"] = old_data or {}
                r["newData"] = new_data or {}
                r["status"] = "PENDING"
                r["submittedAt"] = _now_iso()
                # clear decision fields
                r.pop("decidedAt", None)
                r.pop("decidedBy", None)
                r.pop("decisionReason", None)
                requests[existing_idx] = r
                data["requests"] = requests
                self._atomic_write(data)
                return r

            # nouvelle demande
            new_req = {
                "id": f"CR_{time.strftime('%Y%m%d')}_{uuid.uuid4().hex[:10]}",
                "type": str(req_type),
                "sessionId": str(session_id),
                "teacherId": str(teacher_id),
                "oldData": old_data or {},
                "newData": new_data or {},
                "status": "PENDING",
                "submittedAt": _now_iso(),
            }
            requests.append(new_req)
            data["requests"] = requests
            self._atomic_write(data)
            return new_req

    def set_status(
        self,
        request_id: str,
        *,
        status: str,
        decided_by: str,
        reason: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            self._ensure_file()
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                data = {"requests": data}
            if not isinstance(data, dict):
                data = {"requests": []}
            data.setdefault("requests", [])
            requests = data["requests"]

            for i, r in enumerate(requests):
                if str(r.get("id")) == str(request_id):
                    rr = dict(r)
                    rr["status"] = str(status)
                    rr["decidedAt"] = _now_iso()
                    rr["decidedBy"] = str(decided_by)
                    if reason is not None:
                        rr["decisionReason"] = str(reason)
                    requests[i] = rr
                    data["requests"] = requests
                    self._atomic_write(data)
                    return rr

            return None
