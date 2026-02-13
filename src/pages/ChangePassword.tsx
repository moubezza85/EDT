import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { changePassword } from "@/api/authApi";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function ChangePassword() {
  const { toast } = useToast();
  const nav = useNavigate();
  const { user, logout } = useAuth();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword1, setNewPassword1] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => {
    if (!oldPassword.trim()) return false;
    if (newPassword1.length < 6) return false;
    if (newPassword1 !== newPassword2) return false;
    return true;
  }, [oldPassword, newPassword1, newPassword2]);

  async function onSubmit() {
    if (!canSave) return;
    setSaving(true);
    try {
      await changePassword(oldPassword, newPassword1, newPassword2);
      toast({ title: "Mot de passe modifié", description: "Reconnectez-vous avec votre nouveau mot de passe." });

      // Par sécurité, on déconnecte et on renvoie au login.
      logout();
      nav("/login");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Échec",
        description: e?.body?.message || e?.message || "Impossible de modifier le mot de passe",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Changer le mot de passe</CardTitle>
          <CardDescription>
            {user ? `Utilisateur: ${user.name ?? user.id}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Ancien mot de passe</Label>
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Ancien mot de passe"
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-2">
            <Label>Nouveau mot de passe</Label>
            <Input
              type="password"
              value={newPassword1}
              onChange={(e) => setNewPassword1(e.target.value)}
              placeholder="Minimum 6 caractères"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label>Confirmer le nouveau mot de passe</Label>
            <Input
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              placeholder="Répétez le nouveau mot de passe"
              autoComplete="new-password"
            />
          </div>

          {newPassword1 && newPassword2 && newPassword1 !== newPassword2 ? (
            <div className="text-sm text-red-600">La confirmation ne correspond pas.</div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => nav(-1)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={onSubmit} disabled={!canSave || saving}>
              {saving ? "Enregistrement…" : "Valider"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
