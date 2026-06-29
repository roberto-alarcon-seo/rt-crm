import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// Pipeline stages with labels
export const PIPELINE_STAGES = [
  { value: 'new_lead', label: 'Nuevo lead' },
  { value: 'interest_confirmed', label: 'Interés confirmado' },
  { value: 'financial_validation', label: 'Validación financiera' },
  { value: 'searching', label: 'En búsqueda' },
  { value: 'visit_scheduled', label: 'Visita agendada' },
  { value: 'visit_done', label: 'Visita realizada' },
  { value: 'follow_up', label: 'Seguimiento' },
  { value: 'negotiation', label: 'Oferta / Negociación' },
  { value: 'closed_won', label: 'Cerrado' },
  { value: 'closed_lost', label: 'Perdido' },
];

const CAPTACION_STAGES = [
  { value: 'captacion_new', label: 'Nuevo propietario' },
  { value: 'captacion_valuation', label: 'Valuación' },
  { value: 'captacion_signed', label: 'Exclusiva firmada' },
  { value: 'captacion_listed', label: 'Publicado' },
  { value: 'captacion_offers', label: 'Ofertas recibidas' },
  { value: 'captacion_sold', label: 'Vendido' },
  { value: 'captacion_lost', label: 'Perdido' },
];

const RENTAS_STAGES = [
  { value: 'renta_nuevo', label: 'Nuevo lead renta' },
  { value: 'renta_calificacion', label: 'Calificación' },
  { value: 'renta_busqueda', label: 'En búsqueda' },
  { value: 'renta_visita', label: 'Visita agendada' },
  { value: 'renta_solicitud', label: 'Solicitud de renta' },
  { value: 'renta_cerrado', label: 'Cerrado' },
  { value: 'renta_perdido', label: 'Perdido' },
];

const DEFAULT_STAGE: Record<string, string> = {
  calificacion: 'new_lead',
  captacion: 'captacion_new',
  rentas: 'renta_nuevo',
};

function stagesFor(type: string) {
  if (type === 'captacion') return CAPTACION_STAGES;
  if (type === 'rentas') return RENTAS_STAGES;
  return PIPELINE_STAGES;
}

// Operational statuses
export const OPERATIONAL_STATUSES = [
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'WAITING_CUSTOMER', label: 'En espera del cliente' },
  { value: 'GHOSTING', label: 'Ghosting (sin respuesta)' },
  { value: 'DND', label: 'No contactar (DND)' },
  { value: 'CLOSED', label: 'Cerrado' },
];

export interface LeadPriorityData {
  lead_score: number;
  lead_temperature: 'cold' | 'warm' | 'hot';
  engagement_level: 'low' | 'medium' | 'high';
  source: string;
  opt_in_status: 'unknown' | 'opt_in' | 'opt_out';
  next_action_at: string;
  last_interaction_at: string | null;
  pipeline_stage: string;
  pipeline_type: 'calificacion' | 'captacion' | 'rentas';
  operational_status: string;
}

interface LeadPriorityCardProps {
  data: LeadPriorityData;
  onChange: (data: LeadPriorityData) => void;
}

export function LeadPriorityCard({ data, onChange }: LeadPriorityCardProps) {
  const updateField = <K extends keyof LeadPriorityData>(field: K, value: LeadPriorityData[K]) => {
    onChange({ ...data, [field]: value });
  };

  const handlePipelineTypeChange = (newType: 'calificacion' | 'captacion' | 'rentas') => {
    onChange({
      ...data,
      pipeline_type: newType,
      pipeline_stage: DEFAULT_STAGE[newType],
    });
  };

  const stages = stagesFor(data.pipeline_type);

  const PIPELINE_BUTTONS: { type: 'calificacion' | 'captacion' | 'rentas'; label: string }[] = [
    { type: 'calificacion', label: 'Compradores' },
    { type: 'captacion',    label: 'Captación' },
    { type: 'rentas',       label: 'Rentas' },
  ];

  return (
    <div className="space-y-4">
      {/* Pipeline Type Switcher */}
      <div className="space-y-2">
        <Label>Tipo de pipeline</Label>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {PIPELINE_BUTTONS.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => handlePipelineTypeChange(type)}
              className={cn(
                "flex-1 text-xs font-medium px-2 py-1.5 rounded-md transition-all",
                data.pipeline_type === type
                  ? type === 'rentas'
                    ? "bg-violet-600 text-white shadow-sm"
                    : type === 'captacion'
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline Stage + Operational Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="pipeline_stage">Etapa del pipeline</Label>
          <Select value={data.pipeline_stage} onValueChange={(v) => updateField('pipeline_stage', v)}>
            <SelectTrigger id="pipeline_stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.value} value={stage.value}>
                  {stage.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="operational_status">Estado del contacto</Label>
          <Select value={data.operational_status} onValueChange={(v) => updateField('operational_status', v)}>
            <SelectTrigger id="operational_status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATIONAL_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Row 1: Lead Score + Temperatura */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="lead_score">Lead Score (0-100)</Label>
          <Input
            id="lead_score"
            type="number"
            min={0}
            max={100}
            value={data.lead_score}
            onChange={(e) => updateField('lead_score', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
          />
          <p className="text-xs text-muted-foreground">0 = sin calificar, 100 = máxima prioridad</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead_temperature">Temperatura</Label>
          <Select value={data.lead_temperature} onValueChange={(v) => updateField('lead_temperature', v as 'cold' | 'warm' | 'hot')}>
            <SelectTrigger id="lead_temperature">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cold">❄️ Frío</SelectItem>
              <SelectItem value="warm">🌡️ Tibio</SelectItem>
              <SelectItem value="hot">🔥 Caliente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Engagement + Opt-in */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="engagement_level">Engagement</Label>
          <Select value={data.engagement_level} onValueChange={(v) => updateField('engagement_level', v as 'low' | 'medium' | 'high')}>
            <SelectTrigger id="engagement_level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Bajo</SelectItem>
              <SelectItem value="medium">Medio</SelectItem>
              <SelectItem value="high">Alto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="opt_in_status">Estado Opt-in</Label>
          <Select value={data.opt_in_status} onValueChange={(v) => updateField('opt_in_status', v as 'unknown' | 'opt_in' | 'opt_out')}>
            <SelectTrigger id="opt_in_status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unknown">Desconocido</SelectItem>
              <SelectItem value="opt_in">✅ Aceptó</SelectItem>
              <SelectItem value="opt_out">❌ Opt-out</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Source */}
      <div className="space-y-2">
        <Label htmlFor="source">Fuente</Label>
        <Input
          id="source"
          placeholder="Meta Ads, Google Ads, Referido, Portal..."
          value={data.source}
          onChange={(e) => updateField('source', e.target.value)}
        />
      </div>

      {/* Next Action */}
      <div className="space-y-2">
        <Label htmlFor="next_action_at">Próxima acción</Label>
        <Input
          id="next_action_at"
          type="datetime-local"
          value={data.next_action_at}
          onChange={(e) => updateField('next_action_at', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Define el siguiente seguimiento</p>
      </div>

      {/* Last Interaction (Read-only display) */}
      <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
        <Label className="text-sm text-muted-foreground">Última interacción</Label>
        <span className="text-sm text-muted-foreground">
          {data.last_interaction_at
            ? new Date(data.last_interaction_at).toLocaleDateString('es-MX', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '—'}
        </span>
      </div>
    </div>
  );
}
