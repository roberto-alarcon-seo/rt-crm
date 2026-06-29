import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Users, Plus, Trash2, Eye, EyeOff, Copy, Check, UserCog, Shuffle, KeyRound, MoreHorizontal } from "lucide-react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamUsers, type InviteUserPayload } from "@/hooks/useTeamUsers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = [
  { value: "administrador", label: "Administrador" },
  { value: "manager", label: "Manager" },
  { value: "asesor", label: "Asesor" },
] as const;

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  administrador: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  manager: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  asesor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  owner: "bg-purple-500/15 text-purple-400 border-purple-500/30",
} as any;

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return <span className="text-muted-foreground text-xs">—</span>;
  const label = ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
  const cls = ROLE_BADGE[role] ?? "bg-muted/30 text-muted-foreground border-muted";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", cls)}>
      {label}
    </span>
  );
}

function StatusBadge({ status, firstLogin }: { status: string; firstLogin: boolean }) {
  if (firstLogin) {
    return (
      <Badge variant="outline" className="text-amber-400 border-amber-500/30 bg-amber-500/10 text-xs">
        Pendiente activación
      </Badge>
    );
  }
  if (status === "active") {
    return (
      <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-xs">
        Activo
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground text-xs">
      Inactivo
    </Badge>
  );
}

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="h-8 w-8 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
      {initials || "?"}
    </div>
  );
}

function formatLastLogin(date: string | null): string {
  if (!date) return "Nunca";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(date));
}

function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const rand = (str: string) => str[Math.floor(Math.random() * str.length)];
  // guarantee at least one of each category
  const required = [rand(upper), rand(lower), rand(digits), rand(special)];
  const rest = Array.from({ length: 6 }, () => rand(all));
  return [...required, ...rest].sort(() => Math.random() - 0.5).join("");
}

const EMPTY_FORM: InviteUserPayload = {
  name: "",
  email: "",
  tenantRole: "asesor",
  password: "",
};

