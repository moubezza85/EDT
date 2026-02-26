import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import HardConstraintsTab from "@/components/settings/HardConstraintsTab";
import SoftConstraintsTab from "@/components/settings/SoftConstraintsTab";

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

function uniqNumsSorted(arr: number[]) {
  return Array.from(new Set(arr.filter((x) => Number.isFinite(x)))).sort((a, b) => a - b);
}

function addUniqueKeepOrder(list: string[], value: string) {
  const v = value.trim();
  if (!v) return list;
  if (list.includes(v)) return list;
  return [...list, v];
}

function OrderedTagEditor({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder?: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange(addUniqueKeepOrder(values, v));
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder ?? "Ajouter..."}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" onClick={add}>
          Ajouter
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
            {v}
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onChange(values.filter((x) => x !== v))}
              title="X"
            >
              ×
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-sm text-muted-foreground">Aucune valeur</span>}
      </div>
    </div>
  );
}

// ── Config Tab ─────────────────────────────────────────────────────────────
type ConfigMeta = {
  nomEtablissement: string;
  jours: string[];
  creneaux: number[];
  maxSessionsPerDayTeacher: number;
  maxSessionsPerDayGroup: number;
  massHoraireMinimale: number;
};

function ConfigTab() {
  const { toast } = useToast();
  const [meta, setMeta] = useState<ConfigMeta>({
    nomEtablissement: "",
    jours: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
    creneaux: [1, 2, 3, 4],
    maxSessionsPerDayTeacher: 3,
    maxSessionsPerDayGroup: 3,
    massHoraireMinimale: 26,
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cm = await httpJson<ConfigMeta>("/api/admin/config/meta");
      setMeta({
        nomEtablissement: cm?.nomEtablissement ?? "",
        jours: Array.isArray(cm?.jours) ? cm.jours : [],
        creneaux: Array.isArray(cm?.creneaux) ? cm.creneaux : [],
        maxSessionsPerDayTeacher: Number(cm?.maxSessionsPerDayTeacher ?? 3),
        maxSessionsPerDayGroup: Number(cm?.maxSessionsPerDayGroup ?? 3),
        massHoraireMinimale: Number(cm?.massHoraireMinimale ?? 26),
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur chargement", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setLoading(true);
    try {
      const cleaned: ConfigMeta = {
        nomEtablissement: meta.nomEtablissement ?? "",
        jours: (meta.jours || []).map((x) => x.trim()).filter(Boolean),
        creneaux: uniqNumsSorted((meta.creneaux || []).map((x) => Number(x))),
        maxSessionsPerDayTeacher: Number(meta.maxSessionsPerDayTeacher ?? 3),
        maxSessionsPerDayGroup: Number(meta.maxSessionsPerDayGroup ?? 3),
        massHoraireMinimale: Number(meta.massHoraireMinimale ?? 26),
      };
      await httpJson("/api/admin/config/meta", { method: "PUT", body: JSON.stringify(cleaned) });
      toast({ title: "Configuration enregistrée ✓" });
      setMeta(cleaned);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur sauvegarde", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Nom de l'établissement</Label>
          <Input
            value={meta.nomEtablissement}
            onChange={(e) => setMeta((p) => ({ ...p, nomEtablissement: e.target.value }))}
            placeholder="Ex: OFPPT EST Meknès"
            disabled={loading}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Max séances/jour/formateur</Label>
            <Input
              type="number"
              value={meta.maxSessionsPerDayTeacher}
              onChange={(e) => setMeta((p) => ({ ...p, maxSessionsPerDayTeacher: Number(e.target.value) }))}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label>Max séances/jour/groupe</Label>
            <Input
              type="number"
              value={meta.maxSessionsPerDayGroup}
              onChange={(e) => setMeta((p) => ({ ...p, maxSessionsPerDayGroup: Number(e.target.value) }))}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label>Masse horaire minimale (h)</Label>
            <Input
              type="number"
              value={meta.massHoraireMinimale}
              onChange={(e) => setMeta((p) => ({ ...p, massHoraireMinimale: Number(e.target.value) }))}
              disabled={loading}
              placeholder="26"
            />
          </div>
        </div>
      </div>

      <Separator />

      <OrderedTagEditor
        label="Jours (ordre conservé)"
        values={meta.jours}
        placeholder="Ex: lundi"
        onChange={(next) => setMeta((p) => ({ ...p, jours: next }))}
      />

      <Separator />

      <div className="space-y-2">
        <Label>Créneaux</Label>
        <p className="text-xs text-muted-foreground">
          Les créneaux sont triés numériquement lors de l'enregistrement.
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {meta.creneaux.map((c) => (
            <span key={c} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
              {c}
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setMeta((p) => ({ ...p, creneaux: p.creneaux.filter((x) => x !== c) }))}
                disabled={loading}
              >×</button>
            </span>
          ))}
          {meta.creneaux.length === 0 && <span className="text-sm text-muted-foreground">Aucun créneau</span>}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Ajouter un créneau (ex: 5)"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = (e.currentTarget.value || "").trim();
                const n = Number(v);
                if (!Number.isFinite(n)) return;
                setMeta((p) => ({ ...p, creneaux: uniqNumsSorted([...p.creneaux, n]) }));
                e.currentTarget.value = "";
              }
            }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={loading}>
          {loading ? "Sauvegarde…" : "💾 Enregistrer"}
        </Button>
        <Button variant="outline" onClick={load} disabled={loading}>↻ Recharger</Button>
      </div>
    </div>
  );
}

// ── Types Séances ───────────────────────────────────────────────────────────
type SeanceMode = "PRESENTIEL" | "DISTANCIEL";

interface Seance {
  id: string;
  teacher: string;      // matricule
  group: string;
  module: string;
  volume: number;       // nombre de séances
  mode: SeanceMode;
}

interface TeacherInfo {
  id: string;
  name: string;
}

interface Assignment {
  teacher: string;
  group: string;
  module: string;
  mode: string;
}

// ── Séances Tab ─────────────────────────────────────────────────────────────
function SeancesTab() {
  const { toast } = useToast();
  const [seances, setSeances] = useState<Seance[]>([]);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [massMin, setMassMin] = useState<number>(26);
  const [loading, setLoading] = useState(false);

  // Modale ajout
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<string>("");
  const [newSeance, setNewSeance] = useState<Partial<Seance>>({
    mode: "PRESENTIEL",
    volume: 1,
  });

  // volumes locaux en cours d'édition
  const [localVolumes, setLocalVolumes] = useState<Record<string, number>>({});

  const HEURES_PAR_SEANCE = 2.5;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [seancesData, catalogData, configData] = await Promise.all([
        httpJson<{ seances: Seance[] }>("/api/admin/seances"),
        httpJson<{ teachers: TeacherInfo[]; assignments: Assignment[] }>("/api/admin/catalog/teachers").then(
          async (t) => {
            const asgn = await httpJson<{ assignments: Assignment[] }>("/api/admin/catalog/assignments");
            return { teachers: t.teachers, assignments: asgn.assignments };
          }
        ),
        httpJson<{ massHoraireMinimale?: number }>("/api/admin/config/meta"),
      ]);
      setSeances(seancesData.seances || []);
      setTeachers(catalogData.teachers || []);
      setAssignments(catalogData.assignments || []);
      setMassMin(Number(configData.massHoraireMinimale ?? 26));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur chargement", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Calcul heures par formateur
  const heuresByTeacher = (teacherId: string) => {
    const total = seances
      .filter((s) => s.teacher === teacherId)
      .reduce((sum, s) => sum + (s.volume || 0), 0);
    return total * HEURES_PAR_SEANCE;
  };

  // Formateurs sous le seuil
  const teachersUnderThreshold = teachers.filter(
    (t) => heuresByTeacher(t.id) < massMin
  );

  // Modules affectés à un formateur
  const modulesForTeacher = (teacherId: string) => {
    return [...new Set(
      assignments
        .filter((a) => a.teacher === teacherId)
        .map((a) => a.module)
    )];
  };

  // Groupes disponibles pour un formateur+module
  const groupsForTeacherModule = (teacherId: string, module: string) => {
    return assignments
      .filter((a) => a.teacher === teacherId && a.module === module)
      .map((a) => a.group);
  };

  const getTeacherName = (id: string) =>
    teachers.find((t) => t.id === id)?.name ?? id;

  // Ouvre modal pour un formateur
  const openModal = (teacherId: string) => {
    setSelectedTeacher(teacherId);
    const mods = modulesForTeacher(teacherId);
    setNewSeance({
      mode: "PRESENTIEL",
      volume: 1,
      module: mods[0] ?? "",
      group: mods[0] ? groupsForTeacherModule(teacherId, mods[0])[0] ?? "" : "",
    });
    setModalOpen(true);
  };

  const handleAddSeance = async () => {
    if (!selectedTeacher || !newSeance.group || !newSeance.module) {
      toast({ variant: "destructive", title: "Champs requis", description: "Groupe, module requis." });
      return;
    }
    try {
      await httpJson("/api/admin/seances", {
        method: "POST",
        body: JSON.stringify({
          teacher: selectedTeacher,
          group: newSeance.group,
          module: newSeance.module,
          volume: newSeance.volume ?? 1,
          mode: newSeance.mode ?? "PRESENTIEL",
        }),
      });
      toast({ title: "Séance ajoutée ✓" });
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: e.message });
    }
  };

  const handleSaveVolume = async (seance: Seance) => {
    const vol = localVolumes[seance.id] ?? seance.volume;
    try {
      await httpJson(`/api/admin/seances/${seance.id}`, {
        method: "PUT",
        body: JSON.stringify({ volume: vol }),
      });
      toast({ title: "Volume mis à jour ✓" });
      load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: e.message });
    }
  };

  const handleDeleteSeance = async (id: string) => {
    if (!confirm("Supprimer cette séance ?")) return;
    try {
      await httpJson(`/api/admin/seances/${id}`, { method: "DELETE" });
      toast({ title: "Séance supprimée" });
      load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: e.message });
    }
  };

  // Séances par formateur
  const seancesByTeacher = (teacherId: string) =>
    seances.filter((s) => s.teacher === teacherId);

  return (
    <div className="space-y-5">
      {/* Bannière formateurs sous seuil */}
      {teachersUnderThreshold.length > 0 && (
        <Card className="border-orange-300 bg-orange-50">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm text-orange-700">
              ⚠️ Formateurs avec masse horaire &lt; {massMin}h
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-2">
              {teachersUnderThreshold.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-full bg-orange-100 border border-orange-300 px-3 py-1 text-xs font-medium text-orange-800"
                >
                  <span className="font-mono text-orange-600">{t.id}</span>
                  <span>{t.name}</span>
                  <span className="text-orange-500">— {heuresByTeacher(t.id).toFixed(1)}h</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
      )}

      {/* Cartes par formateur */}
      {!loading && teachers.map((teacher) => {
        const tSeances = seancesByTeacher(teacher.id);
        const heures = heuresByTeacher(teacher.id);
        const underThreshold = heures < massMin;
        return (
          <Card
            key={teacher.id}
            className={underThreshold ? "border-orange-300" : ""}
          >
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground bg-gray-100 rounded px-2 py-0.5">
                    {teacher.id}
                  </span>
                  <span className="font-semibold text-sm">{teacher.name}</span>
                  <Badge variant={underThreshold ? "destructive" : "secondary"}>
                    {heures.toFixed(1)}h ({tSeances.reduce((s, x) => s + (x.volume || 0), 0)} séances)
                  </Badge>
                </div>
                <Button size="sm" onClick={() => openModal(teacher.id)}>
                  + Ajouter séance
                </Button>
              </div>
            </CardHeader>

            {tSeances.length > 0 && (
              <CardContent className="px-4 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="pb-2 pr-4">Mode</th>
                        <th className="pb-2 pr-4">Groupe</th>
                        <th className="pb-2 pr-4">Module</th>
                        <th className="pb-2 pr-4 w-28">Volume (séances)</th>
                        <th className="pb-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tSeances.map((s) => {
                        const localVol =
                          localVolumes[s.id] !== undefined
                            ? localVolumes[s.id]
                            : s.volume;
                        const isDirty = localVol !== s.volume;
                        return (
                          <tr key={s.id} className="border-b last:border-0">
                            <td className="py-2 pr-4">
                              <span
                                className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                                  s.mode === "DISTANCIEL"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-green-100 text-green-700"
                                }`}
                              >
                                {s.mode === "DISTANCIEL" ? "🌐 Distanciel" : "🏫 Présentiel"}
                              </span>
                            </td>
                            <td className="py-2 pr-4 font-mono text-xs">{s.group}</td>
                            <td className="py-2 pr-4 font-mono text-xs">{s.module}</td>
                            <td className="py-2 pr-4">
                              <Input
                                type="number"
                                min={1}
                                value={localVol}
                                onChange={(e) =>
                                  setLocalVolumes((prev) => ({
                                    ...prev,
                                    [s.id]: Number(e.target.value),
                                  }))
                                }
                                className="w-24 h-7 text-xs"
                              />
                            </td>
                            <td className="py-2">
                              <div className="flex gap-2">
                                {isDirty && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => handleSaveVolume(s)}
                                  >
                                    💾 Sauvegarder
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-xs"
                                  onClick={() => handleDeleteSeance(s.id)}
                                >
                                  ✕
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}

            {tSeances.length === 0 && (
              <CardContent className="px-4 pb-3">
                <p className="text-xs text-muted-foreground">Aucune séance définie.</p>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Modal ajout séance */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              ➕ Ajouter une séance —{" "}
              <span className="font-mono text-sm">{selectedTeacher}</span>{" "}
              {getTeacherName(selectedTeacher) !== selectedTeacher && (
                <span className="text-base font-normal">{getTeacherName(selectedTeacher)}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Mode */}
            <div className="space-y-2">
              <Label>Type de séance</Label>
              <div className="flex gap-4">
                {(["PRESENTIEL", "DISTANCIEL"] as SeanceMode[]).map((m) => (
                  <label
                    key={m}
                    className={`flex items-center gap-2 cursor-pointer px-3 py-2 border rounded-lg hover:bg-gray-50 ${
                      newSeance.mode === m ? "border-blue-500 bg-blue-50" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={m}
                      checked={newSeance.mode === m}
                      onChange={() =>
                        setNewSeance((p) => ({ ...p, mode: m, group: "", module: "" }))
                      }
                    />
                    <span className="text-sm">
                      {m === "PRESENTIEL" ? "🏫 Présentiel" : "🌐 Distanciel"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Module (filtré par formateur) */}
            <div className="space-y-2">
              <Label>Module</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={newSeance.module ?? ""}
                onChange={(e) => {
                  const mod = e.target.value;
                  const groups = groupsForTeacherModule(selectedTeacher, mod);
                  setNewSeance((p) => ({
                    ...p,
                    module: mod,
                    group: groups[0] ?? "",
                  }));
                }}
              >
                <option value="">-- Choisir un module --</option>
                {modulesForTeacher(selectedTeacher).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Groupe */}
            <div className="space-y-2">
              <Label>Groupe</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={newSeance.group ?? ""}
                onChange={(e) =>
                  setNewSeance((p) => ({ ...p, group: e.target.value }))
                }
              >
                <option value="">-- Choisir un groupe --</option>
                {newSeance.module
                  ? groupsForTeacherModule(selectedTeacher, newSeance.module).map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))
                  : null}
              </select>
            </div>

            {/* Volume */}
            <div className="space-y-2">
              <Label>Volume (nombre de séances)</Label>
              <Input
                type="number"
                min={1}
                value={newSeance.volume ?? 1}
                onChange={(e) =>
                  setNewSeance((p) => ({ ...p, volume: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">
                = {((newSeance.volume ?? 1) * HEURES_PAR_SEANCE).toFixed(1)}h
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleAddSeance}>Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Launch Tab ──────────────────────────────────────────────────────────────
type Mode = "memetic" | "hc" | "cp_only";

const MODES: { value: Mode; label: string; desc: string }[] = [
  { value: "memetic", label: "🧬 Mémétique", desc: "GA + HC intégré — qualité optimale (recommandé)" },
  { value: "hc", label: "🔄 Hill Climbing", desc: "Plus rapide, bon compromis qualité/temps" },
  { value: "cp_only", label: "⚙️ CP seulement", desc: "Contraintes dures uniquement, pas d'optimisation douce" },
];

function LaunchTab({ onJobStarted }: { onJobStarted: (id: string) => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("memetic");
  const [params, setParams] = useState({
    cp_time: 120,
    cp_workers: 8,
    max_iterations: 10000,
    max_no_improvement: 500,
    population: 100,
    generations: 150,
    hc_freq: 10,
    hc_top: 5,
    hc_iter: 500,
    patience: 50,
    perturb_threshold: 30,
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

  const Row = ({ label, k, min = 1 }: { label: string; k: keyof typeof params; min?: number }) => (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-700 w-60">{label}</label>
      <Input
        type="number"
        min={min}
        value={params[k]}
        onChange={(e) => set(k, Number(e.target.value))}
        className="w-28"
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Mode d'optimisation</p>
        <div className="flex flex-wrap gap-3">
          {MODES.map(({ value, label, desc }) => (
            <label
              key={value}
              className={`flex items-start gap-2 cursor-pointer px-3 py-2 border rounded-lg hover:bg-gray-50 ${
                mode === value ? "border-blue-500 bg-blue-50" : ""
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={value}
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

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">⚙️ Options CP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <Row label="Temps max CP (secondes)" k="cp_time" />
          <Row label="Nombre de workers CP" k="cp_workers" />
        </CardContent>
      </Card>

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

// ── Logs Tab ────────────────────────────────────────────────────────────────
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
        const data = await httpJson<{ ok: boolean; status: string; logs: string[]; result: any }>(
          `/api/generate/status/${id}`
        );
        setJob({ status: data.status as JobState["status"], logs: data.logs ?? [], result: data.result });
        if (data.status !== "running") {
          if (timerRef.current) clearInterval(timerRef.current);
          if (data.status === "done")
            toast({ title: "✅ Génération terminée !", description: "timetable.json mis à jour." });
          if (data.status === "error")
            toast({ variant: "destructive", title: "❌ Échec", description: data.result?.message });
        }
      } catch {
        /* réseau: ignorer */
      }
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
        {jobId && <span className="text-xs text-gray-400 font-mono truncate max-w-[260px]">{jobId}</span>}
        <Button size="sm" variant="outline" onClick={checkActive}>🔍 Vérifier job actif</Button>
        <Button
          size="sm" variant="ghost"
          onClick={() => { setJob({ status: "idle", logs: [], result: null }); onClear(); }}
        >✕ Effacer</Button>
      </div>

      <div className="bg-gray-950 rounded-lg p-4 h-[420px] overflow-y-auto font-mono text-xs leading-relaxed">
        {job.logs.length === 0 ? (
          <span className="text-gray-500">Aucun log pour le moment. Lancez une génération depuis l'onglet « Lancer ».</span>
        ) : (
          job.logs.map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("✓") || line.startsWith("✅") ? "text-emerald-400"
                : line.startsWith("✗") || line.startsWith("❌") || line.toLowerCase().startsWith("error") ? "text-red-400"
                : line.startsWith("⚠") ? "text-yellow-400"
                : "text-gray-200"
              }
            >{line}</div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {job.status === "done" && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
          ✅ Emploi du temps généré et sauvegardé dans timetable.json.
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

// ── Main Page ───────────────────────────────────────────────────────────────
export default function GenerateTimetable() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("params");

  const handleJobStarted = (id: string) => {
    setCurrentJobId(id);
    setActiveTab("logs");
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🗓️ Génération Emploi du Temps</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configurez les paramètres, séances, contraintes, préférences, puis lancez l'algorithme.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="params">⚙️ Paramètres</TabsTrigger>
          <TabsTrigger value="seances">📚 Séances</TabsTrigger>
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
              <CardTitle>⚙️ Paramètres généraux</CardTitle>
              <CardDescription>Jours, créneaux, limites — config.json</CardDescription>
            </CardHeader>
            <CardContent><ConfigTab /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seances">
          <Card>
            <CardHeader>
              <CardTitle>📚 Séances</CardTitle>
              <CardDescription>
                Séances utilisées par le script de génération — seances.json
              </CardDescription>
            </CardHeader>
            <CardContent><SeancesTab /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hard">
          <Card>
            <CardHeader>
              <CardTitle>🔒 Contraintes dures</CardTitle>
              <CardDescription>Indisponibilités, règles absolues — hard.json</CardDescription>
            </CardHeader>
            <CardContent><HardConstraintsTab /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="soft">
          <Card>
            <CardHeader>
              <CardTitle>🎯 Préférences douces</CardTitle>
              <CardDescription>Poids et coûts pour l'optimisation — soft.json</CardDescription>
            </CardHeader>
            <CardContent><SoftConstraintsTab /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="launch">
          <Card>
            <CardHeader>
              <CardTitle>🚀 Lancer la génération</CardTitle>
              <CardDescription>Choisissez le mode et les paramètres, puis lancez l'algorithme.</CardDescription>
            </CardHeader>
            <CardContent><LaunchTab onJobStarted={handleJobStarted} /></CardContent>
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
