// src/pages/PendingRequests.tsx
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { ChangeRequest } from "@/types/changeRequests";
import {
  listAdminChanges,
  simulateAdminChange,
  approveAdminChange,
  rejectAdminChange,
  listTeacherChanges,
} from "@/api/changeRequestsApi";
import { useAuth } from "@/auth/AuthContext";
import { http } from "@/api/http";


// --- OPTION B (sans modifier l'API): on récupère tout en concaténant ---
async function listAllAdminChangesFallback(): Promise<ChangeRequest[]> {
  const [p, a, r, s] = await Promise.all([
    listAdminChanges("PENDING"),
    listAdminChanges("APPROVED"),
    listAdminChanges("REJECTED"),
    listAdminChanges("SUPERSEDED"),
  ]);
  return [...p, ...a, ...r, ...s].sort((x, y) => String(y.submittedAt).localeCompare(String(x.submittedAt)));
}

async function listAllTeacherChangesFallback(): Promise<ChangeRequest[]> {
  const [p, a, r, s] = await Promise.all([
    listTeacherChanges("PENDING"),
    listTeacherChanges("APPROVED"),
    listTeacherChanges("REJECTED"),
    listTeacherChanges("SUPERSEDED"),
  ]);
  return [...p, ...a, ...r, ...s].sort((x, y) => String(y.submittedAt).localeCompare(String(x.submittedAt)));
}

function fmtPos(p: { jour?: string; creneau?: number; salle?: string | null }) {
  const j = p?.jour ?? "-";
  const c = p?.creneau ?? "-";
  const s = p?.salle ?? "-";
  return `${j} • C${c} • ${s}`;
}

function titleFor(r: ChangeRequest) {
  const from = r.oldData ? fmtPos(r.oldData) : "-";
  const to = r.newData ? fmtPos(r.newData) : "-";
  return `${r.type} — ${from} → ${to}`;
}

function statusBadge(status: string) {
  const base = "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border";
  switch (status) {
    case "PENDING":
      return <span className={`${base} bg-yellow-50 border-yellow-200 text-yellow-700`}>PENDING</span>;
    case "APPROVED":
      return <span className={`${base} bg-green-50 border-green-200 text-green-700`}>APPROVED</span>;
    case "REJECTED":
      return <span className={`${base} bg-red-50 border-red-200 text-red-700`}>REJECTED</span>;
    case "SUPERSEDED":
      return <span className={`${base} bg-gray-50 border-gray-200 text-gray-700`}>SUPERSEDED</span>;
    default:
      return <span className={`${base} bg-gray-50 border-gray-200 text-gray-700`}>{status}</span>;
  }
}

