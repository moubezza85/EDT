// src/hooks/useSchedule.ts

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, Cell, Filter } from "../types";
import { getTimetable } from "../api/scheduleApi";
import { sendTimetableCommand } from "../api/commandsApi";
import { getAvailableRooms } from "../api/roomsApi";

type TimetableDTO = {
  version?: number;
  sessions: any[];
};

type UseScheduleOptions = {
  /**
   * Pour un id de groupe (groupe simple ou fusion), retourne la liste des groupes "réels"
   * concernés par la séance. Par défaut: [groupeId]
   */
  expandGroupIds?: (groupeId: string) => string[];

  /** Indique si une salle est virtuelle (ex: TEAMS). */
  isVirtualRoom?: (roomId: string) => boolean;
};

function normalizeSessions(raw: any[]): Session[] {
  return raw.map((s: any) => ({
    ...s,
    id: s.id ?? s.sessionId, // compat
  })) as Session[];
}

function applyMoveLocal(
  sessions: Session[],
  sessionId: string,
  toJour: string,
  toCreneau: number,
  toSalle: string
): Session[] {
  return sessions.map((s) =>
    s.id === sessionId ? { ...s, jour: toJour, creneau: toCreneau, salle: toSalle } : s
  );
}

function applyDeleteLocal(sessions: Session[], sessionId: string): Session[] {
  return sessions.filter((s) => s.id !== sessionId);
}

function newCommandId(): string {
  return crypto.randomUUID();
}

const ALL = "_all";

