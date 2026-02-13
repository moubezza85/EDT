import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { getAvailableRooms } from "@/api/roomsApi";

type ApiResp = {
  availableRooms?: string[];
  occupiedRooms?: string[];
};

export default function FreeRooms() {
  const { toast } = useToast();

  const days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const slots = [
    { id: 1, label: "08h30 - 11h00" },
    { id: 2, label: "11h00 - 13h30" },
    { id: 3, label: "13h30 - 16h00" },
    { id: 4, label: "16h00 - 18h30" },
  ];

  const [day, setDay] = useState<string>("lundi");
  const [slot, setSlot] = useState<number>(1);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResp | null>(null);

  const slotLabel = useMemo(() => slots.find((s) => s.id === slot)?.label ?? "", [slot]);

  const run = async () => {
    setLoading(true);
    try {
      const resp = await getAvailableRooms(day, slot);
      setData(resp);
      toast({
        title: "Résultat chargé",
        description: `Salles libres pour ${day}, ${slotLabel}`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: e?.message ?? "Impossible de récupérer les salles libres.",
      });
    } finally {
      setLoading(false);
    }
  };

  const free = data?.availableRooms ?? [];
  const occupied = data?.occupiedRooms ?? [];

  return (
    <div>
      <header className="bg-white border rounded-md p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Salles libres</h1>
        <p className="text-gray-500">Consultez les salles disponibles pour un jour et un créneau donnés.</p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle>Recherche</CardTitle>
            <CardDescription>Choisissez un jour et un créneau.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">Jour</div>
              <Select value={day} onValueChange={(v) => setDay(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Jour" />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">Créneau</div>
              <Select value={String(slot)} onValueChange={(v) => setSlot(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Créneau" />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={run} disabled={loading} className="w-full">
              {loading ? "Chargement..." : "Rechercher"}
            </Button>

            {data ? (
              <div className="text-xs text-gray-500">
                Dernier résultat : {day}, {slotLabel}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>Résultat</CardTitle>
            <CardDescription>
              {day}, {slotLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium">Salles libres</div>
              {free.length === 0 ? (
                <div className="text-sm text-gray-500">Aucune salle libre (ou pas de recherche effectuée).</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {free.map((r) => (
                    <Badge key={r} variant="secondary">
                      {r}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Salles occupées</div>
              {occupied.length === 0 ? (
                <div className="text-sm text-gray-500">Aucune salle occupée (ou pas d’info renvoyée).</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {occupied.map((r) => (
                    <Badge key={r} variant="outline">
                      {r}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
