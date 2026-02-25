import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function httpJson<T>(url: string, init?: RequestInit): Promise<T> {
  const base = (API_BASE as string).replace(/\/+$/, "");
  const p = url.startsWith("/") ? url : `/${url}`;
  const fullUrl = `${base}${p}`;
  const token = localStorage.getItem("token");
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(fullUrl, {
    headers: { "Content-Type": "application/json", ...authHeader, ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.message || (data as any)?.error || `HTTP_${res.status}`;
    const err: any = new Error(msg);
    err.body = data;
    throw err;
  }
  return data as T;
}

// ── JSON Editor Tab ──────────────────────────────────────────────────────────
function JsonEditorTab({
  getUrl, putUrl, description,
}: {
  getUrl: string;
  putUrl: string;
  description: string;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await httpJson<unknown>(getUrl);
      setText(JSON.stringify(data, null, 2));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur chargement", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [getUrl]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      JSON.parse(text);
    } catch {
      toast({ variant: "destructive", title: "JSON invalide", description: "Corrigez la syntaxe avant de sauvegarder." });
      return;
    }
    setSaving(true);
    try {
      await httpJson(putUrl, { method: "PUT", body: text });
      toast({ title: "Sauvegardé ✓", description: "Fichier mis à jour." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur sauvegarde", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{description}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? "Chargement…" : "↺ Recharger"}
        </Button>
        <Button size="sm" onClick={save} disabled={saving || loading}>
          {saving ? "Sauvegarde…" : "💾 Sauvegarder"}
        </Button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="w-full min-h-[420px] font-mono text-sm p-3 border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
      />
    </div>
  );
}

// ── Launch Tab ───────────────────────────────────────────────────────────────
type Mode = "memetic" | "hc" | "cp_only";

const MODES: { value: Mode; label: string; desc: string }[] = [
  { value: "memetic", label: "🧬 Mémétique",    desc: "GA + HC intégré — qualité optimale (recommandé)" },
  { value: "hc",      label: "🔄 Hill Climbing", desc: "Plus rapide, bon compromis qualité/temps" },
  { value: "cp_only", label: "⚙️ CP seulement",  desc: "Contraintes dures uniquement, pas d'optimisation douce" },
];

function LaunchTab({ onJobStarted }: { onJobStarted: (id: string) => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("memetic");
  const [params, setParams] = useState({
    cp_time: 120,   cp_workers: 8,
    max_iterations: 10000,  max_no_improvement: 500,
    population: 100,  generations: 150,
    hc_freq: 10,    hc_top: 5,   hc_iter: 500,
    patience: 50,   perturb_threshold: 30,
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof params, v: number) => setParams((p) => ({ ...p, [k]: v }));

  const launch = async () => {
    setLoading(true);
    try {
      const data = await httpJson<{ ok: boolean; job_id: string; message?: string }>(
        "/api/generate/memetic",
        { method: "POST", body: JSON.stringify({ mode, params }) }
      );
      toast({ title: "Génération lancée 🚀", description: `Job : ${data.job_id}` });
      onJobStarted(data.job_id);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur lancement", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const Row = ({
    label, k, min = 1,
  }: {
    label: string; k: keyof typeof params; min?: number;
  }) => (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-700 w-60">{label}</label>
      <Input
        type="number" min={min} value={params[k]}
        onChange={(e) => set(k, Number(e.target.value))}
        className="w-28"
      />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Mode */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Mode d’optimisation</p>
        <div className="flex flex-wrap gap-3">
          {MODES.map(({ value, label, desc }) => (
            <label
              key={value}
              className={`flex items-start gap-2 cursor-pointer px-3 py-2 border rounded-lg hover:bg-gray-50 ${
                mode === value ? "border-blue-500 bg-blue-50" : ""
              }`}
            >
              <input
                type="radio" name="mode" value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-0.5"
              />
              <span>
                <span className="text-sm font-medium">{label}</span>
                <span className="block text-xs text-gray-500">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* CP params */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">⚙️ Options CP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <Row label="Temps max CP (secondes)" k="cp_time" />
          <Row label="Nombre de workers CP" k="cp_workers" />
        </CardContent>
      </Card>

      {/* Optimization params */}
      {mode !== "cp_only" && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">
              {mode === "memetic" ? "🧬 Options Mémétique (GA + HC)" : "🔄 Options Hill Climbing"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            {mode === "memetic" && (
              <>
                <Row label="Taille population" k="population" min={2} />
                <Row label="Nombre de générations" k="generations" />
                <Row label="Fréquence HC (toutes les N gén)" k="hc_freq" />
                <Row label="HC sur top K individus" k="hc_top" />
                <Row label="Itérations HC par individu" k="hc_iter" />
                <Row label="Patience early stopping" k="patience" />
                <Row label="Seuil perturbation (stall)" k="perturb_threshold" />
              </>
            )}
            <Row label="Max itérations HC" k="max_iterations" />
            <Row label="Max sans amélioration" k="max_no_improvement" />
          </CardContent>
        </Card>
      )}

      <Button onClick={launch} disabled={loading} size="lg" className="w-full sm:w-auto">
        {loading ? "⏳ Lancement…" : "▶ Lancer la génération"}
      </Button>
    </div>
  );
}

// ── Logs Tab ─────────────────────────────────────────────────────────────────
interface JobState {
  status: "idle" | "running" | "done" | "error";
  logs: string[];
  result: { ok: boolean; message?: string } | null;
}

function LogsTab({ jobId, onClear }: { jobId: string | null; onClear: () => void }) {
  const { toast } = useToast();
  const [job, setJob] = useState<JobState>({ status: "idle", logs: [], result: null });
  const bottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(
    async (id: string) => {
      try {
        const data = await httpJson<{
          ok: boolean; status: string; logs: string[]; result: any;
        }>(`/api/generate/status/${id}`);
        setJob({ status: data.status as JobState["status"], logs: data.logs ?? [], result: data.result });
        if (data.status !== "running") {
          if (timerRef.current) clearInterval(timerRef.current);
          if (data.status === "done")
            toast({ title: "✅ Génération terminée !", description: "timetable.json mis à jour." });
          if (data.status === "error")
            toast({ variant: "destructive", title: "❌ Échec", description: data.result?.message });
        }
      } catch { /* réseau: ignorer */ }
    },
    [toast]
  );

  useEffect(() => {
    if (!jobId) return;
    setJob({ status: "running", logs: [], result: null });
    poll(jobId);
    timerRef.current = setInterval(() => poll(jobId), 1500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [jobId, poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [job.logs]);

  const checkActive = async () => {
    try {
      const data = await httpJson<{ ok: boolean; job_id: string | null; status: string; logs: string[] }>(
        "/api/generate/status"
      );
      if (data.job_id) {
        if (timerRef.current) clearInterval(timerRef.current);
        poll(data.job_id);
        timerRef.current = setInterval(() => poll(data.job_id!), 1500);
        toast({ title: "Job trouvé", description: `ID : ${data.job_id}` });
      } else {
        toast({ title: "Aucun job actif", description: "Le backend est inactif." });
      }
    } catch { /* ignorer */ }
  };

  const badgeVariant: Record<JobState["status"], "default" | "secondary" | "destructive" | "outline"> = {
    idle: "secondary", running: "default", done: "default", error: "destructive",
  };
  const badgeLabel: Record<JobState["status"], string> = {
    idle: "Inactif", running: "En cours…", done: "Terminé ✓", error: "Erreur",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={badgeVariant[job.status]}>{badgeLabel[job.status]}</Badge>
        {jobId && (
          <span className="text-xs text-gray-400 font-mono truncate max-w-[260px]">{jobId}</span>
        )}
        <Button size="sm" variant="outline" onClick={checkActive}>
          🔍 Vérifier job actif
        </Button>
        <Button
          size="sm" variant="ghost"
          onClick={() => { setJob({ status: "idle", logs: [], result: null }); onClear(); }}
        >
          ✕ Effacer
        </Button>
      </div>

      {/* Log console */}
      <div className="bg-gray-950 rounded-lg p-4 h-[420px] overflow-y-auto font-mono text-xs leading-relaxed">
        {job.logs.length === 0 ? (
          <span className="text-gray-500">
            Aucun log pour le moment. Lancez une génération depuis l’onglet « Lancer ».
          </span>
        ) : (
          job.logs.map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("✓") || line.startsWith("✅")
                  ? "text-emerald-400"
                  : line.startsWith("✗") || line.startsWith("❌") || line.toLowerCase().startsWith("error")
                  ? "text-red-400"
                  : line.startsWith("⚠")
                  ? "text-yellow-400"
                  : "text-gray-200"
              }
            >
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {job.status === "done" && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
          ✅ Emploi du temps généré et sauvegardé dans timetable.json (version incrémentée).
        </p>
      )}
      {job.status === "error" && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          ❌ {job.result?.message ?? "Erreur inconnue. Voir les logs ci-dessus."}
        </p>
      )}
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────
export default function GenerateTimetable() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("launch");

  const handleJobStarted = (id: string) => {
    setCurrentJobId(id);
    setActiveTab("logs");
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🗓️ Génération Emploi du Temps</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configurez les paramètres, lancez l’algorithme mémétique et suivez les logs en temps réel.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="params">⚙️ Paramètres</TabsTrigger>
          <TabsTrigger value="hard">🔒 Contraintes</TabsTrigger>
          <TabsTrigger value="soft">🎯 Préférences</TabsTrigger>
          <TabsTrigger value="launch">🚀 Lancer</TabsTrigger>
          <TabsTrigger value="logs" className="relative">
            📋 Logs
            {currentJobId && (
              <span className="ml-1.5 h-2 w-2 rounded-full bg-blue-500 inline-block animate-pulse" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="params">
          <Card>
            <CardHeader>
              <CardTitle>⚙️ Configuration générale</CardTitle>
              <CardDescription>Jours, créneaux, salles, groupes — config.json</CardDescription>
            </CardHeader>
            <CardContent>
              <JsonEditorTab
                getUrl="/api/config"
                putUrl="/api/config"
                description="Modifiez jours, créneaux, salles et groupes. Cliquez Sauvegarder pour persister dans config.json."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hard">
          <Card>
            <CardHeader>
              <CardTitle>🔒 Contraintes dures</CardTitle>
              <CardDescription>Indisponibilités, règles absolues — hard.json</CardDescription>
            </CardHeader>
            <CardContent>
              <JsonEditorTab
                getUrl="/api/settings/hard"
                putUrl="/api/settings/hard"
                description="Indisponibilités formateurs/groupes/salles et exigences de salle obligatoire."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="soft">
          <Card>
            <CardHeader>
              <CardTitle>🎯 Préférences douces</CardTitle>
              <CardDescription>Poids et coûts pour l’optimisation — soft.json</CardDescription>
            </CardHeader>
            <CardContent>
              <JsonEditorTab
                getUrl="/api/settings/soft"
                putUrl="/api/settings/soft"
                description="Préférences de créneaux, poids des pénalités pour l’algorithme mémétique."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="launch">
          <Card>
            <CardHeader>
              <CardTitle>🚀 Lancer la génération</CardTitle>
              <CardDescription>Choisissez le mode et les paramètres, puis lancez l’algorithme.</CardDescription>
            </CardHeader>
            <CardContent>
              <LaunchTab onJobStarted={handleJobStarted} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>📋 Logs en temps réel</CardTitle>
              <CardDescription>Progression de la génération (polling toutes les 1,5 s).</CardDescription>
            </CardHeader>
            <CardContent>
              <LogsTab jobId={currentJobId} onClear={() => setCurrentJobId(null)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
