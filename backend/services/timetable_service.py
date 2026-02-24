"""Service de gestion basique des emplois du temps.

Contient TimetableService (CRUD) et get_timetable_for_formateur() pour compatibilité.
La logique d'impression PDF a été déplacée dans print_service.py.
"""
import json
import os
import tempfile
from typing import Dict, Any, List, Tuple
from pathlib import Path


class TimetableService:
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.timetable_path = os.path.join(data_dir, "timetable.json")

    def _load_sessions(self) -> List[Dict[str, Any]]:
        with open(self.timetable_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and "sessions" in data:
            return data["sessions"]
        return data

    def _save_sessions(self, sessions: List[Dict[str, Any]]) -> None:
        """Sauvegarde atomique des sessions en préservant la version et les métadonnées.

        Correctif : l'ancienne implémentation écrasait le champ 'version' en sauvegardant
        uniquement {"sessions": [...]}, ce qui cassait le versionnage optimiste de l'API.
        Maintenant on lit l'état courant, on met à jour uniquement les sessions, et on
        écrit de manière atomique (tmp + os.replace) pour éviter la corruption.
        """
        # Lire la structure courante pour préserver version et métadonnées
        try:
            with open(self.timetable_path, "r", encoding="utf-8") as f:
                current = json.load(f)
            if not isinstance(current, dict):
                current = {"version": 1}
        except Exception:
            current = {"version": 1}

        current["sessions"] = sessions

        # Écriture atomique (tmp file + os.replace)
        fd, tmp_path = tempfile.mkstemp(
            dir=os.path.dirname(self.timetable_path), suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(current, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.timetable_path)
        finally:
            try:
                os.remove(tmp_path)
            except FileNotFoundError:
                pass

    def _normalize_id(self, s: Dict[str, Any]) -> str:
        return s.get("id") or s.get("sessionId")

    def move(self, session_id: str, to_jour: str, to_creneau: int, to_salle: str) -> Tuple[bool, str, List[Dict[str, Any]]]:
        """Déplace une séance après validation des conflits.

        Note : En production, privilégier le chemin repo.atomic_update + validate_move
        (cf. /api/timetable/commands) qui garantit le versionnage optimiste.
        Cette méthode est conservée pour compatibilité interne.
        """
        sessions = self._load_sessions()

        target = None
        for s in sessions:
            if self._normalize_id(s) == session_id:
                target = s
                break
        if not target:
            return False, "Session introuvable", sessions

        moved = dict(target)
        moved["jour"] = str(to_jour or "").strip().lower()  # normalise à l'écriture
        moved["creneau"] = int(to_creneau)
        moved["salle"] = str(to_salle or "").strip()

        to_jour_n = str(to_jour or "").strip().lower()
        to_salle_n = str(to_salle or "").strip().lower()

        for s in sessions:
            if self._normalize_id(s) == session_id:
                continue
            s_jour_n = str(s.get("jour", "") or "").strip().lower()
            same_slot = (s_jour_n == to_jour_n and int(s.get("creneau", 0) or 0) == int(to_creneau))
            if not same_slot:
                continue

            if str(s.get("salle", "") or "").strip().lower() == to_salle_n:
                return False, "Conflit : la salle est déjà occupée sur ce créneau", sessions
            if str(s.get("formateur", "") or "").strip().lower() == str(target.get("formateur", "") or "").strip().lower():
                return False, "Conflit : le formateur est déjà occupé sur ce créneau", sessions
            if str(s.get("groupe", "") or "").strip().lower() == str(target.get("groupe", "") or "").strip().lower():
                return False, "Conflit : le groupe est déjà occupé sur ce créneau", sessions

        for i, s in enumerate(sessions):
            if self._normalize_id(s) == session_id:
                sessions[i] = moved
                break

        self._save_sessions(sessions)
        return True, "OK", sessions


# ----------------------------
# Helper pour rapports rapides (compatibilité)
# ----------------------------

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

def load_json(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)

def get_timetable_for_formateur(formateur: str):
    """Retourne l'emploi du temps d'un formateur (format rapide pour API).
    
    Pour la génération PDF, utiliser print_service.build_print_model() à la place.
    """
    timetable = load_json("timetable.json")
    config = load_json("config.json")

    sessions = [
        s for s in timetable["sessions"]
        if s["formateur"] == formateur
    ]

    return {
        "header": {
            "annee": "2025-2026",
            "efp": "CF Meknes – ISTAG BAB TIZIMI",
            "periode": "À partir du 19/01/2026",
            "formateur": formateur,
            "matricule": sessions[0]["formateur"] if sessions else "",
            "statut": "Permanent",
        },
        "jours": ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
        "creneaux": [
            "08h30 - 11h00",
            "11h00 - 13h30",
            "13h30 - 16h00",
            "16h00 - 18h30",
        ],
        "sessions": sessions,
    }
