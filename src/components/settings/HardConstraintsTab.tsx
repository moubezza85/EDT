// src/components/settings/HardConstraintsTab.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Save, Plus, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Indispo {
  type: "formateur" | "groupe" | "salle";
  id: string;
  jour: string;
  creneaux: number[];
}

interface Exigence {
  formateur?: string;
  salle_obligatoire: string;
  module?: string;
}

interface HardData {
  indisponibilites: Indispo[];
  exigences_specifiques: Exigence[];
}

interface Teacher { id: string; name: string; }

const API = "/api/admin";

export default function HardConstraintsTab() {
  const { toast } = useToast();
  const [data, setData] = useState<HardData>({
    indisponibilites: [],
    exigences_specifiques: [],
  });
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [jours, setJours] = useState<string[]>([]);
  const [creneaux, setCreneaux] = useState<number[]>([]);
  const [salles, setSalles] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/indispo/hard`).then((r) => r.json()),
      fetch(`${API}/catalog/teachers`).then((r) => r.json()),
      fetch(`${API}/catalog/groups`).then((r) => r.json()),
      fetch(`${API}/catalog/modules`).then((r) => r.json()),
      fetch(`${API}/config/meta`).then((r) => r.json()),
      fetch(`${API}/config/rooms`).then((r) => r.json()),
    ]).then(([hard, cat, grp, mod, cfg, rooms]) => {
      setData({
        indisponibilites: hard.indisponibilites ?? [],
        exigences_specifiques: hard.exigences_specifiques ?? [],
      });
      setTeachers(cat.teachers ?? []);
      setGroups(grp.groups ?? []);
      setModules(mod.modules ?? []);
      setJours(cfg.jours ?? []);
      setCreneaux(cfg.creneaux ?? []);
      setSalles((rooms.salles ?? []).map((s: any) => s.id ?? s));
    });
  }, []);

  const mark = () => setDirty(true);

  const save = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/indispo/hard`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      toast({ title: "Contraintes hard sauvegardées" });
      setDirty(false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: e?.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // ---- Helpers indispos ----
  const addIndispo = (type: Indispo["type"]) => {
    const defaultId =
      type === "formateur"
        ? (teachers[0]?.id ?? "")
        : type === "groupe"
        ? (groups[0] ?? "")
        : (salles[0] ?? "");
    setData((d) => ({
      ...d,
      indisponibilites: [
        ...d.indisponibilites,
        { type, id: defaultId, jour: jours[0] ?? "Lundi", creneaux: [] },
      ],
    }));
    mark();
  };

  const updateIndispo = (globalIdx: number, patch: Partial<Indispo>) => {
    setData((d) => ({
      ...d,
      indisponibilites: d.indisponibilites.map((x, i) =>
        i === globalIdx ? { ...x, ...patch } : x
      ),
    }));
    mark();
  };

  const removeIndispo = (globalIdx: number) => {
    setData((d) => ({
      ...d,
      indisponibilites: d.indisponibilites.filter((_, i) => i !== globalIdx),
    }));
    mark();
  };

  const toggleCreneau = (globalIdx: number, cr: number) => {
    const curr = data.indisponibilites[globalIdx].creneaux;
    const next = curr.includes(cr)
      ? curr.filter((x) => x !== cr)
      : [...curr, cr].sort((a, b) => a - b);
    updateIndispo(globalIdx, { creneaux: next });
  };

  // ---- Helpers exigences ----
  const addExigence = () => {
    setData((d) => ({
      ...d,
      exigences_specifiques: [
        ...d.exigences_specifiques,
        { formateur: teachers[0]?.id, salle_obligatoire: salles[0] ?? "" },
      ],
    }));
    mark();
  };

  const updateExigence = (i: number, patch: Partial<Exigence>) => {
    setData((d) => ({
      ...d,
      exigences_specifiques: d.exigences_specifiques.map((x, idx) =>
        idx === i ? { ...x, ...patch } : x
      ),
    }));
    mark();
  };

  const removeExigence = (i: number) => {
    setData((d) => ({
      ...d,
      exigences_specifiques: d.exigences_specifiques.filter((_, idx) => idx !== i),
    }));
    mark();
  };

  // ---- Rendu liste indispos par type ----
  const renderIndispoList = (type: Indispo["type"]) => {
    const options =
      type === "formateur"
        ? teachers.map((t) => t.id)
        : type === "groupe"
        ? groups
        : salles;

    const items = data.indisponibilites
      .map((x, i) => ({ ...x, _gi: i }))
      .filter((x) => x.type === type);

    return (
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-gray-400 italic">Aucune indisponibilité.</p>
        )}

        {items.map(({ _gi, ...indispo }) => (
          <div
            key={_gi}
            className="flex items-center gap-2 flex-wrap bg-gray-50 rounded p-2"
          >
            {/* ID (formateur / groupe / salle) */}
            <Select
              value={indispo.id}
              onValueChange={(v) => updateIndispo(_gi, { id: v })}
            >
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Jour */}
            <Select
              value={indispo.jour}
              onValueChange={(v) => updateIndispo(_gi, { jour: v })}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {jours.map((j) => (
                  <SelectItem key={j} value={j}>{j}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Créneaux (toggle buttons) */}
            <div className="flex gap-1">
              {creneaux.map((cr) => (
                <button
                  key={cr}
                  type="button"
                  onClick={() => toggleCreneau(_gi, cr)}
                  className={`w-8 h-7 rounded text-xs border font-medium ${
                    indispo.creneaux.includes(cr)
                      ? "bg-red-500 text-white border-red-500"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {cr}
                </button>
              ))}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 ml-auto"
              onClick={() => removeIndispo(_gi)}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => addIndispo(type)}
        >
          <Plus className="h-3 w-3 mr-1" /> Ajouter
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Contraintes hard (indisponibilités)
        </h3>
        <Button size="sm" onClick={save} disabled={!dirty || loading}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {loading ? "Sauvegarde…" : "Sauvegarder"}
        </Button>
      </div>

      <Tabs defaultValue="formateur">
        <TabsList className="h-8">
          <TabsTrigger value="formateur" className="text-xs px-3">
            Formateurs
          </TabsTrigger>
          <TabsTrigger value="groupe" className="text-xs px-3">
            Groupes
          </TabsTrigger>
          <TabsTrigger value="salle" className="text-xs px-3">
            Salles
          </TabsTrigger>
          <TabsTrigger value="exigences" className="text-xs px-3">
            Exigences spéc.
          </TabsTrigger>
        </TabsList>

        {/* Indisponibilités par type */}
        {(["formateur", "groupe", "salle"] as const).map((type) => (
          <TabsContent key={type} value={type} className="mt-3">
            {renderIndispoList(type)}
          </TabsContent>
        ))}

        {/* Exigences spécifiques */}
        <TabsContent value="exigences" className="mt-3 space-y-2">
          {data.exigences_specifiques.length === 0 && (
            <p className="text-xs text-gray-400 italic">Aucune exigence spécifique.</p>
          )}

          {data.exigences_specifiques.map((ex, i) => (
            <div
              key={i}
              className="flex items-center gap-2 flex-wrap bg-gray-50 rounded p-2"
            >
              {/* Formateur (optionnel) */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-gray-400">Formateur</span>
                <Select
                  value={ex.formateur ?? "__none__"}
                  onValueChange={(v) =>
                    updateExigence(i, {
                      formateur: v === "__none__" ? undefined : v,
                    })
                  }
                >
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue placeholder="— aucun —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— aucun —</SelectItem>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <span className="text-gray-400 text-sm mt-3">→</span>

              {/* Salle obligatoire */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-gray-400">Salle oblig.</span>
                <Select
                  value={ex.salle_obligatoire}
                  onValueChange={(v) => updateExigence(i, { salle_obligatoire: v })}
                >
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {salles.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Module (optionnel) */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-gray-400">Module</span>
                <Select
                  value={ex.module ?? "__none__"}
                  onValueChange={(v) =>
                    updateExigence(i, {
                      module: v === "__none__" ? undefined : v,
                    })
                  }
                >
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue placeholder="— aucun —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— aucun —</SelectItem>
                    {modules.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 mt-3 ml-auto"
                onClick={() => removeExigence(i)}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={addExigence}
          >
            <Plus className="h-3 w-3 mr-1" /> Ajouter
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