export const useSchedule = (opts: UseScheduleOptions = {}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [version, setVersion] = useState<number>(1);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filter[]>([]);

  const uniqueFormateurValues = useMemo(
    () => [...new Set(sessions.map((s) => s.formateur))],
    [sessions]
  );
  const uniqueGroupeValues = useMemo(
    () => [...new Set(sessions.map((s) => s.groupe))],
    [sessions]
  );
  const uniqueSalleValues = useMemo(
    () => [...new Set(sessions.map((s) => s.salle))],
    [sessions]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const tt = (await getTimetable()) as TimetableDTO;
      const normalized = normalizeSessions(tt.sessions ?? []);
      setSessions(normalized);

      if (typeof tt.version === "number") setVersion(tt.version);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch schedule data");
      console.error("Error fetching schedule:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addFilter = useCallback((filter: Filter) => {
    setFilters((prev) => [...prev.filter((f) => f.type !== filter.type), filter]);
  }, []);

  const removeFilter = useCallback((type: Filter["type"]) => {
    setFilters((prev) => prev.filter((f) => f.type !== type));
  }, []);

  /**
   * Filtre par défaut: premier formateur.
   * - S'applique seulement si aucun filtre formateur n'est défini (ou valeur vide)
   * - Ne s'applique PAS si l'utilisateur a choisi explicitement "Tous" (= "_all")
   */
  useEffect(() => {
    const first = uniqueFormateurValues[0];
    if (!first) return;

    const current = filters.find((f) => f.type === "formateur")?.value;

    if (current === ALL) return; // utilisateur veut explicitement tout afficher
    if (current && current.trim() !== "") return; // déjà un formateur choisi

    setFilters((prev) => [
      ...prev.filter((f) => f.type !== "formateur"),
      { type: "formateur", value: first },
    ]);
  }, [uniqueFormateurValues, filters]);

  const filteredSessions = useMemo(() => {
    if (!filters.length) return sessions;

    const expand = opts.expandGroupIds ?? ((g: string) => [g]);

    return sessions.filter((session) =>
      filters.every((filter) => {
        const v = (filter.value ?? "").trim();
        if (!v) return true;
        if (v === ALL) return true; // "_all" => pas de filtre

        if (filter.type === "groupe") {
          // Une séance fusionnée doit apparaître dans chaque emploi de groupe.
          const sessionGroups = expand(session.groupe);
          return session.groupe === v || sessionGroups.includes(v);
        }

        return (session as any)[filter.type] === v;
      })
    );
  }, [sessions, filters, opts.expandGroupIds]);

  const hasConflict = useCallback(
    (session: Session, targetCell: Cell): Session | null => {
      const expand = opts.expandGroupIds ?? ((g: string) => [g]);
      const isVirtual = opts.isVirtualRoom ?? (() => false);

      const groupsA = expand(session.groupe);

      return (
        sessions.find((s) => {
          if (s.id === session.id) return false;
          if (s.jour !== targetCell.day || s.creneau !== targetCell.slot) return false;

          // Conflit salle uniquement pour les salles physiques.
          const sameRoom =
            s.salle === session.salle && !isVirtual(session.salle) && !isVirtual(s.salle);

          const sameTeacher = s.formateur === session.formateur;

          // Conflit groupes : intersection non vide (important pour les fusions).
          const groupsB = expand(s.groupe);
          const sameGroup = groupsA.some((g) => groupsB.includes(g));

          return sameRoom || sameTeacher || sameGroup;
        }) || null
      );
    },
    [sessions, opts.expandGroupIds, opts.isVirtualRoom]
  );

  const moveSessionDnD = useCallback(
    async (args: { sessionId: string; toJour: string; toCreneau: number; toSalle: string }) => {
      const prevSessions = sessions;
      const prevVersion = version;

      setSessions(
        applyMoveLocal(prevSessions, args.sessionId, args.toJour, args.toCreneau, args.toSalle)
      );

      try {
        const res = await sendTimetableCommand({
          commandId: newCommandId(),
          expectedVersion: prevVersion,
          type: "MOVE_SESSION",
          payload: args,
        });

        setSessions(res.sessions);
        setVersion(res.version);
        return { ok: true as const };
      } catch (e: any) {
        setSessions(prevSessions);

        const body = e?.body as any;

        if (body && body.ok === false) {
          if (body.code === "VERSION_MISMATCH") {
            await fetchData();
          }
          return { ok: false as const, error: body.message || "Action refusée" };
        }

        return { ok: false as const, error: e?.message ?? "Erreur réseau" };
      }
    },
    [sessions, version, fetchData]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const prevSessions = sessions;
      const prevVersion = version;

      setSessions(applyDeleteLocal(prevSessions, sessionId));

      try {
        const res = await sendTimetableCommand({
          commandId: crypto.randomUUID(),
          expectedVersion: prevVersion,
          type: "DELETE_SESSION",
          payload: { sessionId },
        });

        setSessions(res.sessions);
        setVersion(res.version);
        return { ok: true as const };
      } catch (e: any) {
        setSessions(prevSessions);

        const msg = e?.body?.message || e?.message || "Suppression refusée.";

        if (e?.body?.code === "VERSION_MISMATCH") {
          await fetchData();
        }

        return { ok: false as const, error: msg };
      }
    },
    [sessions, version, fetchData]
  );

  const updateSession = useCallback(
    async (sessionId: string, updates: Partial<Session>) => {
      const hasMove =
        typeof updates.jour === "string" &&
        typeof updates.creneau === "number" &&
        typeof updates.salle === "string";

      if (hasMove) {
        const res = await moveSessionDnD({
          sessionId,
          toJour: updates.jour as string,
          toCreneau: updates.creneau as number,
          toSalle: updates.salle as string,
        });
        return res.ok;
      }

      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s)));
      return true;
    },
    [moveSessionDnD]
  );

  const requestMoveWithRoomCheck = useCallback(
    async (args: { sessionId: string; toJour: string; toCreneau: number }) => {
      const session = sessions.find((s) => s.id === args.sessionId);
      if (!session) {
        return { ok: false as const, mode: "error" as const, error: "Session introuvable côté UI" };
      }

      const roomsRes = await getAvailableRooms(args.toJour, args.toCreneau);
      const availableRooms = roomsRes.availableRooms;

      if (availableRooms.includes(session.salle)) {
        const moved = await moveSessionDnD({
          sessionId: args.sessionId,
          toJour: args.toJour,
          toCreneau: args.toCreneau,
          toSalle: session.salle,
        });
        return moved.ok
          ? { ok: true as const, mode: "moved" as const }
          : { ok: false as const, mode: "error" as const, error: moved.error || "Move refusé" };
      }

      return {
        ok: true as const,
        mode: "choose_room" as const,
        availableRooms,
        preferredRoom: session.salle,
      };
    },
    [sessions, moveSessionDnD]
  );

  return {
    sessions: filteredSessions,
    version,

    loading,
    error,

    filters,
    addFilter,
    removeFilter,

    fetchData,
    updateSession,
    moveSessionDnD,
    deleteSession,
    requestMoveWithRoomCheck,

    hasConflict,

    uniqueFormateurValues,
    uniqueGroupeValues,
    uniqueSalleValues,
  };
};
