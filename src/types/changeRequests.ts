// src/types/changeRequests.ts
export type ChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
export type ChangeRequestType = "MOVE" | "CHANGE_ROOM";

export type ChangeRequest = {
  id: string;
  type: ChangeRequestType;
  sessionId: string;
  teacherId: string;

  oldData: { jour: string; creneau: number; salle?: string | null };
  newData: { jour: string; creneau: number; salle?: string | null; motif?: string | null };

  status: ChangeRequestStatus;
  submittedAt: string;

  decidedAt?: string;
  decidedBy?: string;
  decisionReason?: string;
};
