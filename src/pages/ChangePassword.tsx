import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone } from "lucide-react";

import { changePassword, updatePhone } from "@/api/authApi";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function ChangePassword() {
  const { toast } = useToast();
  const nav = useNavigate();
  const { user, logout, refresh } = useAuth();

  // --- Phone state ---
  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  // --- Password state ---
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword1, setNewPassword1] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // Pré-remplir le téléphone depuis le contexte utilisateur
  useEffect(() => {
    setPhone(user?.phone ?? "");
  }, [user?.phone]);

  const canSavePwd = useMemo(() => {
    if (!oldPassword.trim()) return false;
    if (newPassword1.length < 6) return false;
    if (newPassword1 !== newPassword2) return false;
    return true;
  }, [oldPassword, newPassword1, newPassword2]);

  async function onSubmitPhone() {
    setSavingPhone(true);
    try {
      await updatePhone(phone);
      await refresh();
      toast({
        title: "Téléphone mis à jour",
        description: "Votre numéro de téléphone a été enregistré.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Échec",
        description: e?.body?.message || e?.message || "Impossible de mettre à jour le téléphone",
      });
    } finally {
      setSavingPhone(false);
    }
  }

  async function onSubmitPwd() {
    if (!canSavePwd) return;
    setSavingPwd(true);
    try {
      await changePassword(oldPassword, newPassword1, newPassword2);
      toast({
        title: "Mot de passe modifié",
        description: "Reconnectez-vous avec votre nouveau mot de passe.",
      });
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
      setSavingPwd(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">

      {/* ---- Carte Téléphone ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Numéro de téléphone
          </CardTitle>
          <CardDescription>
            {user ? `Utilisateur : ${user.name ?? user.id}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: +212 6XX XXX XXX"
              autoComplete="tel"
            />
          </div>
          <div className="flex items-center justify-end">
            <Button onClick={onSubmitPhone} disabled={savingPhone}>
              {savingPhone ? "Enregistrement…" : "Mettre à jour"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- Carte Mot de passe ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Changer le mot de passe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="oldPassword">Ancien mot de passe</Label>
            <Input
              id="oldPassword"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Ancien mot de passe"
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword1">Nouveau mot de passe</Label>
            <Input
              id="newPassword1"
              type="password"
              value={newPassword1}
              onChange={(e) => setNewPassword1(e.target.value)}
              placeholder="Minimum 6 caractères"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword2">Confirmer le nouveau mot de passe</Label>
            <Input
              id="newPassword2"
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
            <Button variant="outline" onClick={() => nav(-1)} disabled={savingPwd}>
              Annuler
            </Button>
            <Button onClick={onSubmitPwd} disabled={!canSavePwd || savingPwd}>
              {savingPwd ? "Enregistrement…" : "Valider"}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
