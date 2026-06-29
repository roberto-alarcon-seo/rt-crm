import { useState } from 'react';
import { TrendingUp, Bot, Bell, Clock, AlertTriangle } from 'lucide-react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function SettingsOpportunityAgent() {
  const [enabled, setEnabled] = useState(true);
  const [staleAfterDays, setStaleAfterDays] = useState('7');
  const [alertAfterDays, setAlertAfterDays] = useState('14');
  const [isSaving, setIsSaving] = useState(false);

  const LOOPS = [
    {
      icon: Bell,
      title: 'Loop de seguimiento activo',
      description: 'Cuando una oportunidad lleva N días sin actividad, el agente manda un mensaje de seguimiento al prospecto y crea una tarea para el AE.',
      enabled: true,
    },
    {
      icon: AlertTriangle,
      title: 'Loop de alerta de estancamiento',
      description: 'Si la oportunidad no avanza de etapa en más de N días, el agente alerta al manager y propone acciones concretas.',
      enabled: true,
    },
    {
      icon: Clock,
      title: 'Loop de recordatorio de propuesta',
      description: 'Cuando se envía una propuesta, el agente da seguimiento cada 3 días hasta recibir respuesta o marcarla como perdida.',
      enabled: false,
    },
    {
      icon: TrendingUp,
      title: 'Loop de actualización de probabilidad',
      description: 'El agente recalcula la probabilidad de cierre de cada oportunidad basándose en la antigüedad, etapa y señales de conversación.',
      enabled: true,
    },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setIsSaving(false);
    toast.success('Configuración del Agente de Oportunidades guardada');
  };

  return (
    <SettingsLayout
      title="Agente de Oportunidades"
      description="Configura el agente que mantiene vivo el pipeline comercial"
      icon={<TrendingUp className="w-5 h-5" />}
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
              El agente monitorea el pipeline y ejecuta loops de seguimiento automáticamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label>Agente activo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Los loops se ejecutarán según la configuración definida
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Días sin actividad → seguimiento</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={staleAfterDays}
                    onChange={e => setStaleAfterDays(e.target.value)}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">días</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Días sin avance → alerta al manager</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={alertAfterDays}
                    onChange={e => setAlertAfterDays(e.target.value)}
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
            {LOOPS.map((loop, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                <loop.icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{loop.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{loop.description}</p>
                </div>
                <Switch defaultChecked={loop.enabled} />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar configuración'}
          </Button>
        </div>
      </div>
    </SettingsLayout>
  );
}
