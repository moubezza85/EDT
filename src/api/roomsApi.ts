// src/api/roomsApi.ts
import { httpOk } from "./http";

export type AvailableRoomsResponse = {
  ok: true;
  availableRooms: string[];
  occupiedRooms?: string[];
};

export type RoomsScope = "official" | "draft";

/**
 * Retourne les salles physiques disponibles pour (jour, crÃ©neau).
 * - scope=official => timetable.json
 * - scope=draft    => nextTimetable.json (rÃ©servÃ© admin)
 */
export function getAvailableRooms(jour: string, creneau: number, scope: RoomsScope = "official") {
  const qs = new URLSearchParams({ jour, creneau: String(creneau), scope }).toString();
  return httpOk<AvailableRoomsResponse>(`/api/rooms/available?${qs}`, { method: "GET" });
}
