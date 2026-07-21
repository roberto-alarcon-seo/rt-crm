import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Building2, Globe, Users, TrendingUp, Phone, Mail,
  Edit, Plus, Loader2, Handshake, Link, MapPin, Briefcase, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/hooks/useAccounts";
import { useLinkedExecutives } from "@/hooks/useAccountExecutives";
import { useAccountDocuments } from "@/hooks/useAccountDocuments";
import { useAuth } from "@/contexts/AuthContext";
import { DeleteAccountDialog } from "@/components/accounts/DeleteAccountDialog";
import { AccountDocumentsSection } from "@/components/accounts/AccountDocumentsSection";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const ACCOUNT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  lead:               { label: "Lead",               color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  prospect:           { label: "Prospecto",           color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  cliente:            { label: "Cliente",             color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  partner:            { label: "Partner",             color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  partner_y_cliente:  { label: "Cliente & Partner",   color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const COUNTRY_LABELS: Record<string, string> = {
  MX: "🇲🇽 México", CO: "🇨🇴 Colombia", CL: "🇨🇱 Chile",
  AR: "🇦🇷 Argentina", PE: "🇵🇪 Perú", US: "🇺🇸 Estados Unidos",
};

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { account, contacts, isLoading } = useAccount(id);
  const { linked: executives } = useLinkedExecutives(id);
  const { documents } = useAccountDocuments(id);
  const { hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const canManage = hasRole(["administrador", "manager"]);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-3">
          <Building2 className="w-12 h-12 mx-auto opacity-30" />
          <p>Empresa no encontrada</p>
          <Button variant="outline" onClick={() => navigate("/accounts")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Empresas
          </Button>
        </div>
      </div>
    );
  }

  const typeConfig = ACCOUNT_TYPE_LABELS[account.account_type] ?? ACCOUNT_TYPE_LABELS.lead;

  return (
    <div className="h-full flex flex-col bg-background overflow-auto">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/accounts")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Empresas
          </Button>
        </div>

        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarFallback className="bg-primary/15 text-primary text-lg font-bold">
              {getInitials(account.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{account.name}</h1>
              <Badge variant="outline" className={cn("text-xs", typeConfig.color)}>
                {typeConfig.label}
              </Badge>
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
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                  onClick={e => e.stopPropagation()}>
                  <Link className="w-3.5 h-3.5" />
                  <span>{account.website.replace(/^https?:\/\//, "")}</span>
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => navigate(`/accounts/${id}/edit`)}>
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </Button>
            )}
          </div>
        </div>

        {/* Account Executives — del catálogo, con las columnas legacy como respaldo */}
        {executives.length > 0 ? (
          <div className="mt-3 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/20 text-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <Globe className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-muted-foreground">
                {executives.length === 1
                  ? "Account Executive:"
                  : `Account Executives (${executives.length}):`}
              </span>
            </div>
            {/* Agrupados por organización: una cuenta puede tener AEs de
                Google y de Oracle a la vez, y hay que distinguirlos */}
            <div className="space-y-1.5 pl-6">
              {[...executives.reduce((map, ae) => {
                const key = ae.organization_name ?? "Sin organización";
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(ae);
                return map;
              }, new Map<string, typeof executives>())].map(([orgName, aes]) => (
                <div key={orgName} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 shrink-0">
                    {orgName}
                  </span>
                  {aes.map(ae => (
                    <div key={ae.id} className="flex items-center gap-1.5">
                      <span className="font-medium">{ae.name}</span>
                      {ae.is_primary && (
                        <Badge variant="outline" className="h-4 text-[10px] px-1 border-blue-500/40 text-blue-400">
                          Principal
                        </Badge>
                      )}
                      {ae.email && (
                        <a href={`mailto:${ae.email}`} className="text-blue-400 hover:underline text-xs">
                          {ae.email}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : account.gcp_ae_name ? (
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
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <div className="px-6 border-b border-border bg-card">
            <TabsList className="h-10 bg-transparent p-0 gap-1">
              {[
                { value: "overview",      label: "Overview" },
                { value: "contacts",      label: `Contactos (${contacts.length})` },
                { value: "documents",     label: `Documentos (${documents.length})` },
                { value: "opportunities", label: "Oportunidades" },
                { value: "activity",      label: "Actividad" },
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
            {/* OVERVIEW */}
            <TabsContent value="overview" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Información general</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {[
                      { label: "Tipo", value: typeConfig.label },
                      { label: "Industria", value: account.industry },
                      { label: "Tamaño", value: account.employee_count },
                      { label: "País", value: COUNTRY_LABELS[account.country ?? ""] ?? account.country },
                      { label: "Ciudad", value: account.city },
                      { label: "Sitio web", value: account.website },
                    ].filter(r => r.value).map(row => (
                      <div key={row.label} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">{row.label}</span>
                        <span className="font-medium text-right truncate">{row.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {account.notes && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Notas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{account.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* CONTACTS */}
            <TabsContent value="contacts" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Contactos en esta empresa</h3>
                <Button size="sm" variant="outline" onClick={() => navigate(`/contacts/new?account_id=${id}`)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar contacto
                </Button>
              </div>
              {contacts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Sin contactos vinculados aún</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {contacts.map(contact => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/40 cursor-pointer transition-colors"
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
            </TabsContent>

            {/* DOCUMENTS */}
            <TabsContent value="documents" className="mt-0">
              <h3 className="text-sm font-semibold mb-4">Documentos de la empresa</h3>
              <AccountDocumentsSection accountId={id} canManage={canManage} />
            </TabsContent>

            {/* OPPORTUNITIES */}
            <TabsContent value="opportunities" className="mt-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Oportunidades</h3>
                <Button size="sm" variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Nueva oportunidad
                </Button>
              </div>
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Las oportunidades estarán disponibles cuando se conecte la base de datos</p>
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
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Relaciones con otras empresas</h3>
                <Button size="sm" variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Vincular empresa
                </Button>
              </div>
              <div className="text-center py-12 text-muted-foreground">
                <Handshake className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Vincula partners con clientes finales aquí</p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {account && (
        <DeleteAccountDialog
          accountId={account.id}
          accountName={account.name}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => navigate("/accounts")}
        />
      )}
    </div>
  );
}
