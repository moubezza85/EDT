// src/components/AddSessionModal.tsx
import { useEffect, useMemo, useState } from "react";
import type { Catalog } from "../api/catalogApi";
import { getAvailableRooms, type RoomsScope } from "../api/roomsApi";

type AnySession = {
  id?: string;
  jour?: string;
  creneau?: number;
  salle?: string;
  _virtualState?: string;
};

type Option = { value: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;

  // provenant de config.json via /api/config
  jours: string[];
  creneaux: number[];
  salles: string[];

  // provenant de catalog.json via /api/catalog
  catalog: Catalog;

  onSubmit: (data: {
    formateur: string;
    groupe: string;
    module: string;
    jour: string;
    creneau: number;
    salle: string;
  }) => Promise<void>;

  // RBAC: si fourni, le formateur est imposé (formateur)
  fixedTrainerId?: string;
  lockTrainer?: boolean;

  // Optionnel: gardé pour compat (plus utilisé pour filtrer les salles)
  occupiedSessions?: AnySession[];

  // Quelle source utiliser pour les salles libres (backend)
  // official => timetable.json, draft => nextTimetable.json (admin uniquement)
  roomsScope?: RoomsScope;
};

type AnyAssignment = any;

const TEAMS_ROOM_ID = "TEAMS";

type Mode = "PRESENTIEL" | "ONLINE";

function getTeacherId(a: AnyAssignment): string {
  return String(a?.teacher ?? a?.teacherId ?? a?.trainerId ?? a?.formateur ?? "").trim();
}

function getGroup(a: AnyAssignment): string {
  return String(a?.group ?? a?.groupId ?? a?.groupe ?? "").trim();
}

function getModule(a: AnyAssignment): string {
  return String(a?.module ?? a?.moduleId ?? a?.mid ?? "").trim();
}

function getMode(a: AnyAssignment): Mode {
  const m = String(a?.mode ?? "").trim().toUpperCase();
  return m === "ONLINE" ? "ONLINE" : "PRESENTIEL";
}

type OnlineFusion = { id: string; groupes: string[] };

function readOnlineFusions(catalog: Catalog): OnlineFusion[] {
  const anyCat = catalog as any;
  const f = anyCat?.onlineFusions;
  return Array.isArray(f) ? (f as OnlineFusion[]) : [];
}

function buildGroupLabelMap(groups: string[], fusions: OnlineFusion[]) {
  const map = new Map<string, string>();
  for (const g of groups) {
    const id = String(g).trim();
    if (id) map.set(id, id);
  }
  for (const fu of fusions) {
    const id = String(fu?.id ?? "").trim();
    const arr = Array.isArray(fu?.groupes) ? fu.groupes.map((x) => String(x).trim()).filter(Boolean) : [];
    if (!id) continue;
    const label = arr.length ? `${arr.join(" + ")} (online)` : `${id} (online)`;
    map.set(id, label);
  }
  return map;
}

