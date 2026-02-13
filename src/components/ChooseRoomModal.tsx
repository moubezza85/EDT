// src/components/ChooseRoomModal.tsx
import { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  availableRooms: string[];
  preferredRoom?: string;
  onConfirm: (room: string) => Promise<void> | void;
};

export default function ChooseRoomModal({
  open,
  onClose,
  title = "Choisir une salle",
  availableRooms,
  preferredRoom,
  onConfirm,
}: Props) {
  const initial = useMemo(() => {
    if (!availableRooms.length) return "";
    if (preferredRoom && availableRooms.includes(preferredRoom)) return preferredRoom;
    return availableRooms[0];
  }, [availableRooms, preferredRoom]);

  const [room, setRoom] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRoom(initial);
  }, [initial]);

  if (!open) return null;

  async function handleConfirm() {
    if (!room) return;
    setSaving(true);
    try {
      await onConfirm(room);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="px-2" onClick={onClose} disabled={saving}>
            X
          </button>
        </div>

        <div className="mt-4">
          {availableRooms.length === 0 ? (
            <div className="text-sm text-red-600">
              Aucune salle n’est disponible sur ce créneau.
            </div>
          ) : (
            <label className="grid gap-1">
              <span className="text-sm">Salle disponible</span>
              <select
                className="rounded border p-2"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              >
                {availableRooms.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded border px-3 py-2" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button
            className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
            onClick={handleConfirm}
            disabled={saving || availableRooms.length === 0}
          >
            {saving ? "Enregistrement..." : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
