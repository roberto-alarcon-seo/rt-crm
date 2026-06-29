import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';

export interface AppointmentAgentSettings {
  id?: string;
  tenant_id?: string;
  enabled: boolean;
  hours_before: number;
  include_address: boolean;
  include_recommendations: boolean;
  custom_context: string;
  confirmation_template_ids: string[];
  created_at?: string;
  updated_at?: string;
}

export const DEFAULT_APPOINTMENT_AGENT_SETTINGS: AppointmentAgentSettings = {
  enabled: false,
  hours_before: 24,
  include_address: true,
  include_recommendations: true,
  custom_context: '',
  confirmation_template_ids: [],
};

export const HOURS_BEFORE_OPTIONS = [
  { value: 12, label: '12 horas antes' },
  { value: 24, label: '24 horas antes' },
  { value: 48, label: '48 horas antes' },
];

export function useAppointmentAgentSettings() {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['appointment-agent-settings', tenantId],
    queryFn: async () => {
      if (!tenantId) return { ...DEFAULT_APPOINTMENT_AGENT_SETTINGS };

      const { data, error } = await supabase
        .from('tenant_appointment_agent_settings' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { ...DEFAULT_APPOINTMENT_AGENT_SETTINGS };

      return { ...DEFAULT_APPOINTMENT_AGENT_SETTINGS, ...(data as any) } as AppointmentAgentSettings;
    },
    enabled: !!tenantId,
  });
}

export function useUpdateAppointmentAgentSettings() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (settings: Partial<AppointmentAgentSettings>) => {
      if (!tenantId) throw new Error('No tenant');

      const { data: existing } = await supabase
        .from('tenant_appointment_agent_settings' as any)
        .select('id')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('tenant_appointment_agent_settings' as any)
          .update({ ...settings, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tenant_appointment_agent_settings' as any)
          .insert({ ...DEFAULT_APPOINTMENT_AGENT_SETTINGS, ...settings, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointment-agent-settings'] });
      toast.success('Configuración guardada');
    },
    onError: (error: Error) => {
      toast.error('Error al guardar', { description: error.message });
    },
  });
}
