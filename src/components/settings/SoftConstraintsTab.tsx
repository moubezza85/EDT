// src/components/settings/SoftConstraintsTab.tsx
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Save, Plus, Trash2 } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const API = API_BASE.replace(/\/+$/, "");

const apiFetch = (path: string, init?: RequestInit) => {
  const token = localStorage.getItem("token");
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
};

interface SoftConstraint {
  id: string;
  type: string;
  description?: string;
  nom?: string;
  active?: boolean;
  poids: number;
  params?: Record<string, any>;
}

interface Teacher {
  id: string;
  name: string;
}

// ── SC9 : Préférences salle des GROUPES ──────────────────────────────────────
function GroupeSallePrefs({
  prefs,
  salles,
  onChange,
}: {
  prefs: Record<string, string>;
  salles: string[];
  onChange: (next: Record<string, string>) => void;
}) {
  const [newGroupe, setNewGroupe] = useState("");

  const add = () => {
    const g = newGroupe.trim();
    if (!g) return;
    onChange({ ...prefs, [g]: salles[0] ?? "" });
    setNewGroupe("");
  };

  return (
    <div className="ml-4 mt-2 space-y-2">
      <p className="text-xs text-gray-500 font-medium">Salle préférée par groupe :</p>
      {Object.entries(prefs).map(([groupe, salle]) => (
        <div key={groupe} className="flex items-center gap-2 flex-wrap">
          <Input
            value={groupe}
            readOnly
            className="h-7 w-28 text-xs font-mono bg-gray-50"
          />
          <span className="text-xs text-gray-400">→</span>
          <Select
            value={salle}
            onValueChange={(ns) => onChange({ ...prefs, [groupe]: ns })}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {salles.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={() => {
              const np = { ...prefs };
              delete np[groupe];
              onChange(np);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2 mt-1">
        <Input
          placeholder="ID groupe (ex: G101)"
          value={newGroupe}
          onChange={(e) => setNewGroupe(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="h-7 w-44 text-xs"
        />
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={add}>
          <Plus className="h-3 w-3 mr-1" /> Ajouter groupe
        </Button>
      </div>
    </div>
  );
}

// ── SC8 : Préférences créneaux des GROUPES ───────────────────────────────────
function GroupeCreneauxPrefs({
  prefs,
  jours,
  creneaux,
  onChange,
}: {
  prefs: Record<string, { jour: string; creneaux: number[] }[]>;
  jours: string[];
  creneaux: number[];
  onChange: (next: Record<string, { jour: string; creneaux: number[] }[]>) => void;
}) {
  const [newGroupe, setNewGroupe] = useState("");

  const add = () => {
    const g = newGroupe.trim();
    if (!g) return;
    onChange({ ...prefs, [g]: [{ jour: jours[0] ?? "lundi", creneaux: [] }] });
    setNewGroupe("");
  };

  return (
    <div className="ml-4 mt-2 space-y-3">
      <p className="text-xs text-gray-500 font-medium">Créneaux préférés par groupe :</p>
      {Object.entries(prefs).map(([groupe, slots]) => (
        <div key={groupe} className="rounded border bg-gray-50 p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-gray-700 bg-green-100 px-2 py-0.5 rounded">
              {groupe}
            </span>
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => {
                const np = { ...prefs };
                delete np[groupe];
                onChange(np);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {slots.map((slot, si) => (
            <div key={si} className="flex items-center gap-1.5 flex-wrap ml-2">
              <Select
                value={slot.jour}
                onValueChange={(v) => {
                  const ns = slots.map((s, i) => (i === si ? { ...s, jour: v } : s));
                  onChange({ ...prefs, [groupe]: ns });
                }}
              >
                <SelectTrigger className="h-6 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {jours.map((j) => (
                    <SelectItem key={j} value={j}>{j}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-gray-400">→</span>
              <div className="flex gap-1">
                {creneaux.map((cr) => (
                  <button
                    key={cr}
                    type="button"
                    onClick={() => {
                      const curr = slot.creneaux ?? [];
                      const next = curr.includes(cr)
                        ? curr.filter((x) => x !== cr)
                        : [...curr, cr].sort((a, b) => a - b);
                      const ns = slots.map((s, i) =>
                        i === si ? { ...s, creneaux: next } : s
                      );
                      onChange({ ...prefs, [groupe]: ns });
                    }}
                    className={`w-7 h-6 rounded text-xs border ${
                      slot.creneaux?.includes(cr)
                        ? "bg-green-500 text-white border-green-500"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    {cr}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => {
                  const ns = slots.filter((_, i) => i !== si);
                  onChange({ ...prefs, [groupe]: ns });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}

          <Button
            variant="ghost" size="sm" className="h-6 text-xs ml-2"
            onClick={() => {
              const ns = [...slots, { jour: jours[0] ?? "lundi", creneaux: [] }];
              onChange({ ...prefs, [groupe]: ns });
            }}
          >
            <Plus className="h-3 w-3 mr-1" /> Ajouter jour
          </Button>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          placeholder="ID groupe (ex: G101)"
          value={newGroupe}
          onChange={(e) => setNewGroupe(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="h-7 w-44 text-xs"
        />
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={add}>
          <Plus className="h-3 w-3 mr-1" /> Ajouter groupe
        </Button>
      </div>
    </div>
  );
}

export default function SoftConstraintsTab() {
  const { toast } = useToast();
  const [constraints, setConstraints] = useState<SoftConstraint[]>([]);
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [jours, setJours] = useState<string[]>([]);
  const [creneaux, setCreneaux] = useState<number[]>([]);
  const [salles, setSalles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/admin/constraints/soft-list").then((r) => r.json()),
      apiFetch("/api/admin/catalog/teachers").then((r) => r.json()),
      apiFetch("/api/admin/config/meta").then((r) => r.json()),
      apiFetch("/api/admin/config/rooms").then((r) => r.json()),
    ]).then(([sc, cat, cfg, rooms]) => {
      setConstraints(Array.isArray(sc) ? sc : []);
      setTeacherIds((cat.teachers ?? []).map((t: Teacher) => t.id));
      setJours(cfg.jours ?? []);
      setCreneaux(cfg.creneaux ?? []);
      setSalles((rooms.salles ?? []).map((s: any) => s.id ?? s));
    });
  }, []);

  const mark = () => setDirty(true);

  const update = (idx: number, patch: Partial<SoftConstraint>) => {
    setConstraints((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
    mark();
  };

  const setPreferences = (idx: number, prefs: any) => {
    setConstraints((cs) =>
      cs.map((c, i) =>
        i === idx
          ? { ...c, params: { ...(c.params ?? {}), preferences: prefs } }
          : c
      )
    );
    mark();
  };

  const setParamKey = (idx: number, key: string, val: any) => {
    setConstraints((cs) =>
      cs.map((c, i) =>
        i === idx
          ? { ...c, params: { ...(c.params ?? {}), [key]: val } }
          : c
      )
    );
    mark();
  };

  const save = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/constraints/soft-list", {
        method: "PUT",
        body: JSON.stringify(constraints),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      toast({ title: "Contraintes soft sauvegardées" });
      setDirty(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  // ---- Sous-formulaires paramètres ----
  const renderParams = (c: SoftConstraint, idx: number) => {
    if (c.type === "charge_journaliere" || c.type === "charge_journaliere_for") {
      return (
        <div className="ml-4 mt-2 flex items-center gap-2">
          <Label className="text-xs text-gray-600 w-36">Max séances / jour</Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={c.params?.max ?? 2}
            onChange={(e) => setParamKey(idx, "max", parseInt(e.target.value) || 1)}
            className="h-7 w-20 text-sm"
          />
        </div>
      );
    }

    // ── preference_salle ──────────────────────────────────────────────────────
    if (c.type === "preference_salle") {
      const prefs: Record<string, string> = c.params?.preferences ?? {};

      // SC9 = préférence salle des GROUPES
      if (c.id === "SC9") {
        return (
          <GroupeSallePrefs
            prefs={prefs}
            salles={salles}
            onChange={(next) => setPreferences(idx, next)}
          />
        );
      }

      // SC1 (et autres) = préférence salle des FORMATEURS
      return (
        <div className="ml-4 mt-2 space-y-2">
          <p className="text-xs text-gray-500 font-medium">Salle préférée par formateur :</p>
          {Object.entries(prefs).map(([tid, sid]) => (
            <div key={tid} className="flex items-center gap-2 flex-wrap">
              <Select
                value={tid}
                onValueChange={(newTid) => {
                  const np = { ...prefs };
                  delete np[tid];
                  np[newTid] = sid;
                  setPreferences(idx, np);
                }}
              >
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teacherIds.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-gray-400">→</span>
              <Select
                value={sid}
                onValueChange={(ns) => setPreferences(idx, { ...prefs, [tid]: ns })}
              >
                <SelectTrigger className="h-7 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {salles.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => {
                  const np = { ...prefs };
                  delete np[tid];
                  setPreferences(idx, np);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => {
              const avail = teacherIds.find((t) => !(t in prefs));
              if (!avail || !salles[0]) return;
              setPreferences(idx, { ...prefs, [avail]: salles[0] });
            }}
          >
            <Plus className="h-3 w-3 mr-1" /> Ajouter
          </Button>
        </div>
      );
    }

    // ── preference_creneaux ───────────────────────────────────────────────────
    if (c.type === "preference_creneaux") {
      const prefs: Record<string, { jour: string; creneaux: number[] }[]> =
        c.params?.preferences ?? {};

      // SC8 = préférence créneaux des GROUPES
      if (c.id === "SC8") {
        return (
          <GroupeCreneauxPrefs
            prefs={prefs}
            jours={jours}
            creneaux={creneaux}
            onChange={(next) => setPreferences(idx, next)}
          />
        );
      }

      // SC7 (et autres) = préférence créneaux des FORMATEURS
      return (
        <div className="ml-4 mt-2 space-y-3">
          <p className="text-xs text-gray-500 font-medium">Créneaux préférés par formateur :</p>
          {Object.entries(prefs).map(([tid, slots]) => (
            <div key={tid} className="rounded border bg-gray-50 p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Select
                  value={tid}
                  onValueChange={(newTid) => {
                    const np = { ...prefs };
                    np[newTid] = np[tid];
                    delete np[tid];
                    setPreferences(idx, np);
                  }}
                >
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teacherIds.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => {
                    const np = { ...prefs };
                    delete np[tid];
                    setPreferences(idx, np);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {slots.map((slot, si) => (
                <div key={si} className="flex items-center gap-1.5 flex-wrap ml-2">
                  <Select
                    value={slot.jour}
                    onValueChange={(v) => {
                      const ns = slots.map((s, i) => (i === si ? { ...s, jour: v } : s));
                      setPreferences(idx, { ...prefs, [tid]: ns });
                    }}
                  >
                    <SelectTrigger className="h-6 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jours.map((j) => (
                        <SelectItem key={j} value={j}>{j}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-gray-400">→</span>
                  <div className="flex gap-1">
                    {creneaux.map((cr) => (
                      <button
                        key={cr}
                        type="button"
                        onClick={() => {
                          const curr = slot.creneaux ?? [];
                          const next = curr.includes(cr)
                            ? curr.filter((x) => x !== cr)
                            : [...curr, cr].sort((a, b) => a - b);
                          const ns = slots.map((s, i) =>
                            i === si ? { ...s, creneaux: next } : s
                          );
                          setPreferences(idx, { ...prefs, [tid]: ns });
                        }}
                        className={`w-7 h-6 rounded text-xs border ${
                          slot.creneaux?.includes(cr)
                            ? "bg-blue-500 text-white border-blue-500"
                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                        }`}
                      >
                        {cr}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => {
                      const ns = slots.filter((_, i) => i !== si);
                      setPreferences(idx, { ...prefs, [tid]: ns });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              <Button
                variant="ghost" size="sm" className="h-6 text-xs ml-2"
                onClick={() => {
                  const ns = [...slots, { jour: jours[0] ?? "lundi", creneaux: [] }];
                  setPreferences(idx, { ...prefs, [tid]: ns });
                }}
              >
                <Plus className="h-3 w-3 mr-1" /> Ajouter jour
              </Button>
            </div>
          ))}
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => {
              const avail = teacherIds.find((t) => !(t in prefs));
              if (!avail) return;
              setPreferences(idx, {
                ...prefs,
                [avail]: [{ jour: jours[0] ?? "lundi", creneaux: [] }],
              });
            }}
          >
            <Plus className="h-3 w-3 mr-1" /> Ajouter formateur
          </Button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Contraintes souples (soft)</h3>
        <Button size="sm" onClick={save} disabled={!dirty || loading}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {loading ? "Sauvegarde…" : "Sauvegarder"}
        </Button>
      </div>

      <div className="space-y-3">
        {constraints.map((c, idx) => (
          <div key={c.id} className="rounded-lg border bg-white p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                    {c.id}
                  </span>
                  {/* Badge visuel pour distinguer groupe vs formateur */}
                  {(c.id === "SC8" || c.id === "SC9") && (
                    <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                      👥 Groupe
                    </span>
                  )}
                  {(c.id === "SC7" || c.id === "SC1") && (
                    <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                      👤 Formateur
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-800 truncate">
                    {c.nom ?? c.type}
                  </span>
                </div>
                {c.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-gray-500">Poids</Label>
                  <Input
                    type="number"
                    min={0}
                    max={999}
                    value={c.poids}
                    onChange={(e) =>
                      update(idx, { poids: parseInt(e.target.value) || 0 })
                    }
                    className="h-7 w-16 text-sm text-right"
                  />
                </div>
                <Switch
                  checked={c.active !== false}
                  onCheckedChange={(v) => update(idx, { active: v })}
                />
              </div>
            </div>
            {c.params !== undefined && renderParams(c, idx)}
          </div>
        ))}
        {constraints.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Aucune contrainte soft chargée.</p>
        )}
      </div>
    </div>
  );
}
