import { useDrag } from "react-dnd";
import { Session } from "../types";
import { cn } from "@/lib/utils";

import { BookOpen, Shuffle, Trash2, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import { isOnlineSession } from "@/api/timetableApi";

interface SessionCardProps {
  session: Session;
  groupLabel?: string;
  isCompact?: boolean;
  onDelete?: (sessionId: string) => void;
  onChangeRoom?: (session: Session) => void;
  onChangeModule?: (session: Session) => void;
  draggable?: boolean;
}

const SessionCard = ({
  session,
  groupLabel,
  isCompact = false,
  onDelete,
  onChangeRoom,
  onChangeModule,
  draggable = true,
}: SessionCardProps) => {
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: "SESSION",
      item: session,
      canDrag: draggable,
      collect: (monitor) => ({
        isDragging: !!monitor.isDragging(),
      }),
    }),
    [session, draggable]
  );

  const online = isOnlineSession(session);
  const virtualState = String((session as any)._virtualState ?? "");
  const toDelete = virtualState === "TO_DELETE";
  const isReassignPending = virtualState === "REASSIGN_PENDING";
  const proposedModule = (session as any)._proposedModule as string | undefined;
  const proposedGroupe = (session as any)._proposedGroupe as string | undefined;

  const generateColor = (name: string) => {
    const colors = [
      "bg-blue-100 border-blue-300",
      "bg-green-100 border-green-300",
      "bg-yellow-100 border-yellow-300",
      "bg-purple-100 border-purple-300",
      "bg-pink-100 border-pink-300",
      "bg-indigo-100 border-indigo-300",
      "bg-orange-100 border-orange-300",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const onlineClass = "bg-sky-50 border-sky-300 ring-1 ring-sky-200";
  const colorClass = online ? onlineClass : generateColor(session.module);
  const hasActions = onChangeRoom || onChangeModule || onDelete || online;

  return (
    <div
      ref={drag}
      className={cn(
        "relative rounded-md border p-2 text-sm shadow-sm select-none",
        draggable ? "cursor-move" : "cursor-default",
        colorClass,
        isDragging ? "opacity-50" : "opacity-100",
        toDelete && "opacity-50",
        isReassignPending && "ring-1 ring-orange-400"
      )}
    >
      {toDelete && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <X className="h-10 w-10 text-red-500/70" />
        </div>
      )}

      {/* Contenu principal */}
      <div className="min-w-0 space-y-0.5">

        {/* Module */}
        {isReassignPending && proposedModule && proposedModule !== session.module ? (
          <div className="font-medium leading-tight">
            <span className="line-through text-gray-400 text-xs">{session.module}</span>
            <span className="block text-orange-700 text-xs font-semibold truncate">
              → {proposedModule}
            </span>
          </div>
        ) : (
          <div className="font-medium truncate">{session.module}</div>
        )}

        {/* Groupe */}
        {isReassignPending && proposedGroupe && proposedGroupe !== session.groupe ? (
          <div className="leading-tight">
            <span className="line-through text-gray-400 text-xs">
              {groupLabel ?? session.groupe}
            </span>
            <span className="block text-orange-600 text-xs truncate">
              → {proposedGroupe}
            </span>
          </div>
        ) : (
          <div className="text-gray-700 truncate">{groupLabel ?? session.groupe}</div>
        )}

        {/* Salle */}
        <div className={cn("truncate", online ? "text-sky-700 font-medium" : "text-gray-500")}>
          {online ? `En ligne (${session.salle})` : session.salle}
        </div>

        {/* Formateur */}
        {!isCompact && (
          <div className="text-gray-500 truncate pt-0.5 text-xs">{session.formateur}</div>
        )}
      </div>

      {/* Boutons d'action — rangée compacte en bas */}
      {hasActions && (
        <div
          className="flex items-center justify-end gap-0.5 mt-1.5 pt-1 border-t border-black/10"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {online ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 cursor-default opacity-60"
              title="Séance en ligne"
              onClick={(e) => e.stopPropagation()}
              disabled
            >
              <Video className="h-3.5 w-3.5" />
            </Button>
          ) : (
            onChangeRoom && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                title="Changer salle"
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeRoom(session);
                }}
              >
                <Shuffle className="h-3.5 w-3.5" />
              </Button>
            )
          )}

          {onChangeModule && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              title="Changer module / groupe"
              onClick={(e) => {
                e.stopPropagation();
                onChangeModule(session);
              }}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </Button>
          )}

          {onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  title="Supprimer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer cette séance ?</AlertDialogTitle>
                  <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(session.id)}>
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionCard;
