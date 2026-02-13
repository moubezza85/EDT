import { http } from "./http";
import type { Session } from "../types";

// Endpoint conseillé côté Flask : GET /api/timetable -> retourne { sessions: Session[] }
export function getTimetable() {
  return http<{ sessions: Session[] }>("/api/timetable");
}

// Optionnel plus tard : GET /api/config, etc.
export function getConfig() {
  return http<any>("/api/config");
}

export function moveSession(input: {
  sessionId: string;
  toJour: string;
  toCreneau: number;
  toSalle: string;
}) {
  return http<{ ok: boolean; sessions?: Session[]; error?: string }>("/api/timetable/move", {
    method: "POST",
    body: JSON.stringify(input),
  });
}