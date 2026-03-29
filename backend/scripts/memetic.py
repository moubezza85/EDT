"""
memetic_algorithm.py

Algorithme mémétique pour l'emploi du temps:
- GA (DEAP) + Hill Climbing (recherche locale)
- Entrée: config.json, hard.json, soft.json, seances.json, solution_cp.json
- Sortie: solution_finale.json

CORRECTIONS IMPORTANTES:
- Les individus DEAP doivent rester des creator.Individual (avec .fitness)
- mate() et mutate() doivent modifier IN-PLACE et retourner les individus
- toolbox.clone = deepcopy (clone correct)
- crossover sûr "par séance" (évite doublons/manquants)
- repair systématique après crossover/mutation/HC
"""

from __future__ import annotations

import copy
import json
import logging
import random
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from deap import base, creator, tools


# =============================================================================
# Config
# =============================================================================

@dataclass
class MemeticConfig:
    # GA
    population_size: int = 100
    generations: int = 500
    mutation_rate: float = 0.3           # proba d'appliquer mutation à un individu (boucle GA)
    crossover_rate: float = 0.7
    tournament_size: int = 3
    elite_size: int = 5

    # Hill Climbing
    hc_frequency: int = 10
    hc_num_individuals: int = 10
    hc_iterations: int = 500

    # Mutation interne (tente de trouver un slot valide)
    max_mutation_attempts: int = 50

    # Mutation chaîne : probabilité d'utiliser une permutation circulaire à 3 séances
    chain_mutation_rate: float = 0.3

    # Repair
    repair_attempts_per_invalid: int = 250

    # Early stop
    early_stopping: bool = True
    patience: int = 50                   # réduit de 150 → 50 pour éviter le temps mort

    # Perturbation : si stall > seuil, réinjecter de la diversité dans la population
    perturbation_threshold: int = 30     # stall générations avant perturbation
    perturbation_ratio: float = 0.25     # fraction de la population à remplacer

    # Logs
    verbose: bool = True
    log_interval: int = 10
    score_breakdown_interval: int = 50   # afficher le détail du score tous les N génération


# =============================================================================
# Utilitaires I/O
# =============================================================================

def _read_json_from_anywhere(filename: str, search_dirs: List[Path]) -> Any:
    for d in search_dirs:
        p = d / filename
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
    return None


