// src/api/configApi.ts
import { httpOk } from "./http";

export type Salle = { id: string; type: string };

export type Config = {
  jours: string[];
  creneaux: number[];
  salles: Salle[];
  categorieSalles?: Record<string, string[]>;
  moduleCategories?: Record<string, string>;
};

export function getConfig() {
  return httpOk<Config>("/api/config", { method: "GET" });
}