export default function AddSessionModal({
  open,
  onClose,
  jours,
  creneaux,
  salles,
  catalog,
  onSubmit,
  fixedTrainerId,
  lockTrainer = false,
  occupiedSessions = [],
  roomsScope = "official",
}: Props) {
  void occupiedSessions; // compat: non utilisé pour filtrer les salles

  const safeJours = Array.isArray(jours) ? jours : [];
  const safeCreneaux = Array.isArray(creneaux) ? creneaux : [];
  const safeSalles = useMemo(() => {
    const base = Array.isArray(salles) ? salles : [];
    // on retire TEAMS de la liste physique; en ONLINE, on force TEAMS
    return base.map((s) => String(s).trim()).filter((s) => !!s && s !== TEAMS_ROOM_ID);
  }, [salles]);

  const teachers = Array.isArray((catalog as any)?.teachers) ? (catalog as any).teachers : [];
  const groups = Array.isArray((catalog as any)?.groups) ? (catalog as any).groups : [];
  const assignments = Array.isArray((catalog as any)?.assignments) ? (catalog as any).assignments : [];

  const onlineFusions = useMemo(() => readOnlineFusions(catalog), [catalog]);
  const groupLabelById = useMemo(() => buildGroupLabelMap(groups ?? [], onlineFusions), [groups, onlineFusions]);

  const [modeOnline, setModeOnline] = useState<boolean>(false);

  const [trainerId, setTrainerId] = useState<string>(fixedTrainerId ?? "");
  useEffect(() => {
    if (fixedTrainerId) setTrainerId(String(fixedTrainerId));
  }, [fixedTrainerId]);

  const defaults = useMemo(() => {
    return {
      jour: safeJours[0] ?? "lundi",
      creneau: safeCreneaux[0] ?? 1,
      salle: safeSalles[0] ?? "",
    };
  }, [safeJours, safeCreneaux, safeSalles]);

  const [jour, setJour] = useState(defaults.jour);
  const [creneau, setCreneau] = useState<number>(defaults.creneau);
  const [salle, setSalle] = useState(defaults.salle);

  const [groupId, setGroupId] = useState<string>("");
  const [moduleId, setModuleId] = useState<string>("");

  const [saving, setSaving] = useState(false);

  const configOk = safeJours.length > 0 && safeCreneaux.length > 0 && safeSalles.length > 0;
  const catalogOk =
    !!catalog &&
    Array.isArray((catalog as any).teachers) &&
    Array.isArray((catalog as any).assignments) &&
    (catalog as any).teachers.length > 0;

  const currentMode: Mode = modeOnline ? "ONLINE" : "PRESENTIEL";

  const trainerOptions: Option[] = useMemo(() => {
    return (teachers ?? [])
      .map((t: any) => {
        const id = String(t?.id ?? "").trim();
        const name = String(t?.name ?? "").trim();
        if (!id) return null;
        return { value: id, label: name ? `${name} (${id})` : id };
      })
      .filter(Boolean) as Option[];
  }, [teachers]);

  const groupOptions: Option[] = useMemo(() => {
    if (!trainerId) return [];

    const groupIds: string[] = Array.from(
      new Set(
        (assignments ?? [])
          .filter((a: AnyAssignment) => getTeacherId(a) === trainerId && getMode(a) === currentMode)
          .map((a: AnyAssignment) => String(getGroup(a)).trim())
          .filter(Boolean)
      )
    );

    groupIds.sort((a, b) => a.localeCompare(b));

    return groupIds.map((gid) => ({
      value: gid,
      label: groupLabelById.get(gid) ?? gid,
    }));
  }, [trainerId, assignments, currentMode, groupLabelById]);

  const moduleOptions: Option[] = useMemo(() => {
    if (!trainerId || !groupId) return [];

    const moduleIds: string[] = Array.from(
      new Set(
        (assignments ?? [])
          .filter(
            (a: AnyAssignment) =>
              getTeacherId(a) === trainerId && getMode(a) === currentMode && getGroup(a) === groupId
          )
          .map((a: AnyAssignment) => String(getModule(a)).trim())
          .filter(Boolean)
      )
    );

    moduleIds.sort((a, b) => a.localeCompare(b));

    return moduleIds.map((mid) => ({ value: mid, label: mid }));
  }, [trainerId, groupId, assignments, currentMode]);

  // -----------------------------
  // Salles libres via backend
  // -----------------------------
  const [availableRooms, setAvailableRooms] = useState<string[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const refreshRooms = useMemo(() => {
    return async (j: string, c: number) => {
      setRoomsLoading(true);
      setRoomsError(null);
      try {
        const resp = await getAvailableRooms(j, c, roomsScope);
        const fromApi = Array.isArray(resp.availableRooms) ? resp.availableRooms.map((x) => String(x).trim()).filter(Boolean) : [];
        // on intersecte avec safeSalles (au cas où le parent filtre les salles physiques)
        const allowedSet = new Set(safeSalles.map((x) => String(x).trim()));
        const finalRooms = fromApi.filter((r) => allowedSet.has(String(r).trim()));
        setAvailableRooms(finalRooms);
      } catch (e: any) {
        // En cas d'erreur, on évite de proposer des salles potentiellement occupées.
        setAvailableRooms([]);
        setRoomsError(e?.message ?? "Impossible de charger les salles libres");
      } finally {
        setRoomsLoading(false);
      }
    };
  }, [roomsScope, safeSalles]);

  // Fetch salles libres quand (jour/creneau/mode/scope) change
  useEffect(() => {
    if (!open) return;
    if (!configOk) return;
    if (currentMode === "ONLINE") {
      setAvailableRooms(safeSalles);
      setRoomsError(null);
      return;
    }
    void refreshRooms(String(jour), Number(creneau));
  }, [open, configOk, currentMode, jour, creneau, refreshRooms, safeSalles]);

  // Si la salle choisie n'est plus dispo (présentiel), on bascule vers la 1ère salle libre.
  useEffect(() => {
    if (!open) return;
    if (currentMode === "ONLINE") return;
    const current = String(salle ?? "").trim();
    if (current && availableRooms.includes(current)) return;
    setSalle(availableRooms[0] ?? "");
  }, [open, currentMode, availableRooms, salle]);

  // Quand on passe en ONLINE, salle forcée TEAMS
  useEffect(() => {
    if (!open) return;
    if (modeOnline) {
      setSalle(TEAMS_ROOM_ID);
    } else {
      setSalle(availableRooms[0] ?? defaults.salle);
    }
    setGroupId("");
    setModuleId("");
  }, [modeOnline, open, defaults.salle, availableRooms]);

  // Reset à l'ouverture
  useEffect(() => {
    if (!open) return;

    setJour(defaults.jour);
    setCreneau(defaults.creneau);

    setModeOnline(false);
    setSalle(availableRooms[0] ?? defaults.salle);

    const firstTrainer = String(fixedTrainerId ?? trainerOptions[0]?.value ?? "");
    setTrainerId(firstTrainer);

    setGroupId("");
    setModuleId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaults, trainerOptions, fixedTrainerId]);

  // Trainer -> auto first group
  useEffect(() => {
    if (!open) return;
    const firstGroup = groupOptions[0]?.value ?? "";
    setGroupId(firstGroup);
    setModuleId("");
  }, [trainerId, groupOptions, open]);

  // Group -> auto first module
  useEffect(() => {
    if (!open) return;
    const firstModule = moduleOptions[0]?.value ?? "";
    setModuleId(firstModule);
  }, [groupId, moduleOptions, open]);

  if (!open) return null;

  const effectiveSalle = modeOnline ? TEAMS_ROOM_ID : salle;

  const canSave =
    configOk &&
    catalogOk &&
    trainerId.trim() &&
    groupId.trim() &&
    moduleId.trim() &&
    String(jour).trim() &&
    Number.isFinite(creneau) &&
    String(effectiveSalle).trim();

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSubmit({
        formateur: trainerId,
        groupe: groupId,
        module: moduleId,
        jour: String(jour).trim(),
        creneau,
        salle: String(effectiveSalle).trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ajouter une séance</h2>
          <button className="px-2" onClick={onClose} disabled={saving}>
            X
          </button>
        </div>

        {!configOk ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Configuration incomplète: vérifiez que <b>config.json</b> contient <b>jours</b>, <b>creneaux</b> et <b>salles</b>.
          </div>
        ) : null}

        {!catalogOk ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Catalogue incomplet: vérifiez que <b>catalog.json</b> contient <b>teachers</b> et <b>assignments</b>.
          </div>
        ) : null}

        {/* Switch mode */}
        <div className="mt-4 flex items-center justify-between rounded border p-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Mode de séance</div>
            <div className="text-xs text-muted-foreground">
              Présentiel = salle physique. À distance = salle bloquée sur {TEAMS_ROOM_ID}.
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <span>Présentiel</span>
            <input
              type="checkbox"
              checked={modeOnline}
              onChange={(e) => setModeOnline(e.target.checked)}
              disabled={!configOk}
            />
            <span>À distance</span>
          </label>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm">Formateur</span>
            <select
              className="rounded border p-2"
              value={trainerId}
              onChange={(e) => setTrainerId(e.target.value)}
              disabled={!catalogOk || lockTrainer}
            >
              {trainerOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Groupe</span>
            <select
              className="rounded border p-2"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              disabled={!catalogOk || !trainerId || groupOptions.length === 0}
            >
              {groupOptions.length === 0 ? (
                <option value="">Aucun groupe disponible</option>
              ) : (
                groupOptions.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Module</span>
            <select
              className="rounded border p-2"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              disabled={!catalogOk || !trainerId || !groupId || moduleOptions.length === 0}
            >
              {moduleOptions.length === 0 ? (
                <option value="">Aucun module disponible</option>
              ) : (
                moduleOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="grid gap-1">
              <span className="text-sm">Jour</span>
              <select
                className="rounded border p-2"
                value={jour}
                onChange={(e) => setJour(e.target.value)}
                disabled={!configOk}
              >
                {safeJours.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-sm">Créneau</span>
              <select
                className="rounded border p-2"
                value={creneau}
                onChange={(e) => setCreneau(Number(e.target.value))}
                disabled={!configOk}
              >
                {safeCreneaux.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-sm">Salle</span>
              <select
                className="rounded border p-2"
                value={effectiveSalle}
                onChange={(e) => setSalle(e.target.value)}
                disabled={!configOk || modeOnline || (!modeOnline && (roomsLoading || !!roomsError))}
              >
                {modeOnline ? (
                  <option value={TEAMS_ROOM_ID}>{TEAMS_ROOM_ID}</option>
                ) : roomsLoading ? (
                  <option value="">Chargement…</option>
                ) : availableRooms.length === 0 ? (
                  <option value="">Aucune salle disponible</option>
                ) : null}

                {(modeOnline ? [] : availableRooms).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {roomsError && !modeOnline ? (
                <div className="text-xs text-amber-700 mt-1">
                  {roomsError}
                </div>
              ) : null}

              {modeOnline ? (
                <div className="text-xs text-muted-foreground">Salle verrouillée sur {TEAMS_ROOM_ID}.</div>
              ) : null}
            </label>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded border px-3 py-2" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button
            className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? "Ajout..." : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
