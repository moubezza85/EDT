"""
Solveur CP amélioré pour emploi du temps.
SIMPLE : Chaque séance occupe exactement 1 créneau unique.
Le champ "volume" indique combien de fois placer cette séance.

Classes exportées : TimetableCPSolver, SolverConfig
"""

import json
import logging
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass
from typing import Dict, List
from ortools.sat.python import cp_model


@dataclass
class SolverConfig:
    """Configuration du solveur CP."""
    max_time_seconds: float = 120.0
    num_workers: int = 8
    log_search_progress: bool = True
    enable_soft_objectives: bool = False


class TimetableCPSolver:
    """Solveur CP pour emploi du temps - 1 séance = 1 créneau."""
    
    def __init__(self, config: SolverConfig, data_dir: Path = Path("../data")):
        self.config = config
        self.data_dir = data_dir
        self.setup_logging()
        
        self.config_data = None
        self.seances = []
        self.hard_constraints = None
        self.model = None
        self.grid = {}
        
        self.stats = {
            'seances_totales': 0,
            'seances_apres_expansion': 0,
            'variables_creees': 0,
            'contraintes_ajoutees': 0,
            'temps_resolution': 0.0,
            'status': None
        }
        
    def setup_logging(self):
        """Configure le logging."""
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"cp_solver_{timestamp}.log"
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file, encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
        
    def load_data(self) -> bool:
        """Charge les données."""
        try:
            possible_dirs = [self.data_dir, Path("."), Path("..")]
            
            files = {
                'config': 'config.json',
                'seances': 'seances.json',
                'hard': 'hard.json'
            }
            
            loaded_data = {}
            for key, filename in files.items():
                loaded = False
                for directory in possible_dirs:
                    filepath = directory / filename
                    if filepath.exists():
                        with open(filepath, 'r', encoding='utf-8') as f:
                            loaded_data[key] = json.load(f)
                        self.logger.info(f"✓ Chargé : {filepath}")
                        loaded = True
                        break
                
                if not loaded:
                    self.logger.error(f"✗ Fichier manquant : {filename}")
                    return False
            
            self.config_data = loaded_data['config']
            raw_seances = loaded_data['seances']
            self.hard_constraints = loaded_data['hard']
            
            # Expansion selon volume
            self.stats['seances_totales'] = len(raw_seances)
            self.seances = self._expand_seances(raw_seances)
            self.stats['seances_apres_expansion'] = len(self.seances)
            
            self.logger.info(f"Séances : {self.stats['seances_totales']} → {self.stats['seances_apres_expansion']}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Erreur chargement : {e}")
            return False
    
    def _expand_seances(self, raw_seances: List[Dict]) -> List[Dict]:
        """
        Expande les séances selon le volume.
        volume=2 → 2 séances distinctes à placer (chacune sur 1 créneau).
        """
        expanded = []
        for s in raw_seances:
            vol = s.get('volume', 1)
            base_id = s['id']
            
            for i in range(vol):
                new_s = s.copy()
                new_s['id'] = f"{base_id}_{i}"
                new_s['original_id'] = base_id
                expanded.append(new_s)
        
        return expanded
    
    def create_variables(self):
        """Crée les variables de décision - 1 séance = 1 créneau."""
        jours = self.config_data['jours']
        creneaux = self.config_data['creneaux']
        salles = self.config_data['salles']
        
        self.logger.info("Création des variables...")
        
        for s in self.seances:
            type_requis = s.get('type_salle', 'Cours')
            
            for j in jours:
                for c in creneaux:
                    for salle in salles:
                        is_compatible = self._check_room_compatibility(type_requis, salle['type'])
                        
                        if is_compatible:
                            var_name = f"{s['id']}_{j}_{c}_{salle['name']}"
                            self.grid[(s['id'], j, c, salle['name'])] = self.model.NewBoolVar(var_name)
        
        self.stats['variables_creees'] = len(self.grid)
        self.logger.info(f"Variables créées : {self.stats['variables_creees']}")
    
    def _check_room_compatibility(self, required_type: str, room_type: str) -> bool:
        """Vérifie compatibilité salle."""
        if required_type.lower() == 'cours':
            return True
        return required_type.lower() == room_type.lower()
    
    def add_hard_constraints(self):
        """Ajoute contraintes dures."""
        self.logger.info("Ajout contraintes dures...")
        
        count = 0
        
        # C1: Chaque séance exactement une fois
        for s in self.seances:
            candidats = [v for (sid, j, c, r), v in self.grid.items() if sid == s['id']]
            if candidats:
                self.model.AddExactlyOne(candidats)
                count += 1
        
        jours = self.config_data['jours']
        creneaux = self.config_data['creneaux']
        salles = self.config_data['salles']
        
        # C2: Pas de chevauchement Salle
        for j in jours:
            for c in creneaux:
                for salle in salles:
                    candidats = [v for (sid, jj, cc, rr), v in self.grid.items() 
                               if jj == j and cc == c and rr == salle['name']]
                    if len(candidats) > 1:
                        self.model.AddAtMostOne(candidats)
                        count += 1
        
        # C3: Pas de chevauchement Formateur
        formateurs = set(s['formateur'] for s in self.seances)
        for prof in formateurs:
            ids_prof = [s['id'] for s in self.seances if s['formateur'] == prof]
            for j in jours:
                for c in creneaux:
                    candidats = [v for (sid, jj, cc, rr), v in self.grid.items() 
                               if sid in ids_prof and jj == j and cc == c]
                    if len(candidats) > 1:
                        self.model.AddAtMostOne(candidats)
                        count += 1
        
        # C4: Pas de chevauchement Groupe
        groupes = set(s['groupe'] for s in self.seances)
        for grp in groupes:
            ids_grp = [s['id'] for s in self.seances if s['groupe'] == grp]
            for j in jours:
                for c in creneaux:
                    candidats = [v for (sid, jj, cc, rr), v in self.grid.items() 
                               if sid in ids_grp and jj == j and cc == c]
                    if len(candidats) > 1:
                        self.model.AddAtMostOne(candidats)
                        count += 1
        
        # C5: Indisponibilités
        for indispo in self.hard_constraints.get('indisponibilites', []):
            type_con = indispo['type']
            target_id = indispo['id']
            j_ind = indispo['jour']
            liste_creneaux = indispo.get('creneaux', [indispo.get('creneau')])
            liste_creneaux = [x for x in liste_creneaux if x is not None]
            
            for c_ind in liste_creneaux:
                if type_con == 'formateur':
                    ids_concernes = [s['id'] for s in self.seances if s['formateur'] == target_id]
                    for sid in ids_concernes:
                        for salle in salles:
                            key = (sid, j_ind, c_ind, salle['name'])
                            if key in self.grid:
                                self.model.Add(self.grid[key] == 0)
                                count += 1
                
                elif type_con == 'groupe':
                    ids_concernes = [s['id'] for s in self.seances if s['groupe'] == target_id]
                    for sid in ids_concernes:
                        for salle in salles:
                            key = (sid, j_ind, c_ind, salle['name'])
                            if key in self.grid:
                                self.model.Add(self.grid[key] == 0)
                                count += 1
                
                elif type_con == 'salle':
                    for s in self.seances:
                        key = (s['id'], j_ind, c_ind, target_id)
                        if key in self.grid:
                            self.model.Add(self.grid[key] == 0)
                            count += 1
        
        # C6: Salles obligatoires
        for exigence in self.hard_constraints.get('exigences_specifiques', []):
            salle_obligatoire = exigence.get('salle_obligatoire')
            ids_cibles = []
            
            if 'formateur' in exigence:
                ids_cibles = [s['id'] for s in self.seances if s['formateur'] == exigence['formateur']]
            elif 'module' in exigence:
                ids_cibles = [s['id'] for s in self.seances if s['module'] == exigence['module']]
            
            for sid in ids_cibles:
                for (ssid, jj, cc, rr), v in self.grid.items():
                    if ssid == sid and rr != salle_obligatoire:
                        self.model.Add(v == 0)
                        count += 1
        
        self.stats['contraintes_ajoutees'] = count
        self.logger.info(f"Contraintes ajoutées : {count}")
    
    def solve(self) -> bool:
        """Résout le problème."""
        self.logger.info("=" * 60)
        self.logger.info("Démarrage résolution...")
        self.logger.info("=" * 60)
        
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.config.max_time_seconds
        solver.parameters.num_search_workers = self.config.num_workers
        
        if self.config.log_search_progress:
            solver.parameters.log_search_progress = True
        
        import time
        start_time = time.time()
        status = solver.Solve(self.model)
        self.stats['temps_resolution'] = time.time() - start_time
        self.stats['status'] = status
        
        self.logger.info(f"Temps : {self.stats['temps_resolution']:.2f}s")
        
        if status == cp_model.OPTIMAL:
            self.logger.info("✓ Solution OPTIMALE trouvée !")
            return self._export_solution(solver)
        elif status == cp_model.FEASIBLE:
            self.logger.info("✓ Solution RÉALISABLE trouvée !")
            return self._export_solution(solver)
        else:
            self.logger.error("✗ AUCUNE SOLUTION")
            return False
    
    def _export_solution(self, solver: cp_model.CpSolver) -> bool:
        """Exporte la solution."""
        solution_export = []
        
        for (sid, j, c, r), v in self.grid.items():
            if solver.Value(v) == 1:
                seance_meta = next(s for s in self.seances if s['id'] == sid)
                solution_export.append({
                    "seance": sid,
                    "jour": j,
                    "creneau": c,
                    "salle": r,
                    "formateur": seance_meta['formateur'],
                    "groupe": seance_meta['groupe'],
                    "module": seance_meta['module']
                })
        
        output_file = Path('solution_cp.json')
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(solution_export, f, indent=2, ensure_ascii=False)
        
        self.logger.info(f"✓ Solution exportée : {output_file}")
        self.logger.info(f"  Séances planifiées : {len(solution_export)}")
        
        return True
    
    def run(self) -> bool:
        """Exécute le solveur."""
        self.logger.info("Initialisation solveur CP...")
        
        if not self.load_data():
            return False
        
        self.model = cp_model.CpModel()
        self.create_variables()
        self.add_hard_constraints()
        
        success = self.solve()
        
        self.logger.info("=" * 60)
        self.logger.info("RÉSUMÉ")
        self.logger.info("=" * 60)
        for key, value in self.stats.items():
            self.logger.info(f"{key}: {value}")
        
        return success


def main():
    """Point d'entrée si exécuté directement."""
    config = SolverConfig(
        max_time_seconds=120.0,
        num_workers=8,
        log_search_progress=True
    )
    
    solver = TimetableCPSolver(config)
    success = solver.run()
    
    if success:
        print("\n✓ Solution CP générée !")
        print("→ solution_cp.json")
    else:
        print("\n✗ Échec CP")
    
    return 0 if success else 1


if __name__ == "__main__":
    exit(main())