export default function SettingsTeamPage() {
  const { tenantRole, isSuperAdmin, profile, tenant } = useAuth();
  const { users, isLoading, invite, updateRole, resetPassword, remove } = useTeamUsers();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState<InviteUserPayload>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUserName, setDeleteUserName] = useState("");

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetUserName, setResetUserName] = useState("");
  const [resetPassword_value, setResetPassword_value] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetCopied, setResetCopied] = useState(false);

  const maxUsers = tenant?.max_users ?? 0;
  const currentCount = users.length;
  const atLimit = maxUsers > 0 && currentCount >= maxUsers;
  const capacityPct = maxUsers > 0 ? Math.min(100, Math.round((currentCount / maxUsers) * 100)) : 0;

  const canManage = isSuperAdmin || tenantRole === "administrador";

  if (!canManage) return <Navigate to="/settings/whatsapp" replace />;

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return;
    await invite.mutateAsync(form);
    setInviteOpen(false);
    setForm(EMPTY_FORM);
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(form.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    if (deleteUserId) {
      remove.mutate(deleteUserId);
      setDeleteUserId(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || resetPassword_value.length < 8) return;
    await resetPassword.mutateAsync({ userId: resetUserId, password: resetPassword_value });
    setResetUserId(null);
    setResetPassword_value("");
    setShowResetPassword(false);
  };

  const handleCopyResetPassword = () => {
    navigator.clipboard.writeText(resetPassword_value);
    setResetCopied(true);
    setTimeout(() => setResetCopied(false), 2000);
  };

  return (
    <SettingsLayout
      title="Equipo"
      description="Gestiona los usuarios que tienen acceso a esta cuenta"
      icon={Users}
    >
      <div className="space-y-6 max-w-4xl">
        {/* Capacity card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Usuarios del equipo</CardTitle>
                <CardDescription>
                  {isLoading ? (
                    "Cargando..."
                  ) : (
                    <>
                      <span className="font-medium text-foreground">{currentCount}</span>
                      {maxUsers > 0 && (
                        <> de <span className="font-medium text-foreground">{maxUsers}</span> usuarios</>
                      )}{" "}
                      en tu plan
                    </>
                  )}
                </CardDescription>
              </div>
              <Button
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setShowPassword(false);
                  setInviteOpen(true);
                }}
                disabled={atLimit}
                size="sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar usuario
              </Button>
            </div>
          </CardHeader>
          {maxUsers > 0 && (
            <CardContent className="pt-0">
              <div className="space-y-1.5">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      capacityPct >= 100
                        ? "bg-destructive"
                        : capacityPct >= 80
                        ? "bg-amber-500"
                        : "bg-primary"
                    )}
                    style={{ width: `${capacityPct}%` }}
                  />
                </div>
                {atLimit && (
                  <p className="text-xs text-destructive">
                    Has alcanzado el límite de usuarios. Contacta a soporte para ampliar tu plan.
                  </p>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Users table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-28 rounded-full" />
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                No hay usuarios en este equipo todavía.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Último acceso</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const isSelf = user.id === profile?.id;
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar name={user.name ?? ""} />
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{user.name || "Sin nombre"}</p>
                              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isSelf || user.tenant_role === "owner" ? (
                            <RoleBadge role={user.tenant_role} />
                          ) : (
                            <Select
                              value={user.tenant_role ?? "asesor"}
                              onValueChange={(val) =>
                                updateRole.mutate({ userId: user.id, role: val })
                              }
                              disabled={updateRole.isPending}
                            >
                              <SelectTrigger className="h-7 w-[140px] text-xs border-none bg-transparent p-0 focus:ring-0 focus:ring-offset-0 [&>svg]:ml-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((r) => (
                                  <SelectItem key={r.value} value={r.value} className="text-sm">
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={user.status}
                            firstLogin={user.first_login_required}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatLastLogin(user.last_login_at)}
                        </TableCell>
                        <TableCell>
                          {!isSelf && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setResetUserId(user.id);
                                    setResetUserName(user.name || user.email);
                                    setResetPassword_value("");
                                    setShowResetPassword(false);
                                  }}
                                >
                                  <KeyRound className="mr-2 h-4 w-4" />
                                  Restablecer contraseña
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    setDeleteUserId(user.id);
                                    setDeleteUserName(user.name || user.email);
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar usuario
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              Agregar usuario
            </DialogTitle>
            <DialogDescription>
              El usuario recibirá un correo de activación. Al ingresar por primera vez deberá cambiar su contraseña.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="inv-name">Nombre completo</Label>
              <Input
                id="inv-name"
                placeholder="María García"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-email">Correo electrónico</Label>
              <Input
                id="inv-email"
                type="email"
                placeholder="maria@tuempresa.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-role">Rol</Label>
              <Select
                value={form.tenantRole}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, tenantRole: v as InviteUserPayload["tenantRole"] }))
                }
              >
                <SelectTrigger id="inv-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.tenantRole === "administrador"
                  ? "Acceso completo: configuración, usuarios y todas las secciones."
                  : form.tenantRole === "manager"
                  ? "Gestiona leads, propiedades y puede ver reportes."
                  : "Atiende conversaciones y consulta propiedades asignadas."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-password">Contraseña temporal</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="inv-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    required
                    minLength={8}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword((s) => !s)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const pwd = generatePassword();
                    setForm((f) => ({ ...f, password: pwd }));
                    setShowPassword(true);
                  }}
                  title="Generar contraseña"
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyPassword}
                  disabled={!form.password}
                  title="Copiar contraseña"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Comparte esta contraseña con el usuario. Deberá cambiarla al primer inicio de sesión.
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={invite.isPending || !form.name.trim() || !form.email.trim() || form.password.length < 8}
              >
                {invite.isPending ? "Creando…" : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={!!resetUserId}
        onOpenChange={(open) => {
          if (!open) { setResetUserId(null); setResetPassword_value(""); setShowResetPassword(false); }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Restablecer contraseña
            </DialogTitle>
            <DialogDescription>
              Genera una contraseña temporal para <strong>{resetUserName}</strong>. Al iniciar sesión, se le pedirá que la cambie.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="reset-password">Nueva contraseña temporal</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="reset-password"
                    type={showResetPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={resetPassword_value}
                    onChange={(e) => setResetPassword_value(e.target.value)}
                    required
                    minLength={8}
                    className="pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowResetPassword((s) => !s)}
                    tabIndex={-1}
                  >
                    {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const pwd = generatePassword();
                    setResetPassword_value(pwd);
                    setShowResetPassword(true);
                  }}
                  title="Generar contraseña"
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyResetPassword}
                  disabled={!resetPassword_value}
                  title="Copiar contraseña"
                >
                  {resetCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Comparte esta contraseña con el usuario. Deberá cambiarla al próximo inicio de sesión.
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setResetUserId(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={resetPassword.isPending || resetPassword_value.length < 8}
              >
                {resetPassword.isPending ? "Restableciendo…" : "Restablecer contraseña"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la cuenta de <strong>{deleteUserName}</strong>. Esta acción no se puede deshacer y el usuario perderá acceso inmediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
  );
}
