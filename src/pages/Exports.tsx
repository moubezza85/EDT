// src/pages/Exports.tsx
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

import { getCatalog, type Catalog } from "@/api/catalogApi";
import { getConfig, type Config } from "@/api/configApi";
import { httpBlob } from "@/api/http";

export default function Exports() {
  const { toast } = useToast();

  // data
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);

  // selections
  const [trainerId, setTrainerId] = useState("");
  const [groupe, setGroupe] = useState("");
  const [salle, setSalle] = useState("");

  useEffect(() => {
    getCatalog().then(setCatalog);
    getConfig().then(setCfg);
  }, []);

  const trainers = useMemo(() => catalog?.teachers ?? [], [catalog]);

  // IMPORTANT:
  // On utilise UNIQUEMENT les groupes "réels" du catalog => pas de fusions.
  const groupes = useMemo(() => catalog?.groups ?? [], [catalog]);

  const salles = useMemo(() => cfg?.salles ?? [], [cfg]);

  const downloadAndToast = async (path: string, message: string) => {
    toast({ title: message });
    const blob = await httpBlob(path, { method: "GET" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Exports PDF – Emploi du temps</h1>
        <p className="text-gray-500">Télécharger les emplois du temps (semaine courante)</p>
      </div>

      {/* -------- Formateur -------- */}
      <Card>
        <CardHeader>
          <CardTitle>Export par Formateur</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 items-end">
          <Select value={trainerId} onValueChange={setTrainerId}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Choisir un formateur" />
            </SelectTrigger>
            <SelectContent>
              {trainers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            disabled={!trainerId}
            onClick={() =>
              downloadAndToast(
                `/api/reports/timetable/formateur/${encodeURIComponent(trainerId)}`,
                "Génération du PDF formateur."
              ).catch((e: any) =>
                toast({ variant: "destructive", title: "Erreur", description: e?.message ?? "Téléchargement impossible" })
              )
            }
          >
            Télécharger PDF
          </Button>
        </CardContent>
      </Card>

      {/* -------- Groupe -------- */}
      <Card>
        <CardHeader>
          <CardTitle>Export par Groupe</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 items-end">
          <Select value={groupe} onValueChange={setGroupe}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Choisir un groupe" />
            </SelectTrigger>
            <SelectContent>
              {groupes.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            disabled={!groupe}
            onClick={() =>
              downloadAndToast(
                `/api/reports/timetable/groupe/${encodeURIComponent(groupe)}`,
                "Génération du PDF groupe."
              ).catch((e: any) =>
                toast({ variant: "destructive", title: "Erreur", description: e?.message ?? "Téléchargement impossible" })
              )
            }
          >
            Télécharger PDF
          </Button>
        </CardContent>
      </Card>

      {/* -------- Salle -------- */}
      <Card>
        <CardHeader>
          <CardTitle>Export par Salle</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 items-end">
          <Select value={salle} onValueChange={setSalle}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Choisir une salle" />
            </SelectTrigger>
            <SelectContent>
              {salles.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.id} {s.type ? `(${s.type})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            disabled={!salle}
            onClick={() =>
              downloadAndToast(
                `/api/reports/timetable/salle/${encodeURIComponent(salle)}`,
                "Génération du PDF salle."
              ).catch((e: any) =>
                toast({ variant: "destructive", title: "Erreur", description: e?.message ?? "Téléchargement impossible" })
              )
            }
          >
            Télécharger PDF
          </Button>
        </CardContent>
      </Card>

      {/* -------- ZIP GLOBAL -------- */}
      <Card className="border-2 border-black">
        <CardHeader>
          <CardTitle>Export global</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            onClick={() =>
              downloadAndToast(
                `/api/reports/timetable/all`,
                "Génération du ZIP complet."
              ).catch((e: any) =>
                toast({ variant: "destructive", title: "Erreur", description: e?.message ?? "Téléchargement impossible" })
              )
            }
          >
            Télécharger ZIP complet (Formateurs + Groupes + Salles)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
