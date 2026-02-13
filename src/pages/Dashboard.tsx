import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Dashboard() {
  return (
    <div>
      <header className="bg-white border rounded-md p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500">
          Statistiques et KPIs (à définir). Cette page est prête à être enrichie.
        </p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>À venir</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">
            Total sessions, heures totales, répartition par jour, etc.
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Conflits</CardTitle>
            <CardDescription>À venir</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">
            Conflits détectés, taux de conformité, contraintes violées, etc.
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Utilisation des salles</CardTitle>
            <CardDescription>À venir</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">
            Occupation par salle, heatmap, créneaux vides, etc.
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Zone de travail</CardTitle>
            <CardDescription>Placeholder</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-gray-500">
            Quand vous serez prêt, on définira les métriques et on construira les graphs (Recharts) + filtres.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
