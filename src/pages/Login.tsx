import { useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Login() {
  const { login, loading, error, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();

  const next = useMemo(() => {
    const v = (search.get("next") || "").trim();
    return v || "/";
  }, [search]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const ok = await login(username.trim(), password);
    setSubmitting(false);
    if (ok) {
      navigate(next, { replace: true });
    }
  }

  // Déjà connecté => redirection
  if (isAuthenticated) {
    const fallback = user?.role === "formateur" ? "/virtuel" : "/";
    return <Navigate to={next || fallback} replace />;
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Admin: <b>admin/admin</b> — Autres comptes: <b>id/id</b>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-600">Identifiant</label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ex: 14017" />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-gray-600">Mot de passe</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ex: 14017"
              />
            </div>

            {error ? <div className="text-sm text-red-600">{error}</div> : null}

            <Button type="submit" className="w-full" disabled={loading || submitting}>
              {submitting || loading ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
