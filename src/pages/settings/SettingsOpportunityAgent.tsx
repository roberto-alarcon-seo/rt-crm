import { useEffect, useState } from 'react';
import { TrendingUp, Bot, Bell, Clock, AlertTriangle } from 'lucide-react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  useOpportunityAgentSettings,
  useUpdateOpportunityAgentSettings,
  type OpportunityAgentSettings,
} from '@/hooks/useOpportunityAgentSettings';

/** Los 4 loops que ejecuta la edge function ai-opportunity-agent cada hora. */
type LoopKey = Extract<keyof OpportunityAgentSettings,
  | 'loop_followup_enabled'
  | 'loop_stall_alert_enabled'
  | 'loop_proposal_reminder_enabled'
  | 'loop_probability_update_enabled'>;

interface LoopSpec {
  key: LoopKey;
  icon: typeof Bell;
  title: string;
  description: string;
}

export default function SettingsOpportunityAgent() {
  const { data: settings, isLoading } = useOpportunityAgentSettings();
  const updateSettings = useUpdateOpportunityAgentSettings();

  const [enabled, setEnabled] = useState(false);
  const [staleAfterDays, setStaleAfterDays] = useState(7);
  const [alertAfterDays, setAlertAfterDays] = useState(14);
  const [proposalReminderDays, setProposalReminderDays] = useState(3);
  const [loops, setLoops] = useState<Record<LoopKey, boolean>>({
    loop_followup_enabled: true,
    loop_stall_alert_enabled: true,
    loop_proposal_reminder_enabled: true,
    loop_probability_update_enabled: true,
  });

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setStaleAfterDays(settings.stale_after_days);
    setAlertAfterDays(settings.alert_after_days);
    setProposalReminderDays(settings.proposal_reminder_days);
    setLoops({
      loop_followup_enabled: settings.loop_followup_enabled,
      loop_stall_alert_enabled: settings.loop_stall_alert_enabled,
      loop_proposal_reminder_enabled: settings.loop_proposal_reminder_enabled,
      loop_probability_update_enabled: settings.loop_probability_update_enabled,
    });
  }, [settings]);

  const LOOPS: LoopSpec[] = [
    {
      key: 'loop_followup_enabled',
      icon: Bell,
      title: 'Loop de seguimiento activo',
      description: `Cuando una oportunidad lleva ${staleAfterDays} días sin actividad, el agente crea una tarea de seguimiento para su comercial.`,
    },
    {
      key: 'loop_stall_alert_enabled',
      icon: AlertTriangle,
      title: 'Loop de alerta de estancamiento',
      description: `Si la oportunidad no avanza de etapa en más de ${alertAfterDays} días, el agente alerta al manager. La alerta se rearma al mover la etapa.`,
    },
    {
      key: 'loop_proposal_reminder_enabled',
      icon: Clock,
      title: 'Loop de recordatorio de propuesta',
      description: `Cuando la oportunidad entra a la etapa de propuesta, el agente da seguimiento cada ${proposalReminderDays} días hasta recibir respuesta o marcarla como perdida.`,
    },
    {
      key: 'loop_probability_update_enabled',
      icon: TrendingUp,
      title: 'Loop de actualización de probabilidad',
      description: 'El agente recalcula la probabilidad de cierre a partir de la etapa y del tiempo que lleva estancada, para que el forecast no mienta.',
    },
  ];

  const handleSave = () => {
    updateSettings.mutate({
      enabled,
      stale_after_days: staleAfterDays,
      alert_after_days: alertAfterDays,
      proposal_reminder_days: proposalReminderDays,
      ...loops,
    });
  };

  return (
    <SettingsLayout
      title="Agente de Oportunidades"
      description="Configura el agente que mantiene vivo el pipeline comercial"
      icon={TrendingUp}
    >
      <div className="space-y-6">

        {/* Estado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Estado del Agente
            </CardTitle>
            <CardDescription>
              El agente revisa el pipeline cada hora y ejecuta los loops que estén encendidos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label>Agente activo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Con el agente apagado no se ejecuta ningún loop
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isLoading} />
            </div>
          </CardContent>
        </Card>

        {/* Umbrales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Umbrales de tiempo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="stale_after_days">Días sin actividad → seguimiento</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="stale_after_days"
                    type="number"
                    min={1}
                    max={90}
                    value={staleAfterDays}
                    onChange={e => setStaleAfterDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">días</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="alert_after_days">Días sin avance → alerta al manager</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="alert_after_days"
                    type="number"
                    min={1}
                    max={180}
                    value={alertAfterDays}
                    onChange={e => setAlertAfterDays(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">días</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="proposal_reminder_days">Recordatorio de propuesta cada</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="proposal_reminder_days"
                    type="number"
                    min={1}
                    max={30}
                    value={proposalReminderDays}
                    onChange={e => setProposalReminderDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">días</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loops configurables */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Ciclos automáticos (Loops)
            </CardTitle>
            <CardDescription>
              Los loops son ciclos que el agente ejecuta continuamente para mantener el pipeline activo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {LOOPS.map(loop => (
              <div key={loop.key} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                <loop.icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{loop.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{loop.description}</p>
                </div>
                <Switch
                  checked={loops[loop.key]}
                  onCheckedChange={v => setLoops(prev => ({ ...prev, [loop.key]: v }))}
                  aria-label={loop.title}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateSettings.isPending || isLoading}>
            {updateSettings.isPending ? 'Guardando...' : 'Guardar configuración'}
          </Button>
        </div>
      </div>
    </SettingsLayout>
  );
}
