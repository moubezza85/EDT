export type Config = {
  jours: string[];
  creneaux: number[];
  salles: string[];
  categorieSalles?: Record<string, string[]>;
  moduleCategories?: Record<string, string>;
};

export type TimetableSession = {
  sessionId: string;
  seanceId: string;
  formateur: string;
  groupe: string;
  module: string;
  jour: string;
  creneau: number;
  salle: string;
};
