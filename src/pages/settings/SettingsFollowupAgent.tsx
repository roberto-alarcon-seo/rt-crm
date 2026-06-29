import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw, Settings2, Sparkles, Clock,
  Plus, Trash2, ChevronRight, UserX, UserCheck, Ban, Activity,
  MessageSquare, Send,
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
import {
  useFollowupSettings,
  useUpdateFollowupSettings,
  DEFAULT_FOLLOWUP_SETTINGS,
  STYLE_OPTIONS,
  DELAY_PRESETS,
  formatDelay,
  type FollowupSettings,
  type FollowupStyle,
  type FollowupStep,
  type AfterAttempts,
} from '@/hooks/useFollowupSettings';

// ── helpers ──────────────────────────────────────────────────────────────────

const AFTER_ATTEMPTS_OPTIONS: {
  value: AfterAttempts;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  iconColor: string;
}[] = [
  {
    value: 'escalate',
    label: 'Escalar a asesor humano',
    desc: 'Marca la conversación como "Necesita atención" para que un asesor retome el contacto.',
    icon: UserCheck,
    accent: 'border-primary/40 bg-primary/5',
    iconColor: 'text-primary',
  },
  {
    value: 'lost',
    label: 'Marcar como lead perdido',
    desc: 'Cambia la etapa del contacto a "Perdido" en su pipeline (compradores o captación).',
    icon: UserX,
    accent: 'border-destructive/40 bg-destructive/5',
    iconColor: 'text-destructive',
  },
  {
    value: 'nothing',
    label: 'Solo detener el seguimiento',
    desc: 'No se toma ninguna acción adicional. El lead queda en la etapa actual en silencio.',
    icon: Ban,
    accent: 'border-muted-foreground/30 bg-muted/40',
    iconColor: 'text-muted-foreground',
  },
];

function AfterAttemptsCard({
  option, selected, onClick,
}: {
  option: typeof AFTER_ATTEMPTS_OPTIONS[0]; selected: boolean; onClick: () => void;
}) {
  const Icon = option.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-start gap-3 p-4 rounded-lg border transition-all',
        selected ? option.accent + ' ring-1 ring-inset ring-current' : 'border-border hover:bg-accent/50',
      )}
    >
      <div className={cn(
        'h-8 w-8 rounded-md flex items-center justify-center shrink-0 mt-0.5',
        selected ? 'bg-current/10' : 'bg-muted',
      )}>
        <Icon className={cn('h-4 w-4', selected ? option.iconColor : 'text-muted-foreground')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium', selected && option.iconColor)}>{option.label}</span>
          {selected && <span className="text-[10px] px-1.5 py-0.5 rounded bg-current/10 font-medium">Seleccionado</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{option.desc}</p>
      </div>
    </button>
  );
}

