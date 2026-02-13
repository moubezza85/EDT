// src/pages/Index.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import ScheduleGrid from "../components/ScheduleGrid";
import FilterBar from "../components/FilterBar";
import AddSessionModal from "../components/AddSessionModal";

import { useSchedule } from "../hooks/useSchedule";
import { FilterType } from "../types";
import { useToast } from "../components/ui/use-toast";
import { httpBlob } from "../api/http";

import { getConfig, type Config } from "../api/configApi";
import { getCatalog, type Catalog } from "../api/catalogApi";
import { addSession } from "../api/timetableApi";
import { useAuth } from "@/auth/AuthContext";

const ALL = "_all";

const Index = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const readOnly = user?.role === "surveillant";

  // ---- config ----
  const [cfg, setCfg] = useState<Config | null>(null);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgError, setCfgError] = useState<string | null>(null);

  // ---- catalog ----
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // ---- add modal ----
  const [addOpen, setAddOpen] = useState(false);

  // -------- helpers: virtual rooms + fusions --------
  const isVirtualRoom = useCallback(
    (roomId: string) => {
      const salles = cfg?.salles ?? [];
      const found = salles.find((s: any) => (typeof s === "string" ? s === roomId : s?.id === roomId));
      const type = typeof found === "string" ? null : found?.type;
      return (type ?? "").toUpperCase() === "VIRTUEL";
    },
    [cfg]
  );

  const fusionMap = useMemo(() => {
    const m = new Map<string, string[]>();
    (catalog?.onlineFusions ?? []).forEach((f) => m.set(f.id, f.groupes ?? []));
    return m;
  }, [catalog]);

  const expandGroupIds = useCallback(
    (groupeId: string) => {
      const expanded = fusionMap.get(groupeId);
      if (expanded && expanded.length) return expanded;
      return [groupeId];
    },
    [fusionMap]
  );

  const formatGroupLabel = useCallback(
    (groupeId: string) => {
      const expanded = fusionMap.get(groupeId);
      if (expanded && expanded.length) return expanded.join(" + ");
      return groupeId;
    },
    [fusionMap]
  );

  // ---- schedule hook (filtrage + conflits) ----
  const {
    sessions,
    loading,
    error,
    hasConflict,
    updateSession,
    fetchData,
    uniqueFormateurValues,
    uniqueGroupeValues,
    uniqueSalleValues,
    filters,
    addFilter,
    removeFilter,
    deleteSession,
  } = useSchedule({ expandGroupIds, isVirtualRoom });

  // ---- rooms for grid (salles physiques uniquement) ----
  const salleIdsPhysical = useMemo(() => {
    const raw = cfg?.salles ?? [];
    const ids = raw
      .map((s: any) => (typeof s === "string" ? s : s?.id))
      .filter((x: any): x is string => typeof x === "string" && x.trim().length > 0);

    return ids.filter((id) => !isVirtualRoom(id));
  }, [cfg, isVirtualRoom]);

  // ---- filter options (UI) ----
  const groupeOptions = useMemo(() => {
    // Pour que DEV101 / DEV102 soient toujours sélectionnables même si seules des fusions existent dans le timetable
    const fromCatalog = (catalog?.groups ?? []).filter((g) => (g ?? "").trim().length > 0);
    return fromCatalog.length ? fromCatalog : uniqueGroupeValues;
  }, [catalog, uniqueGroupeValues]);

  const salleOptions = useMemo(() => uniqueSalleValues.filter((id) => !isVirtualRoom(id)), [uniqueSalleValues, isVirtualRoom]);

  // ---- load config + catalog ----
  useEffect(() => {
    (async () => {
      try {
        setCfgLoading(true);
        setCfgError(null);
        const c = await getConfig();
        setCfg(c);
      } catch (e: any) {
        setCfgError(e?.message ?? "Impossible de charger config.json");
        setCfg(null);
      } finally {
        setCfgLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setCatalogLoading(true);
        setCatalogError(null);
        const c = await getCatalog();
        setCatalog(c);
      } catch (e: any) {
        setCatalogError(e?.message ?? "Impossible de charger catalog.json");
        setCatalog(null);
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, []);

  // ---- filters record for FilterBar ----
  const filtersRecord = useMemo(() => {
    const rec: Record<string, string> = {
      formateur: ALL,
      groupe: ALL,
      salle: ALL,
    };
    filters.forEach((filter) => {
      rec[filter.type] = filter.value;
    });
    return rec;
  }, [filters]);

  const handleFilterChange = (type: FilterType, value: string) => {
    addFilter({ type, value });
  };

  const handleClearFilter = (type: FilterType) => {
    removeFilter(type);
  };

  const handleRefresh = () => {
    fetchData();
    toast({
      title: "Actualisation",
      description: "Les données les plus récentes ont été chargées.",
    });
  };

  // ---- PDF bouton (formateur uniquement) ----
  const selectedFormateur = filtersRecord.formateur ?? "";
  const canDownloadPdf = !!selectedFormateur && selectedFormateur !== ALL;

  const handleDownloadPdf = async () => {
    if (!canDownloadPdf) {
      toast({
        variant: "destructive",
        title: "Téléchargement indisponible",
        description: "Veuillez sélectionner un formateur spécifique (pas 'Tous').",
      });
      return;
    }

    try {
      const blob = await httpBlob(
        `/api/reports/timetable/formateur/${encodeURIComponent(selectedFormateur)}`,
        { method: "GET" }
      );
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Impression impossible",
        description: e?.message ?? "Erreur lors de la génération du PDF",
      });
    }
  };

  // bouton "Ajouter séance" : exiger formateur choisi + config/catalog chargés
  const canOpenAdd = !!cfg && !!catalog && !cfgLoading && !catalogLoading;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Emploi de temps Intelligent</h1>
        <p className="text-gray-500">Gérer les séances avec simplicité !</p>
      </header>

      <main className="container mx-auto py-6 px-4">
        <FilterBar
          formateurOptions={uniqueFormateurValues}
          groupeOptions={groupeOptions}
          salleOptions={salleOptions}
          onFilterChange={handleFilterChange}
          onClearFilter={handleClearFilter}
          onRefresh={handleRefresh}
          filters={filtersRecord}
          isLoading={loading}
        />

        <div className="mt-3 text-sm text-gray-600">
          {cfgLoading
            ? "Chargement config..."
            : cfgError
            ? cfgError
            : cfg
            ? "Config chargée"
            : null}
          {catalogLoading
            ? " | Chargement catalogue..."
            : catalogError
            ? ` | ${catalogError}`
            : catalog
            ? " | Catalogue chargé"
            : null}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            className="rounded border border-black bg-white px-3 py-2 text-black disabled:opacity-50"
            onClick={handleDownloadPdf}
            disabled={!canDownloadPdf || readOnly}
            title={
              readOnly
                ? "Accès lecture seule"
                : canDownloadPdf
                ? "Télécharger l'emploi du temps en PDF"
                : "Sélectionnez un formateur pour télécharger"
            }
          >
            Télécharger PDF
          </button>

          {!readOnly ? (
            <button
              className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
              onClick={() => setAddOpen(true)}
              disabled={!canOpenAdd}
            >
              + Ajouter une séance
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-md my-4">{error}</div>
        ) : loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <div className="bg-white rounded-md shadow-sm mt-6">
            <DndProvider backend={HTML5Backend}>
              <ScheduleGrid
                sessions={sessions}
                hasConflict={hasConflict}
                updateSession={updateSession}
                rooms={salleIdsPhysical}
                isLoading={loading}
                onDeleteSession={readOnly ? undefined : deleteSession}
                formatGroupLabel={formatGroupLabel}
                readOnly={readOnly}
              />
            </DndProvider>
          </div>
        )}

        {cfg && catalog && !readOnly ? (
          <AddSessionModal
            open={addOpen}
            onClose={() => setAddOpen(false)}
            jours={cfg.jours ?? []}
            creneaux={cfg.creneaux ?? []}
            salles={salleIdsPhysical}
            catalog={catalog}
            occupiedSessions={sessions}
            onSubmit={async (data) => {
              try {
                await addSession(data);
                toast({
                  title: "Séance ajoutée",
                  description: "La séance a été ajoutée avec succès.",
                });
                setAddOpen(false);
                fetchData();
              } catch (e: any) {
                const msg = e?.message ?? "Impossible d'ajouter la séance";
                toast({
                  variant: "destructive",
                  title: "Erreur d’ajout",
                  description: msg,
                });
              }
            }}
          />
        ) : null}
      </main>
    </div>
  );
};

export default Index;
