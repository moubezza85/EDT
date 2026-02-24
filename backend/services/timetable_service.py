import json
import os
import tempfile
from typing import Dict, Any, List, Tuple


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

        Note\u00a0: En production, privilégier le chemin repo.atomic_update + validate_move
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
                return False, "Conflit\u00a0: la salle est d\u00e9j\u00e0 occup\u00e9e sur ce cr\u00e9neau", sessions
            if str(s.get("formateur", "") or "").strip().lower() == str(target.get("formateur", "") or "").strip().lower():
                return False, "Conflit\u00a0: le formateur est d\u00e9j\u00e0 occup\u00e9 sur ce cr\u00e9neau", sessions
            if str(s.get("groupe", "") or "").strip().lower() == str(target.get("groupe", "") or "").strip().lower():
                return False, "Conflit\u00a0: le groupe est d\u00e9j\u00e0 occup\u00e9 sur ce cr\u00e9neau", sessions

        for i, s in enumerate(sessions):
            if self._normalize_id(s) == session_id:
                sessions[i] = moved
                break

        self._save_sessions(sessions)
        return True, "OK", sessions


import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

def load_json(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)

def get_timetable_for_formateur(formateur: str):
    timetable = load_json("timetable.json")
    config = load_json("config.json")

    sessions = [
        s for s in timetable["sessions"]
        if s["formateur"] == formateur
    ]

    return {
        "header": {
            "annee": "2025-2026",
            "efp": "CF Meknes \u2013 ISTAG BAB TIZIMI",
            "periode": "\u00c0 partir du 19/01/2026",
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

### printing to PDF
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

HOURS_PER_SLOT = 2.5  # confirmé par toi : Créneau × 2,5

# ----------------------------
# Helpers de lecture JSON
# ----------------------------

def _load_json(filename: str) -> Any:
    path = DATA_DIR / filename
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_config() -> Dict[str, Any]:
    return _load_json("config.json")

def load_catalog() -> Dict[str, Any]:
    return _load_json("catalog.json")

def load_timetable() -> Dict[str, Any]:
    return _load_json("timetable.json")


# ----------------------------
# Résolution identité formateur
# catalog.json: trainers: [{id, name}]
# ----------------------------
def _norm_str(x: Any) -> str:
    return str(x or "").strip()

def expand_group_ids(group_id: str, catalog: Dict[str, Any]) -> List[str]:
    """
    Si group_id est une fusion (ex: DEV101_DEV102), retourne les groupes réels (DEV101, DEV102).
    Sinon retourne [group_id].
    """
    gid = _norm_str(group_id)
    if not gid:
        return []

    # Fusion ?
    for f in (catalog.get("onlineFusions", []) or []):
        fid = _norm_str((f or {}).get("id"))
        if fid and fid.lower() == gid.lower():
            groups = (f or {}).get("groupes", []) or []
            out = [_norm_str(g) for g in groups if _norm_str(g)]
            return out if out else [gid]

    return [gid]

def is_online_session(session: Dict[str, Any]) -> bool:
    # Convention “simple” que vous utilisez : salle = TEAMS
    return _norm_str(session.get("salle")).upper() == "TEAMS"


@dataclass(frozen=True)
class TrainerIdentity:
    id: str
    name: str

def resolve_trainer_identity(trainer_key: str, catalog: Dict[str, Any]) -> Optional[TrainerIdentity]:
    """
    trainer_key peut être:
      - l'id (ex: "14017")
      - le name (ex: "Mohamed OUBEZZA")
    Retourne {id, name} si trouvé, sinon None.
    """
    trainers = catalog.get("teachers", []) or []
    trainer_key_norm = (trainer_key or "").strip()

    # Match par id
    for t in trainers:
        if str(t.get("id", "")).strip() == trainer_key_norm:
            return TrainerIdentity(id=str(t.get("id")), name=str(t.get("name", "")).strip())

    # Match par name
    for t in trainers:
        if str(t.get("name", "")).strip().lower() == trainer_key_norm.lower():
            return TrainerIdentity(id=str(t.get("id", "")).strip(), name=str(t.get("name", "")).strip())

    return None


# ----------------------------
# Normalisation config (jours / creneaux / labels)
# ----------------------------

def _normalize_day_key(day: str) -> str:
    return (day or "").strip().lower()

def get_days_from_config(cfg: Dict[str, Any]) -> List[str]:
    jours = cfg.get("jours", []) or []
    return [_normalize_day_key(j) for j in jours if str(j).strip()]

def get_slots_from_config(cfg: Dict[str, Any]) -> List[int]:
    slots = cfg.get("creneaux", []) or []
    out: List[int] = []
    for s in slots:
        try:
            out.append(int(s))
        except Exception:
            pass
    return out

def default_slot_labels(slots: List[int]) -> Dict[int, str]:
    mapping = {
        1: "08h30 - 11h00",
        2: "11h00 - 13h30",
        3: "13h30 - 16h00",
        4: "16h00 - 18h30",
    }
    return {s: mapping.get(s, f"Créneau {s}") for s in slots}


# ----------------------------
# Construction de grille (jours × créneaux)
# ----------------------------

def _index_sessions_by_cell(sessions: List[Dict[str, Any]]) -> Dict[Tuple[str, int], Dict[str, Any]]:
    idx: Dict[Tuple[str, int], Dict[str, Any]] = {}
    for s in sessions:
        day = _normalize_day_key(str(s.get("jour", "")))
        try:
            slot = int(s.get("creneau"))
        except Exception:
            continue
        if not day:
            continue
        idx[(day, slot)] = s
    return idx

def _count_occupied_slots(grid: Dict[str, Dict[int, Optional[Dict[str, Any]]]]) -> int:
    count = 0
    for _, row in grid.items():
        for _, cell in row.items():
            if cell is not None:
                count += 1
    return count


# ----------------------------
# Sélection sessions par vue
# ----------------------------

def filter_sessions_for_formateur(all_sessions: List[Dict[str, Any]], trainer_key: str, catalog: Dict[str, Any]) -> List[Dict[str, Any]]:
    ident = resolve_trainer_identity(trainer_key, catalog)
    key_norm = (trainer_key or "").strip().lower()

    out: List[Dict[str, Any]] = []
    for s in all_sessions:
        f = str(s.get("formateur", "")).strip()
        if not f:
            continue
        f_norm = f.lower()

        if ident:
            if f == ident.id or f_norm == ident.id.lower() or f_norm == ident.name.lower():
                out.append(s)
        else:
            if f_norm == key_norm:
                out.append(s)
    return out

def filter_sessions_for_groupe(
    all_sessions: List[Dict[str, Any]],
    groupe: str,
    catalog: Dict[str, Any],
) -> List[Dict[str, Any]]:
    g_norm = _norm_str(groupe).lower()
    if not g_norm:
        return []

    out: List[Dict[str, Any]] = []
    for s in all_sessions:
        sid = _norm_str(s.get("groupe"))
        if not sid:
            continue
        expanded = [x.lower() for x in expand_group_ids(sid, catalog)]
        if g_norm in expanded:
            out.append(s)

    return out


def filter_sessions_for_salle(all_sessions: List[Dict[str, Any]], salle: str) -> List[Dict[str, Any]]:
    r_norm = (salle or "").strip().lower()
    return [s for s in all_sessions if str(s.get("salle", "")).strip().lower() == r_norm]


# ----------------------------
# Format cellule selon vue
# ----------------------------

def format_cell_text(view: str, session: Dict[str, Any], catalog: Dict[str, Any]) -> List[str]:
    module = str(session.get("module", "")).strip()
    groupe = str(session.get("groupe", "")).strip()
    salle = str(session.get("salle", "")).strip()

    formateur_raw = str(session.get("formateur", "")).strip()
    ident = resolve_trainer_identity(formateur_raw, catalog)
    formateur = ident.name if ident and ident.name else formateur_raw

    view = (view or "").strip().lower()

    if view == "formateur":
        return [module, groupe, salle]
    if view == "groupe":
        return [module, formateur, salle]
    if view == "salle":
        return [module, groupe, formateur]

    return [module, groupe, salle]


# ----------------------------
# Modèle d'impression principal
# ----------------------------

def build_print_model(view: str, entity_key: str) -> Dict[str, Any]:
    cfg = load_config()
    catalog = load_catalog()
    timetable = load_timetable()

    days = get_days_from_config(cfg)
    slots = get_slots_from_config(cfg)
    slot_labels = default_slot_labels(slots)

    all_sessions = (timetable.get("sessions", []) or [])

    view_norm = (view or "").strip().lower()
    if view_norm == "formateur":
        sessions = filter_sessions_for_formateur(all_sessions, entity_key, catalog)
        ident = resolve_trainer_identity(entity_key, catalog) or resolve_trainer_identity(str(sessions[0].get("formateur", "")) if sessions else "", catalog)
        header_identity = {
            "type": "formateur",
            "id": ident.id if ident else str(entity_key),
            "name": ident.name if ident else str(entity_key),
            "matricule": ident.id if ident else str(entity_key),
        }
    elif view_norm == "groupe":
        sessions = filter_sessions_for_groupe(all_sessions, entity_key, catalog)
        header_identity = {
            "type": "groupe",
            "id": str(entity_key),
            "name": str(entity_key),
            "matricule": "",
        }
    elif view_norm == "salle":
        sessions = filter_sessions_for_salle(all_sessions, entity_key)
        header_identity = {
            "type": "salle",
            "id": str(entity_key),
            "name": str(entity_key),
            "matricule": "",
        }
    else:
        raise ValueError("view must be one of: formateur, groupe, salle")

    idx = _index_sessions_by_cell(sessions)

    grid: Dict[str, Dict[int, Optional[Dict[str, Any]]]] = {}
    for d in days:
        grid[d] = {}
        for s in slots:
            raw = idx.get((d, s))
            if raw is None:
                grid[d][s] = None
            else:
                grid[d][s] = {
                    "lines": format_cell_text(view_norm, raw, catalog),
                    "raw": raw,
                }

    occupied_slots = _count_occupied_slots(grid)
    total_hours = occupied_slots * HOURS_PER_SLOT

    header = {
        "title": "EMPLOI DU TEMPS",
        "view": view_norm,
        "identity": header_identity,
        "week_label": "Semaine courante",
        "total_slots": occupied_slots,
        "hours_per_slot": HOURS_PER_SLOT,
        "total_hours": total_hours,
    }

    return {
        "header": header,
        "days": days,
        "slots": slots,
        "slot_labels": slot_labels,
        "grid": grid,
    }


# ----------------------------
# Listes pour génération globale (ZIP)
# ----------------------------

def list_all_trainers(catalog: Optional[Dict[str, Any]] = None) -> List[TrainerIdentity]:
    if catalog is None:
        catalog = load_catalog()
    trainers = catalog.get("teachers", []) or []
    out: List[TrainerIdentity] = []
    for t in trainers:
        tid = str(t.get("id", "")).strip()
        name = str(t.get("name", "")).strip()
        if tid and name:
            out.append(TrainerIdentity(id=tid, name=name))
    return out

def list_all_groupes(catalog: Optional[Dict[str, Any]] = None) -> List[str]:
    if catalog is None:
        catalog = load_catalog()

    groups = catalog.get("groups", []) or []
    vals = [str(g).strip() for g in groups if str(g).strip()]
    return sorted(set(vals))


def list_all_salles(cfg: Optional[Dict[str, Any]] = None) -> List[str]:
    if cfg is None:
        cfg = load_config()
    salles = cfg.get("salles", []) or []

    vals: List[str] = []
    for s in salles:
        if isinstance(s, dict):
            rid = str(s.get("id", "")).strip()
            if rid:
                vals.append(rid)
        else:
            rid = str(s).strip()
            if rid:
                vals.append(rid)

    seen = set()
    out = []
    for x in vals:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out
