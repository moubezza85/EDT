// src/components/ChangeModuleModal.tsx
import { useEffect, useMemo, useState } from "react";
import type { Session } from "../types";
import type { Catalog } from "../api/catalogApi";

type Option = { value: string; label: string };
type AnyAssignment = any;

function getTeacherId(a: AnyAssignment): string {
  return String(a?.teacher ?? a?.teacherId ?? a?.trainerId ?? a?.formateur ?? "").trim();
}
function getGroup(a: AnyAssignment): string {
  return String(a?.group ?? a?.groupId ?? a?.groupe ?? "").trim();
}
function getModule(a: AnyAssignment): string {
  return String(a?.module ?? a?.moduleId ?? a?.mid ?? "").trim();
}
function getMode(a: AnyAssignment): string {
  return String(a?.mode ?? "").trim().toUpperCase() === "ONLINE" ? "ONLINE" : "PRESENTIEL";
}

const TEAMS_ROOM_ID = "TEAMS";

type Props = {
  open: boolean;
  onClose: () => void;
  session: Session | null;
  catalog: Catalog;
  lockTrainer?: boolean;
  onSubmit: (newGroupe: string, newModule: string) => Promise<void>;
};

export default function ChangeModuleModal({
  open,
  onClose,
  session,
  catalog,
  lockTrainer = false,
  onSubmit,
}: Props) {
  const teachers = Array.isArray((catalog as any)?.teachers)
    ? (catalog as any).teachers
    : [];
  const assignments = Array.isArray((catalog as any)?.assignments)
    ? (catalog as any).assignments
    : [];

  // Mode inféré depuis la salle de la séance
  const currentMode = useMemo(() => {
    if (!session) return "PRESENTIEL";
    return String(session.salle ?? "").trim().toUpperCase() === TEAMS_ROOM_ID
      ? "ONLINE"
      : "PRESENTIEL";
  }, [session]);

  const [trainerId, setTrainerId] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  const [moduleId, setModuleId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Init à l'ouverture
  useEffect(() => {
    if (!open || !session) return;
    setTrainerId(session.formateur ?? "");
    setGroupId(session.groupe ?? "");
    setModuleId(session.module ?? "");
    setLocalError(null);
  }, [open, session]);

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
    const ids: string[] = Array.from(
      new Set(
        (assignments ?? [])
          .filter(
            (a: AnyAssignment) =>
              getTeacherId(a) === trainerId && getMode(a) === currentMode
          )
          .map((a: AnyAssignment) => getGroup(a))
          .filter(Boolean)
      )
    );
    ids.sort((a, b) => a.localeCompare(b));
    return ids.map((id) => ({ value: id, label: id }));
  }, [trainerId, assignments, currentMode]);

  const moduleOptions: Option[] = useMemo(() => {
    if (!trainerId || !groupId) return [];
    const ids: string[] = Array.from(
      new Set(
        (assignments ?? [])
          .filter(
            (a: AnyAssignment) =>
              getTeacherId(a) === trainerId &&
              getMode(a) === currentMode &&
              getGroup(a) === groupId
          )
          .map((a: AnyAssignment) => getModule(a))
          .filter(Boolean)
      )
    );
    ids.sort((a, b) => a.localeCompare(b));
    return ids.map((id) => ({ value: id, label: id }));
  }, [trainerId, groupId, assignments, currentMode]);

  // Auto-select first group quand trainer change (si la valeur n'est plus valide)
  useEffect(() => {
    if (!open) return;
    const isValid = groupId && groupOptions.some((g) => g.value === groupId);
    if (isValid) return;
    setGroupId(groupOptions[0]?.value ?? "");
    setModuleId("");
  }, [trainerId, groupOptions, open, groupId]);

  // Auto-select first module quand group change (si la valeur n'est plus valide)
  useEffect(() => {
    if (!open) return;
    const isValid = moduleId && moduleOptions.some((m) => m.value === moduleId);
    if (isValid) return;
    setModuleId(moduleOptions[0]?.value ?? "");
  }, [groupId, moduleOptions, open, moduleId]);

  if (!open || !session) return null;

  const canSave = trainerId.trim() && groupId.trim() && moduleId.trim() && !saving;

  const hasChange =
    groupId.trim() !== (session.groupe ?? "").trim() ||
    moduleId.trim() !== (session.module ?? "").trim();

  async function handleSave() {
    if (!canSave) return;
    if (!hasChange) {
      onClose();
      return;
    }
    setLocalError(null);
    setSaving(true);
    try {
      await onSubmit(groupId.trim(), moduleId.trim());
      onClose();
    } catch (e: any) {
      setLocalError(e?.message ?? "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded bg-white p-4 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Changer le module / groupe</h2>
          <button
            className="px-2 text-gray-500 hover:text-gray-700"
            onClick={onClose}
            disabled={saving}
          >
            ✕
          </button>
        </div>

        {/* Info séance (lecture seule) */}
        <div className="mb-4 rounded border bg-gray-50 p-3 text-sm space-y-1">
          <div>
            <span className="font-medium text-gray-600">Jour / Créneau : </span>
            <span className="capitalize">{session.jour}</span>
            {" — créneau "}
            {session.creneau}
          </div>
          <div>
            <span className="font-medium text-gray-600">Salle : </span>
            {session.salle}
            {currentMode === "ONLINE" && (
              <span className="ml-1 text-sky-600 text-xs">(en ligne)</span>
            )}
          </div>
          <div>
            <span className="font-medium text-gray-600">Formateur actuel : </span>
            {session.formateur}
          </div>
        </div>

        {localError && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {localError}
          </div>
        )}

        <div className="grid gap-3">
          {/* Formateur (grisé si lockTrainer) */}
          <label className="grid gap-1">
            <span className="text-sm font-medium">
              Formateur
              {lockTrainer && (
                <span className="ml-1 text-xs text-gray-400">(verrouillé)</span>
              )}
            </span>
            <select
              className="rounded border p-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              value={trainerId}
              onChange={(e) => setTrainerId(e.target.value)}
              disabled={lockTrainer}
            >
              {trainerOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {/* Groupe */}
          <label className="grid gap-1">
            <span className="text-sm font-medium">Groupe</span>
            <select
              className="rounded border p-2"
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setModuleId("");
              }}
              disabled={!trainerId || groupOptions.length === 0}
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

          {/* Module */}
          <label className="grid gap-1">
            <span className="text-sm font-medium">Module</span>
            <select
              className="rounded border p-2"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              disabled={!groupId || moduleOptions.length === 0}
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
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={onClose}
            disabled={saving}
          >
            Annuler
          </button>
          <button
            className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? "Sauvegarde…" : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
