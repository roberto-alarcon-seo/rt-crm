import { useState } from 'react';
import { Bot, Sparkles, MessageSquare, Target, Users } from 'lucide-react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const QUALIFICATION_CRITERIA = [
  { key: 'size', label: 'Tamaño de empresa', description: '¿Cuántos empleados tiene la empresa?' },
  { key: 'budget', label: 'Presupuesto', description: '¿Tienen budget aprobado o en proceso?' },
  { key: 'decision_maker', label: 'Rol del contacto', description: '¿El contacto decide o influye en la compra?' },
  { key: 'urgency', label: 'Urgencia', description: '¿Cuándo necesitan arrancar?' },
  { key: 'product_fit', label: 'Fit de producto', description: '¿Su caso encaja con Nexus/Aura/Prism/Radian?' },
  { key: 'country', label: 'Cobertura geográfica', description: '¿Operan en un mercado donde RT puede entregar?' },
];

export default function SettingsSDRAgent() {
  const [enabled, setEnabled] = useState(true);
  const [tone, setTone] = useState('professional');
  const [systemPrompt, setSystemPrompt] = useState(
    'Eres el agente SDR de Random Truffle. Tu misión es calificar leads entrantes, entender su necesidad, ' +
    'identificar el producto RT que mejor encaja (Nexus, Aura, Prism o Radian) y agendar una demo con el ' +
    'equipo comercial cuando el lead esté listo. Siempre actúa con profesionalismo y contexto regional LATAM.'
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setIsSaving(false);
    toast.success('Configuración del Agente SDR guardada');
  };

  return (
    <SettingsLayout
      title="Agente SDR"
      description="Configura el agente de captación y calificación de leads B2B"
      icon={<Bot className="w-5 h-5" />}
    >
      <div className="space-y-6">

        {/* Estado del agente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Estado del Agente SDR
            </CardTitle>
            <CardDescription>
              El agente SDR responde leads entrantes por WhatsApp, califica y agenda demos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Agente activo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  El agente responderá automáticamente leads nuevos
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Tono de comunicación</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Profesional</SelectItem>
                  <SelectItem value="friendly">Amigable</SelectItem>
                  <SelectItem value="consultative">Consultivo</SelectItem>
                  <SelectItem value="adaptive">Adaptativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Criterios de calificación */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Criterios de Calificación
            </CardTitle>
            <CardDescription>
              El agente evaluará estos criterios para asignar un score (0–100) a cada lead
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {QUALIFICATION_CRITERIA.map(criterion => (
              <div key={criterion.key} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                <div className="flex-1">
                  <p className="text-sm font-medium">{criterion.label}</p>
                  <p className="text-xs text-muted-foreground">{criterion.description}</p>
                </div>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shrink-0">
                  Activo
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Productos que puede presentar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Productos Random Truffle
            </CardTitle>
            <CardDescription>
              El agente conoce estos productos y los recomienda según el caso de uso del lead
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { name: 'Nexus', desc: 'Agente de integración y orquestación de datos' },
              { name: 'Aura', desc: 'Agente de IA conversacional para atención al cliente' },
              { name: 'Prism', desc: 'Analítica avanzada y dashboards inteligentes' },
              { name: 'Radian', desc: 'Automatización de procesos con IA generativa' },
              { name: 'Servicios', desc: 'Managed Service, Implementación, Desarrollo' },
              { name: 'GCP', desc: 'Gemini, BigQuery, Cloud Run, Looker' },
            ].map(p => (
              <div key={p.name} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40">
                <div className="flex-1">
                  <span className="text-sm font-semibold text-primary">{p.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{p.desc}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* System prompt */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Instrucciones del Agente
            </CardTitle>
            <CardDescription>
              Prompt de sistema que define el comportamiento y contexto del agente SDR
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={6}
              className="resize-none font-mono text-sm"
              placeholder="Define las instrucciones del agente..."
            />
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