def _write_json(path: Path, data: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# =============================================================================
# Hard validator
# =============================================================================

class HardConstraintValidator:
    """
    Valide et teste la faisabilité hard (conflits + indispos + compat type salle).
    Assure aussi la normalisation jour/salle.
    """

    def __init__(self, config_data: Dict, hard_constraints: Dict, seances_meta: List[Dict]):
        self.config_data = config_data
        self.hard_constraints = hard_constraints or {}
        self.seances_meta = seances_meta or []

        self.jours: List[str] = list(config_data.get("jours", []))
        self.creneaux: List[int] = list(config_data.get("creneaux", []))

        # Normalisation jours
        self.jour_canon = {str(j).lower(): j for j in self.jours}

        # Salles: canonical = id (si présent) sinon name
        self.salle_alias_to_canon: Dict[str, str] = {}
        self.salles_canon: List[str] = []
        self.salles_type_map: Dict[str, str] = {}

        for s in config_data.get("salles", []):
            sid = s.get("id")
            sname = s.get("name")
            canon = sid or sname
            if not canon:
                continue
            canon = str(canon)
            self.salles_canon.append(canon)

            # alias -> canon
            self.salle_alias_to_canon[canon] = canon
            if sid is not None:
                self.salle_alias_to_canon[str(sid)] = canon
            if sname is not None:
                self.salle_alias_to_canon[str(sname)] = canon

            self.salles_type_map[canon] = str(s.get("type", "Cours") or "Cours")

        # Meta map (base_id -> meta)
        self.meta_map = {str(s.get("id")): s for s in self.seances_meta if s.get("id") is not None}

        # Indisponibilités précalculées: (id, jourLower, creneau)
        self.unavailable = {"formateur": set(), "groupe": set(), "salle": set()}
        self._precompute_unavailability()

    def _precompute_unavailability(self):
        for indispo in self.hard_constraints.get("indisponibilites", []):
            t = indispo.get("type")
            target = str(indispo.get("id"))
            jour = str(indispo.get("jour", "")).lower()
            crs = indispo.get("creneaux", [indispo.get("creneau")])
            crs = [x for x in crs if x is not None]
            for c in crs:
                self.unavailable.get(t, set()).add((target, jour, int(c)))

    def canonical_jour(self, jour: str) -> str:
        if jour is None:
            return jour
        return self.jour_canon.get(str(jour).lower(), str(jour))

    def canonical_salle(self, salle: str) -> str:
        if salle is None:
            return salle
        return self.salle_alias_to_canon.get(str(salle), str(salle))

    def normalize_course(self, cours: Dict[str, Any]) -> Dict[str, Any]:
        c = dict(cours)
        c["jour"] = self.canonical_jour(c.get("jour"))
        c["salle"] = self.canonical_salle(c.get("salle"))
        if c.get("creneau") is not None:
            c["creneau"] = int(c["creneau"])
        return c

    @staticmethod
    def _base_id(seance_id: str) -> str:
        s = str(seance_id)
        if "_" in s:
            left, right = s.rsplit("_", 1)
            if right.isdigit():
                return left
        return s

    def _type_required_for_seance(self, seance_id: str) -> str:
        base = self._base_id(seance_id)
        meta = self.meta_map.get(base, {})
        return str(meta.get("type_salle", "Cours") or "Cours")

    def is_slot_available(
        self,
        cours: Dict[str, Any],
        new_jour: str,
        new_creneau: int,
        new_salle: str,
        individual: List[Dict[str, Any]],
        cours_idx: int = -1,
    ) -> bool:
        """
        Vérifie si déplacer 'cours' vers (new_jour,new_creneau,new_salle) respecte hard:
        - indispos prof/groupe/salle
        - pas de conflits prof/groupe/salle
        - compatibilité type salle
        """
        cours = self.normalize_course(cours)

        prof = str(cours.get("formateur"))
        grp = str(cours.get("groupe"))
        seance_id = str(cours.get("seance"))

        j = self.canonical_jour(new_jour)
        c = int(new_creneau)
        r = self.canonical_salle(new_salle)

        j_lower = str(j).lower()

        # indispos
        if (prof, j_lower, c) in self.unavailable["formateur"]:
            return False
        if (grp, j_lower, c) in self.unavailable["groupe"]:
            return False
        if (r, j_lower, c) in self.unavailable["salle"]:
            return False

        # conflits
        for i, other0 in enumerate(individual):
            if cours_idx >= 0 and i == cours_idx:
                continue
            other = self.normalize_course(other0)

            if str(other.get("seance")) == seance_id:
                continue

            if other.get("jour") == j and int(other.get("creneau")) == c:
                if str(other.get("formateur")) == prof:
                    return False
                if str(other.get("groupe")) == grp:
                    return False
                if self.canonical_salle(other.get("salle")) == r:
                    return False

        # compat salle
        type_req = self._type_required_for_seance(seance_id)
        type_room = self.salles_type_map.get(r, "Cours")

        if type_req.strip().lower() == "cours":
            return True
        return type_req.strip().lower() == type_room.strip().lower()

    def validate_structure(
        self, individual: List[Dict[str, Any]], expected_seances: Set[str]
    ) -> Tuple[bool, List[str]]:
        errors: List[str] = []
        seances = [c.get("seance") for c in individual]
        if len(seances) != len(set(seances)):
            errors.append("Doublons de 'seance' détectés")
        if set(seances) != expected_seances:
            missing = expected_seances - set(seances)
            extra = set(seances) - expected_seances
            if missing:
                errors.append(f"Séances manquantes: {len(missing)}")
            if extra:
                errors.append(f"Séances en trop/inconnues: {len(extra)}")
        return (len(errors) == 0), errors

    def validate_hard(
        self, individual: List[Dict[str, Any]]
    ) -> Tuple[bool, List[str]]:
        errors: List[str] = []
        occ_prof = set()
        occ_grp = set()
        occ_room = set()

        for c0 in individual:
            c = self.normalize_course(c0)
            j = c.get("jour")
            cr = c.get("creneau")
            r = self.canonical_salle(c.get("salle"))
            prof = str(c.get("formateur"))
            grp = str(c.get("groupe"))
            seance_id = str(c.get("seance"))

            if j is None or cr is None or r is None:
                errors.append("Cours incomplet (jour/creneau/salle manquant)")
                continue

            j_lower = str(j).lower()
            cr = int(cr)

            # indispos
            if (prof, j_lower, cr) in self.unavailable["formateur"]:
                errors.append(f"Indispo formateur {prof} {j} {cr}")
            if (grp, j_lower, cr) in self.unavailable["groupe"]:
                errors.append(f"Indispo groupe {grp} {j} {cr}")
            if (r, j_lower, cr) in self.unavailable["salle"]:
                errors.append(f"Indispo salle {r} {j} {cr}")

            # conflits
            kp = (prof, j, cr)
            kg = (grp, j, cr)
            kr = (r, j, cr)

            if kp in occ_prof:
                errors.append(f"Conflit prof {prof} {j} {cr}")
            else:
                occ_prof.add(kp)

            if kg in occ_grp:
                errors.append(f"Conflit groupe {grp} {j} {cr}")
            else:
                occ_grp.add(kg)

            if kr in occ_room:
                errors.append(f"Conflit salle {r} {j} {cr}")
            else:
                occ_room.add(kr)

            # compat type salle
            type_req = self._type_required_for_seance(seance_id)
            type_room = self.salles_type_map.get(r, "Cours")
            if type_req.strip().lower() != "cours":
                if type_req.strip().lower() != type_room.strip().lower():
                    errors.append(f"Incompat salle seance={seance_id} req={type_req} got={type_room}")

        return (len(errors) == 0), errors


# =============================================================================
# Soft evaluator
# =============================================================================

class SoftConstraintEvaluator:
    def __init__(self, soft_constraints: List[Dict[str, Any]]):
        self.soft_constraints = soft_constraints or []

    @staticmethod
    def _preprocess(individual: List[Dict[str, Any]]) -> Tuple[Dict, Dict]:
        p_plan: Dict[str, Dict[str, List[int]]] = {}
        g_plan: Dict[str, Dict[str, List[int]]] = {}
        for c in individual:
            p = str(c["formateur"])
            g = str(c["groupe"])
            j = c["jour"]
            cr = int(c["creneau"])
            p_plan.setdefault(p, {}).setdefault(j, []).append(cr)
            g_plan.setdefault(g, {}).setdefault(j, []).append(cr)
        return p_plan, g_plan

    @staticmethod
    def _holes(plan: Dict[str, Dict[str, List[int]]]) -> int:
        pen = 0
        for ent in plan:
            for j in plan[ent]:
                slots = sorted(plan[ent][j])
                for i in range(len(slots) - 1):
                    if slots[i + 1] - slots[i] > 1:
                        pen += 1
        return pen

    @staticmethod
    def _daily_overload(plan: Dict[str, Dict[str, List[int]]], max_par_jour: int) -> int:
        pen = 0
        for ent in plan:
            for j in plan[ent]:
                n = len(plan[ent][j])
                if n > max_par_jour:
                    pen += (n - max_par_jour)
        return pen

    @staticmethod
    def _min_char_groupe(g_plan: Dict[str, Dict[str, List[int]]]) -> int:
        pen = 0
        for g in g_plan:
            for j in g_plan[g]:
                if len(g_plan[g][j]) == 1:
                    pen += 1
        return pen

    @staticmethod
    def _pref_salle(individual: List[Dict[str, Any]], params: Dict[str, Any]) -> int:
        prefs = (params or {}).get("preferences", {}) or {}
        pen = 0
        for c in individual:
            p = str(c["formateur"])
            pref = prefs.get(p)
            if pref and str(c["salle"]) != str(pref):
                pen += 1
        return pen

    @staticmethod
    def _pref_creneaux(individual: List[Dict[str, Any]], params: Dict[str, Any]) -> int:
        prefs = (params or {}).get("preferences", {}) or {}
        if not prefs:
            return 0

        allowed: Dict[str, Set[Tuple[str, int]]] = {}
        for prof, rules in prefs.items():
            s = set()
            for r in rules:
                j = str(r["jour"]).lower()
                for cr in r["creneaux"]:
                    s.add((j, int(cr)))
            allowed[str(prof)] = s

        pen = 0
        for c in individual:
            p = str(c["formateur"])
            if p in allowed:
                k = (str(c["jour"]).lower(), int(c["creneau"]))
                if k not in allowed[p]:
                    pen += 1
        return pen

    def _compute_penalties(self, individual: List[Dict[str, Any]]) -> Dict[str, float]:
        """Calcule le détail des pénalités par contrainte."""
        p_plan, g_plan = self._preprocess(individual)
        breakdown: Dict[str, float] = {}

        for sc in self.soft_constraints:
            if not sc.get("active", True):
                continue
            ctype = sc.get("type")
            sc_id = sc.get("id", ctype)
            poids = float(sc.get("poids", 1))
            params = sc.get("params", {}) or {}

            pen = 0
            if ctype == "trous_groupe":
                pen = self._holes(g_plan)
            elif ctype == "trous_formateur":
                pen = self._holes(p_plan)
            elif ctype == "charge_journaliere":
                pen = self._daily_overload(g_plan, int(params.get("max_par_jour", params.get("max", 3))))
            elif ctype == "charge_journaliere_for":
                pen = self._daily_overload(p_plan, int(params.get("max_par_jour", params.get("max", 3))))
            elif ctype == "minChar":
                pen = self._min_char_groupe(g_plan)
            elif ctype == "preference_salle":
                pen = self._pref_salle(individual, params)
            elif ctype == "preference_creneaux":
                pen = self._pref_creneaux(individual, params)

            breakdown[f"{sc_id}({ctype})"] = poids * float(pen)

        return breakdown

    def evaluate(self, individual: List[Dict[str, Any]]) -> float:
        return float(sum(self._compute_penalties(individual).values()))

    def evaluate_with_breakdown(self, individual: List[Dict[str, Any]]) -> Tuple[float, Dict[str, float]]:
        """Retourne le score total ET le détail par contrainte."""
        breakdown = self._compute_penalties(individual)
        return float(sum(breakdown.values())), breakdown

    def get_hot_sessions(self, individual: List[Dict[str, Any]]) -> List[str]:
        """
        Retourne les IDs de séances appartenant aux entités (groupes/formateurs)
        ayant le plus de trous → à cibler en priorité dans le HC.
        """
        p_plan, g_plan = self._preprocess(individual)

        entity_holes: Dict[str, int] = {}
        for plan in (p_plan, g_plan):
            for ent in plan:
                holes = 0
                for j in plan[ent]:
                    slots = sorted(plan[ent][j])
                    for i in range(len(slots) - 1):
                        if slots[i + 1] - slots[i] > 1:
                            holes += 1
                if holes > 0:
                    entity_holes[ent] = entity_holes.get(ent, 0) + holes

        if not entity_holes:
            return []

        # top 5 entités les plus pénalisées
        top_entities = set(
            k for k, v in sorted(entity_holes.items(), key=lambda x: -x[1])[:5]
        )

        return [
            c["seance"] for c in individual
            if str(c.get("formateur")) in top_entities or str(c.get("groupe")) in top_entities
        ]


# =============================================================================
# Repair engine
# =============================================================================

class RepairEngine:
    """
    - Assure 1 seul gène par séance (pas de doublons, pas de manquants)
    - Corrige les slots invalides (conflits/indispos/compat) en tentant des placements aléatoires
    - Fallback sur la base CP pour une séance si impossible
    """

    def __init__(
        self,
        validator: HardConstraintValidator,
        base_solution: List[Dict[str, Any]],
        seance_order: List[str],
        cfg: MemeticConfig,
    ):
        self.validator = validator
        self.cfg = cfg
        self.base_by_seance = {c["seance"]: validator.normalize_course(c) for c in base_solution}
        self.seance_order = list(seance_order)
        self.expected_seances = set(self.seance_order)

        self.jours = validator.jours[:]
        self.creneaux = validator.creneaux[:]
        self.salles = validator.salles_canon[:]

    def _rand_slot(self) -> Tuple[str, int, str]:
        return (
            random.choice(self.jours),
            int(random.choice(self.creneaux)),
            random.choice(self.salles),
        )

    def repair(self, individual: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # normaliser + garder 1 occurrence
        by_seance: Dict[str, Dict[str, Any]] = {}
        for c0 in individual:
            c = self.validator.normalize_course(c0)
            sid = c.get("seance")
            if sid is None:
                continue
            if sid not in by_seance:
                by_seance[sid] = c

        # ajouter manquants depuis base
        for sid in self.expected_seances:
            if sid not in by_seance and sid in self.base_by_seance:
                by_seance[sid] = dict(self.base_by_seance[sid])

        # reconstruire dans ordre
        repaired = [dict(by_seance[sid]) for sid in self.seance_order if sid in by_seance]

        # corriger slots invalides (passe simple)
        repaired = self._fix_invalid_slots(repaired)

        # validation finale: si encore mauvais => fallback CP complet
        ok_struct, _ = self.validator.validate_structure(repaired, self.expected_seances)
        ok_hard, _ = self.validator.validate_hard(repaired)
        if not (ok_struct and ok_hard):
            repaired = [dict(self.base_by_seance[sid]) for sid in self.seance_order if sid in self.base_by_seance]

        return repaired

    def _fix_invalid_slots(self, individual: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        ind = [self.validator.normalize_course(c) for c in individual]

        for idx in range(len(ind)):
            cours = ind[idx]
            if self.validator.is_slot_available(cours, cours["jour"], cours["creneau"], cours["salle"], ind, idx):
                continue

            moved = False
            for _ in range(self.cfg.repair_attempts_per_invalid):
                nj, nc, ns = self._rand_slot()
                if self.validator.is_slot_available(cours, nj, nc, ns, ind, idx):
                    ind[idx] = {**cours, "jour": self.validator.canonical_jour(nj), "creneau": int(nc), "salle": self.validator.canonical_salle(ns)}
                    moved = True
                    break

            if not moved:
                sid = cours["seance"]
                if sid in self.base_by_seance:
                    ind[idx] = dict(self.base_by_seance[sid])

        return ind


# =============================================================================
# Local search (Hill Climbing)
# =============================================================================

class LocalSearchEngine:
    def __init__(self, validator: HardConstraintValidator, evaluator: SoftConstraintEvaluator, cfg: MemeticConfig):
        self.validator = validator
        self.evaluator = evaluator
        self.cfg = cfg
        self.jours = validator.jours[:]
        self.creneaux = validator.creneaux[:]
        self.salles = validator.salles_canon[:]

    def hill_climb(self, individual: List[Dict[str, Any]], max_iterations: int) -> List[Dict[str, Any]]:
        """
        Hill climbing amélioré avec :
        - Phase 1 : recherche ciblée sur les séances "chaudes" (entités avec trous)
        - Phase 2 : recherche globale classique
        - Chain swap : permutation circulaire de 3 séances pour casser les plateaux
        """
        cur = [self.validator.normalize_course(c) for c in individual]
        cur_score = self.evaluator.evaluate(cur)

        no_imp = 0
        max_no_imp = max(50, max_iterations // 4)

        for iteration in range(max_iterations):
            if no_imp >= max_no_imp:
                break

            improved = False

            # -----------------------------------------------------------------
            # Phase 1 : cibler les séances des entités les plus pénalisées
            # (exécuté 1 itération sur 3 pour alterner avec la phase globale)
            # -----------------------------------------------------------------
            if iteration % 3 == 0:
                hot_ids = set(self.evaluator.get_hot_sessions(cur))
                hot_indices = [i for i, c in enumerate(cur) if c["seance"] in hot_ids]
                if hot_indices:
                    random.shuffle(hot_indices)
                    for idx in hot_indices[:min(15, len(hot_indices))]:
                        c = cur[idx]
                        best_move = None
                        best_delta = 0.0

                        for _k in range(15):  # plus d'essais pour les séances hot
                            nj = random.choice(self.jours)
                            nc = int(random.choice(self.creneaux))
                            ns = random.choice(self.salles)

                            if self.validator.is_slot_available(c, nj, nc, ns, cur, idx):
                                neighbor = [x.copy() for x in cur]
                                neighbor[idx] = {
                                    **c,
                                    "jour": self.validator.canonical_jour(nj),
                                    "creneau": int(nc),
                                    "salle": self.validator.canonical_salle(ns),
                                }
                                new_score = self.evaluator.evaluate(neighbor)
                                delta = new_score - cur_score
                                if delta < best_delta:
                                    best_delta = delta
                                    best_move = (nj, nc, ns)

                        if best_move and best_delta < 0:
                            nj, nc, ns = best_move
                            cur[idx] = {
                                **c,
                                "jour": self.validator.canonical_jour(nj),
                                "creneau": int(nc),
                                "salle": self.validator.canonical_salle(ns),
                            }
                            cur_score += best_delta
                            improved = True
                            no_imp = 0
                            break

            # -----------------------------------------------------------------
            # Phase 2 : recherche globale classique (swap simple)
            # -----------------------------------------------------------------
            if not improved:
                indices = list(range(len(cur)))
                random.shuffle(indices)

                for idx in indices[:min(20, len(indices))]:
                    c = cur[idx]
                    best_move = None
                    best_delta = 0.0

                    for _k in range(10):
                        nj = random.choice(self.jours)
                        nc = int(random.choice(self.creneaux))
                        ns = random.choice(self.salles)

                        if self.validator.is_slot_available(c, nj, nc, ns, cur, idx):
                            neighbor = [x.copy() for x in cur]
                            neighbor[idx] = {
                                **c,
                                "jour": self.validator.canonical_jour(nj),
                                "creneau": int(nc),
                                "salle": self.validator.canonical_salle(ns),
                            }
                            new_score = self.evaluator.evaluate(neighbor)
                            delta = new_score - cur_score
                            if delta < best_delta:
                                best_delta = delta
                                best_move = (nj, nc, ns)

                    if best_move and best_delta < 0:
                        nj, nc, ns = best_move
                        cur[idx] = {
                            **c,
                            "jour": self.validator.canonical_jour(nj),
                            "creneau": int(nc),
                            "salle": self.validator.canonical_salle(ns),
                        }
                        cur_score += best_delta
                        improved = True
                        no_imp = 0
                        break

            # -----------------------------------------------------------------
            # Phase 3 : chain swap (permutation circulaire de 3 séances)
            # Exécuté quand les swaps simples ne trouvent plus rien (no_imp > 5)
            # -----------------------------------------------------------------
            if not improved and no_imp > 5 and len(cur) >= 3:
                improved = self._chain_swap(cur, cur_score)
                if improved:
                    cur_score = self.evaluator.evaluate(cur)
                    no_imp = 0

            if not improved:
                no_imp += 1

        return cur

    def _chain_swap(self, cur: List[Dict[str, Any]], cur_score: float) -> bool:
        """
        Permutation circulaire des créneaux de 3 séances choisies aléatoirement :
        A prend le slot de B, B prend le slot de C, C prend le slot de A.
        Permet de sortir des plateaux où les swaps simples échouent.
        Modifie `cur` IN-PLACE. Retourne True si amélioration trouvée.
        """
        for _ in range(8):  # 8 tentatives de chain swap par appel
            idxs = random.sample(range(len(cur)), 3)
            a_idx, b_idx, c_idx = idxs
            a, b, c = cur[a_idx], cur[b_idx], cur[c_idx]

            # Candidat : A→slot_B, B→slot_C, C→slot_A
            a_new = {**a, "jour": b["jour"], "creneau": b["creneau"], "salle": b["salle"]}
            b_new = {**b, "jour": c["jour"], "creneau": c["creneau"], "salle": c["salle"]}
            c_new = {**c, "jour": a["jour"], "creneau": a["creneau"], "salle": a["salle"]}

            neighbor = [x.copy() for x in cur]
            neighbor[a_idx] = a_new
            neighbor[b_idx] = b_new
            neighbor[c_idx] = c_new

            # Vérification hard constraints pour les 3 séances modifiées
            a_ok = self.validator.is_slot_available(a, b["jour"], b["creneau"], b["salle"], neighbor, a_idx)
            b_ok = self.validator.is_slot_available(b, c["jour"], c["creneau"], c["salle"], neighbor, b_idx)
            c_ok = self.validator.is_slot_available(c, a["jour"], a["creneau"], a["salle"], neighbor, c_idx)

            if a_ok and b_ok and c_ok:
                new_score = self.evaluator.evaluate(neighbor)
                if new_score < cur_score:
                    cur[a_idx] = a_new
                    cur[b_idx] = b_new
                    cur[c_idx] = c_new
                    return True

        return False


# =============================================================================
# Memetic Optimizer
# =============================================================================

class MemeticOptimizer:
    def __init__(self, cfg: MemeticConfig, data_dir: Path = Path("../data")):
        self.cfg = cfg
        self.data_dir = data_dir

        self.logger = self._setup_logging()

        # data
        self.config_data: Dict[str, Any] = {}
        self.hard_constraints: Dict[str, Any] = {}
        self.soft_constraints: List[Dict[str, Any]] = []
        self.seances_meta: List[Dict[str, Any]] = []
        self.solution_cp: List[Dict[str, Any]] = []

        # engines
        self.validator: Optional[HardConstraintValidator] = None
        self.evaluator: Optional[SoftConstraintEvaluator] = None
        self.repair: Optional[RepairEngine] = None
        self.local: Optional[LocalSearchEngine] = None

        # deap
        self.toolbox: Optional[base.Toolbox] = None

        # seance order
        self.seance_order: List[str] = []
        self.expected_seances: Set[str] = set()

        # stats
        self.best_ever = None
        self.no_improve = 0
        self.hc_applications = 0
        self.hc_improvements = 0

    def _setup_logging(self) -> logging.Logger:
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"memetic_{ts}.log"

        logger = logging.getLogger(f"Memetic-{ts}")
        logger.setLevel(logging.INFO)
        logger.propagate = False

        fh = logging.FileHandler(log_file, encoding="utf-8")
        sh = logging.StreamHandler()

        fmt = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        fh.setFormatter(fmt)
        sh.setFormatter(fmt)

        logger.addHandler(fh)
        logger.addHandler(sh)
        return logger

    def load_data(self) -> bool:
        search_dirs = [self.data_dir, Path("."), Path("..")]

        self.config_data = _read_json_from_anywhere("config.json", search_dirs)
        self.hard_constraints = _read_json_from_anywhere("hard.json", search_dirs) or {}
        self.soft_constraints = _read_json_from_anywhere("soft.json", search_dirs) or []
        self.solution_cp = _read_json_from_anywhere("solution_cp.json", search_dirs)
        seances_data = _read_json_from_anywhere("seances.json", search_dirs) or []
        if isinstance(seances_data, dict) and "seances" in seances_data:
            self.seances_meta = seances_data["seances"]
        else:
            self.seances_meta = seances_data

        if not self.config_data or not self.solution_cp:
            self.logger.error("Fichiers manquants: config.json ou solution_cp.json")
            return False

        self.validator = HardConstraintValidator(self.config_data, self.hard_constraints, self.seances_meta)
        self.evaluator = SoftConstraintEvaluator(self.soft_constraints)

        # normaliser solution CP
        self.solution_cp = [self.validator.normalize_course(c) for c in self.solution_cp]

        # seance order stable
        self.seance_order = [c["seance"] for c in self.solution_cp]
        seen = set()
        self.seance_order = [s for s in self.seance_order if not (s in seen or seen.add(s))]
        self.expected_seances = set(self.seance_order)

        # validate base
        ok_struct, errs1 = self.validator.validate_structure(self.solution_cp, self.expected_seances)
        ok_hard, errs2 = self.validator.validate_hard(self.solution_cp)
        if not (ok_struct and ok_hard):
            self.logger.error("solution_cp.json invalide (hard/structure).")
            for e in (errs1 + errs2)[:25]:
                self.logger.error(f"  - {e}")
            return False

        self.repair = RepairEngine(self.validator, self.solution_cp, self.seance_order, self.cfg)
        self.local = LocalSearchEngine(self.validator, self.evaluator, self.cfg)

        self.logger.info("✓ Données chargées.")
        self.logger.info(f"Score initial (CP): {self.evaluator.evaluate(self.solution_cp):.2f}")
        return True

    def setup_deap(self):
        # Create DEAP classes once
        if not hasattr(creator, "FitnessMin"):
            creator.create("FitnessMin", base.Fitness, weights=(-1.0,))
        if not hasattr(creator, "Individual"):
            creator.create("Individual", list, fitness=creator.FitnessMin)

        self.toolbox = base.Toolbox()
        self.toolbox.register("clone", copy.deepcopy)  # IMPORTANT
        self.toolbox.register("evaluate", self.evaluate)
        self.toolbox.register("mate", self.crossover_safe)
        self.toolbox.register("mutate", self.mutate_safe)
        self.toolbox.register("select", tools.selTournament, tournsize=self.cfg.tournament_size)

    # -------------------------------------------------------------------------
    # Fitness evaluation (repair before eval)
    # -------------------------------------------------------------------------
    def evaluate(self, individual):
        repaired = self.repair.repair(list(individual))
        individual[:] = repaired
        score = self.evaluator.evaluate(individual)
        return (score,)

    # -------------------------------------------------------------------------
    # Mutation (IN-PLACE)
    # -------------------------------------------------------------------------
    def mutate_safe(self, individual):
        ind = [self.validator.normalize_course(c) for c in individual]

        jours = self.validator.jours
        creneaux = self.validator.creneaux
        salles = self.validator.salles_canon

        # Choix du type de mutation : chaîne (30%) ou classique (70%)
        if random.random() < self.cfg.chain_mutation_rate and len(ind) >= 3:
            # --- Mutation chaîne : permutation circulaire de 3 séances ---
            for _attempt in range(self.cfg.max_mutation_attempts):
                idxs = random.sample(range(len(ind)), 3)
                a_idx, b_idx, c_idx = idxs
                a, b, c = ind[a_idx], ind[b_idx], ind[c_idx]

                a_new = {**a, "jour": b["jour"], "creneau": b["creneau"], "salle": b["salle"]}
                b_new = {**b, "jour": c["jour"], "creneau": c["creneau"], "salle": c["salle"]}
                c_new = {**c, "jour": a["jour"], "creneau": a["creneau"], "salle": a["salle"]}

                candidate = [x.copy() for x in ind]
                candidate[a_idx] = a_new
                candidate[b_idx] = b_new
                candidate[c_idx] = c_new

                a_ok = self.validator.is_slot_available(a, b["jour"], b["creneau"], b["salle"], candidate, a_idx)
                b_ok = self.validator.is_slot_available(b, c["jour"], c["creneau"], c["salle"], candidate, b_idx)
                c_ok = self.validator.is_slot_available(c, a["jour"], a["creneau"], a["salle"], candidate, c_idx)

                if a_ok and b_ok and c_ok:
                    ind[a_idx] = a_new
                    ind[b_idx] = b_new
                    ind[c_idx] = c_new
                    break
        else:
            # --- Mutation classique : déplacer N séances aléatoirement ---
            num_genes = random.randint(1, max(3, len(ind) // 20))
            for _ in range(num_genes):
                idx = random.randrange(len(ind))
                cours = ind[idx]
                original = cours.copy()

                for _attempt in range(self.cfg.max_mutation_attempts):
                    nj = random.choice(jours)
                    nc = int(random.choice(creneaux))
                    ns = random.choice(salles)
                    if self.validator.is_slot_available(cours, nj, nc, ns, ind, idx):
                        ind[idx] = {
                            **cours,
                            "jour": self.validator.canonical_jour(nj),
                            "creneau": int(nc),
                            "salle": self.validator.canonical_salle(ns),
                        }
                        break
                else:
                    ind[idx] = original

        ind = self.repair.repair(ind)
        individual[:] = ind  # IN-PLACE: conserver creator.Individual
        return (individual,)

    # -------------------------------------------------------------------------
    # Crossover (IN-PLACE, par séance)
    # -------------------------------------------------------------------------
    def crossover_safe(self, ind1, ind2):
        p1 = {c["seance"]: self.validator.normalize_course(c) for c in ind1}
        p2 = {c["seance"]: self.validator.normalize_course(c) for c in ind2}

        child1 = []
        child2 = []

        for sid in self.seance_order:
            g1 = p1.get(sid)
            g2 = p2.get(sid)

            if g1 is None and g2 is None:
                base = self.repair.base_by_seance.get(sid)
                if base:
                    child1.append(dict(base))
                    child2.append(dict(base))
                continue
            if g1 is None:
                child1.append(dict(g2))
                child2.append(dict(g2))
                continue
            if g2 is None:
                child1.append(dict(g1))
                child2.append(dict(g1))
                continue

            if random.random() < 0.5:
                child1.append(dict(g1))
                child2.append(dict(g2))
            else:
                child1.append(dict(g2))
                child2.append(dict(g1))

        child1 = self.repair.repair(child1)
        child2 = self.repair.repair(child2)

        # IN-PLACE update
        ind1[:] = child1
        ind2[:] = child2
        return ind1, ind2

    # -------------------------------------------------------------------------
    # Population init
    # -------------------------------------------------------------------------
    def create_initial_population(self) -> List:
        pop = []
        # base CP
        pop.append(creator.Individual(copy.deepcopy(self.solution_cp)))

        # variations
        for _ in range(self.cfg.population_size - 1):
            ind = creator.Individual(copy.deepcopy(self.solution_cp))
            # quelques mutations de diversification
            for _m in range(random.randint(1, 5)):
                self.mutate_safe(ind)
                if hasattr(ind, "fitness") and ind.fitness.valid:
                    del ind.fitness.values
            pop.append(ind)
        return pop

    # -------------------------------------------------------------------------
    # Hill climbing application
    # -------------------------------------------------------------------------
    def apply_local_search(self, population: List) -> List:
        bests = tools.selBest(population, self.cfg.hc_num_individuals)

        improved = []
        for i, ind in enumerate(bests):
            old_score = ind.fitness.values[0]
            new_data = self.local.hill_climb(list(ind), self.cfg.hc_iterations)
            new_data = self.repair.repair(new_data)

            new_ind = creator.Individual(new_data)
            new_ind.fitness.values = self.evaluate(new_ind)
            new_score = new_ind.fitness.values[0]

            self.hc_applications += 1
            if new_score < old_score:
                self.hc_improvements += 1
                improved.append(new_ind)
            else:
                improved.append(ind)

        # remplacer les pires
        worst_idx = sorted(range(len(population)), key=lambda k: population[k].fitness.values[0], reverse=True)[:len(improved)]
        for wi, newi in zip(worst_idx, improved):
            population[wi] = newi
        return population

    # -------------------------------------------------------------------------
    # Main optimize
    # -------------------------------------------------------------------------
    def _perturb_population(self, population: List, best_score: float) -> List:
        """
        Réinjecte de la diversité quand la population a convergé.
        Remplace `perturbation_ratio` des pires individus par des variantes
        mutées du meilleur individu, pour relancer l'exploration.
        """
        n_inject = max(1, int(self.cfg.perturbation_ratio * len(population)))
        # Indices des pires individus (sauf élite)
        worst_idx = sorted(
            range(len(population)),
            key=lambda k: population[k].fitness.values[0],
            reverse=True,
        )[:n_inject]

        best_ind = tools.selBest(population, 1)[0]

        for wi in worst_idx:
            new_ind = self.toolbox.clone(best_ind)
            # appliquer 2-4 mutations pour diversifier
            for _ in range(random.randint(2, 4)):
                self.toolbox.mutate(new_ind)
            if new_ind.fitness.valid:
                del new_ind.fitness.values
            new_ind.fitness.values = self.toolbox.evaluate(new_ind)
            population[wi] = new_ind

        self.logger.info(
            f"  💥 Perturbation: {n_inject} individus réinjectés (score actuel: {best_score:.0f})"
        )
        return population

    def optimize(self):
        pop = self.create_initial_population()

        # eval init
        for ind in pop:
            ind.fitness.values = self.toolbox.evaluate(ind)

        self.best_ever = tools.selBest(pop, 1)[0]
        best_score = self.best_ever.fitness.values[0]
        self.no_improve = 0
        last_perturbation = 0  # génération de la dernière perturbation

        stats = tools.Statistics(key=lambda ind: ind.fitness.values[0])
        stats.register("min", min)
        stats.register("avg", lambda xs: sum(xs) / len(xs))

        if self.cfg.verbose:
            self.logger.info(f"Gen 0 | best={best_score:.2f}")

        for gen in range(1, self.cfg.generations + 1):
            # select + clone DEAP
            offspring = self.toolbox.select(pop, len(pop) - self.cfg.elite_size)
            offspring = list(map(self.toolbox.clone, offspring))

            # crossover
            for i in range(1, len(offspring), 2):
                if random.random() < self.cfg.crossover_rate:
                    self.toolbox.mate(offspring[i - 1], offspring[i])
                    if offspring[i - 1].fitness.valid:
                        del offspring[i - 1].fitness.values
                    if offspring[i].fitness.valid:
                        del offspring[i].fitness.values

            # mutation
            for ind in offspring:
                if random.random() < self.cfg.mutation_rate:
                    self.toolbox.mutate(ind)
                    if ind.fitness.valid:
                        del ind.fitness.values

            # evaluate invalid
            invalid = [ind for ind in offspring if not ind.fitness.valid]
            for ind in invalid:
                ind.fitness.values = self.toolbox.evaluate(ind)

            # elitisme
            elites = tools.selBest(pop, self.cfg.elite_size)
            pop = offspring + list(map(self.toolbox.clone, elites))

            # Hill climbing périodique
            if gen % self.cfg.hc_frequency == 0:
                self.logger.info(f"🔧 Gen {gen}: Hill Climbing")
                pop = self.apply_local_search(pop)

            # best update
            cur_best = tools.selBest(pop, 1)[0]
            cur_score = cur_best.fitness.values[0]

            if cur_score < best_score:
                self.best_ever = self.toolbox.clone(cur_best)
                best_score = cur_score
                self.no_improve = 0
            else:
                self.no_improve += 1

            # Perturbation si stagnation (mais pas juste après une perturbation récente)
            if (
                self.no_improve > 0
                and self.no_improve % self.cfg.perturbation_threshold == 0
                and gen - last_perturbation >= self.cfg.perturbation_threshold
            ):
                pop = self._perturb_population(pop, best_score)
                last_perturbation = gen

            # Log périodique
            if self.cfg.verbose and (gen % self.cfg.log_interval == 0 or gen == 1):
                rec = stats.compile(pop)
                self.logger.info(
                    f"Gen {gen:4d} | min={rec['min']:.2f} | avg={rec['avg']:.2f} | best={best_score:.2f} | stall={self.no_improve}"
                )

            # Score breakdown périodique
            if self.cfg.verbose and gen % self.cfg.score_breakdown_interval == 0:
                _, breakdown = self.evaluator.evaluate_with_breakdown(list(self.best_ever))
                parts = " | ".join(f"{k}={v:.0f}" for k, v in sorted(breakdown.items(), key=lambda x: -x[1]) if v > 0)
                self.logger.info(f"  📊 Détail score gen {gen}: {parts}")

            if self.cfg.early_stopping and self.no_improve >= self.cfg.patience:
                self.logger.info(f"⏹ Early stop à gen {gen} (stall={self.no_improve})")
                break

        best = list(self.best_ever)
        best = self.repair.repair(best)

        # sécurité finale
        ok_struct, errs1 = self.validator.validate_structure(best, self.expected_seances)
        ok_hard, errs2 = self.validator.validate_hard(best)
        if not (ok_struct and ok_hard):
            self.logger.error("Solution finale invalide -> fallback solution CP")
            for e in (errs1 + errs2)[:25]:
                self.logger.error(f"  - {e}")
            best = copy.deepcopy(self.solution_cp)

        return best

    def run(self) -> bool:
        try:
            if not self.load_data():
                return False
            self.setup_deap()

            best_solution = self.optimize()

            out = Path("solution_finale.json")
            _write_json(out, best_solution)
            self.logger.info(f"✓ Écrit: {out}")

            final_score, breakdown = self.evaluator.evaluate_with_breakdown(best_solution)
            self.logger.info(f"Score final: {final_score:.2f}")
            self.logger.info("📊 Détail des pénalités :")
            for constraint, penalty in sorted(breakdown.items(), key=lambda x: -x[1]):
                if penalty > 0:
                    self.logger.info(f"  {constraint}: {penalty:.0f}")
            self.logger.info(f"HC applications: {self.hc_applications} | improvements: {self.hc_improvements}")
            return True

        except Exception as e:
            self.logger.error(f"Erreur fatale: {e}")
            import traceback
            self.logger.error(traceback.format_exc())
            return False


# =============================================================================
# Main
# =============================================================================

def main() -> int:
    cfg = MemeticConfig(
        population_size=80,
        generations=200,
        mutation_rate=0.3,
        crossover_rate=0.7,
        tournament_size=3,
        elite_size=5,
        hc_frequency=10,
        hc_num_individuals=10,
        hc_iterations=500,
        chain_mutation_rate=0.3,
        max_mutation_attempts=50,
        early_stopping=True,
        patience=50,
        perturbation_threshold=30,
        perturbation_ratio=0.25,
        verbose=True,
        log_interval=10,
        score_breakdown_interval=50,
    )

    optimizer = MemeticOptimizer(cfg)
    ok = optimizer.run()

    if ok:
        print("\n✓ Optimisation mémétique réussie -> solution_finale.json")
        return 0
    print("\n✗ Échec optimisation")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
