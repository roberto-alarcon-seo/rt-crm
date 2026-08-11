import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';

export interface OpportunityAgentSettings {
  id: string;
  tenant_id: string;
  enabled: boolean;
  /** Días sin actividad antes de crear una tarea de seguimiento (§4.1: 7). */
  stale_after_days: number;
  /** Días sin cambiar de etapa antes de alertar al manager (§4.1: 14). */
  alert_after_days: number;
  loop_followup_enabled: boolean;
  loop_stall_alert_enabled: boolean;
  loop_proposal_reminder_enabled: boolean;
  loop_probability_update_enabled: boolean;
  /** Cada cuántos días se recuerda una propuesta enviada (§4.1: 3). */
  proposal_reminder_days: number;
  created_at: string;
  updated_at: string;
}

export function useOpportunityAgentSettings() {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['opportunity-agent-settings', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('tenant_opportunity_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;
      if (data) return data as unknown as OpportunityAgentSettings;

      const { data: created, error: insertError } = await supabase
        .from('tenant_opportunity_settings')
        .insert({ tenant_id: tenantId })
        .select()
        .single();

      if (insertError) throw insertError;
      return created as unknown as OpportunityAgentSettings;
    },
    enabled: !!tenantId,
  });
}

export function useUpdateOpportunityAgentSettings() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (
      updates: Partial<Omit<OpportunityAgentSettings, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>,
    ) => {
      if (!tenantId) throw new Error('No tenant');

      const { data, error } = await supabase
        .from('tenant_opportunity_settings')
        .update(updates)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunity-agent-settings'] });
      toast.success('Configuración del Agente de Oportunidades guardada');
    },
    onError: (error) => {
      toast.error('Error al guardar la configuración', { description: error.message });
    },
  });
}
