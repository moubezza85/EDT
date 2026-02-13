// src/api/timetableApi.ts
import { httpOk } from "./http";
import type { Session } from "../types";

export type AddSessionInput = {
  formateur: string;
  groupe: string;
  module: string;
  jour: string;
  creneau: number;
  salle: string;
};

export type AddSessionResponse = {
  ok: true;
  version: number;
  session: Session;
};

export type TimetableScope = "official" | "draft";

export function addSession(input: AddSessionInput, scope: TimetableScope = "official") {
  const url = scope === "draft" ? "/api/timetable/sessions?scope=draft" : "/api/timetable/sessions";
  return httpOk<AddSessionResponse>(url, {
    method: "POST",
    body: JSON.stringify(input),
  });
}


export const TEAMS_ROOM_ID = "TEAMS";

export function isOnlineSession(session: { salle?: string | null }) {
  return (session?.salle ?? "").toUpperCase() === TEAMS_ROOM_ID;
}
