import { useState, useMemo } from "react";
import { useDrop } from "react-dnd";
import { useToast } from "@/components/ui/use-toast";
import SessionCard from "./SessionCard";
import RoomSelector from "./RoomSelector";
import { Session, Cell } from "@/types";
import { cn } from "@/lib/utils";
import { getAvailableRooms } from "@/api/roomsApi";
import { isOnlineSession } from "@/api/timetableApi";
interface ScheduleGridProps {
  sessions: Session[];
  hasConflict: (session: Session, targetCell: Cell) => Session | null;
  updateSession: (sessionId: string, updates: Partial<Session>) => Promise<boolean>;
  rooms: string[];
  isLoading?: boolean;
  slotHours?: number;
  onDeleteSession?: (sessionId: string) => Promise<void>;
  formatGroupLabel?: (groupeId: string) => string;
  readOnly?: boolean;
}

const ScheduleGrid = ({
  sessions,
  hasConflict,
  updateSession,
  rooms,
  isLoading = false,
  onDeleteSession,
  slotHours = 2.5,
  formatGroupLabel,
  readOnly = false,
}: ScheduleGridProps) => {
  const { toast } = useToast();

  const [roomSelectorOpen, setRoomSelectorOpen] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<string[]>(rooms);

  const [draggedSession, setDraggedSession] = useState<Session | null>(null);
  const [conflictSession, setConflictSession] = useState<Session | null>(null);
  const [targetCell, setTargetCell] = useState<Cell | null>(null);

  const days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const timeSlots = [
    { id: 1, label: "08h30 - 11h00" },
    { id: 2, label: "11h00 - 13h30" },
    { id: 3, label: "13h30 - 16h00" },
    { id: 4, label: "16h00 - 18h30" },
  ];

  const getSlotLabel = (slotId: number) => timeSlots.find((t) => t.id === slotId)?.label ?? String(slotId);

  const openRoomSelector = (opts: {
    session: Session;
    dest: Cell;
    freeRooms: string[];
    conflict?: Session | null;
  }) => {
    setDraggedSession(opts.session);
    setTargetCell(opts.dest);
    setConflictSession(opts.conflict ?? null);
    setAvailableRooms(opts.freeRooms);
    setRoomSelectorOpen(true);
  };

  const handleChangeRoomClick = async (session: Session) => {
    if (isLoading) return;
    if (readOnly) return;

    // Séance en ligne => pas de changement de salle
    if (isOnlineSession(session)) return;

    try {
      const api = await getAvailableRooms(session.jour, session.creneau);
      const freeRooms = api.availableRooms ?? [];

      if (freeRooms.length === 0) {
        toast({
          title: "Aucune salle disponible",
          description: "Aucune salle n’est disponible sur ce créneau.",
          variant: "destructive",
        });
        return;
      }

      openRoomSelector({
        session,
        dest: { day: session.jour, slot: session.creneau },
        freeRooms,
        conflict: null,
      });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message ?? "Erreur lors du chargement des salles disponibles.",
        variant: "destructive",
      });
    }
  };

  const handleDrop = async (session: Session, day: string, slot: number) => {
    if (isLoading) return;
    if (readOnly) return;
    if (session.jour === day && session.creneau === slot) return;

    const dest: Cell = { day, slot };

    // Pré-check: conflit formateur/groupe
    const conflict = hasConflict(session, dest);
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
      // sinon conflit de salle possible uniquement => on continue
    }

    // Séance en ligne => on déplace sans logique “salles libres”
    if (isOnlineSession(session)) {
      const success = await updateSession(session.id, {
        jour: day,
        creneau: slot,
        // garde la “salle” TEAMS (ou votre id virtuel)
        salle: session.salle,
      });

      if (success) {
        toast({
          title: "Séance déplacée",
          description: `${session.module} (${session.groupe}) déplacée au ${day}, ${getSlotLabel(slot)} (En ligne)`,
        });
      } else {
        toast({
          title: "Erreur de déplacement",
          description: "Action refusée par le serveur (contraintes / conflits).",
          variant: "destructive",
        });
      }
      return;
    }

    try {
      // 1) récupérer salles libres depuis backend
      const api = await getAvailableRooms(day, slot);
      const freeRooms = api.availableRooms ?? [];

      if (freeRooms.length === 0) {
        toast({
          title: "Erreur de déplacement",
          description: "Aucune salle disponible sur ce créneau.",
          variant: "destructive",
        });
        return;
      }

      // 2) si la salle actuelle est libre => move direct en gardant la même salle
      if (freeRooms.includes(session.salle)) {
        const success = await updateSession(session.id, {
          jour: day,
          creneau: slot,
          salle: session.salle,
        });

        if (success) {
          toast({
            title: "Séance déplacée",
            description: `${session.module} (${session.groupe}) déplacée au ${day}, ${getSlotLabel(
              slot
            )} (Salle ${session.salle})`,
          });
        } else {
          toast({
            title: "Erreur de déplacement",
            description: "Action refusée par le serveur (contraintes / conflits).",
            variant: "destructive",
          });
        }
        return;
      }

      // 3) sinon, ouvrir le selector avec EXACTEMENT freeRooms (API)
      openRoomSelector({
        session,
        dest,
        freeRooms,
        conflict: conflict ?? null,
      });

      toast({
        title: "Salle occupée",
        description: "Choisissez une salle libre pour ce créneau.",
      });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message ?? "Erreur lors du chargement des salles disponibles.",
        variant: "destructive",
      });
    }
  };

  const handleRoomSelect = async (room: string) => {
    if (!draggedSession || !targetCell) return;

    const success = await updateSession(draggedSession.id, {
      jour: targetCell.day,
      creneau: targetCell.slot,
      salle: room,
    });

    if (success) {
      const sameSlot = draggedSession.jour === targetCell.day && draggedSession.creneau === targetCell.slot;

      toast({
        title: sameSlot ? "Salle modifiée" : "Séance déplacée",
        description: sameSlot
          ? `${draggedSession.module} (${draggedSession.groupe}) : Salle ${room}`
          : `${draggedSession.module} (${draggedSession.groupe}) déplacée au ${targetCell.day}, ${getSlotLabel(
              targetCell.slot
            )} (Salle ${room})`,
      });

      setRoomSelectorOpen(false);
    } else {
      toast({
        title: "Action refusée",
        description: "Action refusée par le serveur (contraintes / conflits).",
        variant: "destructive",
      });
    }
  };
  const sessionsByCell = useMemo(() => {
    const result: Record<string, Record<number, Session[]>> = {};

    days.forEach((day) => {
      result[day] = {};
      timeSlots.forEach((slot) => {
        result[day][slot.id] = [];
      });
    });

    sessions.forEach((session) => {
      if (result[session.jour] && result[session.jour][session.creneau]) {
        result[session.jour][session.creneau].push(session);
      }
    });

    return result;
  }, [sessions]);

  const [isCompact] = useState(window.innerWidth < 768);

  const slotCount = useMemo(() => sessions.length, [sessions]);

  const totalHours = useMemo(() => {
    const hours = slotCount * slotHours;
    return Number.isInteger(hours) ? `${hours}` : `${hours}`.replace(".", ",");
  }, [slotCount, slotHours]);

  const handleDelete = async (sessionId: string) => {
    if (!onDeleteSession) return;

    try {
      await onDeleteSession(sessionId);
      toast({
        title: "Séance supprimée",
        description: "La séance a été supprimée.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Suppression refusée",
        description: e?.message ?? "Impossible de supprimer la séance.",
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
          <span className="text-gray-500">
            {" "}
            ( {slotCount} × {String(slotHours).replace(".", ",")} )
          </span>
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

                const [{ isOver, canDrop }, drop] = useDrop(() => ({
                  accept: "SESSION",
                  canDrop: () => !isLoading,
                  drop: (item: Session) => handleDrop(item, day, slot.id),
                  collect: (monitor) => ({
                    isOver: !!monitor.isOver(),
                    canDrop: !!monitor.canDrop(),
                  }),
                }));

                return (
                  <td
                    ref={drop}
                    key={`${day}-${slot.id}`}
                    className={cn(
                      "p-2 border relative min-h-[100px]",
                      isOver && canDrop ? "bg-blue-50" : "",
                      isOver && !canDrop ? "bg-red-50" : ""
                    )}
                  >
                    <div className="space-y-2">
                      {cellSessions.map((s) => {
                        const online = isOnlineSession(s);
                        return (
                          <SessionCard
                            key={s.id}
                            session={s}
                            groupLabel={formatGroupLabel ? formatGroupLabel(s.groupe) : undefined}
                            isCompact={isCompact || cellSessions.length > 1}
                            draggable={!readOnly}
                            // IMPORTANT: on ne passe pas onChangeRoom si c’est en ligne
                            onChangeRoom={!readOnly && !online ? handleChangeRoomClick : undefined}
                            onDelete={!readOnly && onDeleteSession ? handleDelete : undefined}
                          />
                        );
                      })}
                    </div>
                  </td>
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
};

export default ScheduleGrid;
