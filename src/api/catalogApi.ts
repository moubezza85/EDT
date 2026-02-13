import { httpOk } from "./http";

export type OnlineFusion = {
  id: string;
  groupes: string[];
};

export type Catalog = {
  teachers: { id: string; name?: string }[];
  groups: string[];
  modules: string[];
  assignments: { trainerId: string; groupId: string; moduleIds: string[] }[];

  // Fusions fixes (séances en ligne). Exemple: DEV101_DEV102 => ["DEV101","DEV102"]
  onlineFusions?: OnlineFusion[];
};

export function getCatalog() {
  return httpOk<Catalog>("/api/catalog", { method: "GET" });
}
