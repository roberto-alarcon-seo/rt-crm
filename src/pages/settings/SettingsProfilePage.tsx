import { useState, useRef, useCallback } from "react";
import { User, Camera, Linkedin, Instagram, KeyRound, Loader2, Save, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const COUNTRY_CODES = [
  { code: "+52", label: "🇲🇽 +52 México" },
  { code: "+57", label: "🇨🇴 +57 Colombia" },
  { code: "+54", label: "🇦🇷 +54 Argentina" },
  { code: "+56", label: "🇨🇱 +56 Chile" },
  { code: "+51", label: "🇵🇪 +51 Perú" },
  { code: "+58", label: "🇻🇪 +58 Venezuela" },
  { code: "+593", label: "🇪🇨 +593 Ecuador" },
  { code: "+503", label: "🇸🇻 +503 El Salvador" },
  { code: "+502", label: "🇬🇹 +502 Guatemala" },
  { code: "+507", label: "🇵🇦 +507 Panamá" },
  { code: "+34",  label: "🇪🇸 +34 España" },
  { code: "+1",   label: "🇺🇸 +1 EE.UU. / Canadá" },
];

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export default function SettingsProfilePage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile form state
  const [form, setForm] = useState({
    name: profile?.name ?? "",
    job_title: profile?.job_title ?? "",
    phone_country_code: profile?.phone_country_code ?? "+52",
    phone: profile?.phone ?? "",
    bio: profile?.bio ?? "",
    linkedin_url: profile?.linkedin_url ?? "",
    instagram_url: profile?.instagram_url ?? "",
  });

  const phoneDigits = form.phone.replace(/\D/g, "");
  const phoneError =
    phoneDigits.length > 0 && phoneDigits.length !== 10
      ? "El número debe tener exactamente 10 dígitos."
      : null;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;

    setIsUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("user-avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("user-avatars").getPublicUrl(path);
      const newUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: newUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      setAvatarUrl(newUrl);
      toast({ title: "Foto actualizada" });
    } catch {
      toast({ title: "Error al subir la foto", variant: "destructive" });
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [profile?.id, toast]);

  const handleSaveProfile = async () => {
    if (!profile?.id) return;
    if (phoneError) return;
    setIsSavingProfile(true);
    try {
      const cleanPhone = phoneDigits || null;
      const { error } = await supabase
        .from("profiles")
        .update({
          name: form.name.trim(),
          job_title: form.job_title.trim() || null,
          phone: cleanPhone,
          phone_country_code: cleanPhone ? form.phone_country_code : null,
          bio: form.bio.trim() || null,
          linkedin_url: form.linkedin_url.trim() || null,
          instagram_url: form.instagram_url.trim() || null,
        })
        .eq("id", profile.id);

      if (error) throw error;
      toast({ title: "Perfil guardado" });
    } catch {
      toast({ title: "Error al guardar el perfil", variant: "destructive" });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const passwordError = (() => {
    if (!passwordForm.newPassword) return null;
    if (!PASSWORD_REGEX.test(passwordForm.newPassword))
      return "Mínimo 8 caracteres, una mayúscula, una minúscula y un número.";
    if (passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword)
      return "Las contraseñas no coinciden.";
    return null;
  })();

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) return;
    if (passwordError) return;

    setIsChangingPassword(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const { data, error } = await supabase.functions.invoke("auth-change-password", {
        body: {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? "Error desconocido");
      }

      toast({ title: "Contraseña actualizada correctamente" });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al cambiar la contraseña";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Mi perfil</h1>
            <p className="text-muted-foreground text-sm">Información profesional y seguridad de tu cuenta</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left column: avatar + professional info */}
          <div className="lg:col-span-2 space-y-6">

        {/* Avatar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Foto de perfil</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {profile?.name ? getInitials(profile.name) : "U"}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isUploadingAvatar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="text-sm text-muted-foreground space-y-0.5">
              <p>JPG, PNG, WebP o GIF — máximo 5 MB.</p>
              <p>Recomendado: imagen cuadrada de al menos 200×200 px.</p>
            </div>
          </CardContent>
        </Card>

        {/* Professional info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Información profesional</CardTitle>
            <CardDescription>Esta información puede aparecer en comunicaciones con clientes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre completo</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Tu nombre"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="job_title">Cargo / Título</Label>
                <Input
                  id="job_title"
                  value={form.job_title}
                  onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
                  placeholder="Asesor inmobiliario"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input id="email" value={profile?.email ?? ""} disabled />
                <p className="text-xs text-muted-foreground">No se puede modificar desde aquí.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono / WhatsApp</Label>
                <div className="flex gap-2">
                  <Select
                    value={form.phone_country_code}
                    onValueChange={(v) => setForm((f) => ({ ...f, phone_country_code: v }))}
                  >
                    <SelectTrigger className="w-[140px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    value={form.phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setForm((f) => ({ ...f, phone: digits }));
                    }}
                    placeholder="10 dígitos"
                    maxLength={10}
                    className={cn(phoneError && "border-destructive focus-visible:ring-destructive")}
                  />
                </div>
                {phoneError ? (
                  <p className="text-xs text-destructive">{phoneError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {form.phone_country_code} + 10 dígitos sin espacios ni guiones.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Presentación / Bio</Label>
              <Textarea
                id="bio"
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                placeholder="Breve descripción profesional que puede compartirse con tus clientes..."
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="linkedin_url">LinkedIn</Label>
                <div className="relative">
                  <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="linkedin_url"
                    type="url"
                    value={form.linkedin_url}
                    onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                    placeholder="https://linkedin.com/in/tu-perfil"
                    className={cn(
                      "pl-9",
                      form.linkedin_url && !/^https?:\/\//i.test(form.linkedin_url) && "border-destructive"
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="instagram_url">Instagram</Label>
                <div className="relative">
                  <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="instagram_url"
                    type="url"
                    value={form.instagram_url}
                    onChange={(e) => setForm((f) => ({ ...f, instagram_url: e.target.value }))}
                    placeholder="https://instagram.com/tu_usuario"
                    className={cn(
                      "pl-9",
                      form.instagram_url && !/^https?:\/\//i.test(form.instagram_url) && "border-destructive"
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={isSavingProfile || !!phoneError}>
                {isSavingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar perfil
              </Button>
            </div>
          </CardContent>
        </Card>

          </div>{/* end left column */}

          {/* Right column: change password */}
          <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Cambiar contraseña
            </CardTitle>
            <CardDescription>Usa una contraseña segura que no uses en otros sitios.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Contraseña actual</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPw ? "text" : "password"}
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  placeholder="Tu contraseña actual"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPw ? "text" : "password"}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  className={cn("pr-10", passwordError && passwordForm.newPassword && "border-destructive")}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar nueva contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Repite la nueva contraseña"
                className={cn(passwordError && passwordForm.confirmPassword && "border-destructive")}
              />
              {passwordError && (passwordForm.newPassword || passwordForm.confirmPassword) && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleChangePassword}
                disabled={
                  isChangingPassword ||
                  !passwordForm.currentPassword ||
                  !passwordForm.newPassword ||
                  !passwordForm.confirmPassword ||
                  !!passwordError
                }
              >
                {isChangingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cambiar contraseña
              </Button>
            </div>
          </CardContent>
        </Card>
          </div>{/* end right column */}

        </div>{/* end grid */}

      </div>
    </div>
  );
}
