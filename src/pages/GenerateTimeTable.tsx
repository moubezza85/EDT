import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function httpJson<T>(url: string, init?: RequestInit): Promise<T> {
  const base = (API_BASE as string).replace(/\/+$/, "");
  const p = url.startsWith("/") ? url : `/${url}`;
  const fullUrl = `${base}${p}`;

  const token = localStorage.getItem("token");
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(fullUrl, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.message || (data as any)?.error || `HTTP_${res.status}`;
    const err: any = new Error(msg);
    err.body = data;
    throw err;
  }
  return data as T;
}

type GenerateResp = {
  ok: boolean;
  message?: string;
  warnings?: string[];
  // optionnel : le backend peut renvoyer sessions/version
  sessions?: any[];
  version?: number;
};

export default function GenerateTimetable() {
  const { toast } = useToast();

  const [strategy, setStrategy] = useState<string>("cp_sat");
  const [maxSeconds, setMaxSeconds] = useState<number>(10);
  const [seed, setSeed] = useState<number>(0);
  const [apply, setApply] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<GenerateResp | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const payload = {
        strategy,
        maxSeconds,
        seed,
        apply,
      };

      const resp = await httpJson<GenerateResp>("/api/generate/run", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setLast(resp);

      toast({
        title: "Génération terminée",
        description: resp?.message || (apply ? "Emploi appliqué (timetable.json mis à jour)." : "Résultat généré."),
      });
    } catch (e: any) {
      const msg = e?.body?.message || e?.message || "Génération refusée.";
      toast({
        variant: "destructive",
        title: "Erreur de génération",
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header className="bg-white border rounded-md p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Générer emploi</h1>
        <p className="text-gray-500">
          Paramétrez et lancez la génération côté backend. Le backend reste la source de vérité (validation + écriture).
        </p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle>Paramètres</CardTitle>
            <CardDescription>Options minimales (MVP).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">Stratégie</div>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger>
                  <SelectValue placeholder="Stratégie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cp_sat">CP-SAT</SelectItem>
                  <SelectItem value="heuristic">Heuristique</SelectItem>
                  <SelectItem value="genetic">Génétique</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-gray-500">
                Adaptez les valeurs selon ce que votre backend supporte.
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">Temps max (secondes)</div>
              <Input
                type="number"
                min={1}
                value={maxSeconds}
                onChange={(e) => setMaxSeconds(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">Seed</div>
              <Input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
              />
              <div className="text-xs text-gray-500">0 = seed par défaut.</div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={apply} onCheckedChange={(v) => setApply(Boolean(v))} id="apply" />
              <label htmlFor="apply" className="text-sm text-gray-700">
                Appliquer le résultat (écrire dans timetable.json)
              </label>
            </div>

            <Button onClick={run} disabled={loading} className="w-full">
              {loading ? "Génération..." : "Lancer la génération"}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>Résultat</CardTitle>
            <CardDescription>Messages, avertissements, retour backend.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!last ? (
              <div className="text-sm text-gray-500">Aucune génération exécutée pour le moment.</div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">Statut :</span>{" "}
                  <span className={last.ok ? "text-green-700" : "text-red-600"}>
                    {last.ok ? "OK" : "Échec"}
                  </span>
                </div>

                {last.message ? (
                  <div className="text-sm">
                    <span className="font-medium">Message :</span> {last.message}
                  </div>
                ) : null}

                {Array.isArray(last.warnings) && last.warnings.length > 0 ? (
                  <div className="rounded-md border bg-yellow-50 p-3 text-sm">
                    <div className="font-medium mb-1">Warnings</div>
                    <ul className="list-disc pl-5 space-y-1">
                      {last.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="rounded-md border bg-gray-50 p-3">
                  <div className="text-xs font-medium text-gray-600 mb-2">Réponse brute</div>
                  <pre className="text-xs overflow-auto">{JSON.stringify(last, null, 2)}</pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
