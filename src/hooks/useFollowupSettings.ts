import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';

export type FollowupStyle = 'warm' | 'professional' | 'casual';
export type AfterAttempts = 'escalate' | 'lost' | 'nothing';

/** Minutos que caben en la ventana de mensaje libre de WhatsApp. */
export const FREE_FORM_WINDOW_MINUTES = 24 * 60;

export interface FollowupStep {
  delay_minutes: number;
  /**
   * Plantilla HSM aprobada con la que se envía este paso. Es OBLIGATORIA para
   * los pasos que caen fuera de la ventana de 24 h de WhatsApp: pasada esa
   * ventana Meta no permite mensajes libres, solo plantillas aprobadas.
   * Los pasos dentro de la ventana la dejan vacía y el agente redacta el texto.
   */
  template_name?: string | null;
}

export interface FollowupSettings {
  id?: string;
  tenant_id?: string;
  enabled: boolean;
  enable_captacion: boolean;
  enable_venta: boolean;
  followup_schedule: FollowupStep[];
  after_attempts: AfterAttempts;
  respect_business_hours: boolean;
  /** Envía solo dentro de esta franja, en la hora local del lead (§4.2: 9–19). */
  send_window_start_hour: number;
  send_window_end_hour: number;
  followup_style: FollowupStyle;
  custom_context: string;
  created_at?: string;
  updated_at?: string;
}

/** Un paso necesita plantilla si su espera excede la ventana de mensaje libre. */
export function stepNeedsTemplate(step: FollowupStep): boolean {
  return step.delay_minutes > FREE_FORM_WINDOW_MINUTES;
}

/** Pasos mal configurados: fuera de la ventana y sin plantilla. No se envían. */
export function invalidSteps(schedule: FollowupStep[]): number[] {
  return schedule
    .map((step, i) => (stepNeedsTemplate(step) && !step.template_name ? i : -1))
    .filter((i) => i >= 0);
}

export const DEFAULT_FOLLOWUP_SETTINGS: FollowupSettings = {
  enabled: false,
  enable_captacion: true,
  enable_venta: true,
  followup_schedule: [
    { delay_minutes: 30 },
    { delay_minutes: 60 },
    { delay_minutes: 720 },
  ],
  after_attempts: 'escalate',
  respect_business_hours: false,
  send_window_start_hour: 9,
  send_window_end_hour: 19,
  followup_style: 'warm',
  custom_context: '',
};

export const STYLE_OPTIONS: { value: FollowupStyle; label: string; description: string }[] = [
  { value: 'warm',         label: 'Cálido',       description: 'Amable y cercano, como un amigo que sigue en contacto' },
  { value: 'professional', label: 'Profesional',  description: 'Formal y enfocado en valor, ideal para clientes corporativos' },
  { value: 'casual',       label: 'Casual',        description: 'Relajado y conversacional, para audiencias jóvenes' },
];

export const DELAY_PRESETS = [
  { value: 15,    label: '15 min' },
  { value: 30,    label: '30 min' },
  { value: 60,    label: '1 hora' },
  { value: 120,   label: '2 horas' },
  { value: 240,   label: '4 horas' },
  { value: 360,   label: '6 horas' },
  { value: 720,   label: '12 horas' },
  { value: 1440,  label: '24 horas' },
  // Cadencia comercial en días (§4.2: día 2, día 5, día 12). Estos pasos caen
  // fuera de la ventana de 24 h, así que exigen plantilla aprobada.
  { value: 2880,  label: '2 días' },
  { value: 4320,  label: '3 días' },
  { value: 7200,  label: '5 días' },
  { value: 10080, label: '7 días' },
  { value: 17280, label: '12 días' },
  { value: 43200, label: '30 días' },
];

export function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < FREE_FORM_WINDOW_MINUTES) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  const days = minutes / FREE_FORM_WINDOW_MINUTES;
  if (Number.isInteger(days)) return days === 1 ? '24h' : `${days} días`;
  const h = Math.floor(minutes / 60);
  return `${h}h`;
}

export function useFollowupSettings() {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['followup-settings', tenantId],
    queryFn: async () => {
      if (!tenantId) return { ...DEFAULT_FOLLOWUP_SETTINGS };

      const { data, error } = await supabase
        .from('tenant_followup_settings' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { ...DEFAULT_FOLLOWUP_SETTINGS };

      const row = data as any;
      return {
        ...DEFAULT_FOLLOWUP_SETTINGS,
        ...row,
        followup_schedule: Array.isArray(row.followup_schedule)
          ? row.followup_schedule
          : DEFAULT_FOLLOWUP_SETTINGS.followup_schedule,
      } as FollowupSettings;
    },
    enabled: !!tenantId,
  });
}

export function useUpdateFollowupSettings() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (settings: Partial<FollowupSettings>) => {
      if (!tenantId) throw new Error('No tenant');

      const { data: existing } = await supabase
        .from('tenant_followup_settings' as any)
        .select('id')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('tenant_followup_settings' as any)
          .update({ ...settings, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tenant_followup_settings' as any)
          .insert({ ...DEFAULT_FOLLOWUP_SETTINGS, ...settings, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followup-settings'] });
      toast.success('Configuración guardada');
    },
    onError: (error: Error) => {
      toast.error('Error al guardar', { description: error.message });
    },
  });
}
