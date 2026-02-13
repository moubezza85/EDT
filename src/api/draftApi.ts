// src/api/draftApi.ts
import { http } from "@/api/http";
import type { Session } from "@/types";

export type DraftTimetableDTO = {
  week_start: string;
  revision: number;
  version: number;
  sessions: Session[];
};

export type AdminVirtualTimetableDTO = {
  ok: boolean;
  draft?: { week_start?: string; revision?: number };
  version: number;
  sessions: Session[];
  virtual?: {
    sessionsBase: any[];
    sessionsExtra: any[];
  };
  pendingRequests?: any[];
};

export function getDraftTimetable() {
  return http<DraftTimetableDTO>("/api/next-timetable");
}

export function getAdminVirtualDraft() {
  return http<AdminVirtualTimetableDTO>("/api/admin/timetable/virtual");
}

export function publishDraftTimetable(week_start: string) {
  return http<any>("/api/admin/publish", {
    method: "POST",
    body: JSON.stringify({ week_start }),
  });
}
