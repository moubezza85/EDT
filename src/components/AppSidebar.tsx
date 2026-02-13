import { NavLink } from "react-router-dom";
import { CalendarDays, Settings, Wand2, DoorOpen, BarChart3, FileText, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: any };

export default function AppSidebar() {
  const { user, loading, logout, isAuthenticated } = useAuth();

  const role = user?.role;

  const items: NavItem[] = (() => {
    if (!role) return [];
    if (role === "admin") {
      return [
        { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
        { to: "/", label: "Emploi du temps", icon: CalendarDays },
        { to: "/virtuel", label: "Emploi temporaire", icon: DoorOpen },
        { to: "/pending", label: "Requêtes de changement", icon: DoorOpen },
        { to: "/sallelibre", label: "Salles libres", icon: DoorOpen },
        { to: "/genereremploi", label: "Générer emploi", icon: Wand2 },
        { to: "/exports", label: "Exports", icon: FileText },
        { to: "/parametres", label: "Paramètres", icon: Settings },
        { to: "/change-password", label: "Changer mot de passe", icon: KeyRound },
      ];
    }
    if (role === "surveillant") {
      return [
        { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
        { to: "/", label: "Emploi du temps", icon: CalendarDays },
        { to: "/sallelibre", label: "Salles libres", icon: DoorOpen },
        { to: "/change-password", label: "Changer mot de passe", icon: KeyRound },
      ];
    }
    // formateur
    return [
      { to: "/emploi", label: "Emploi officiel", icon: CalendarDays },
      { to: "/virtuel", label: "Emploi en négociation", icon: DoorOpen },
      { to: "/pending", label: "Mes demandes", icon: DoorOpen },
      { to: "/change-password", label: "Changer mot de passe", icon: KeyRound },
    ];
  })();

  return (
    <aside className="w-[260px] shrink-0 rounded-lg border bg-white p-3 shadow-sm">
      <div className="px-2 py-3">
        <div className="text-lg font-bold">EDT</div>
        <div className="text-sm text-gray-500">Gestion & optimisation</div>

        <div className="mt-3 space-y-2">
          <div className="text-xs text-gray-500">Session</div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">
              {loading ? "Chargement…" : user ? `${user.name ?? user.id} • ${user.role}` : "Non connecté"}
            </div>

            {isAuthenticated ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => {
                  logout();
                  window.location.href = "/login";
                }}
                title="Se déconnecter"
              >
                Logout
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => (window.location.href = "/login")}
                title="Se connecter"
              >
                Login
              </Button>
            )}
          </div>
        </div>
      </div>

      <nav className="mt-2 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                  isActive ? "bg-gray-100 font-medium" : "hover:bg-gray-50"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
