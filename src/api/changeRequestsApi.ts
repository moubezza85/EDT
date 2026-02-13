// src/api/changeRequestsApi.ts
import { http } from "@/api/http";
import type { ChangeRequest } from "@/types/changeRequests";

// ------------------------------
// ADMIN
// ------------------------------

export async function listAdminChanges(status: string = "PENDING"): Promise<ChangeRequest[]> {
  const json = await http<{ ok: boolean; requests: ChangeRequest[] }>(
    `/api/admin/changes?status=${encodeURIComponent(status)}`
  );
  return (json?.requests ?? []) as ChangeRequest[];
}

export async function simulateAdminChange(requestId: string, decidedBy: string = "ADMIN") {
  return await http<any>(`/api/admin/changes/${encodeURIComponent(requestId)}/simulate`, {
    method: "POST",
    body: JSON.stringify({ decidedBy }),
  });
}

export async function approveAdminChange(requestId: string, decidedBy: string = "ADMIN") {
  return await http<any>(`/api/admin/changes/${encodeURIComponent(requestId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ decidedBy }),
  });
}

export async function rejectAdminChange(requestId: string, reason: string, decidedBy: string = "ADMIN") {
  return await http<any>(`/api/admin/changes/${encodeURIComponent(requestId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ decidedBy, reason }),
  });
}

// ------------------------------
// TEACHER
// ------------------------------

export async function listTeacherChanges(status?: string): Promise<ChangeRequest[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const json = await http<{ ok: boolean; requests: ChangeRequest[] }>(`/api/teacher/changes${qs}`);
  return (json?.requests ?? []) as ChangeRequest[];
}

export async function createTeacherChange(payload: {
  type: "MOVE" | "CHANGE_ROOM" | "DELETE" | "INSERT";
  sessionId?: string;
  newData?: any;
}): Promise<ChangeRequest> {
  const json = await http<{ ok: boolean; request: ChangeRequest }>(`/api/teacher/changes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return json.request;
}
