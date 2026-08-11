import { useState, useEffect, useCallback } from "react";
import { Shield, ShieldOff, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  useConsentSettings,
  useUpdateConsentSettings,
  parseKeywords,
} from "@/hooks/useConsentSettings";
import { matchesOptOut } from "@/lib/optOut";

interface ConsentRow {
  id: string;
  contact_id: string;
  status: string;
  dnd_until: string | null;
  source: string;
  updated_at: string;
  contacts: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
}

export default function SettingsConsentPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"blocklist" | "rules">("blocklist");

  // Blocklist state
  const [rows, setRows] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Reglas: antes vivían en constantes del frontend y "Guardar" no escribía nada.
  const { data: consentSettings } = useConsentSettings();
  const updateConsent = useUpdateConsentSettings();

  const [keywords, setKeywords] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");
  const [detectionEnabled, setDetectionEnabled] = useState(true);
  const [consentText, setConsentText] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [privacyEmail, setPrivacyEmail] = useState("");
  const [showInWidget, setShowInWidget] = useState(true);
  /** Mensaje de prueba para ver si daría de baja, con las palabras actuales. */
  const [probe, setProbe] = useState("");

  useEffect(() => {
    if (!consentSettings) return;
    setKeywords(consentSettings.opt_out_keywords.join(", "));
    setConfirmMsg(consentSettings.opt_out_confirmation_message);
    setDetectionEnabled(consentSettings.opt_out_detection_enabled);
    setConsentText(consentSettings.consent_text ?? "");
    setPrivacyUrl(consentSettings.privacy_policy_url ?? "");
    setPrivacyEmail(consentSettings.privacy_contact_email ?? "");
    setShowInWidget(consentSettings.show_consent_in_widget);
  }, [consentSettings]);

  const loadBlocklist = useCallback(async () => {
    if (!profile?.tenant_id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contact_consents')
        .select(`
          id,
          contact_id,
          status,
          dnd_until,
          source,
          updated_at,
          contacts:contact_id (id, name, phone, email)
        `)
        .eq('tenant_id', profile.tenant_id)
        .in('status', ['opted_out', 'dnd', 'blocked'])
        .order('updated_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows((data || []) as unknown as ConsentRow[]);
    } catch (err) {
      console.error('Error loading blocklist:', err);
      toast.error('Error al cargar la lista');
    } finally {
      setLoading(false);
    }
  }, [profile?.tenant_id]);

  useEffect(() => {
    loadBlocklist();
  }, [loadBlocklist]);

  const filteredRows = rows.filter((row) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      row.contacts?.name?.toLowerCase().includes(term) ||
      row.contacts?.phone?.toLowerCase().includes(term) ||
      row.contacts?.email?.toLowerCase().includes(term)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'opted_out':
        return <Badge variant="destructive">Opt-out</Badge>;
      case 'blocked':
        return <Badge variant="secondary">Bloqueado</Badge>;
      case 'dnd':
        return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">DND</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const handleSaveRules = () => {
    const parsed = parseKeywords(keywords);
    if (detectionEnabled && parsed.length === 0) {
      toast.error('Define al menos una palabra clave, o apaga la detección automática');
      return;
    }
    updateConsent.mutate({
      opt_out_keywords: parsed,
      opt_out_confirmation_message: confirmMsg.trim(),
      opt_out_detection_enabled: detectionEnabled,
      consent_text: consentText.trim() || null,
      privacy_policy_url: privacyUrl.trim() || null,
      privacy_contact_email: privacyEmail.trim() || null,
      show_consent_in_widget: showInWidget,
    });
  };

  return (
    <SettingsLayout 
      title="Consentimiento" 
      description="Gestiona opt-out, DND y bloqueos para WhatsApp"
      icon={Shield}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="blocklist" className="gap-2">
            <ShieldOff className="h-4 w-4" />
            Bloqueos
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Shield className="h-4 w-4" />
            Reglas automáticas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="blocklist" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Lista de bloqueos</CardTitle>
                  <CardDescription>
                    Contactos con opt-out, DND o bloqueados
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadBlocklist}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre, teléfono o email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {loading ? (
                <p className="text-center py-8 text-muted-foreground">Cargando...</p>
              ) : filteredRows.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No hay contactos bloqueados.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contacto</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Fuente</TableHead>
                        <TableHead>Actualizado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {row.contacts?.name || '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.contacts?.phone || '—'}
                          </TableCell>
                          <TableCell>{getStatusBadge(row.status)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.source}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(row.updated_at).toLocaleDateString('es-MX', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Palabras clave para Opt-out (Inbound)</CardTitle>
              <CardDescription>
                Cuando un contacto envía un mensaje con estas palabras, se marca automáticamente como opt-out
                y se deja de escribirle.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Detectar bajas automáticamente</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Si lo apagas, las bajas solo se pueden registrar a mano desde la ficha del contacto
                  </p>
                </div>
                <Switch
                  checked={detectionEnabled}
                  onCheckedChange={setDetectionEnabled}
                  aria-label="Detectar bajas automáticamente"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="keywords">Palabras clave (separadas por coma)</Label>
                <Textarea
                  id="keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="baja, stop, alto, cancelar"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Se comparan sin distinguir mayúsculas ni acentos, contra el mensaje completo o como palabra suelta.
                  Nunca a media palabra: "bajarle al presupuesto" no da de baja a nadie.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="optout-probe">Probar un mensaje</Label>
                <Input
                  id="optout-probe"
                  value={probe}
                  onChange={(e) => setProbe(e.target.value)}
                  placeholder="Escribe un mensaje como si fueras el cliente"
                />
                {probe.trim() && (
                  matchesOptOut(probe, parseKeywords(keywords)) ? (
                    <p className="text-xs text-destructive">
                      Con estas palabras clave, este mensaje daría de baja al contacto.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Este mensaje no daría de baja al contacto.
                    </p>
                  )
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mensaje de confirmación</CardTitle>
              <CardDescription>
                Es el último mensaje que se envía al contacto tras darse de baja.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="confirm-msg">Mensaje</Label>
                <Textarea
                  id="confirm-msg"
                  value={confirmMsg}
                  onChange={(e) => setConfirmMsg(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Texto de consentimiento</CardTitle>
              <CardDescription>
                Se muestra al capturar datos, por ejemplo bajo el formulario del chat del sitio web.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="consent-text">Texto</Label>
                <Textarea
                  id="consent-text"
                  value={consentText}
                  onChange={(e) => setConsentText(e.target.value)}
                  rows={4}
                  placeholder="Al compartir tus datos aceptas que…"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="privacy-url">Aviso de privacidad (URL)</Label>
                  <Input
                    id="privacy-url"
                    type="url"
                    value={privacyUrl}
                    onChange={(e) => setPrivacyUrl(e.target.value)}
                    placeholder="https://tusitio.com/privacy"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="privacy-email">Correo para bajas y datos</Label>
                  <Input
                    id="privacy-email"
                    type="email"
                    value={privacyEmail}
                    onChange={(e) => setPrivacyEmail(e.target.value)}
                    placeholder="privacy@tusitio.com"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Mostrarlo en el chat del sitio web</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Aparece bajo el formulario donde el visitante deja sus datos
                  </p>
                </div>
                <Switch
                  checked={showInWidget}
                  onCheckedChange={setShowInWidget}
                  aria-label="Mostrar el consentimiento en el widget"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveRules} disabled={updateConsent.isPending}>
              {updateConsent.isPending ? 'Guardando...' : 'Guardar reglas'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </SettingsLayout>
  );
}
