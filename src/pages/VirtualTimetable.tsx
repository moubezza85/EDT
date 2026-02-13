// src/pages/VirtualTimetable.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import VirtualScheduleGrid from "@/components/VirtualScheduleGrid";
import FilterBar from "@/components/FilterBar";
import AddSessionModal from "@/components/AddSessionModal";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";

import { useAuth } from "@/auth/AuthContext";

import { getConfig, type Config } from "@/api/configApi";
import { getAdminVirtualDraft, publishDraftTimetable } from "@/api/draftApi";
import { getCatalog, type Catalog } from "@/api/catalogApi";
import { getTeacherTimetable } from "@/api/teacherApi";
import { createTeacherChange, listTeacherChanges, listAdminChanges } from "@/api/changeRequestsApi";
import { addSession } from "@/api/timetableApi";
import { sendTimetableCommand } from "@/api/commandsApi";

import type { FilterType, Session } from "@/types";
import type { ChangeRequest } from "@/types/changeRequests";

const ALL = "_all";

function normalizeSessions(raw: any[]): Session[] {
  return (raw ?? []).map((s: any) => ({ ...s, id: s.id ?? s.sessionId })) as Session[];
}


function buildVirtualFromRequests(official: Session[], requests: ChangeRequest[]) {
  const base = official.map((s: any) => ({ ...s }));
  const extra: any[] = [];

  const byId = new Map<string, any>();
  base.forEach((s: any) => byId.set(String(s.id), s));

  for (const r of requests ?? []) {
    const type = String((r as any).type ?? "").toUpperCase();
    const sessionId = String((r as any).sessionId ?? "");
    const oldData = (r as any).oldData ?? {};
    const newData = (r as any).newData ?? {};

    if (type === "DELETE") {
      const s = byId.get(sessionId);
      if (s) {
        (s as any)._virtualState = "TO_DELETE";
        (s as any)._virtualRequestId = (r as any).id ?? (r as any).requestId;
      }
      continue;
    }

    if (type === "INSERT") {
      extra.push({
        id: sessionId || `ghost:${(r as any).id ?? (r as any).requestId}`,
        ...newData,
        _virtualState: "INSERTED",
        _virtualRequestId: (r as any).id ?? (r as any).requestId,
      });
      continue;
    }

    if (type === "MOVE" || type === "CHANGE_ROOM") {
      const s = byId.get(sessionId);
      if (s) {
        (s as any)._virtualState = "MOVED_AWAY";
        (s as any)._virtualRequestId = (r as any).id ?? (r as any).requestId;
      }
      extra.push({
        id: sessionId,
        ...(type === "CHANGE_ROOM"
          ? { ...s, ...oldData, salle: newData?.salle }
          : { ...s, ...oldData, ...newData }),
        jour: String(newData?.jour ?? oldData?.jour ?? s?.jour),
        creneau: Number(newData?.creneau ?? oldData?.creneau ?? s?.creneau),
        salle: String(newData?.salle ?? oldData?.salle ?? s?.salle),
        _virtualState: "PROPOSED_DESTINATION",
        _virtualRequestId: (r as any).id ?? (r as any).requestId,
      });
    }
  }

  return { base, extra };
}

