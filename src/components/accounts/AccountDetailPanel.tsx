import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, Globe, Users, TrendingUp, Edit, Plus, Handshake, Link, MapPin,
  Briefcase, Trash2, ArrowLeft, Pencil, Check, X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount, useUpdateAccount } from "@/hooks/useAccounts";
import { useAuth } from "@/contexts/AuthContext";
import { DeleteAccountDialog } from "@/components/accounts/DeleteAccountDialog";
import { AccountInfoCard } from "@/components/accounts/AccountInfoCard";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const ACCOUNT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  prospect: { label: "Prospecto", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  cliente: { label: "Cliente", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  partner: { label: "Partner", color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  partner_y_cliente: { label: "Cliente & Partner", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const COUNTRY_LABELS: Record<string, string> = {
  MX: "🇲🇽 México", CO: "🇨🇴 Colombia", CL: "🇨🇱 Chile",
  AR: "🇦🇷 Argentina", PE: "🇵🇪 Perú", US: "🇺🇸 Estados Unidos",
};

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

interface AccountDetailPanelProps {
  accountId?: string;
  /** Muestra un botón de volver (útil en móvil cuando la lista se oculta). */
  onBack?: () => void;
  /** Se llama tras eliminar la empresa (para limpiar la selección y refrescar). */
  onDeleted?: () => void;
}

export function AccountDetailPanel({ accountId, onBack, onDeleted }: AccountDetailPanelProps) {
  const navigate = useNavigate();
  const { account, contacts, isLoading } = useAccount(accountId);
  const { hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState("info");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const updateAccount = useUpdateAccount();

  const canManage = hasRole(["administrador", "manager"]);

  // Al cambiar de empresa, volver a la pestaña Info y salir de edición de nombre.
  useEffect(() => { setActiveTab("info"); setEditingName(false); }, [accountId]);

  const startEditName = () => { if (account) { setNameDraft(account.name); setEditingName(true); } };
  const saveName = async () => {
    if (!account) return;
    const v = nameDraft.trim();
    if (!v || v === account.name) { setEditingName(false); return; }
    await updateAccount.mutateAsync({ id: account.id, name: v });
    setEditingName(false);
  };

  if (!accountId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-6">
        <div className="text-center space-y-3">
          <Building2 className="w-12 h-12 mx-auto opacity-20" />
          <p className="text-sm">Selecciona una empresa para ver su detalle</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-6">
        <div className="text-center space-y-3">
          <Building2 className="w-12 h-12 mx-auto opacity-30" />
          <p>Empresa no encontrada</p>
        </div>
      </div>
    );
  }

  const typeConfig = ACCOUNT_TYPE_LABELS[account.account_type] ?? ACCOUNT_TYPE_LABELS.lead;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card">
        {onBack && (
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 lg:hidden" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Empresas
          </Button>
        )}
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarFallback className="bg-primary/15 text-primary text-lg font-bold">
              {getInitials(account.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap group">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    className="text-xl font-bold h-9 w-[min(28rem,60vw)]"
                    disabled={updateAccount.isPending}
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500" onClick={saveName} disabled={updateAccount.isPending}>
                    {updateAccount.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingName(false)} disabled={updateAccount.isPending}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold truncate">{account.name}</h1>
                  {canManage && (
                    <button
                      onClick={startEditName}
                      title="Editar nombre"
                      className="text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <Badge variant="outline" className={cn("text-xs", typeConfig.color)}>
                    {typeConfig.label}
                  </Badge>
                </>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 flex-wrap text-sm text-muted-foreground">
              {account.industry && (
                <div className="flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>{account.industry}</span>
                </div>
              )}
              {(account.city || account.country) && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>
                    {[account.city, COUNTRY_LABELS[account.country ?? ""] ?? account.country]
                      .filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
              {account.website && (
                <a href={account.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-primary transition-colors">
                  <Link className="w-3.5 h-3.5" />
                  <span>{account.website.replace(/^https?:\/\//, "")}</span>
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => navigate(`/accounts/${account.id}/edit`)}>
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            {canManage && (
              <Button
                size="sm" variant="outline"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </Button>
            )}
          </div>
        </div>

        {account.gcp_ae_name && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-muted-foreground">Account Executive:</span>
            <span className="font-medium">{account.gcp_ae_name}</span>
            {account.gcp_ae_email && (
              <a href={`mailto:${account.gcp_ae_email}`} className="text-blue-400 hover:underline">
                {account.gcp_ae_email}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <div className="px-6 border-b border-border bg-card sticky top-0 z-10">
            <TabsList className="h-10 bg-transparent p-0 gap-1">
              {[
                { value: "info", label: "Info" },
                { value: "contacts", label: `Contactos (${contacts.length})` },
                { value: "opportunities", label: "Oportunidades" },
                { value: "activity", label: "Actividad" },
                { value: "relationships", label: "Relaciones" },
              ].map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-sm px-3 h-10"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="p-6">
            {/* INFO */}
            <TabsContent value="info" className="mt-0 space-y-4">
              <AccountInfoCard account={account} canManage={canManage} />
            </TabsContent>

            {/* CONTACTS */}
            <TabsContent value="contacts" className="mt-0">
              <Card className="max-w-3xl">
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm font-semibold">Contactos en esta empresa</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/contacts/new?account_id=${account.id}`)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar contacto
                  </Button>
                </CardHeader>
                <CardContent>
                  {contacts.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Sin contactos vinculados aún</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60 -my-1">
                      {contacts.map(contact => (
                        <div
                          key={contact.id}
                          className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/contacts/${contact.id}`)}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/15 text-primary text-xs">
                              {getInitials(contact.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{contact.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {contact.email || contact.phone || "Sin datos de contacto"}
                            </p>
                          </div>
                          {contact.last_interaction_at && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatDistanceToNow(new Date(contact.last_interaction_at), { addSuffix: true, locale: es })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* OPPORTUNITIES */}
            <TabsContent value="opportunities" className="mt-0">
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Las oportunidades estarán disponibles próximamente</p>
              </div>
            </TabsContent>

            {/* ACTIVITY */}
            <TabsContent value="activity" className="mt-0">
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">Historial de actividad disponible próximamente</p>
              </div>
            </TabsContent>

            {/* RELATIONSHIPS */}
            <TabsContent value="relationships" className="mt-0">
              <div className="text-center py-12 text-muted-foreground">
                <Handshake className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Vincula partners con clientes finales aquí</p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <DeleteAccountDialog
        accountId={account.id}
        accountName={account.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={onDeleted}
      />
    </div>
  );
}