export default function PendingRequests() {
  const { toast } = useToast();
  const { user } = useAuth();
  const role = user?.role;

  const [pendingItems, setPendingItems] = useState<ChangeRequest[]>([]);
  const [auditItems, setAuditItems] = useState<ChangeRequest[]>([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterSession, setFilterSession] = useState("");

  const refreshPending = async () => {
    const list = role === "formateur" ? await listTeacherChanges("PENDING") : await listAdminChanges("PENDING");
    setPendingItems(list);
  };

  const refreshAudit = async () => {
    const all = role === "formateur" ? await listAllTeacherChangesFallback() : await listAllAdminChangesFallback();
    setAuditItems(all);
  };

  const refreshAll = async () => {
    setLoading(true);
    setErr(null);
    try {
      await Promise.all([refreshPending(), refreshAudit()]);
    } catch (e: any) {
      setErr(e?.message ?? "Erreur chargement demandes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingFiltered = useMemo(() => {
    const t = filterTeacher.trim();
    const s = filterSession.trim();
    return pendingItems.filter((r) => {
      if (role !== "formateur" && t && String(r.teacherId) !== t) return false;
      if (s && String(r.sessionId) !== s) return false;
      return true;
    });
  }, [pendingItems, filterTeacher, filterSession, role]);

  const auditFiltered = useMemo(() => {
    const t = filterTeacher.trim();
    const s = filterSession.trim();
    return auditItems.filter((r) => {
      if (role !== "formateur" && t && String(r.teacherId) !== t) return false;
      if (s && String(r.sessionId) !== s) return false;
      return true;
    });
  }, [auditItems, filterTeacher, filterSession, role]);

  const onSimulate = async (r: ChangeRequest) => {
    try {
      await simulateAdminChange(r.id, "DIRECTEUR");
      toast({ title: "Simulation OK", description: `Demande ${r.id} valide à l’instant T.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Simulation échouée", description: e?.message ?? "Conflit/contraintes" });
    }
  };

  const onApprove = async (r: ChangeRequest) => {
    try {
      await approveAdminChange(r.id, "DIRECTEUR");
      toast({ title: "Approuvée", description: `Demande ${r.id} appliquée au planning officiel.` });
      await refreshAll();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Approbation refusée", description: e?.message ?? "Conflit/contraintes" });
      await refreshAll();
    }
  };

  const onReject = async (r: ChangeRequest) => {
    const reason = window.prompt("Motif du rejet ?", "Rejeté par le directeur");
    if (!reason) return;

    try {
      await rejectAdminChange(r.id, reason, "DIRECTEUR");
      toast({ title: "Rejetée", description: `Demande ${r.id} rejetée.` });
      await refreshAll();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur rejet", description: e?.message ?? "Impossible de rejeter" });
    }
  };

  // ✅ NOUVEAU : Annuler une demande (formateur uniquement)
  const onCancel = async (r: ChangeRequest) => {
    const ok = window.confirm("Annuler cette demande ? Elle sera supprimée.");
    if (!ok) return;

    try {
      await http<{ ok: boolean }>(`/api/teacher/changes/${r.id}`, { method: "DELETE" });
      toast({ title: "Annulée", description: `Demande ${r.id} supprimée.` });
      await refreshAll();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Annulation impossible",
        description: e?.message ?? "Erreur lors de l’annulation",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Demandes (Validation + Audit)</h1>
        <p className="text-gray-500">En haut : demandes PENDING (actions). En bas : audit complet (lecture seule).</p>
      </header>

      <main className="container mx-auto py-6 px-4">
        <div className="flex flex-wrap items-end gap-3 bg-white border rounded p-4">
          {role !== "formateur" ? (
            <div className="grid gap-1">
              <div className="text-sm font-medium">Filtrer par teacherId</div>
              <Input value={filterTeacher} onChange={(e) => setFilterTeacher(e.target.value)} placeholder="ex: 14017" />
            </div>
          ) : null}

          <div className="grid gap-1">
            <div className="text-sm font-medium">Filtrer par sessionId</div>
            <Input value={filterSession} onChange={(e) => setFilterSession(e.target.value)} placeholder="ex: SES_123" />
          </div>

          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={refreshAll} disabled={loading}>
              Actualiser
            </Button>
          </div>
        </div>

        {err ? <div className="mt-4 bg-red-50 text-red-600 p-4 rounded">{err}</div> : null}

        {/* -------------------- PENDING (actions) -------------------- */}
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Requêtes en attente (PENDING)</h2>
            <div className="text-sm text-gray-600">{pendingFiltered.length} élément(s)</div>
          </div>

          <div className="mt-3 space-y-3">
            {pendingFiltered.length === 0 ? (
              <div className="text-gray-600">Aucune demande PENDING.</div>
            ) : (
              pendingFiltered.map((r) => (
                <div key={r.id} className="bg-white border rounded p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {statusBadge(r.status)}
                        <div className="font-semibold truncate">{titleFor(r)}</div>
                      </div>

                      <div className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Req:</span> {r.id} •{" "}
                        <span className="font-medium">teacher:</span> {r.teacherId} •{" "}
                        <span className="font-medium">session:</span> {r.sessionId}
                      </div>

                      {r.newData?.motif ? <div className="text-sm text-gray-500 mt-1">Motif: {r.newData.motif}</div> : null}
                      <div className="text-xs text-gray-400 mt-1">Soumise: {r.submittedAt}</div>
                    </div>

                    {role !== "formateur" ? (
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onSimulate(r)}>
                          Simuler
                        </Button>
                        <Button onClick={() => onApprove(r)}>Approuver</Button>
                        <Button variant="destructive" onClick={() => onReject(r)}>
                          Rejeter
                        </Button>
                      </div>
                    ) : (
                      // ✅ Formateur: un seul bouton Annuler
                      <div className="flex gap-2">
                        <Button variant="destructive" onClick={() => onCancel(r)}>
                          Annuler
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* -------------------- AUDIT (lecture seule) -------------------- */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Audit : toutes les demandes</h2>
            <div className="text-sm text-gray-600">{auditFiltered.length} élément(s)</div>
          </div>

          <p className="text-gray-500 text-sm mt-1">
            Liste complète (PENDING, APPROVED, REJECTED, SUPERSEDED). Aucun bouton d’action ici.
          </p>

          <div className="mt-3 space-y-2">
            {auditFiltered.length === 0 ? (
              <div className="text-gray-600">Aucune demande dans l’audit.</div>
            ) : (
              auditFiltered.map((r) => (
                <div key={r.id} className="bg-white border rounded p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {statusBadge(r.status)}
                        <div className="font-medium truncate">{titleFor(r)}</div>
                      </div>

                      <div className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Req:</span> {r.id} •{" "}
                        <span className="font-medium">teacher:</span> {r.teacherId ?? "-"} •{" "}
                        <span className="font-medium">session:</span> {r.sessionId ?? "-"}
                      </div>

                      {r.decisionReason ? (
                        <div className="text-xs text-gray-500 mt-1">
                          <span className="font-medium">Décision:</span> {r.decisionReason}
                        </div>
                      ) : null}

                      <div className="text-xs text-gray-400 mt-1">
                        Soumise: {r.submittedAt}
                        {r.decidedAt ? ` • Décidée: ${r.decidedAt}` : ""}
                        {r.decidedBy ? ` • Par: ${r.decidedBy}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
