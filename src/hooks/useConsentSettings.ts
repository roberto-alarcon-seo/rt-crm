import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';

export interface ConsentSettings {
  id: string;
  tenant_id: string;
  /** Palabras que, recibidas por WhatsApp, dan de baja al contacto. */
  opt_out_keywords: string[];
  opt_out_confirmation_message: string;
  opt_out_detection_enabled: boolean;
  /** Texto legal que se muestra al capturar datos (§7.3). */
  consent_text: string | null;
  privacy_policy_url: string | null;
  privacy_contact_email: string | null;
  show_consent_in_widget: boolean;
  created_at: string;
  updated_at: string;
}

/** "baja, stop, alto" → ['baja','stop','alto'], sin vacíos ni duplicados. */
export function parseKeywords(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function useConsentSettings() {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['consent-settings', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('tenant_consent_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;
      if (data) return data as unknown as ConsentSettings;

      const { data: created, error: insertError } = await supabase
        .from('tenant_consent_settings')
        .insert({ tenant_id: tenantId })
        .select()
        .single();

      if (insertError) throw insertError;
      return created as unknown as ConsentSettings;
    },
    enabled: !!tenantId,
  });
}

export function useUpdateConsentSettings() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (
      updates: Partial<Omit<ConsentSettings, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>,
    ) => {
      if (!tenantId) throw new Error('No tenant');

      const { data, error } = await supabase
        .from('tenant_consent_settings')
        .update(updates)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consent-settings'] });
      toast.success('Reglas de consentimiento guardadas');
    },
    onError: (error) => {
      toast.error('Error al guardar las reglas', { description: error.message });
    },
  });
}
