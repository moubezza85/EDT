// src/components/VirtualScheduleGrid.tsx
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useDrop } from "react-dnd";
import { useToast } from "@/components/ui/use-toast";
import SessionCard from "./SessionCard";
import RoomSelector from "./RoomSelector";
import { Session, Cell } from "@/types";
import { cn } from "@/lib/utils";
import { getAvailableRooms } from "@/api/roomsApi";
import type { RoomsScope } from "@/api/roomsApi";
import { isOnlineSession } from "@/api/timetableApi";

type GhostSession = {
  id: string; // ghost id
  originalSessionId: string; // vraie session
  requestId: string;
  jour: string;
  creneau: number;
  salle: string;
  module?: string;
  groupe?: string;
  formateur?: string;
  motif?: string | null;
  hasCollision?: boolean;
};

type DeleteResult = { ok: true; error?: undefined } | { ok: false; error: any };

interface VirtualScheduleGridProps {
  sessions: Session[]; // sessions réelles (draggables)
  ghostSessions: GhostSession[]; // propositions (non-draggables)
  movedSessionIds: Set<string>; // sessions ayant une proposition => affichées en "source moved-away"
  hasConflict: (session: Session, targetCell: Cell) => Session | null;
  updateSession: (sessionId: string, updates: Partial<Session>) => Promise<boolean>;
  rooms: string[];
  roomsScope?: RoomsScope;
  isLoading?: boolean;
  slotHours?: number;

  // IMPORTANT: deleteSession de useSchedule retourne {ok:boolean,...}
  onDeleteSession?: (sessionId: string) => Promise<DeleteResult>;

  formatGroupLabel?: (groupeId: string) => string;
}

