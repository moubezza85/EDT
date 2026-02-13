// src/components/FilterBar.tsx
import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FilterType } from "@/types";
import { RefreshCw } from "lucide-react";
import { http } from "@/api/http";

// Si tu as déjà une constante ailleurs, remplace cette ligne par ton import habituel
const API_BASE_URL = import.meta.env.VITE_API_BASE;

type Teacher = { id: string; name?: string };

interface FilterBarProps {
  formateurOptions: string[]; // ids (depuis timetable.json)
  groupeOptions: string[];
  salleOptions: string[];
  onFilterChange: (type: FilterType, value: string) => void;
  onClearFilter: (type: FilterType) => void;
  onRefresh: () => void;
  filters: Record<string, string>;
  isLoading?: boolean;
  hideTeacherFilter?: boolean;
}

async function fetchTeachers(): Promise<Teacher[]> {
  // Option A (recommandé) : route dédiée /api/teachers si tu l'as
  // const res = await fetch(`${API_BASE_URL}/api/teachers`);

  // Option B : utiliser /api/catalog (chez toi elle existe déjà)
  const json = await http<any>("/api/catalog");
  const teachers = (json?.teachers ?? []) as Teacher[];
  return Array.isArray(teachers) ? teachers : [];
}

const FilterBar = ({
  formateurOptions,
  groupeOptions,
  salleOptions,
  onFilterChange,
  onClearFilter,
  onRefresh,
  filters,
  isLoading = false,
  hideTeacherFilter = false,
}: FilterBarProps) => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await fetchTeachers();
        if (!cancelled) setTeachers(t);
      } catch (e) {
        // Pas bloquant : on reste en fallback sur l'id
        console.error(e);
        if (!cancelled) setTeachers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const teacherNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teachers) {
      const id = String(t?.id ?? "").trim();
      const name = String(t?.name ?? "").trim();
      if (id) m.set(id, name);
    }
    return m;
  }, [teachers]);

  const sortedFormateurOptions = useMemo(() => {
    // Toujours des ids venant du timetable
    const ids = [...formateurOptions]
      .map((x) => String(x ?? "").trim())
      .filter((x) => x.length > 0);

    // tri par "Nom (Id)" si nom existe, sinon par id
    return ids.sort((a, b) => {
      const la = teacherNameById.get(a) ? `${teacherNameById.get(a)} (${a})` : a;
      const lb = teacherNameById.get(b) ? `${teacherNameById.get(b)} (${b})` : b;
      return la.localeCompare(lb);
    });
  }, [formateurOptions, teacherNameById]);

  const sortedGroupeOptions = useMemo(
    () =>
      [...groupeOptions]
        .map((x) => String(x ?? "").trim())
        .filter((groupe) => groupe !== "")
        .sort(),
    [groupeOptions]
  );

  const sortedSalleOptions = useMemo(
    () =>
      [...salleOptions]
        .map((x) => String(x ?? "").trim())
        .filter((salle) => salle !== "")
        .sort(),
    [salleOptions]
  );

  const formatTeacherLabel = (id: string) => {
    const name = (teacherNameById.get(id) ?? "").trim();
    return name ? `${name} (${id})` : id;
  };

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-white border-b">
      {!hideTeacherFilter ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="formateur-filter" className="text-sm font-medium">
            Formateur
          </label>

          <Select value={filters.formateur || "_all"} onValueChange={(value) => onFilterChange("formateur", value)}>
            <SelectTrigger id="formateur-filter" className="w-[240px]">
              <SelectValue placeholder="Tous les Formateurs" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="_all">Tous les Formateurs</SelectItem>

              {sortedFormateurOptions.map((id) => (
                <SelectItem key={id} value={id}>
                  {formatTeacherLabel(id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="groupe-filter" className="text-sm font-medium">
          Groupe
        </label>

        <Select
          value={filters.groupe || ""}
          onValueChange={(value) => (value === "_all" ? onClearFilter("groupe") : onFilterChange("groupe", value))}
        >
          <SelectTrigger id="groupe-filter" className="w-[200px]">
            <SelectValue placeholder="Tous les Groupes" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="_all">Tous les Groupes</SelectItem>

            {sortedGroupeOptions.map((groupe) => (
              <SelectItem key={groupe} value={groupe}>
                {groupe}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="salle-filter" className="text-sm font-medium">
          Salle
        </label>

        <Select
          value={filters.salle || ""}
          onValueChange={(value) => (value === "_all" ? onClearFilter("salle") : onFilterChange("salle", value))}
        >
          <SelectTrigger id="salle-filter" className="w-[200px]">
            <SelectValue placeholder="Toutes les Salles" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="_all">Toutes les Salles</SelectItem>

            {sortedSalleOptions.map((salle) => (
              <SelectItem key={salle} value={salle}>
                {salle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end">
        <Button variant="outline" size="icon" onClick={onRefresh} disabled={isLoading} className="h-10 w-10">
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          <span className="sr-only">Actualiser</span>
        </Button>
      </div>
    </div>
  );
};

export default FilterBar;
