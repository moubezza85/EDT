// src/pages/Settings.tsx
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

type Teacher = { id: string; name: string };

type Mode = "PRESENTIEL" | "ONLINE";

// Ajout mode (si absent => PRESENTIEL)
type Assignment = { group: string; module: string; teacher: string; mode?: Mode };

type OnlineFusion = { id: string; groupes: string[] };

type ConfigMeta = {
  nomEtablissement: string;
  jours: string[];
  creneaux: number[];
  maxSessionsPerDayTeacher: number;
  maxSessionsPerDayGroup: number;
};

type SoftConstraintRow = { enabled: boolean; weight: number; label?: string };
type SoftConstraints = Record<string, SoftConstraintRow>;

type IndispoMap = Record<string, number[]>; // { lundi: [1,2], ... }

type RoomType = string;
type Room = { id: string; type: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = API_BASE.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${p}`;

  // JWT: inclure le Bearer token pour éviter les 401 après activation de l'auth
  const token = localStorage.getItem("token");
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

function uniqNumsSorted(arr: number[]) {
  return Array.from(new Set(arr.filter((x) => Number.isFinite(x)))).sort((a, b) => a - b);
}

// IMPORTANT: conserve l’ordre, n’applique pas de tri
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

function TeacherManager() {
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [draftId, setDraftId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ teachers: Teacher[] }>("/api/admin/catalog/teachers");
      setTeachers(Array.isArray(data?.teachers) ? data.teachers : []);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    const id = draftId.trim();
    const name = draftName.trim();
    if (!id || !name) {
      toast({ title: "Erreur", description: "id et name sont requis.", variant: "destructive" });
      return;
    }
    try {
      await api("/api/admin/catalog/teachers", {
        method: "POST",
        body: JSON.stringify({ id, name }),
      });
      setDraftId("");
      setDraftName("");
      await load();
      toast({ title: "OK", description: "Formateur ajouté." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const del = async (id: string) => {
    try {
      await api(`/api/admin/catalog/teachers/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
      toast({ title: "OK", description: "Formateur supprimé." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Formateurs</CardTitle>
        <CardDescription>Ajouter / supprimer des formateurs (id + nom).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3">
          <Input value={draftId} placeholder="ID (ex: 14017)" onChange={(e) => setDraftId(e.target.value)} />
          <Input
            value={draftName}
            placeholder="Nom (ex: MOHAMED OUBEZZA)"
            onChange={(e) => setDraftName(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={add} disabled={loading} className="w-full">
              Ajouter
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <div className="grid grid-cols-12 gap-2 border-b px-3 py-2 text-sm font-medium">
            <div className="col-span-3">ID</div>
            <div className="col-span-7">Nom</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          {teachers.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">Aucun formateur.</div>
          ) : (
            teachers
              .slice()
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((t) => (
                <div key={t.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                  <div className="col-span-3">{t.id}</div>
                  <div className="col-span-7">{t.name}</div>
                  <div className="col-span-2 text-right">
                    <Button variant="destructive" size="sm" onClick={() => del(t.id)}>
                      X
                    </Button>
                  </div>
                </div>
              ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SimpleListManager({
  title,
  description,
  getUrl,
  addUrl,
  deleteUrlPrefix,
  keyName,
  placeholder = "ID (ex: DEV101, M103...)",
}: {
  title: string;
  description?: string;
  getUrl: string;
  addUrl: string;
  deleteUrlPrefix: string;
  keyName: "groups" | "modules";
  placeholder?: string;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<any>(getUrl);
      const list = Array.isArray(data?.[keyName]) ? data[keyName] : [];
      setItems(list);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAdd = async () => {
    const id = draft.trim();
    if (!id) return;
    try {
      await api(addUrl, { method: "POST", body: JSON.stringify({ id }) });
      setDraft("");
      await load();
      toast({ title: "OK", description: "Ajout enregistré." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const onDelete = async (id: string) => {
    if (!id) return;
    try {
      await api(`${deleteUrlPrefix}${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
      toast({ title: "OK", description: "Suppression enregistrée." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd();
              }
            }}
          />
          <Button onClick={onAdd} disabled={loading}>
            Ajouter
          </Button>
        </div>

        <div className="rounded-md border">
          <div className="grid grid-cols-12 gap-2 border-b px-3 py-2 text-sm font-medium">
            <div className="col-span-10">ID</div>
            <div className="col-span-2 text-right">Action</div>
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">Aucun élément.</div>
          ) : (
            items.map((id) => (
              <div key={id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                <div className="col-span-10">{id}</div>
                <div className="col-span-2 text-right">
                  <Button variant="destructive" size="sm" onClick={() => onDelete(id)}>
                    X
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RoomsManager({
  roomTypes,
  rooms,
  onReload,
}: {
  roomTypes: RoomType[];
  rooms: Room[];
  onReload: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [typeDraft, setTypeDraft] = useState("");
  const [roomIdDraft, setRoomIdDraft] = useState("");
  const [roomTypeDraft, setRoomTypeDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const addType = async () => {
    const t = typeDraft.trim();
    if (!t) return;
    setBusy(true);
    try {
      await api("/api/admin/config/room-types", { method: "POST", body: JSON.stringify({ id: t }) });
      setTypeDraft("");
      await onReload();
      toast({ title: "OK", description: "Type de salle ajouté." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const deleteType = async (t: string) => {
    setBusy(true);
    try {
      await api(`/api/admin/config/room-types/${encodeURIComponent(t)}`, { method: "DELETE" });
      await onReload();
      toast({ title: "OK", description: "Type de salle supprimé." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const addRoom = async () => {
    const id = roomIdDraft.trim();
    const type = roomTypeDraft.trim();
    if (!id || !type) {
      toast({ title: "Erreur", description: "id et type sont requis.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await api("/api/admin/config/rooms", {
        method: "POST",
        body: JSON.stringify({ id, type }),
      });
      setRoomIdDraft("");
      setRoomTypeDraft("");
      await onReload();
      toast({ title: "OK", description: "Salle ajoutée." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const deleteRoom = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/admin/config/rooms/${encodeURIComponent(id)}`, { method: "DELETE" });
      await onReload();
      toast({ title: "OK", description: "Salle supprimée." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Types de salles</CardTitle>
          <CardDescription>Ajouter / supprimer les types (Cours, Informatique, Atelier...).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={typeDraft}
              placeholder="Ex: Cours"
              onChange={(e) => setTypeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addType();
                }
              }}
            />
            <Button onClick={addType} disabled={busy}>
              Ajouter
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {roomTypes.length === 0 ? (
              <span className="text-sm text-muted-foreground">Aucun type.</span>
            ) : (
              roomTypes.map((t) => (
                <span key={t} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                  {t}
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    title="Supprimer"
                    onClick={() => deleteType(t)}
                    disabled={busy}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salles</CardTitle>
          <CardDescription>Ajouter / supprimer des salles (id + type).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3">
            <Input value={roomIdDraft} placeholder="ID (ex: S20)" onChange={(e) => setRoomIdDraft(e.target.value)} />
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={roomTypeDraft}
              onChange={(e) => setRoomTypeDraft(e.target.value)}
            >
              <option value="">— type —</option>
              {roomTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button onClick={addRoom} disabled={busy} className="w-full">
                Ajouter
              </Button>
              <Button variant="secondary" onClick={onReload} disabled={busy} className="w-full">
                Rafraîchir
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <div className="grid grid-cols-12 gap-2 border-b px-3 py-2 text-sm font-medium">
              <div className="col-span-5">ID</div>
              <div className="col-span-5">Type</div>
              <div className="col-span-2 text-right">Action</div>
            </div>
            {rooms.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground">Aucune salle.</div>
            ) : (
              rooms
                .slice()
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((r) => (
                  <div key={r.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                    <div className="col-span-5">{r.id}</div>
                    <div className="col-span-5">{r.type}</div>
                    <div className="col-span-2 text-right">
                      <Button variant="destructive" size="sm" onClick={() => deleteRoom(r.id)} disabled={busy}>
                        X
                      </Button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IndispoEditor({
  scope,
  entities,
  jours,
  creneaux,
  labelById,
}: {
  scope: "teachers" | "groups" | "rooms";
  entities: string[];
  jours: string[];
  creneaux: number[];
  labelById?: Record<string, string>; // optionnel
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>("");
  const [data, setData] = useState<IndispoMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) {
      setData({});
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const d = await api<IndispoMap>(`/api/admin/indispo/${scope}/${encodeURIComponent(selected)}`);
        setData(d || {});
      } catch (e: any) {
        toast({ title: "Erreur", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, scope]);

  const isChecked = (jour: string, c: number) => {
    const arr = Array.isArray(data?.[jour]) ? data[jour] : [];
    return arr.includes(c);
  };

  const toggle = (jour: string, c: number) => {
    setData((prev) => {
      const arr = Array.isArray(prev[jour]) ? prev[jour] : [];
      const next = arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c];
      return { ...prev, [jour]: uniqNumsSorted(next) };
    });
  };

  const save = async () => {
    if (!selected) return;
    try {
      await api(`/api/admin/indispo/${scope}/${encodeURIComponent(selected)}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      toast({ title: "OK", description: "Indisponibilités enregistrées." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Indisponibilités – {scope === "teachers" ? "Formateurs" : scope === "groups" ? "Groupes" : "Salles"}
        </CardTitle>
        <CardDescription>Sélectionnez une entité puis cochez les créneaux indisponibles.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Label className="min-w-32">Entité</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">— sélectionner —</option>
            {entities.map((id) => (
              <option key={id} value={id}>
                {labelById?.[id] ?? id}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={save} disabled={!selected || loading}>
            Enregistrer
          </Button>
        </div>

        {!selected ? (
          <div className="text-sm text-muted-foreground">Sélectionnez une entité pour éditer ses indisponibilités.</div>
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Jour</th>
                  {creneaux.map((c) => (
                    <th key={c} className="p-2 text-center">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jours.map((j) => (
                  <tr key={j} className="border-b">
                    <td className="p-2 font-medium">{j}</td>
                    {creneaux.map((c) => (
                      <td key={c} className="p-2 text-center">
                        <input type="checkbox" checked={isChecked(j, c)} onChange={() => toggle(j, c)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function normalizeMode(a: Assignment): Mode {
  return String(a?.mode ?? "PRESENTIEL").toUpperCase() === "ONLINE" ? "ONLINE" : "PRESENTIEL";
}

function OnlineFusionsManager({ groups }: { groups: string[] }) {
  const { toast } = useToast();

  const [fusions, setFusions] = useState<{ id: string; groupes: string[] }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api<{ onlineFusions: { id: string; groupes: string[] }[] }>(
        "/api/admin/catalog/online-fusions"
      );
      setFusions(Array.isArray(d?.onlineFusions) ? d.onlineFusions : []);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGroup = (g: string) => {
    setSelected((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  // ID auto: tri stable + join "_"
  const fusionId = useMemo(() => {
    const parts = selected.map((x) => x.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
    return parts.length >= 2 ? parts.join("_") : "";
  }, [selected]);

  const create = async () => {
    if (selected.length < 2) {
      toast({ title: "Erreur", description: "Sélectionnez au moins 2 groupes.", variant: "destructive" });
      return;
    }
    if (!fusionId) {
      toast({ title: "Erreur", description: "Fusion invalide.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await api("/api/admin/catalog/online-fusions", {
        method: "POST",
        body: JSON.stringify({ id: fusionId, groupes: selected }),
      });
      toast({ title: "OK", description: `Fusion créée : ${fusionId}` });
      setSelected([]);
      await load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    setLoading(true);
    try {
      await api(`/api/admin/catalog/online-fusions/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast({ title: "OK", description: "Fusion supprimée." });
      await load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const selectedSorted = useMemo(() => selected.slice().sort((a, b) => a.localeCompare(b)), [selected]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fusions en ligne</CardTitle>
        <CardDescription>
          Sélectionnez au moins 2 groupes physiques puis créez la fusion. L’ID est généré automatiquement.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Création */}
        <div className="rounded-md border p-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>ID auto</Label>
              <div className="h-10 w-full rounded-md border bg-muted px-3 flex items-center text-sm">
                {fusionId || "— (sélectionnez au moins 2 groupes) —"}
              </div>
              <div className="text-xs text-muted-foreground">
                Règle: tri alphabétique + join “_”. Exemple: DEV101 + DEV102 → DEV101_DEV102
              </div>
            </div>

            <div className="space-y-2">
              <Label>Groupes sélectionnés</Label>
              <div className="flex flex-wrap gap-2">
                {selectedSorted.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Aucun</span>
                ) : (
                  selectedSorted.map((g) => (
                    <span key={g} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                      {g}
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => toggleGroup(g)}
                        disabled={loading}
                        title="Retirer"
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Choisir les groupes physiques</Label>
            <div className="max-h-56 overflow-auto rounded-md border p-2">
              <div className="grid gap-2 md:grid-cols-3">
                {groups
                  .slice()
                  .sort((a, b) => a.localeCompare(b))
                  .map((g) => (
                    <label key={g} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(g)}
                        onChange={() => toggleGroup(g)}
                        disabled={loading}
                      />
                      <span>{g}</span>
                    </label>
                  ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={create} disabled={loading || selected.length < 2}>
              Créer la fusion
            </Button>
          </div>
        </div>

        {/* Liste */}
        <div className="rounded-md border">
          <div className="grid grid-cols-12 gap-2 border-b px-3 py-2 text-sm font-medium">
            <div className="col-span-4">ID</div>
            <div className="col-span-7">Groupes</div>
            <div className="col-span-1 text-right">Action</div>
          </div>

          {fusions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">Aucune fusion définie.</div>
          ) : (
            fusions
              .slice()
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((f) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                  <div className="col-span-4">{f.id}</div>
                  <div className="col-span-7">{(f.groupes ?? []).join(" + ")}</div>
                  <div className="col-span-1 text-right">
                    <Button variant="destructive" size="sm" onClick={() => remove(f.id)} disabled={loading}>
                      ×
                    </Button>
                  </div>
                </div>
              ))
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={load} disabled={loading}>
            Rafraîchir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


export default function Settings() {
  const { toast } = useToast();

  // référentiels
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [onlineFusions, setOnlineFusions] = useState<OnlineFusion[]>([]);

  // affectations
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Présentiel form
  const [pGroup, setPGroup] = useState("");
  const [pModule, setPModule] = useState("");
  const [pTeacher, setPTeacher] = useState("");

  // Online form
  const [oGroup, setOGroup] = useState("");
  const [oModule, setOModule] = useState("");
  const [oTeacher, setOTeacher] = useState("");

  // config meta + salles
  const [meta, setMeta] = useState<ConfigMeta>({
    nomEtablissement: "",
    jours: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"], // ordre conservé
    creneaux: [1, 2, 3, 4],
    maxSessionsPerDayTeacher: 3,
    maxSessionsPerDayGroup: 3,
  });

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  // soft constraints
  const [soft, setSoft] = useState<SoftConstraints>({});

  const loadOnlineFusions = async () => {
    // Stratégie défensive: on tente un endpoint dédié, sinon fallback.
    try {
      const d = await api<{ onlineFusions: OnlineFusion[] }>("/api/admin/catalog/online-fusions");
      setOnlineFusions(Array.isArray(d?.onlineFusions) ? d.onlineFusions : []);
      return;
    } catch {
      // fallback: certains backends mettent onlineFusions dans /api/admin/catalog
    }

    try {
      const d = await api<any>("/api/admin/catalog");
      const f = d?.onlineFusions;
      setOnlineFusions(Array.isArray(f) ? (f as OnlineFusion[]) : []);
    } catch {
      setOnlineFusions([]);
    }
  };

  const loadAll = async () => {
    try {
      const [t, g, m, a, cm, rs, sc] = await Promise.all([
        api<{ teachers: Teacher[] }>("/api/admin/catalog/teachers"),
        api<{ groups: string[] }>("/api/admin/catalog/groups"),
        api<{ modules: string[] }>("/api/admin/catalog/modules"),
        api<{ assignments: Assignment[] }>("/api/admin/catalog/assignments"),
        api<ConfigMeta>("/api/admin/config/meta"),
        api<{ typeSalle: string[]; salles: Room[] }>("/api/admin/config/rooms"),
        api<{ soft: SoftConstraints }>("/api/admin/constraints/soft"),
      ]);

      setTeachers(Array.isArray(t.teachers) ? t.teachers : []);
      setGroups(Array.isArray(g.groups) ? g.groups : []);
      setModules(Array.isArray(m.modules) ? m.modules : []);
      setAssignments(Array.isArray(a.assignments) ? a.assignments : []);

      setMeta({
        nomEtablissement: cm?.nomEtablissement ?? "",
        jours: Array.isArray(cm?.jours) ? cm.jours : [],
        creneaux: Array.isArray(cm?.creneaux) ? cm.creneaux : [],
        maxSessionsPerDayTeacher: Number(cm?.maxSessionsPerDayTeacher ?? 3),
        maxSessionsPerDayGroup: Number(cm?.maxSessionsPerDayGroup ?? 3),
      });

      setRoomTypes(Array.isArray(rs?.typeSalle) ? rs.typeSalle : []);
      setRooms(Array.isArray(rs?.salles) ? rs.salles : []);

      setSoft(sc?.soft ?? {});
      await loadOnlineFusions();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadRooms = async () => {
    const rs = await api<{ typeSalle: string[]; salles: Room[] }>("/api/admin/config/rooms");
    setRoomTypes(Array.isArray(rs?.typeSalle) ? rs.typeSalle : []);
    setRooms(Array.isArray(rs?.salles) ? rs.salles : []);
  };

  const assignmentKey = (x: Assignment) => `${normalizeMode(x)}::${x.group}::${x.module}`;

  const canAddPresentiel = useMemo(() => Boolean(pGroup && pModule && pTeacher), [pGroup, pModule, pTeacher]);
  const canAddOnline = useMemo(() => Boolean(oGroup && oModule && oTeacher), [oGroup, oModule, oTeacher]);

  const saveAssignment = async (mode: Mode, group: string, module: string, teacher: string) => {
    await api("/api/admin/catalog/assignments", {
      method: "POST",
      body: JSON.stringify({ group, module, teacher, mode }),
    });
  };

  const refreshAssignments = async () => {
    const a = await api<{ assignments: Assignment[] }>("/api/admin/catalog/assignments");
    setAssignments(Array.isArray(a.assignments) ? a.assignments : []);
  };

  const addOrUpdatePresentiel = async () => {
    if (!canAddPresentiel) return;
    try {
      await saveAssignment("PRESENTIEL", pGroup, pModule, pTeacher);
      toast({ title: "OK", description: "Affectation présentiel enregistrée." });
      setPGroup("");
      setPModule("");
      setPTeacher("");
      await refreshAssignments();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const addOrUpdateOnline = async () => {
    if (!canAddOnline) return;
    try {
      await saveAssignment("ONLINE", oGroup, oModule, oTeacher);
      toast({ title: "OK", description: "Affectation en ligne enregistrée." });
      setOGroup("");
      setOModule("");
      setOTeacher("");
      await refreshAssignments();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const deleteAssignment = async (mode: Mode, group: string, module: string) => {
    try {
      await api("/api/admin/catalog/assignments", {
        method: "DELETE",
        body: JSON.stringify({ group, module, mode }),
      });
      toast({ title: "OK", description: "Affectation supprimée." });
      await refreshAssignments();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const saveMeta = async () => {
    try {
      // IMPORTANT: jours conservés dans l’ordre (pas de tri).
      const cleaned: ConfigMeta = {
        nomEtablissement: meta.nomEtablissement ?? "",
        jours: (meta.jours || []).map((x) => x.trim()).filter(Boolean),
        creneaux: uniqNumsSorted((meta.creneaux || []).map((x) => Number(x))),
        maxSessionsPerDayTeacher: Number(meta.maxSessionsPerDayTeacher ?? 3),
        maxSessionsPerDayGroup: Number(meta.maxSessionsPerDayGroup ?? 3),
      };

      await api("/api/admin/config/meta", { method: "PUT", body: JSON.stringify(cleaned) });
      toast({ title: "OK", description: "Configuration enregistrée." });
      setMeta(cleaned);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const saveSoft = async () => {
    try {
      await api("/api/admin/constraints/soft", { method: "PUT", body: JSON.stringify({ soft }) });
      toast({ title: "OK", description: "Contraintes soft enregistrées." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const softKeys = useMemo(() => Object.keys(soft).sort((a, b) => a.localeCompare(b)), [soft]);

  const teacherIds = useMemo(() => teachers.map((t) => t.id), [teachers]);

  // Mapping id -> "Nom (id)" pour les indisponibilités (Formateurs)
  const teacherLabelById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const t of teachers) {
      const id = String(t.id ?? "").trim();
      const name = String(t.name ?? "").trim();
      if (!id) continue;
      rec[id] = name ? `${name} (${id})` : id;
    }
    return rec;
  }, [teachers]);

  // Options groupe ONLINE = groupes + fusions
  const onlineGroupOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];

    for (const g of groups) {
      const id = String(g).trim();
      if (!id) continue;
      opts.push({ value: id, label: id });
    }

    for (const f of onlineFusions) {
      const id = String(f?.id ?? "").trim();
      const arr = Array.isArray(f?.groupes) ? f.groupes.map((x) => String(x).trim()).filter(Boolean) : [];
      if (!id) continue;
      opts.push({ value: id, label: arr.length ? `${arr.join(" + ")} (online)` : `${id} (online)` });
    }

    // uniq by value
    const seen = new Set<string>();
    return opts.filter((x) => {
      if (seen.has(x.value)) return false;
      seen.add(x.value);
      return true;
    });
  }, [groups, onlineFusions]);

  const presentielAssignments = useMemo(
    () => assignments.filter((a) => normalizeMode(a) === "PRESENTIEL"),
    [assignments]
  );
  const onlineAssignments = useMemo(
    () => assignments.filter((a) => normalizeMode(a) === "ONLINE"),
    [assignments]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Administration du référentiel, des affectations, de la configuration, des contraintes soft et des indisponibilités.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={loadAll}>
          Rafraîchir tout
        </Button>
      </div>

      <Tabs defaultValue="referentiel" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="referentiel">Référentiel</TabsTrigger>
          <TabsTrigger value="affectations">Affectations</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="salles">Salles</TabsTrigger>
          <TabsTrigger value="constraints">Contraintes soft</TabsTrigger>
          <TabsTrigger value="indispo">Indisponibilités</TabsTrigger>
        </TabsList>

        <TabsContent value="referentiel" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <TeacherManager />
            <SimpleListManager
              title="Groupes"
              description="Ajouter / supprimer des groupes."
              getUrl="/api/admin/catalog/groups"
              addUrl="/api/admin/catalog/groups"
              deleteUrlPrefix="/api/admin/catalog/groups/"
              keyName="groups"
              placeholder="ex: DEV101"
            />
            <SimpleListManager
              title="Modules"
              description="Ajouter / supprimer des modules."
              getUrl="/api/admin/catalog/modules"
              addUrl="/api/admin/catalog/modules"
              deleteUrlPrefix="/api/admin/catalog/modules/"
              keyName="modules"
              placeholder="ex: DEV_M103"
            />
      

          </div>
        </TabsContent>

        <TabsContent value="affectations" className="space-y-4">
          <Tabs defaultValue="presentiel" className="space-y-4">
            <TabsList>
              <TabsTrigger value="presentiel">Présentiel</TabsTrigger>
              <TabsTrigger value="online">En ligne</TabsTrigger>
            </TabsList>

            {/* PRESENTIEL */}
            <TabsContent value="presentiel" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Affectations Présentiel</CardTitle>
                  <CardDescription>
                    Clé unique : (mode, groupe, module). Une nouvelle affectation remplace l’ancienne.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Groupe</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={pGroup}
                        onChange={(e) => setPGroup(e.target.value)}
                      >
                        <option value="">— sélectionner —</option>
                        {groups.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label>Module</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={pModule}
                        onChange={(e) => setPModule(e.target.value)}
                      >
                        <option value="">— sélectionner —</option>
                        {modules.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label>Formateur</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={pTeacher}
                        onChange={(e) => setPTeacher(e.target.value)}
                      >
                        <option value="">— sélectionner —</option>
                        {teachers
                          .slice()
                          .sort((a, b) => a.id.localeCompare(b.id))
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.id})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <Button className="w-full" onClick={addOrUpdatePresentiel} disabled={!canAddPresentiel}>
                        Enregistrer
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="rounded-md border">
                    <div className="grid grid-cols-12 gap-2 border-b px-3 py-2 text-sm font-medium">
                      <div className="col-span-4">Groupe</div>
                      <div className="col-span-4">Module</div>
                      <div className="col-span-3">Formateur</div>
                      <div className="col-span-1 text-right">Action</div>
                    </div>

                    {presentielAssignments.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-muted-foreground">Aucune affectation présentiel.</div>
                    ) : (
                      presentielAssignments
                        .slice()
                        .sort((a, b) => assignmentKey(a).localeCompare(assignmentKey(b)))
                        .map((a) => (
                          <div key={assignmentKey(a)} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                            <div className="col-span-4">{a.group}</div>
                            <div className="col-span-4">{a.module}</div>
                            <div className="col-span-3">{teacherLabelById[a.teacher] ?? a.teacher}</div>
                            <div className="col-span-1 text-right">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteAssignment("PRESENTIEL", a.group, a.module)}
                              >
                                ×
                              </Button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ONLINE */}
            <TabsContent value="online" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Affectations En ligne</CardTitle>
                  <CardDescription>
                    Ici, le groupe peut être un groupe simple (DEV101) ou une fusion (DEV101_DEV102).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Groupe / Fusion</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={oGroup}
                        onChange={(e) => setOGroup(e.target.value)}
                      >
                        <option value="">— sélectionner —</option>
                        {onlineGroupOptions.map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label>Module</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={oModule}
                        onChange={(e) => setOModule(e.target.value)}
                      >
                        <option value="">— sélectionner —</option>
                        {modules.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label>Formateur</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={oTeacher}
                        onChange={(e) => setOTeacher(e.target.value)}
                      >
                        <option value="">— sélectionner —</option>
                        {teachers
                          .slice()
                          .sort((a, b) => a.id.localeCompare(b.id))
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.id})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <Button className="w-full" onClick={addOrUpdateOnline} disabled={!canAddOnline}>
                        Enregistrer
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="rounded-md border">
                    <div className="grid grid-cols-12 gap-2 border-b px-3 py-2 text-sm font-medium">
                      <div className="col-span-4">Groupe/Fusion</div>
                      <div className="col-span-4">Module</div>
                      <div className="col-span-3">Formateur</div>
                      <div className="col-span-1 text-right">Action</div>
                    </div>

                    {onlineAssignments.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-muted-foreground">Aucune affectation en ligne.</div>
                    ) : (
                      onlineAssignments
                        .slice()
                        .sort((a, b) => assignmentKey(a).localeCompare(assignmentKey(b)))
                        .map((a) => (
                          <div key={assignmentKey(a)} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                            <div className="col-span-4">{a.group}</div>
                            <div className="col-span-4">{a.module}</div>
                            <div className="col-span-3">{teacherLabelById[a.teacher] ?? a.teacher}</div>
                            <div className="col-span-1 text-right">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteAssignment("ONLINE", a.group, a.module)}
                              >
                                ×
                              </Button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </CardContent>
              </Card>
              <OnlineFusionsManager groups={groups} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          {/* inchangé */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Établissement, jours, créneaux et limites quotidiennes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nom de l’établissement</Label>
                  <Input
                    value={meta.nomEtablissement}
                    onChange={(e) => setMeta((p) => ({ ...p, nomEtablissement: e.target.value }))}
                    placeholder="Ex: OFPPT ... "
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Max séances/jour/formateur</Label>
                    <Input
                      type="number"
                      value={meta.maxSessionsPerDayTeacher}
                      onChange={(e) => setMeta((p) => ({ ...p, maxSessionsPerDayTeacher: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max séances/jour/groupe</Label>
                    <Input
                      type="number"
                      value={meta.maxSessionsPerDayGroup}
                      onChange={(e) => setMeta((p) => ({ ...p, maxSessionsPerDayGroup: Number(e.target.value) }))}
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
                  Les créneaux sont triés numériquement lors de l’enregistrement (cohérence solveur).
                </p>
                <div className="flex gap-2">
                  <Input value="" placeholder="(édition via ajout ci-dessous)" disabled />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {meta.creneaux.map((c) => (
                    <span key={c} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                      {c}
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setMeta((p) => ({ ...p, creneaux: p.creneaux.filter((x) => x !== c) }))}
                        title="Supprimer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {meta.creneaux.length === 0 && <span className="text-sm text-muted-foreground">Aucun créneau</span>}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ajouter un créneau (ex: 5)"
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
                  <Button
                    type="button"
                    onClick={() => {
                      const el = document.activeElement as HTMLInputElement | null;
                      if (el) el.blur();
                    }}
                    variant="secondary"
                  >
                    OK
                  </Button>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveMeta}>Enregistrer</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salles" className="space-y-4">
          <RoomsManager roomTypes={roomTypes} rooms={rooms} onReload={reloadRooms} />
        </TabsContent>

        <TabsContent value="constraints" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contraintes soft</CardTitle>
              <CardDescription>Activer/désactiver et régler la pondération uniquement.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {softKeys.length === 0 ? (
                <div className="text-sm text-muted-foreground">Aucune contrainte soft définie côté backend.</div>
              ) : (
                <div className="space-y-3">
                  {softKeys.map((k) => {
                    const row = soft[k];
                    return (
                      <div key={k} className="rounded-md border p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-1">
                            <div className="font-medium">{row?.label || k}</div>
                            <div className="text-xs text-muted-foreground">Clé: {k}</div>
                          </div>

                          <div className="flex flex-col gap-3 md:flex-row md:items-center">
                            <div className="flex items-center gap-2">
                              <Label>Actif</Label>
                              <Switch
                                checked={Boolean(row?.enabled)}
                                onCheckedChange={(v) =>
                                  setSoft((p) => ({
                                    ...p,
                                    [k]: { ...(p[k] || { enabled: false, weight: 1 }), enabled: v },
                                  }))
                                }
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              <Label>Pondération</Label>
                              <Input
                                className="w-24"
                                type="number"
                                value={Number(row?.weight ?? 1)}
                                onChange={(e) =>
                                  setSoft((p) => ({
                                    ...p,
                                    [k]: { ...(p[k] || { enabled: false, weight: 1 }), weight: Number(e.target.value) },
                                  }))
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={saveSoft} disabled={softKeys.length === 0}>
                  Enregistrer
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="indispo" className="space-y-4">
          <Tabs defaultValue="teachers" className="space-y-4">
            <TabsList>
              <TabsTrigger value="teachers">Formateurs</TabsTrigger>
              <TabsTrigger value="groups">Groupes</TabsTrigger>
              <TabsTrigger value="rooms">Salles</TabsTrigger>
            </TabsList>

            <TabsContent value="teachers">
              <IndispoEditor
                scope="teachers"
                entities={teacherIds}
                jours={meta.jours}
                creneaux={meta.creneaux}
                labelById={teacherLabelById}
              />
            </TabsContent>

            <TabsContent value="groups">
              <IndispoEditor scope="groups" entities={groups} jours={meta.jours} creneaux={meta.creneaux} />
            </TabsContent>

            <TabsContent value="rooms">
              <IndispoEditor
                scope="rooms"
                entities={rooms.map((r) => r.id)}
                jours={meta.jours}
                creneaux={meta.creneaux}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