export default function VirtualTimetable() {
  const { toast } = useToast();
  const { user } = useAuth();

  const role = user?.role;

  // ---- config ----
  const [cfg, setCfg] = useState<Config | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  // ---- add modal ----
  const [addOpen, setAddOpen] = useState(false);

  // ---- teacher data ----
  const [officialSessions, setOfficialSessions] = useState<Session[]>([]);
  const [officialVersion, setOfficialVersion] = useState<number>(1);
  const officialVersionRef = useRef<number>(1);
  const [virtualBase, setVirtualBase] = useState<Session[]>([]);
  const [virtualExtra, setVirtualExtra] = useState<Session[]>([]);
  const [pending, setPending] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // draft meta (for admin publish)
  const [draftWeekStart, setDraftWeekStart] = useState<string>("");
  const [draftRevision, setDraftRevision] = useState<number>(1);

  // -------- helpers: virtual rooms + fusions --------
  const isVirtualRoom = useCallback(
    (roomId: string) => {
      const salles = cfg?.salles ?? [];
      const found = salles.find((s: any) => (typeof s === "string" ? s === roomId : s?.id === roomId));
      const type = typeof found === "string" ? null : found?.type;
      return (type ?? "").toUpperCase() === "VIRTUEL";
    },
    [cfg]
  );

  // FIX: OnlineFusion a "groupes"
  const fusionMap = useMemo(() => {
    const m = new Map<string, string[]>();
    (catalog?.onlineFusions ?? []).forEach((f: any) => m.set(f.id, f.groupes ?? []));
    return m;
  }, [catalog]);

  const expandGroupIds = useCallback(
    (groupeId: string) => {
      const kids = fusionMap.get(groupeId);
      return kids?.length ? kids : [groupeId];
    },
    [fusionMap]
  );

  const formatGroupLabel = useCallback(
    (groupeId: string) => {
      const kids = fusionMap.get(groupeId);
      return kids?.length ? `${groupeId}` : groupeId;
    },
    [fusionMap]
  );

  // ---- rooms for grid (salles physiques uniquement) ----
  const salleIdsPhysical = useMemo(() => {
    const raw = cfg?.salles ?? [];
    const ids = raw
      .map((s: any) => (typeof s === "string" ? s : s?.id))
      .filter((x: any): x is string => typeof x === "string" && x.trim().length > 0);
    return ids.filter((id) => !isVirtualRoom(id));
  }, [cfg, isVirtualRoom]);

  // ---- filter state (virtuel) ----
  const [filters, setFilters] = useState<{ formateur: string; groupe: string; salle: string }>({
    formateur: ALL,
    groupe: ALL,
    salle: ALL,
  });

  const handleFilterChange = useCallback((type: FilterType, value: string) => {
    setFilters((p) => ({ ...p, [type]: value }));
  }, []);

  const handleClearFilter = useCallback((type: FilterType) => {
    setFilters((p) => ({ ...p, [type]: ALL }));
  }, []);

  // ---- hasConflict (sur les séances officielles du formateur) ----
  const hasConflict = useCallback(
    (session: Session, targetCell: { day: string; slot: number }): Session | null => {
      const groupsA = expandGroupIds(session.groupe);
      const isVirt = (id: string) => isVirtualRoom(id);
      return (
        officialSessions.find((s) => {
          if (String(s.id) === String(session.id)) return false;
          if (s.jour !== targetCell.day || s.creneau !== targetCell.slot) return false;
          const sameRoom = s.salle === session.salle && !isVirt(session.salle) && !isVirt(s.salle);
          const sameTeacher = s.formateur === session.formateur;
          const groupsB = expandGroupIds(s.groupe);
          const sameGroup = groupsA.some((g) => groupsB.includes(g));
          return sameRoom || sameTeacher || sameGroup;
        }) || null
      );
    },
    [officialSessions, expandGroupIds, isVirtualRoom]
  );

  // ---- load meta (config + catalog) ----
  useEffect(() => {
    (async () => {
      try {
        setLoadingMeta(true);
        setMetaErr(null);
        const [c1, c2] = await Promise.all([getConfig(), getCatalog()]);
        setCfg(c1);
        setCatalog(c2);
      } catch (e: any) {
        setMetaErr(e?.message ?? "Erreur chargement config/catalog");
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, []);

  const refreshTeacher = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);
      const tt = await getTeacherTimetable();
      // teacher endpoint peut ne pas exposer version, on garde celle du planning officiel
      setOfficialSessions(normalizeSessions(tt.sessions));
      setVirtualBase(normalizeSessions(tt.virtual?.sessionsBase ?? tt.sessions));
      setVirtualExtra(normalizeSessions(tt.virtual?.sessionsExtra ?? []));
      // pendingRequests peut être présent
      const list = tt.pendingRequests?.length ? tt.pendingRequests : await listTeacherChanges("PENDING");
      setPending(list);
    } catch (e: any) {
      setErr(e?.message ?? "Impossible de charger l'emploi virtuel");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAdminVirtual = useCallback(async () => {
    try {
      setLoading(true);
      setErr(null);

      // Server-side virtual view is based on the draft timetable (nextTimetable.json)
      const tt = await getAdminVirtualDraft();
      const base = normalizeSessions((tt as any).sessions ?? []);
      const serverVersion = Number((tt as any).version ?? 1);
      setOfficialVersion(serverVersion);
      officialVersionRef.current = serverVersion;
      setOfficialSessions(base);

      const vb = normalizeSessions((tt as any).virtual?.sessionsBase ?? base);
      const ve = normalizeSessions((tt as any).virtual?.sessionsExtra ?? []);
      setVirtualBase(vb);
      setVirtualExtra(ve);
      setPending((tt as any).pendingRequests ?? (await listAdminChanges("PENDING")));

      const ws = String((tt as any).draft?.week_start ?? "");
      const rev = Number((tt as any).draft?.revision ?? 1);
      setDraftWeekStart(ws);
      setDraftRevision(rev);
    } catch (e: any) {
      setErr(e?.message ?? "Impossible de charger l'emploi virtuel (admin)");
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePublish = useCallback(async () => {
    if (!draftWeekStart) {
      toast({
        variant: "destructive",
        title: "week_start manquant",
        description: "Veuillez saisir la date du lundi (YYYY-MM-DD) avant de publier.",
      });
      return;
    }
    const ok = window.confirm(
      `Publier le brouillon (week_start=${draftWeekStart}) ?\n\n- Backup timetable.json -> history/timetable_YYYYMMDD.json\n- nextTimetable.json -> timetable.json\n- Reset du cycle de négociation`
    );
    if (!ok) return;

    try {
      setLoading(true);
      await publishDraftTimetable(draftWeekStart);
      toast({ title: "Publié", description: "Le nouvel emploi du temps officiel a été publié." });
      await refreshAdminVirtual();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Erreur publication",
        description: e?.message ?? "Impossible de publier",
      });
    } finally {
      setLoading(false);
    }
  }, [draftWeekStart, refreshAdminVirtual, toast]);

  // Keep ref in sync
  useEffect(() => {
    officialVersionRef.current = officialVersion;
  }, [officialVersion]);

  useEffect(() => {
    if (role === "formateur") {
      refreshTeacher();
    } else {
      // admin: la page reste utilisable (mais moins critique)
      refreshAdminVirtual();
    }
  }, [role, refreshTeacher, refreshAdminVirtual]);

  // ---- ghost + moved ids (pour VirtualScheduleGrid) ----
  const movedSessionIds = useMemo(() => {
    const s = new Set<string>();
    virtualBase.forEach((x: any) => {
      if (String(x?._virtualState) === "MOVED_AWAY") s.add(String(x.id));
    });
    return s;
  }, [virtualBase]);

  const ghostSessions = useMemo(() => {
    // Pour la grille, on affiche uniquement les destinations proposées + insert
    const base = virtualExtra.map((s: any) => ({
      id: `ghost:${String(s._virtualRequestId ?? s.id)}`,
      originalSessionId: String(s.id),
      requestId: String(s._virtualRequestId ?? s.id),
      jour: String(s.jour),
      creneau: Number(s.creneau),
      salle: String(s.salle ?? ""),
      module: s.module,
      groupe: s.groupe,
      formateur: s.formateur,
      motif: null,
      hasCollision: false,
    }));
    // Filtrer les cartes de modifications selon les filtres actifs (formateur/groupe/salle)
    return base.filter((g: any) => {
      if (filters.formateur !== ALL && String(g.formateur) !== filters.formateur) return false;
      if (filters.salle !== ALL && String(g.salle) !== filters.salle) return false;
      if (filters.groupe !== ALL) {
        const groups = expandGroupIds(String(g.groupe));
        if (String(g.groupe) !== filters.groupe && !groups.includes(filters.groupe)) return false;
      }
      return true;
    });
  }, [virtualExtra, filters, expandGroupIds]);

  // ---- filtres appliqués (sur base virtuelle) ----
  const filteredSessions = useMemo(() => {
    const list = virtualBase;
    return list.filter((s) => {
      if (filters.formateur !== ALL && String(s.formateur) !== filters.formateur) return false;
      if (filters.salle !== ALL && String(s.salle) !== filters.salle) return false;
      if (filters.groupe !== ALL) {
        const groups = expandGroupIds(String(s.groupe));
        if (String(s.groupe) !== filters.groupe && !groups.includes(filters.groupe)) return false;
      }
      return true;
    });
  }, [virtualBase, filters, expandGroupIds]);

  const uniqueFormateurValues = useMemo(() => [...new Set(officialSessions.map((s) => s.formateur))], [officialSessions]);
  const uniqueGroupeValues = useMemo(() => [...new Set(officialSessions.map((s) => s.groupe))], [officialSessions]);
  const uniqueSalleValues = useMemo(() => [...new Set(officialSessions.map((s) => s.salle))], [officialSessions]);

  const groupeOptions = useMemo(() => {
    const fromCatalog = (((catalog as any)?.groups ?? []) as string[]).filter((g) => (g ?? "").trim().length > 0);
    return fromCatalog.length ? fromCatalog : uniqueGroupeValues;
  }, [catalog, uniqueGroupeValues]);

  const salleOptions = useMemo(() => uniqueSalleValues.filter((id) => !isVirtualRoom(id)), [uniqueSalleValues, isVirtualRoom]);

  // ---- actions (formateur) ----
  const updateSession = useCallback(
    async (sessionId: string, updates: Partial<Session>) => {
      // Admin: appliquer directement au planning VIRTUEL (draft) via /api/timetable/commands?scope=draft
      if (role === "admin") {
        try {
          const commandId =
            (globalThis as any).crypto?.randomUUID?.() ?? `cmd_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          const res = await sendTimetableCommand(
            {
            commandId,
            expectedVersion: officialVersionRef.current,
            type: "MOVE_SESSION",
            payload: {
              sessionId: String(sessionId),
              toJour: String(updates.jour),
              toCreneau: Number(updates.creneau),
              toSalle: String(updates.salle),
            },
            },
            "draft"
          );
          // Update local version immediately to reduce VERSION_MISMATCH on rapid moves
          if (typeof (res as any)?.version === "number") {
            setOfficialVersion((res as any).version);
            officialVersionRef.current = (res as any).version;
          }
          await refreshAdminVirtual();
          return true;
        } catch (e: any) {
          toast({
            variant: "destructive",
            title: "Déplacement refusé",
            description: e?.body?.message ?? e?.message ?? "Conflit ou version obsolète",
          });
          await refreshAdminVirtual();
          return false;
        }
      }

      // Formateur: créer une demande (avec validation conflit côté backend)
      if (role !== "formateur") return false;
      try {
        await createTeacherChange({
          type: "MOVE",
          sessionId,
          newData: {
            jour: updates.jour,
            creneau: updates.creneau,
            salle: updates.salle,
          },
        });
        toast({ title: "Demande envoyée", description: "Déplacement ajouté aux requêtes (PENDING)." });
        await refreshTeacher();
        return true;
      } catch (e: any) {
        toast({ variant: "destructive", title: "Déplacement refusé", description: e?.message ?? "Erreur" });
        await refreshTeacher();
        return false;
      }
    },
    [role, toast, refreshTeacher, refreshAdminVirtual]
  );

  const onDeleteSession = useCallback(
    async (sessionId: string) => {
      // Admin: suppression directe (planning virtuel / draft)
      if (role === "admin") {
        try {
          const commandId =
            (globalThis as any).crypto?.randomUUID?.() ?? `cmd_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          const res = await sendTimetableCommand(
            {
            commandId,
            expectedVersion: officialVersionRef.current,
            type: "DELETE_SESSION",
            payload: { sessionId: String(sessionId) },
            },
            "draft"
          );
          if (typeof (res as any)?.version === "number") {
            setOfficialVersion((res as any).version);
            officialVersionRef.current = (res as any).version;
          }
          toast({ title: "Séance supprimée", description: "Suppression appliquée au planning virtuel (draft)." });
          await refreshAdminVirtual();
          return { ok: true as const };
        } catch (e: any) {
          toast({
            variant: "destructive",
            title: "Suppression refusée",
            description: e?.body?.message ?? e?.message ?? "Conflit ou version obsolète",
          });
          await refreshAdminVirtual();
          return { ok: false as const, error: e?.body?.message ?? e?.message ?? "Erreur" };
        }
      }

      // Formateur: création d'une demande DELETE (PENDING)
      if (role !== "formateur") return { ok: false as const, error: "Action non autorisée" };
      try {
        await createTeacherChange({ type: "DELETE", sessionId });
        toast({ title: "Demande envoyée", description: "Suppression ajoutée aux requêtes (PENDING)." });
        await refreshTeacher();
        return { ok: true as const };
      } catch (e: any) {
        await refreshTeacher();
        return { ok: false as const, error: e?.message ?? "Erreur" };
      }
    },
    [role, toast, refreshTeacher, refreshAdminVirtual]
  );

  const handleAdd = useCallback(
    async (data: any) => {
      if (role === "admin") {
        // admin: ajout direct sur le draft (planning virtuel)
        await addSession(data, "draft");
        toast({ title: "Séance ajoutée", description: "Séance ajoutée au brouillon (draft)." });
        await refreshAdminVirtual();
        return;
      }
      // formateur: INSERT => change_requests
      await createTeacherChange({
        type: "INSERT",
        newData: {
          formateur: user?.id,
          groupe: data.groupe,
          module: data.module,
          jour: data.jour,
          creneau: data.creneau,
          salle: data.salle,
        },
      });
      toast({ title: "Demande envoyée", description: "Ajout ajouté aux requêtes (PENDING)." });
      await refreshTeacher();
    },
    [role, user?.id, toast, refreshTeacher, refreshAdminVirtual]
  );

  if (loadingMeta) return <div className="p-6 text-sm text-gray-600">Chargement…</div>;
  if (metaErr) return <div className="p-6 text-sm text-red-600">{metaErr}</div>;
  if (!cfg || !catalog) return <div className="p-6 text-sm text-gray-600">Configuration indisponible.</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b p-4 shadow-sm print:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {role === "formateur" ? "Emploi temporaire (Formateur)" : "Emploi temporaire"}
            </h1>
            <p className="text-gray-500">
              {role === "formateur"
                ? "Déplacer / ajouter / supprimer crée des requêtes (PENDING)."
                : "Vue de travail."}
            </p>
          </div>

          <div className="flex gap-2">
            {role === "admin" ? (
              <div className="flex items-center gap-2 mr-2">
                <div className="text-xs text-gray-600">
                  <div>
                    <span className="font-medium">Draft</span> • revision {draftRevision}
                  </div>
                  <div className="text-[11px]">week_start (lundi)</div>
                </div>
                <Input
                  className="h-9 w-[140px]"
                  placeholder="YYYY-MM-DD"
                  value={draftWeekStart}
                  onChange={(e) => setDraftWeekStart(e.target.value)}
                />
                <button
                  className="rounded border px-3 py-2 text-sm"
                  onClick={handlePublish}
                  disabled={loading}
                  title="Publier le brouillon vers l'emploi officiel"
                >
                  Publier
                </button>
              </div>
            ) : null}
            {role === "admin" ? (
              <button className="rounded bg-black px-3 py-2 text-white" onClick={() => setAddOpen(true)}>
                + Ajouter une séance
              </button>
            ) : (
              <button className="rounded bg-black px-3 py-2 text-white" onClick={() => setAddOpen(true)}>
                + Proposer une séance
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="p-4">
        {err ? <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{err}</div> : null}

        <div className="print:hidden">
          <FilterBar
            formateurOptions={uniqueFormateurValues}
            groupeOptions={groupeOptions}
            salleOptions={salleOptions}
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilter={handleClearFilter}
            onRefresh={role === "formateur" ? refreshTeacher : refreshAdminVirtual}
            isLoading={loading}
            hideTeacherFilter={role === "formateur"}
          />
        </div>

        <div className="mt-4 bg-white rounded-md shadow-sm">
          <DndProvider backend={HTML5Backend}>
            <VirtualScheduleGrid
              sessions={filteredSessions}
              ghostSessions={ghostSessions}
              movedSessionIds={movedSessionIds}
              hasConflict={hasConflict as any}
              updateSession={async (sid, upd) => updateSession(String(sid), upd)}
              rooms={salleIdsPhysical}
              roomsScope={role === "admin" ? "draft" : "official"}
              isLoading={loading}
              onDeleteSession={role === "formateur" || role === "admin" ? (id) => onDeleteSession(String(id)) : undefined}
              formatGroupLabel={formatGroupLabel}
            />
          </DndProvider>
        </div>
      </main>

      <AddSessionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        jours={cfg.jours ?? []}
        creneaux={cfg.creneaux ?? []}
        salles={salleIdsPhysical}
        catalog={catalog}
        occupiedSessions={[
          ...virtualBase.filter((s: any) => String((s as any)?._virtualState) !== "MOVED_AWAY"),
          ...virtualExtra,
        ]}
        fixedTrainerId={role === "formateur" ? user?.id : undefined}
        lockTrainer={role === "formateur"}
        roomsScope={role === "admin" ? "draft" : "official"}
        // formateur: AddSessionModal doit déjà filtrer ses modules côté UI; sinon backend refusera
        onSubmit={async (data) => {
          try {
            await handleAdd(data);
            setAddOpen(false);
          } catch (e: any) {
            toast({ variant: "destructive", title: "Erreur", description: e?.message ?? "Impossible" });
          }
        }}
      />
    </div>
  );
}
