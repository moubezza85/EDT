import { http } from "@/api/http";
import type { Session } from "@/types";
import type { ChangeRequest } from "@/types/changeRequests";

export type TeacherTimetableResponse = {
  ok: boolean;
  version: number;
  sessions: Session[];
  virtual?: {
    sessionsBase: any[];
    sessionsExtra: any[];
  };
  pendingRequests?: ChangeRequest[];
};

export async function getTeacherTimetable(teacherId?: string) {
  const qs = teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : "";
  return await http<TeacherTimetableResponse>(`/api/teacher/timetable${qs}`);
}
