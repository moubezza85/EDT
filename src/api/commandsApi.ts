// src/api/commandsApi.ts
import type { Session } from "../types";
import { httpOk } from "./http";

export type CommandSuccess = {
  ok: true;
  version: number;
  sessions: Session[];
  warnings: string[];
};

export type CommandError = {
  ok: false;
  code: string;
  message: string;
  details?: any;
  version?: number;
  serverVersion?: number;
};

export type MoveCommand = {
  commandId: string;
  expectedVersion: number;
  type: "MOVE_SESSION";
  payload: {
    sessionId: string;
    toJour: string;
    toCreneau: number;
    toSalle: string;
  };
};

export type DeleteCommand = {
  commandId: string;
  expectedVersion: number;
  type: "DELETE_SESSION";
  payload: {
    sessionId: string;
  };
};

export type TimetableCommand = MoveCommand | DeleteCommand;

export type TimetableScope = "official" | "draft";

export function sendTimetableCommand(
  input: TimetableCommand,
  scope: TimetableScope = "official"
): Promise<CommandSuccess> {
  // IMPORTANT: cette fonction ne "retourne" que le succès.
  // Les erreurs (409, 400, etc.) passent par throw (catch côté appelant) avec e.body = CommandError.
  const url = scope === "draft" ? "/api/timetable/commands?scope=draft" : "/api/timetable/commands";
  return httpOk<CommandSuccess>(url, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