function StyleCard({
  value, label, description, selected, onClick,
}: { value: FollowupStyle; label: string; description: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left p-4 rounded-lg border transition-all w-full',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/50 hover:bg-accent/50',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm">{label}</span>
        {selected && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Activo</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

// ── Step editor ───────────────────────────────────────────────────────────────

function StepRow({
  step, index, total, onChange, onRemove,
}: {
  step: FollowupStep; index: number; total: number;
  onChange: (delay: number) => void; onRemove: () => void;
}) {
  const isFirst = index === 0;
  const relativeLabel = isFirst
    ? 'desde el último mensaje del cliente'
    : `después del recordatorio ${index}`;

  return (
    <div className="flex items-start gap-3">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center pt-1">
        <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-bold text-primary">{index + 1}</span>
        </div>
        {index < total - 1 && (
          <div className="w-px flex-1 bg-border mt-1 min-h-[20px]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm font-medium">Recordatorio {index + 1}</p>
          <span className="text-xs text-muted-foreground">{relativeLabel}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DELAY_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs border transition-colors',
                step.delay_minutes === p.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:border-primary/50 hover:bg-accent',
              )}
            >
              {p.label}
            </button>
          ))}
          {total > 1 && (
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── After-attempts section ────────────────────────────────────────────────────

function AfterAttemptsSection({
  form, patch,
}: { form: FollowupSettings; patch: <K extends keyof FollowupSettings>(k: K, v: FollowupSettings[K]) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          Al agotar todos los recordatorios
        </CardTitle>
        <CardDescription>
          Si el cliente no responde después del último recordatorio, elige una acción.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {AFTER_ATTEMPTS_OPTIONS.map((opt) => (
          <AfterAttemptsCard
            key={opt.value}
            option={opt}
            selected={form.after_attempts === opt.value}
            onClick={() => patch('after_attempts', opt.value)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ── Flow preview ──────────────────────────────────────────────────────────────

function PreviewBubble({ text, isAgent }: { text: string; isAgent: boolean }) {
  return (
    <div className={cn('flex', isAgent ? 'justify-start' : 'justify-end')}>
      <div className={cn(
        'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug',
        isAgent
          ? 'bg-card border border-border text-foreground rounded-tl-sm'
          : 'bg-primary text-primary-foreground rounded-tr-sm',
      )}>
        {text}
      </div>
    </div>
  );
}

function FlowPreview({ settings }: { settings: FollowupSettings }) {
  const styleLabel = STYLE_OPTIONS.find((s) => s.value === settings.followup_style)?.label ?? 'Cálido';
  const schedule = settings.followup_schedule;

  const examples: Record<FollowupStyle, string[]> = {
    warm: [
      '¡Hola! Solo quería retomar nuestra conversación — ¿pudiste ver las opciones que te compartí? Estoy aquí si tienes dudas 😊',
      '¿Todo bien? Si lo necesitas puedo buscarte algo diferente o agendar una llamada cuando tengas oportunidad.',
      'Quiero asegurarme de que tengas toda la información que necesitas. Este es mi último mensaje para no ser invasivo — quedo a tus órdenes cuando quieras. 🙌',
    ],
    professional: [
      'Buen día. Me permito retomar nuestro intercambio. ¿Pudo revisar la información enviada? Con gusto coordinamos los siguientes pasos.',
      'Le comparto que seguimos disponibles para asesorarle. ¿Desea agendar una consulta esta semana?',
      'Este es nuestro último seguimiento antes de cerrar el expediente. Quedo a su disposición si desea retomar el proceso.',
    ],
    casual: [
      'Hey! Solo pasaba a checar si viste lo que te mandé 👀 Dime qué onda.',
      '¿Sigues interesado? Cuéntame qué buscas y lo ajustamos.',
      'Va mi último mensaje para no saturarte — cuando quieras seguir, aquí estamos 🤙',
    ],
  };

  const msgs = examples[settings.followup_style] ?? examples.warm;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" /> {schedule.length} recordatorio{schedule.length !== 1 ? 's' : ''}
        </Badge>
        {schedule.map((s, i) => (
          <Badge key={i} variant="outline" className="gap-1">
            #{i + 1}: {formatDelay(s.delay_minutes)}
          </Badge>
        ))}
        <Badge variant="outline" className="gap-1">{styleLabel}</Badge>
      </div>

      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
        <PreviewBubble text="¿Cuánto vale un departamento en Polanco?" isAgent={false} />
        <PreviewBubble text="¡Claro! Te comparto opciones en Polanco entre $3M y $5M MXN. ¿Alguna te llama la atención?" isAgent />
        <p className="text-center text-[10px] text-muted-foreground">— cliente no responde —</p>
        {msgs.slice(0, Math.min(msgs.length, schedule.length)).map((msg, i) => (
          <div key={i} className="space-y-1">
            <p className="text-[10px] text-muted-foreground pl-1">
              Recordatorio {i + 1} · {formatDelay(schedule[i]?.delay_minutes ?? 30)} después
            </p>
            <PreviewBubble text={msg} isAgent />
          </div>
        ))}
        {settings.after_attempts !== 'nothing' && (
          <div className="flex flex-wrap gap-2 pt-1">
            {settings.after_attempts === 'lost' && (
              <span className="text-[10px] px-2 py-1 rounded bg-destructive/10 text-destructive border border-destructive/20">
                → Etapa cambiada a Perdido
              </span>
            )}
            {settings.after_attempts === 'escalate' && (
              <span className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
                → Escalado a asesor humano
              </span>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground italic">
        Ejemplo ilustrativo — el agente genera mensajes naturales con el contexto real.
      </p>
    </div>
  );
}

// ── Activity Tab ──────────────────────────────────────────────────────────────

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function timeUntil(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'pendiente';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'en un momento';
  if (m < 60) return `en ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `en ${h}h`;
  return `en ${Math.floor(h / 24)}d`;
}

function computeNextAt(
  followup_count: number,
  last_customer_message_at: string,
  last_followup_at: string | null,
  schedule: FollowupStep[],
): Date | null {
  const step = followup_count;
  if (step >= schedule.length) return null;
  const delayMs = (schedule[step]?.delay_minutes ?? 30) * 60 * 1000;
  if (step === 0) return new Date(new Date(last_customer_message_at).getTime() + delayMs);
  if (!last_followup_at) return null;
  return new Date(new Date(last_followup_at).getTime() + delayMs);
}

function ActivityTab({ schedule }: { schedule: FollowupStep[] }) {
  const tenantId = useEffectiveTenantId();
  const maxFollowups = schedule.length;

  const { data: pending, isLoading: loadingPending, refetch: refetchPending } = useQuery({
    queryKey: ['followup-pending', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('conversations')
        .select('id, customer_whatsapp, followup_count, last_customer_message_at, last_followup_at, contact:contacts(name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
        .eq('ai_state', 'active')
        .eq('needs_human', false)
        .gt('last_customer_message_at', since)
        .order('last_customer_message_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((c: any) => (c.followup_count ?? 0) < maxFollowups);
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  });

  const { data: recent, isLoading: loadingRecent, refetch: refetchRecent } = useQuery({
    queryKey: ['followup-recent-msgs', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('messages')
        .select('id, body, created_at, to_number, conversation_id, conversation:conversations(customer_whatsapp, followup_count, contact:contacts(name))')
        .eq('tenant_id', tenantId)
        .eq('source', 'ai')
        .eq('direction', 'outbound')
        .eq('ai_generated', true)
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).filter((m: any) => (m.conversation?.followup_count ?? 0) > 0);
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  });

  function handleRefresh() { refetchPending(); refetchRecent(); }

  return (
    <div className="space-y-4 mt-4">
      {/* Upcoming */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Próximas atenciones
            </CardTitle>
            <CardDescription className="mt-0.5">
              Leads en espera de recordatorio (ventana 24 h activa).
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-8 w-8 p-0">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {loadingPending ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : !pending?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sin leads pendientes de seguimiento en este momento.
            </p>
          ) : (
            <div className="divide-y">
              {(pending as any[]).map((conv) => {
                const nextAt = computeNextAt(
                  conv.followup_count ?? 0,
                  conv.last_customer_message_at,
                  conv.last_followup_at,
                  schedule,
                );
                const step = conv.followup_count ?? 0;
                const name = conv.contact?.name ?? conv.customer_whatsapp;
                const isPast = nextAt ? nextAt.getTime() <= Date.now() : false;
                return (
                  <div key={conv.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          Recordatorio {step + 1}/{maxFollowups} · sin respuesta {timeAgo(conv.last_customer_message_at)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={isPast ? 'destructive' : 'secondary'} className="shrink-0 text-xs">
                      {nextAt ? (isPast ? 'Pendiente' : timeUntil(nextAt)) : '—'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent sent */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Recordatorios enviados (últimas 48 h)
          </CardTitle>
          <CardDescription>Mensajes generados por el agente de seguimiento.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRecent ? (
            <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
          ) : !recent?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No se han enviado recordatorios en las últimas 48 horas.
            </p>
          ) : (
            <div className="divide-y">
              {(recent as any[]).map((msg) => {
                const name = msg.conversation?.contact?.name ?? msg.to_number ?? '—';
                return (
                  <div key={msg.id} className="py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{timeAgo(msg.created_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {msg.body}
                    </p>
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

export default function SettingsFollowupAgent() {
  const { data: saved, isLoading } = useFollowupSettings();
  const { mutate: save, isPending } = useUpdateFollowupSettings();

  const [form, setForm] = useState<FollowupSettings>({ ...DEFAULT_FOLLOWUP_SETTINGS });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (saved) { setForm({ ...saved }); setDirty(false); }
  }, [saved]);

  function patch<K extends keyof FollowupSettings>(key: K, value: FollowupSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function updateStep(index: number, delay: number) {
    const next = form.followup_schedule.map((s, i) =>
      i === index ? { ...s, delay_minutes: delay } : s
    );
    patch('followup_schedule', next);
  }

  function addStep() {
    if (form.followup_schedule.length >= 5) return;
    const last = form.followup_schedule[form.followup_schedule.length - 1];
    const nextDelay = last ? Math.min(last.delay_minutes * 2, 1440) : 60;
    patch('followup_schedule', [...form.followup_schedule, { delay_minutes: nextDelay }]);
  }

  function removeStep(index: number) {
    if (form.followup_schedule.length <= 1) return;
    patch('followup_schedule', form.followup_schedule.filter((_, i) => i !== index));
  }

  function handleSave() { save(form); setDirty(false); }

  if (isLoading) {
    return (
      <SettingsLayout title="Agente de Seguimiento" description="Re-engancha leads silenciosos automáticamente" icon={RefreshCw}>
        <div className="max-w-4xl space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      title="Agente de Seguimiento"
      description="Re-engancha leads que dejaron de responder dentro de la ventana de 24 h de WhatsApp"
      icon={RefreshCw}
    >
      <div className="max-w-4xl space-y-6 pb-24">

        {/* Master toggle */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                  <RefreshCw className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Activar Agente de Seguimiento</CardTitle>
                  <CardDescription className="mt-0.5">
                    Cuando un lead no responde, el agente envía recordatorios naturales y escalados — nunca spam.
                  </CardDescription>
                </div>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => patch('enabled', v)} />
            </div>

            {/* Pipeline filters — only visible when agent is enabled */}
            {form.enabled && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Flujos con seguimiento activo</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label className="text-sm font-medium">Flujo de Captación</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Propietarios y vendedores — pipeline de captación de inmuebles.
                      </p>
                    </div>
                    <Switch
                      checked={form.enable_captacion}
                      onCheckedChange={(v) => patch('enable_captacion', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label className="text-sm font-medium">Flujo de Venta</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Compradores y arrendatarios — pipeline de calificación y cierre.
                      </p>
                    </div>
                    <Switch
                      checked={form.enable_venta}
                      onCheckedChange={(v) => patch('enable_venta', v)}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="schedule">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Calendario
            </TabsTrigger>
            <TabsTrigger value="style" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Estilo
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Vista previa
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Actividad
            </TabsTrigger>
          </TabsList>

          {/* ── Schedule tab ── */}
          <TabsContent value="schedule" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Programa de recordatorios</CardTitle>
                <CardDescription>
                  Define cuándo se envía cada recordatorio. El primero es relativo al último mensaje del cliente;
                  los siguientes son relativos al recordatorio anterior.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {form.followup_schedule.map((step, i) => (
                    <StepRow
                      key={i}
                      step={step}
                      index={i}
                      total={form.followup_schedule.length}
                      onChange={(d) => updateStep(i, d)}
                      onRemove={() => removeStep(i)}
                    />
                  ))}
                </div>

                {form.followup_schedule.length < 5 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addStep}
                    className="mt-2 gap-2 w-full border-dashed"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar recordatorio
                    <span className="text-muted-foreground text-xs">
                      ({form.followup_schedule.length}/5)
                    </span>
                  </Button>
                )}
              </CardContent>
            </Card>

            <AfterAttemptsSection form={form} patch={patch} />
          </TabsContent>

          {/* ── Style tab ── */}
          <TabsContent value="style" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tono de los recordatorios</CardTitle>
                <CardDescription>
                  El agente adapta vocabulario y registro al idioma/región configurado en el Agente de Calificación.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {STYLE_OPTIONS.map((opt) => (
                  <StyleCard
                    key={opt.value}
                    value={opt.value}
                    label={opt.label}
                    description={opt.description}
                    selected={form.followup_style === opt.value}
                    onClick={() => patch('followup_style', opt.value)}
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Contexto adicional (opcional)</CardTitle>
                <CardDescription>
                  Instrucciones extra: promociones, zonas de enfoque, restricciones de horario, etc.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={4}
                  placeholder="Ejemplo: No mencionar descuentos. Enfocarse en propiedades en Polanco y Santa Fe. Si el cliente pregunta por precio, redirigir a agendar una visita."
                  value={form.custom_context}
                  onChange={(e) => patch('custom_context', e.target.value)}
                  className="resize-none"
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Preview tab ── */}
          <TabsContent value="preview" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Simulación del flujo</CardTitle>
                <CardDescription>
                  Ejemplo de cómo se vería el agente con la configuración actual.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FlowPreview settings={form} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Activity tab ── */}
          <TabsContent value="activity">
            <ActivityTab schedule={form.followup_schedule} />
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