export default function VirtualScheduleGrid({
  sessions,
  ghostSessions,
  movedSessionIds,
  hasConflict,
  updateSession,
  rooms,
  roomsScope = "official",
  isLoading = false,
  onDeleteSession,
  slotHours = 2.5,
  formatGroupLabel,
}: VirtualScheduleGridProps) {
  const { toast } = useToast();

  const [roomSelectorOpen, setRoomSelectorOpen] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<string[]>(rooms);

  const [draggedSession, setDraggedSession] = useState<Session | null>(null);
  const [targetCell, setTargetCell] = useState<Cell | null>(null);
  const [conflictSession, setConflictSession] = useState<Session | null>(null);

  const days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const timeSlots = [
    { id: 1, label: "08h30 - 11h00" },
    { id: 2, label: "11h00 - 13h30" },
    { id: 3, label: "13h30 - 16h00" },
    { id: 4, label: "16h00 - 18h30" },
  ];

  const slotCount = timeSlots.length * days.length;
  const totalHours = Math.round(slotCount * slotHours * 10) / 10;

  const sessionsByCell = useMemo(() => {
    const map: Record<string, Record<number, Session[]>> = {};
    for (const d of days) map[d] = { 1: [], 2: [], 3: [], 4: [] };

    for (const s of sessions) {
      if (!map[s.jour]) continue;
      if (!map[s.jour][s.creneau]) map[s.jour][s.creneau] = [];
      map[s.jour][s.creneau].push(s);
    }
    return map;
  }, [sessions]);

  const ghostByCell = useMemo(() => {
    const map: Record<string, Record<number, GhostSession[]>> = {};
    for (const d of days) map[d] = { 1: [], 2: [], 3: [], 4: [] };

    for (const g of ghostSessions) {
      if (!map[g.jour]) continue;
      if (!map[g.jour][g.creneau]) map[g.jour][g.creneau] = [];
      map[g.jour][g.creneau].push(g);
    }
    return map;
  }, [ghostSessions]);

  // Cell = { day, slot } (selon votre useSchedule/hasConflict)
  const openRoomSelector = (opts: { session: Session; dest: Cell; freeRooms: string[]; conflict?: Session | null }) => {
    setDraggedSession(opts.session);
    setTargetCell(opts.dest);
    setConflictSession(opts.conflict ?? null);
    setAvailableRooms(opts.freeRooms);
    setRoomSelectorOpen(true);
  };

  const handleDrop = async (session: Session, toDay: string, toSlot: number) => {
  if (isLoading) return;

  // Séance en ligne => pas de déplacement
  if (isOnlineSession(session)) return;

  // Pré-check: conflit formateur/groupe AVANT de proposer une salle.
  const conflict = hasConflict(session, { day: toDay, slot: toSlot });
  if (conflict) {
    const sameTeacher = conflict.formateur === session.formateur;
    const sameGroup = conflict.groupe === session.groupe;

    if (sameTeacher || sameGroup) {
      toast({
        title: "Conflit de déplacement",
        description: sameTeacher
          ? "Le formateur est déjà occupé sur ce créneau."
          : "Le groupe est déjà occupé sur ce créneau.",
        variant: "destructive",
      });
      return;
    }
    // Sinon: conflit de salle possible uniquement => on continue.
  }

  try {
    // On ne consulte les salles libres qu'après avoir éliminé les conflits formateur/groupe.
    const api = await getAvailableRooms(toDay, toSlot, roomsScope);
    const freeRooms = api.availableRooms ?? [];

    if (freeRooms.length === 0) {
      toast({
        title: "Aucune salle disponible",
        description: "Aucune salle n’est disponible sur ce créneau.",
        variant: "destructive",
      });
      return;
    }

    // Si la salle actuelle est libre ET pas de conflit => move direct
    if (freeRooms.includes(session.salle) && !conflict) {
      const ok = await updateSession(session.id, { jour: toDay, creneau: toSlot, salle: session.salle });
      if (!ok) {
        toast({
          title: "Déplacement refusé",
          description: "Le backend a refusé ce déplacement.",
          variant: "destructive",
        });
      }
      return;
    }

    // Sinon, on propose un choix de salle (conflit salle)
    openRoomSelector({ session, dest: { day: toDay, slot: toSlot }, freeRooms, conflict });
  } catch (e: any) {
    toast({
      title: "Erreur",
      description: e?.message ?? "Erreur lors de la récupération des salles",
      variant: "destructive",
    });
  }
};


  // IMPORTANT:
  // Ne pas utiliser useDrop() directement dans un map/loop (hooks rules).
  // On encapsule la logique de drop dans un composant dédié.
  const DropCell = ({
    day,
    slotId,
    children,
  }: {
    day: string;
    slotId: number;
    children: ReactNode;
  }) => {
    const [{ isOver, canDrop }, drop] = useDrop(
      () => ({
        accept: "SESSION",
        canDrop: () => !isLoading,
        drop: (item: Session) => handleDrop(item, day, slotId),
        collect: (monitor) => ({
          isOver: !!monitor.isOver(),
          canDrop: !!monitor.canDrop(),
        }),
      }),
      [day, slotId, isLoading, handleDrop]
    );

    return (
      <td
        ref={drop}
        className={cn(
          "p-2 border relative min-h-[100px]",
          isOver && canDrop ? "bg-blue-50" : "",
          isOver && !canDrop ? "bg-red-50" : ""
        )}
      >
        {children}
      </td>
    );
  };

  const handleRoomSelect = async (roomId: string) => {
    if (!draggedSession || !targetCell) return;

    // FIX: mapper Cell(day/slot) -> Session(jour/creneau)
    const ok = await updateSession(draggedSession.id, {
      jour: targetCell.day,
      creneau: targetCell.slot,
      salle: roomId,
    });

    if (!ok) {
      toast({
        title: "Déplacement refusé",
        description: "Le backend a refusé ce déplacement.",
        variant: "destructive",
      });
    }
    setRoomSelectorOpen(false);
  };

  const handleDelete = async (sessionId: string) => {
    if (!onDeleteSession) return;

    const res = await onDeleteSession(sessionId);
    if (!res.ok) {
      toast({
        title: "Suppression refusée",
        description: String(res.error ?? "Erreur"),
        variant: "destructive",
      });
    }
  };

  const handleChangeRoomClick = async (session: Session) => {
    if (isLoading) return;
    if (isOnlineSession(session)) return;

    try {
      const api = await getAvailableRooms(session.jour, session.creneau, roomsScope);
      const freeRooms = api.availableRooms ?? [];

      if (freeRooms.length === 0) {
        toast({
          title: "Aucune salle disponible",
          description: "Aucune salle n’est disponible sur ce créneau.",
          variant: "destructive",
        });
        return;
      }

      // FIX: dest = {day, slot}
      openRoomSelector({ session, dest: { day: session.jour, slot: session.creneau }, freeRooms });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message ?? "Erreur récupération salles",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white p-3">
        <div className="text-sm text-gray-700">
          <span className="font-medium">Créneaux affichés :</span> <span>{slotCount}</span>
        </div>
        <div className="text-sm text-gray-700">
          <span className="font-medium">Total heures :</span> <span>{totalHours} h</span>
          <span className="text-gray-500"> ( {slotCount} × {String(slotHours).replace(".", ",")} )</span>
        </div>
      </div>

      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="p-3 border"></th>
            {timeSlots.map((slot) => (
              <th key={slot.id} className="p-3 border font-medium text-center">
                {slot.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {days.map((day, dayIndex) => (
            <tr key={day} className={dayIndex % 2 === 0 ? "bg-gray-50" : ""}>
              <td className="p-3 border font-medium capitalize">{day}</td>

              {timeSlots.map((slot) => {
                const cellSessions = sessionsByCell[day][slot.id];
                const cellGhosts = ghostByCell[day][slot.id];

                return (
                  <DropCell key={`${day}-${slot.id}`} day={day} slotId={slot.id}>
                    <div className="space-y-2">
                      {/* Sessions réelles (draggables) */}
                      {cellSessions.map((s) => {
                        const online = isOnlineSession(s);
                        const moved = movedSessionIds.has(String(s.id));
                        return (
                          <div key={s.id} className={cn(moved ? "opacity-60" : "")}>
                            <SessionCard
                              session={s}
                              groupLabel={formatGroupLabel ? formatGroupLabel(s.groupe) : undefined}
                              isCompact={cellSessions.length > 1}
                              onChangeRoom={!online ? handleChangeRoomClick : undefined}
                              onDelete={onDeleteSession ? handleDelete : undefined}
                            />
                          </div>
                        );
                      })}

                      {/* Ghost sessions (propositions) — non draggables */}
                      {cellGhosts.map((g) => (
                        <div
                          key={g.id}
                          className={cn(
                            "rounded-md border border-dashed p-2 text-xs bg-green-50",
                            g.hasCollision ? "border-red-400 bg-red-50" : "border-green-300"
                          )}
                          title={`Proposition ${g.requestId} (session ${g.originalSessionId})`}
                        >
                          <div className="font-semibold">
                            Proposition {g.requestId}
                            {g.hasCollision ? " — ⚠ conflit potentiel" : ""}
                          </div>
                          <div className="text-gray-700">
                            {g.module ? (
                              <span className="mr-2">
                                <span className="font-medium">Module:</span> {g.module}
                              </span>
                            ) : null}
                            {g.groupe ? (
                              <span>
                                <span className="font-medium">Groupe:</span> {g.groupe}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-gray-600">
                            <span className="font-medium">Salle:</span> {g.salle}
                          </div>
                          {g.motif ? <div className="text-gray-500 mt-1">Motif: {g.motif}</div> : null}
                        </div>
                      ))}
                    </div>
                  </DropCell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <RoomSelector
        open={roomSelectorOpen}
        onClose={() => setRoomSelectorOpen(false)}
        session={draggedSession}
        conflictSession={conflictSession}
        rooms={availableRooms}
        onRoomSelect={handleRoomSelect}
      />
    </div>
  );
}
