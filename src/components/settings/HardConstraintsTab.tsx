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

// ─── Types ───────────────────────────────────────────────────────────────────

interface Indispo {
  type: "formateur" | "groupe" | "salle";
  id: string;
  jour: string;
  creneaux: number[];
}

/**
 * Exigence spécifique : un formateur OU un groupe exige une salle précise.
 *   { type: "formateur", id: "14017", salle_obligatoire: "S21" }
 *   { type: "groupe",    id: "DEV101", salle_obligatoire: "S4"  }
 */
interface Exigence {
  type: "formateur" | "groupe";
  id: string;
  salle_obligatoire: string;
}

interface HardData {
  indisponibilites: Indispo[];
  exigences_specifiques: Exigence[];
}

interface Teacher {
  id: string;
  name: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function HardConstraintsTab() {
  const { toast } = useToast();
  const [data, setData] = useState<HardData>({
    indisponibilites: [],
    exigences_specifiques: [],
  });
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [jours, setJours] = useState<string[]>([]);
  const [creneaux, setCreneaux] = useState<number[]>([]);
  const [salles, setSalles] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/admin/indispo/hard").then((r) => r.json()),
      apiFetch("/api/admin/catalog/teachers").then((r) => r.json()),
      apiFetch("/api/admin/catalog/groups").then((r) => r.json()),
      apiFetch("/api/admin/config/meta").then((r) => r.json()),
      apiFetch("/api/admin/config/rooms").then((r) => r.json()),
    ]).then(([hard, cat, grp, cfg, rooms]) => {
      setData({
        indisponibilites: hard.indisponibilites ?? [],
        exigences_specifiques: normalizeExigences(hard.exigences_specifiques ?? []),
      });
      setTeachers(cat.teachers ?? []);
      setGroups(grp.groups ?? []);
      setJours(cfg.jours ?? []);
      setCreneaux(cfg.creneaux ?? []);
      setSalles((rooms.salles ?? []).map((s: any) => s.id ?? s));
    });
  }, []);

  // ─── Migration de l'ancien format ─────────────────────────────────────────
  // Ancien: { formateur?: string, module?: string, salle_obligatoire: string }
  // Nouveau: { type: 'formateur'|'groupe', id: string, salle_obligatoire: string }
  const normalizeExigences = (raw: any[]): Exigence[] =>
    raw
      .map((e): Exigence | null => {
        if (e.type === "formateur" || e.type === "groupe") return e as Exigence;
        if (e.formateur)
          return { type: "formateur", id: e.formateur, salle_obligatoire: e.salle_obligatoire };
        if (e.groupe)
          return { type: "groupe", id: e.groupe, salle_obligatoire: e.salle_obligatoire };
        // ancien champ "module" ignoré (remplacé par groupe)
        return null;
      })
      .filter((x): x is Exigence => x !== null);

  const mark = () => setDirty(true);

  // ─── Save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/indispo/hard", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      toast({ title: "Contraintes hard sauvegardées" });
      setDirty(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  // ─── Indispos helpers ──────────────────────────────────────────────────────
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

  const updateIndispo = (gi: number, patch: Partial<Indispo>) => {
    setData((d) => ({
      ...d,
      indisponibilites: d.indisponibilites.map((x, i) =>
        i === gi ? { ...x, ...patch } : x
      ),
    }));
    mark();
  };

  const removeIndispo = (gi: number) => {
    setData((d) => ({
      ...d,
      indisponibilites: d.indisponibilites.filter((_, i) => i !== gi),
    }));
    mark();
  };

  const toggleCreneau = (gi: number, cr: number) => {
    const curr = data.indisponibilites[gi].creneaux;
    const next = curr.includes(cr)
      ? curr.filter((x) => x !== cr)
      : [...curr, cr].sort((a, b) => a - b);
    updateIndispo(gi, { creneaux: next });
  };

  // ─── Exigences helpers ─────────────────────────────────────────────────────
  const addExigence = (type: Exigence["type"]) => {
    const defaultId =
      type === "formateur" ? (teachers[0]?.id ?? "") : (groups[0] ?? "");
    setData((d) => ({
      ...d,
      exigences_specifiques: [
        ...d.exigences_specifiques,
        { type, id: defaultId, salle_obligatoire: salles[0] ?? "" },
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

  // ─── Render : liste indispos ───────────────────────────────────────────────
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
              variant="ghost" size="icon" className="h-7 w-7 ml-auto"
              onClick={() => removeIndispo(_gi)}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        ))}

        <Button
          variant="outline" size="sm" className="h-7 text-xs"
          onClick={() => addIndispo(type)}
        >
          <Plus className="h-3 w-3 mr-1" /> Ajouter
        </Button>
      </div>
    );
  };

  // ─── Render : exigences spécifiques ───────────────────────────────────────
  const renderExigences = () => (
    <div className="space-y-3">
      {/* Légende */}
      <p className="text-xs text-muted-foreground">
        Un formateur ou un groupe peut exiger d'être toujours dans une salle spécifique.
      </p>

      {/* Liste */}
      {data.exigences_specifiques.length === 0 && (
        <p className="text-xs text-gray-400 italic">Aucune exigence spécifique.</p>
      )}

      {data.exigences_specifiques.map((ex, i) => {
        const isFor = ex.type === "formateur";
        const idOptions = isFor ? teachers.map((t) => t.id) : groups;

        return (
          <div
            key={i}
            className="flex items-center gap-2 flex-wrap rounded-lg border bg-white p-2.5 shadow-sm"
          >
            {/* Badge type */}
            <span
              className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold ${
                isFor
                  ? "bg-blue-100 text-blue-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {isFor ? "Formateur" : "Groupe"}
            </span>

            {/* Sélecteur type */}
            <Select
              value={ex.type}
              onValueChange={(v: "formateur" | "groupe") => {
                const newId =
                  v === "formateur" ? (teachers[0]?.id ?? "") : (groups[0] ?? "");
                updateExigence(i, { type: v, id: newId });
              }}
            >
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="formateur">Formateur</SelectItem>
                <SelectItem value="groupe">Groupe</SelectItem>
              </SelectContent>
            </Select>

            {/* Sélecteur ID formateur ou groupe */}
            <Select
              value={ex.id}
              onValueChange={(v) => updateExigence(i, { id: v })}
            >
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue placeholder={isFor ? "Formateur..." : "Groupe..."} />
              </SelectTrigger>
              <SelectContent>
                {idOptions.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Flèche */}
            <span className="text-gray-400 font-bold">→</span>

            {/* Salle obligatoire */}
            <Select
              value={ex.salle_obligatoire}
              onValueChange={(v) => updateExigence(i, { salle_obligatoire: v })}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue placeholder="Salle..." />
              </SelectTrigger>
              <SelectContent>
                {salles.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Supprimer */}
            <Button
              variant="ghost" size="icon" className="h-7 w-7 ml-auto"
              onClick={() => removeExigence(i)}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        );
      })}

      {/* Boutons d'ajout */}
      <div className="flex gap-2">
        <Button
          variant="outline" size="sm" className="h-7 text-xs"
          onClick={() => addExigence("formateur")}
        >
          <Plus className="h-3 w-3 mr-1" />
          <span className="text-blue-600 font-medium">Formateur</span>
          <span className="ml-1">→ Salle</span>
        </Button>
        <Button
          variant="outline" size="sm" className="h-7 text-xs"
          onClick={() => addExigence("groupe")}
        >
          <Plus className="h-3 w-3 mr-1" />
          <span className="text-amber-600 font-medium">Groupe</span>
          <span className="ml-1">→ Salle</span>
        </Button>
      </div>
    </div>
  );

  // ─── Render principal ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Contraintes dures (hard)
        </h3>
        <Button size="sm" onClick={save} disabled={!dirty || loading}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {loading ? "Sauvegarde…" : "Sauvegarder"}
        </Button>
      </div>

      <Tabs defaultValue="formateur">
        <TabsList className="h-8">
          <TabsTrigger value="formateur" className="text-xs px-3">Formateurs</TabsTrigger>
          <TabsTrigger value="groupe" className="text-xs px-3">Groupes</TabsTrigger>
          <TabsTrigger value="salle" className="text-xs px-3">Salles</TabsTrigger>
          <TabsTrigger value="exigences" className="text-xs px-3">Exigences spéc.</TabsTrigger>
        </TabsList>

        {(["formateur", "groupe", "salle"] as const).map((type) => (
          <TabsContent key={type} value={type} className="mt-3">
            {renderIndispoList(type)}
          </TabsContent>
        ))}

        <TabsContent value="exigences" className="mt-3">
          {renderExigences()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
