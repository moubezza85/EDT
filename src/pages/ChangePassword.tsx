import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Phone } from "lucide-react";

import { changePassword, updateEmail, updatePhone } from "@/api/authApi";
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

  // --- Email state ---
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // --- Password state ---
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword1, setNewPassword1] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // Pr\u00e9-remplir depuis le contexte utilisateur
  useEffect(() => {
    setPhone(user?.phone ?? "");
    setEmail(user?.email ?? "");
  }, [user?.phone, user?.email]);

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
        title: "T\u00e9l\u00e9phone mis \u00e0 jour",
        description: "Votre num\u00e9ro de t\u00e9l\u00e9phone a \u00e9t\u00e9 enregistr\u00e9.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "\u00c9chec",
        description: e?.body?.message || e?.message || "Impossible de mettre \u00e0 jour le t\u00e9l\u00e9phone",
      });
    } finally {
      setSavingPhone(false);
    }
  }

  async function onSubmitEmail() {
    setSavingEmail(true);
    try {
      await updateEmail(email);
      await refresh();
      toast({
        title: "Email mis \u00e0 jour",
        description: "Votre adresse email a \u00e9t\u00e9 enregistr\u00e9e.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "\u00c9chec",
        description: e?.body?.message || e?.message || "Impossible de mettre \u00e0 jour l'email",
      });
    } finally {
      setSavingEmail(false);
    }
  }

  async function onSubmitPwd() {
    if (!canSavePwd) return;
    setSavingPwd(true);
    try {
      await changePassword(oldPassword, newPassword1, newPassword2);
      toast({
        title: "Mot de passe modifi\u00e9",
        description: "Reconnectez-vous avec votre nouveau mot de passe.",
      });
      logout();
      nav("/login");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "\u00c9chec",
        description: e?.body?.message || e?.message || "Impossible de modifier le mot de passe",
      });
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">

      {/* ---- Carte T\u00e9l\u00e9phone ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Num\u00e9ro de t\u00e9l\u00e9phone
          </CardTitle>
          <CardDescription>
            {user ? `Utilisateur : ${user.name ?? user.id}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">T\u00e9l\u00e9phone</Label>
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
              {savingPhone ? "Enregistrement\u2026" : "Mettre \u00e0 jour"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- Carte Email ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Adresse email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: prenom.nom@exemple.com"
              autoComplete="email"
            />
          </div>
          <div className="flex items-center justify-end">
            <Button onClick={onSubmitEmail} disabled={savingEmail}>
              {savingEmail ? "Enregistrement\u2026" : "Mettre \u00e0 jour"}
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
              placeholder="Minimum 6 caract\u00e8res"
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
              placeholder="R\u00e9p\u00e9tez le nouveau mot de passe"
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
              {savingPwd ? "Enregistrement\u2026" : "Valider"}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
