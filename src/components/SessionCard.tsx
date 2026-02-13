import { useDrag } from "react-dnd";
import { Session } from "../types";
import { cn } from "@/lib/utils";

import { Shuffle, Trash2, Video, X } from "lucide-react";
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
  onChangeRoom?: (session: Session) => void; // (présentiel uniquement)
  draggable?: boolean;
}

const SessionCard = ({ session, groupLabel, isCompact = false, onDelete, onChangeRoom, draggable = true }: SessionCardProps) => {
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
  const toDelete = String((session as any)._virtualState ?? "") === "TO_DELETE";

  // couleur stable par module (présentiel)
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

  // style “en ligne” distinct
  const onlineClass = "bg-sky-50 border-sky-300 ring-1 ring-sky-200";
  const colorClass = online ? onlineClass : generateColor(session.module);

  return (
    <div
      ref={drag}
      className={cn(
        "relative rounded-md border p-2 text-sm shadow-sm select-none",
        draggable ? "cursor-move" : "cursor-default",
        colorClass,
        isDragging ? "opacity-50" : "opacity-100",
        toDelete ? "opacity-50" : ""
      )}
    >
      {toDelete && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <X className="h-10 w-10 text-red-500/70" />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{session.module}</div>
          <div className="text-gray-700 truncate">{groupLabel ?? session.groupe}</div>

          <div className={cn("truncate", online ? "text-sky-700 font-medium" : "text-gray-500")}>
            {online ? `En ligne (${session.salle})` : session.salle}
          </div>

          {!isCompact && (
            <div className="text-gray-500 truncate pt-1 text-xs">{session.formateur}</div>
          )}
        </div>

        {(onChangeRoom || onDelete || online) && (
          <div className="flex flex-col items-center gap-1 shrink-0">
            {/* Si en ligne: icône informative (sans action) */}
            {online ? (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 cursor-default"
                title="Séance en ligne"
                onMouseDown={(e) => e.stopPropagation()} // évite de “démarrer” un drag depuis le bouton
                onClick={(e) => e.stopPropagation()}
                disabled
              >
                <Video className="h-4 w-4" />
              </Button>
            ) : (
              // Présentiel: bouton changer salle si fourni
              onChangeRoom && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  title="Changer salle"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeRoom(session);
                  }}
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              )
            )}

            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    title="Supprimer"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4" />
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
    </div>
  );
};

export default SessionCard;
