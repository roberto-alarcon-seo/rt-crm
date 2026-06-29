import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';

export type FollowupStyle = 'warm' | 'professional' | 'casual';
export type AfterAttempts = 'escalate' | 'lost' | 'nothing';

export interface FollowupStep {
  delay_minutes: number;
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
  followup_style: FollowupStyle;
  custom_context: string;
  created_at?: string;
  updated_at?: string;
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
  followup_style: 'warm',
  custom_context: '',
};

export const STYLE_OPTIONS: { value: FollowupStyle; label: string; description: string }[] = [
  { value: 'warm',         label: 'Cálido',       description: 'Amable y cercano, como un amigo que sigue en contacto' },
  { value: 'professional', label: 'Profesional',  description: 'Formal y enfocado en valor, ideal para clientes corporativos' },
  { value: 'casual',       label: 'Casual',        description: 'Relajado y conversacional, para audiencias jóvenes' },
];

export const DELAY_PRESETS = [
  { value: 15,   label: '15 min' },
  { value: 30,   label: '30 min' },
  { value: 60,   label: '1 hora' },
  { value: 120,  label: '2 horas' },
  { value: 240,  label: '4 horas' },
  { value: 360,  label: '6 horas' },
  { value: 720,  label: '12 horas' },
  { value: 1440, label: '24 horas' },
];

export function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
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
