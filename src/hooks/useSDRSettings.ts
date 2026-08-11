import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';

export type SDRTone = 'professional' | 'friendly' | 'consultative' | 'adaptive';

export interface SDRSettings {
  id: string;
  tenant_id: string;
  enabled: boolean;
  tone: SDRTone;
  system_prompt: string | null;
  /** Score a partir del cual el lead es "caliente" (§3.2 del setup: 70). */
  hot_threshold: number;
  /** Score a partir del cual se nutre en lugar de bajar a baja frecuencia (40). */
  nurture_threshold: number;
  notify_owner_on_hot: boolean;
  /** Horas para proponer la demo cuando el lead se pone caliente (24–48 h). */
  demo_sla_hours: number;
  created_at: string;
  updated_at: string;
}

export interface SDRCriterion {
  id: string;
  tenant_id: string;
  criterion_key: string;
  label: string;
  guide_question: string;
  /** Aportación máxima de este criterio al score 0–100. */
  weight: number;
  is_active: boolean;
  sort_order: number;
}

export interface SDRProduct {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  /** Señal de dolor que hace que este producto sea la puerta de entrada (§3.4). */
  entry_signal: string;
  url: string | null;
  is_active: boolean;
  sort_order: number;
}

/** Suma de pesos de los criterios activos. Debería dar 100. */
export function activeWeightTotal(criteria: SDRCriterion[]): number {
  return criteria.filter((c) => c.is_active).reduce((sum, c) => sum + c.weight, 0);
}

// ── Configuración ─────────────────────────────────────────────────────────────

export function useSDRSettings() {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['sdr-settings', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      const { data, error } = await supabase
        .from('tenant_sdr_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;
      if (data) return data as unknown as SDRSettings;

      // Los tenants creados después de la migración no traen su fila: se crea
      // al primer acceso, igual que hace el widget.
      const { data: created, error: insertError } = await supabase
        .from('tenant_sdr_settings')
        .insert({ tenant_id: tenantId })
        .select()
        .single();

      if (insertError) throw insertError;
      return created as unknown as SDRSettings;
    },
    enabled: !!tenantId,
  });
}

export function useUpdateSDRSettings() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<SDRSettings, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>) => {
      if (!tenantId) throw new Error('No tenant');

      const { data, error } = await supabase
        .from('tenant_sdr_settings')
        .update(updates)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sdr-settings'] });
      toast.success('Configuración del Agente SDR guardada');
    },
    onError: (error) => {
      toast.error('Error al guardar la configuración del Agente SDR', { description: error.message });
    },
  });
}

// ── Criterios de calificación ─────────────────────────────────────────────────

export function useSDRCriteria() {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['sdr-criteria', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('sdr_qualification_criteria')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order');

      if (error) throw error;
      return (data ?? []) as unknown as SDRCriterion[];
    },
    enabled: !!tenantId,
  });
}

export function useUpdateSDRCriterion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Pick<SDRCriterion, 'id'> & Partial<Pick<SDRCriterion, 'weight' | 'is_active' | 'guide_question' | 'label'>>) => {
      const { error } = await supabase
        .from('sdr_qualification_criteria')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sdr-criteria'] });
    },
    onError: (error) => {
      toast.error('Error al guardar el criterio', { description: error.message });
    },
  });
}

// ── Productos ─────────────────────────────────────────────────────────────────

export function useSDRProducts() {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['sdr-products', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const { data, error } = await supabase
        .from('sdr_products')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order');

      if (error) throw error;
      return (data ?? []) as unknown as SDRProduct[];
    },
    enabled: !!tenantId,
  });
}

export function useUpsertSDRProduct() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (product: Partial<SDRProduct> & { name: string }) => {
      if (!tenantId) throw new Error('No tenant');

      if (product.id) {
        const { id, ...updates } = product;
        const { error } = await supabase
          .from('sdr_products')
          .update(updates)
          .eq('id', id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('sdr_products')
        .insert({ ...product, tenant_id: tenantId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sdr-products'] });
      toast.success('Producto guardado');
    },
    onError: (error) => {
      toast.error('Error al guardar el producto', { description: error.message });
    },
  });
}

export function useDeleteSDRProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sdr_products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sdr-products'] });
      toast.success('Producto eliminado');
    },
    onError: (error) => {
      toast.error('Error al eliminar el producto', { description: error.message });
    },
  });
}
