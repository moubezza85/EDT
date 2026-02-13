// src/pages/TeacherOfficialTimetable.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import ScheduleGrid from "@/components/ScheduleGrid";
import { useToast } from "@/components/ui/use-toast";
import { httpBlob } from "@/api/http";

import { getConfig, type Config } from "@/api/configApi";
import { getTimetable } from "@/api/scheduleApi";
import { getCatalog, type Catalog } from "@/api/catalogApi";
import { useAuth } from "@/auth/AuthContext";

import type { Session, Cell } from "@/types";

function normalizeSessions(raw: any[]): Session[] {
  return (raw ?? []).map((s: any) => ({ ...s, id: s.id ?? s.sessionId })) as Session[];
}

export default function TeacherOfficialTimetable() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [cfg, setCfg] = useState<Config | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  // On charge l'emploi officiel complet, puis on filtre selon le formateur connecté.
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isVirtualRoom = useCallback(
    (roomId: string) => {
      const salles = cfg?.salles ?? [];
      const found = salles.find((s: any) => (typeof s === "string" ? s === roomId : s?.id === roomId));
      const type = typeof found === "string" ? null : found?.type;
      return (type ?? "").toUpperCase() === "VIRTUEL";
    },
    [cfg]
  );

  const fusionMap = useMemo(() => {
    const m = new Map<string, string[]>();
    (catalog?.onlineFusions ?? []).forEach((f: any) => m.set(f.id, f.groupes ?? []));
    return m;
  }, [catalog]);

  const formatGroupLabel = useCallback(
    (groupeId: string) => {
      const expanded = fusionMap.get(groupeId);
      if (expanded && expanded.length) return expanded.join(" + ");
      return groupeId;
    },
    [fusionMap]
  );

  const salleIdsPhysical = useMemo(() => {
    const raw = cfg?.salles ?? [];
    const ids = raw
      .map((s: any) => (typeof s === "string" ? s : s?.id))
      .filter((x: any): x is string => typeof x === "string" && x.trim().length > 0);
    return ids.filter((id) => !isVirtualRoom(id));
  }, [cfg, isVirtualRoom]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);
      const tt = await getTimetable();
      setAllSessions(normalizeSessions((tt as any).sessions ?? []));
      toast({ title: "Actualisé", description: "Emploi officiel rechargé (vos séances)." });
    } catch (e: any) {
      setErr(e?.message ?? "Impossible de charger l'emploi officiel");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const onPrint = useCallback(async () => {
    // Impression via backend (PDF) plutôt que window.print()
    if (!user?.id) return;
    try {
      const blob = await httpBlob(
        `/api/reports/timetable/formateur/${encodeURIComponent(String(user.id))}`,
        { method: "GET" }
      );
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Impression impossible",
        description: e?.message ?? "Erreur lors de la génération du PDF",
      });
    }
  }, [toast, user?.id]);


  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [c1, c2, tt] = await Promise.all([getConfig(), getCatalog(), getTimetable()]);
        setCfg(c1);
        setCatalog(c2);
        setAllSessions(normalizeSessions((tt as any).sessions ?? []));
      } catch (e: any) {
        setErr(e?.message ?? "Configuration indisponible");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const teacherKey = useMemo(() => {
    const id = (user?.id ?? "").trim();
    const name = (user?.name ?? "").trim();
    return { id, name };
  }, [user]);

  const sessions = useMemo(() => {
    // Filtre robuste: on compare l'id (prioritaire) et, en fallback, le nom.
    const id = teacherKey.id;
    const name = teacherKey.name;
    if (!id && !name) return [];
    return allSessions.filter((s) => {
      const key = String((s as any).formateur ?? "").trim();
      if (!key) return false;
      if (id && key === id) return true;
      if (name && key.toLowerCase() === name.toLowerCase()) return true;
      return false;
    });
  }, [allSessions, teacherKey]);

  // Read-only view: no drag/drop actions, but ScheduleGrid expects these callbacks.
  const hasConflict = useCallback((_s: Session, _c: Cell) => null, []);
  const updateSession = useCallback(async (_id: string, _upd: Partial<Session>) => false, []);

  if (loading && !cfg) return <div className="p-6 text-sm text-gray-600">Chargement…</div>;
  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!cfg) return <div className="p-6 text-sm text-gray-600">Configuration indisponible.</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b p-4 shadow-sm print:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Emploi du temps (officiel)</h1>
            <p className="text-gray-500">Lecture seule — affichage limité à vos séances.</p>
          </div>
          <div className="flex gap-2">
            <button className="rounded border px-3 py-2 text-sm" onClick={onPrint}>
              Imprimer
            </button>
            <button className="rounded border px-3 py-2 text-sm" onClick={refresh} disabled={loading}>
              Actualiser
            </button>
          </div>
        </div>
      </header>

      <main className="p-4">
        <div className="bg-white rounded-md shadow-sm">
          <DndProvider backend={HTML5Backend}>
            <ScheduleGrid
              sessions={sessions}
              rooms={salleIdsPhysical}
              hasConflict={hasConflict}
              updateSession={updateSession}
              isLoading={loading}
              readOnly
              formatGroupLabel={formatGroupLabel}
            />
          </DndProvider>
        </div>
      </main>
    </div>
  );
}
