import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck, Clock, MapPin, Lightbulb, Send, RefreshCw, Activity,
  Sparkles, FileText, Check, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { useTemplates, type Template } from '@/hooks/useTemplates';
import {
  useAppointmentAgentSettings,
  useUpdateAppointmentAgentSettings,
  DEFAULT_APPOINTMENT_AGENT_SETTINGS,
  HOURS_BEFORE_OPTIONS,
  type AppointmentAgentSettings,
} from '@/hooks/useAppointmentAgentSettings';

// ── Template card for selection ───────────────────────────────────────────────

function TemplateSelectCard({
  template,
  selected,
  onToggle,
}: {
  template: Template;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const varCount = template.variables?.length ?? 0;

  return (
    <div
      className={cn(
        'rounded-lg border transition-all',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/40',
      )}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Checkbox */}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
            selected ? 'bg-primary border-primary' : 'border-border bg-background',
          )}
        >
          {selected && <Check className="h-3 w-3 text-primary-foreground" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{template.display_name ?? template.name}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{template.category}</Badge>
            {varCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {varCount} variable{varCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <p className={cn('text-xs text-muted-foreground mt-1', !expanded && 'line-clamp-2')}>
            {template.body}
          </p>
          {template.body.length > 100 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 flex items-center gap-1 text-[11px] text-primary hover:text-primary/80"
            >
              {expanded ? <><ChevronUp className="h-3 w-3" />Ver menos</> : <><ChevronDown className="h-3 w-3" />Ver completo</>}
            </button>
          )}
          {varCount > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {template.variables.map((v) => (
                <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono text-muted-foreground">
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Template picker section ───────────────────────────────────────────────────

function TemplatePicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: templates, isLoading } = useTemplates();

  const approved = (templates ?? []).filter(
    (t) => t.approval_status === 'approved' && t.twilio_template_sid,
  );

  function toggleTemplate(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!approved.length) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Sin plantillas aprobadas</p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
              Ve a <strong>Canales → Librería de Plantillas</strong>, crea plantillas de confirmación de cita y envíalas a revisión de WhatsApp. El agente solo puede usar plantillas aprobadas y sincronizadas con Twilio.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {approved.map((t) => (
        <TemplateSelectCard
          key={t.id}
          template={t}
          selected={selectedIds.includes(t.id)}
          onToggle={() => toggleTemplate(t.id)}
        />
      ))}
    </div>
  );
}

// ── Activity tab ──────────────────────────────────────────────────────────────

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function ActivityTab() {
  const tenantId = useEffectiveTenantId();

  const { data: upcoming, isLoading: loadingUpcoming, refetch: refetchUpcoming } = useQuery({
    queryKey: ['appointment-upcoming', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const now = new Date();
      const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('events')
        .select('id, title, event_type, start_at, status, confirmation_sent_at, contact:contacts(name, phone)')
        .eq('tenant_id', tenantId)
        .eq('status', 'scheduled')
        .gte('start_at', now.toISOString())
        .lte('start_at', next48h)
        .order('start_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  });

  const { data: confirmed, isLoading: loadingConfirmed, refetch: refetchConfirmed } = useQuery({
    queryKey: ['appointment-confirmed-recent', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('conversation_activity')
        .select('id, event_type, created_at, payload, contact:contacts(name)')
        .eq('tenant_id', tenantId)
        .in('event_type', ['appointment_confirmed', 'appointment_declined'])
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  });

  function handleRefresh() { refetchUpcoming(); refetchConfirmed(); }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Citas próximas (48 h)
            </CardTitle>
            <CardDescription className="mt-0.5">
              Citas programadas en las próximas 48 horas.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-8 w-8 p-0">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {loadingUpcoming ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : !(upcoming as any[])?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sin citas programadas en las próximas 48 horas.
            </p>
          ) : (
            <div className="divide-y">
              {(upcoming as any[]).map((ev) => {
                const name = ev.contact?.name ?? ev.contact?.phone ?? '—';
                const sent = !!ev.confirmation_sent_at;
                const dt = new Intl.DateTimeFormat('es-MX', {
                  weekday: 'short', day: 'numeric', month: 'short',
                  hour: '2-digit', minute: '2-digit',
                }).format(new Date(ev.start_at));
                return (
                  <div key={ev.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">{ev.title} · {dt}</p>
                      </div>
                    </div>
                    <Badge variant={sent ? 'secondary' : 'outline'} className="shrink-0 text-xs">
                      {sent ? 'Confirmación enviada' : 'Pendiente'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Respuestas recientes (7 días)
          </CardTitle>
          <CardDescription>Confirmaciones y cancelaciones registradas por el agente.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingConfirmed ? (
            <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
          ) : !(confirmed as any[])?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sin actividad de confirmación en los últimos 7 días.
            </p>
          ) : (
            <div className="divide-y">
              {(confirmed as any[]).map((act) => {
                const isConfirmed = act.event_type === 'appointment_confirmed';
                const name = act.contact?.name ?? (act.payload as any)?.title ?? '—';
                return (
                  <div key={act.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                        isConfirmed ? 'bg-green-500/15' : 'bg-destructive/10',
                      )}>
                        <CalendarCheck className={cn('h-4 w-4', isConfirmed ? 'text-green-500' : 'text-destructive')} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {isConfirmed ? 'Confirmó asistencia' : 'Canceló cita'} · {timeAgo(act.created_at)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('shrink-0 text-xs', isConfirmed ? 'text-green-600 border-green-300' : 'text-destructive border-destructive/30')}
                    >
                      {isConfirmed ? 'Confirmada' : 'Cancelada'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsAppointmentAgent() {
  const { data: saved, isLoading } = useAppointmentAgentSettings();
  const { mutate: save, isPending } = useUpdateAppointmentAgentSettings();

  const [form, setForm] = useState<AppointmentAgentSettings>({ ...DEFAULT_APPOINTMENT_AGENT_SETTINGS });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (saved) { setForm({ ...saved }); setDirty(false); }
  }, [saved]);

  function patch<K extends keyof AppointmentAgentSettings>(key: K, value: AppointmentAgentSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleSave() { save(form); setDirty(false); }

  if (isLoading) {
    return (
      <SettingsLayout title="Agente de Agendamiento" description="Confirma citas automáticamente por WhatsApp" icon={CalendarCheck}>
        <div className="max-w-2xl space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </SettingsLayout>
    );
  }

  const selectedCount = form.confirmation_template_ids.length;

  return (
    <SettingsLayout
      title="Agente de Agendamiento"
      description="Confirma citas automáticamente por WhatsApp y actualiza su estado en tiempo real"
      icon={CalendarCheck}
    >
      <div className="max-w-2xl space-y-6 pb-24">

        {/* Master toggle */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                  <CalendarCheck className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Activar Agente de Agendamiento</CardTitle>
                  <CardDescription className="mt-0.5">
                    El agente envía un mensaje de confirmación antes de cada cita y actualiza su estado según la respuesta del cliente.
                  </CardDescription>
                </div>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => patch('enabled', v)} />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="templates">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Plantillas
              {selectedCount > 0 && (
                <Badge className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                  {selectedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" /> Configuración
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Actividad
            </TabsTrigger>
          </TabsList>

          {/* ── Templates tab ── */}
          <TabsContent value="templates" className="space-y-4 mt-4">

            {/* How it works */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Cómo elige la IA la plantilla</p>
              </div>
              <ul className="text-xs text-blue-700/80 dark:text-blue-400/80 space-y-1 list-disc list-inside">
                <li>Cuando no hay ventana activa de 24 h (primer contacto, ~90% de los casos), <strong>solo se pueden usar plantillas aprobadas por WhatsApp</strong>.</li>
                <li>La IA evalúa el tipo de cita y selecciona la plantilla más adecuada del conjunto configurado.</li>
                <li>Las variables (nombre, fecha, inmueble, dirección) <strong>se rellenan automáticamente</strong> con los datos de la cita.</li>
                <li>Si hay ventana activa de 24 h, la IA genera un mensaje libre y personalizado.</li>
              </ul>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Plantillas para confirmación de citas</CardTitle>
                <CardDescription>
                  Selecciona las plantillas aprobadas que el agente puede usar. Si configuras varias, la IA elegirá la más apropiada según el tipo de cita.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TemplatePicker
                  selectedIds={form.confirmation_template_ids}
                  onChange={(ids) => patch('confirmation_template_ids', ids)}
                />

                {selectedCount === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Sin plantillas seleccionadas. El agente solo podrá actuar cuando haya ventana de 24 h activa.
                  </p>
                )}

                {selectedCount > 1 && (
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {selectedCount} plantillas configuradas — la IA seleccionará la más adecuada por tipo de cita.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Variable mapping guide */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Relleno automático de variables</CardTitle>
                <CardDescription>
                  El agente detecta el propósito de cada variable por su nombre y la rellena automáticamente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { pattern: 'nombre, cliente, name', value: 'Nombre del contacto' },
                    { pattern: 'fecha, date, dia, cita', value: 'Fecha y hora de la cita' },
                    { pattern: 'propiedad, inmueble', value: 'Título del inmueble' },
                    { pattern: 'direccion, address', value: 'Dirección del inmueble' },
                    { pattern: 'asesor, agente, agent', value: 'Nombre del agente IA' },
                    { pattern: 'tipo, type', value: 'Tipo de cita' },
                  ].map(({ pattern, value }) => (
                    <div key={pattern} className="flex items-start gap-2 py-1.5 border-b last:border-0 col-span-2">
                      <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0 mt-0.5 w-40 truncate">{pattern}</span>
                      <span className="text-muted-foreground">{value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Nombra las variables de tus plantillas usando estas palabras clave para que el relleno automático funcione correctamente.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Config tab ── */}
          <TabsContent value="config" className="space-y-4 mt-4">

            {/* Timing */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" /> Tiempo de aviso
                </CardTitle>
                <CardDescription>
                  Cuántas horas antes de la cita se envía el mensaje de confirmación.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  {HOURS_BEFORE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => patch('hours_before', opt.value)}
                      className={cn(
                        'flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all',
                        form.hours_before === opt.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border hover:border-primary/50 hover:bg-accent',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Content toggles (only matter for free-form path) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Contenido del mensaje libre</CardTitle>
                <CardDescription>
                  Aplica cuando hay ventana de 24 h activa y el agente genera un mensaje personalizado (no plantilla).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Incluir dirección del inmueble</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Muestra la dirección registrada en los metadatos de la cita.
                      </p>
                    </div>
                  </div>
                  <Switch checked={form.include_address} onCheckedChange={(v) => patch('include_address', v)} />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <Lightbulb className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Incluir recomendaciones</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tips prácticos: llegar a tiempo, traer identificación, etc.
                      </p>
                    </div>
                  </div>
                  <Switch checked={form.include_recommendations} onCheckedChange={(v) => patch('include_recommendations', v)} />
                </div>
              </CardContent>
            </Card>

            {/* Custom context */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Contexto adicional (opcional)</CardTitle>
                <CardDescription>
                  Instrucciones específicas para el agente en mensajes libres: protocolo de llegada, requisitos, etc.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  placeholder="Ejemplo: Pedir al cliente que llegue 10 minutos antes. Si la cita es en edificio, mencionar que debe registrarse en recepción."
                  value={form.custom_context}
                  onChange={(e) => patch('custom_context', e.target.value)}
                  className="resize-none"
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Activity tab ── */}
          <TabsContent value="activity">
            <ActivityTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky save footer */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background py-3 px-8 flex items-center justify-between shadow-lg">
          <p className="text-sm text-muted-foreground">Tienes cambios sin guardar</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => { setForm({ ...saved! }); setDirty(false); }}
            >
              Cancelar
            </Button>
            <Button size="lg" onClick={handleSave} disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      )}
    </SettingsLayout>
  );
}
