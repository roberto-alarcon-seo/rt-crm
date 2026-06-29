import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';
import type { DealStage, DealType } from './useDeals';

export type CreditType = 'contado' | 'banco' | 'infonavit' | 'fovissste' | 'cofinavit' | 'otro';
export type DocParty = 'client' | 'property';

export const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  contado:   'Contado',
  banco:     'Crédito bancario',
  infonavit: 'INFONAVIT',
  fovissste: 'FOVISSSTE',
  cofinavit: 'Cofinavit',
  otro:      'Otro',
};

export interface DocumentTemplate {
  id: string;
  tenant_id: string;
  name: string;
  deal_type: DealType;
  credit_type: CreditType | null;
  is_default: boolean;
  country: string;
  created_at: string;
  updated_at: string;
  items?: DocumentTemplateItem[];
}

export interface DocumentTemplateItem {
  id: string;
  template_id: string;
  tenant_id: string;
  label: string;
  deal_stage: DealStage;
  party: DocParty;
  sort_order: number;
  created_at: string;
}

// ─── Seed data (mirrors hardcoded DOCUMENT_TEMPLATES + party assignments) ────
export const DEFAULT_TEMPLATE_SEEDS: {
  name: string;
  deal_type: DealType;
  credit_type: CreditType | null;
  is_default: boolean;
  items: { label: string; deal_stage: DealStage; party: DocParty; sort_order: number }[];
}[] = [
  {
    name: 'Compra general',
    deal_type: 'compra',
    credit_type: null,
    is_default: true,
    items: [
      { label: 'INE / Pasaporte',            deal_stage: 'contrato_compraventa', party: 'client',   sort_order: 1 },
      { label: 'Comprobante de domicilio',    deal_stage: 'contrato_compraventa', party: 'client',   sort_order: 2 },
      { label: 'Carta oferta firmada',        deal_stage: 'contrato_compraventa', party: 'client',   sort_order: 3 },
      { label: 'Contrato de promesa',         deal_stage: 'contrato_compraventa', party: 'client',   sort_order: 4 },
      { label: 'Comprobante de enganche',     deal_stage: 'contrato_compraventa', party: 'client',   sort_order: 5 },
      { label: 'Orden de valuación',          deal_stage: 'valuacion',            party: 'client',   sort_order: 1 },
      { label: 'Dictamen del valuador',       deal_stage: 'valuacion',            party: 'property', sort_order: 2 },
      { label: 'Carta de preaprobación',      deal_stage: 'apertura_credito',     party: 'client',   sort_order: 1 },
      { label: 'Estados de cuenta (3 meses)', deal_stage: 'apertura_credito',     party: 'client',   sort_order: 2 },
      { label: 'Comprobante de ingresos',     deal_stage: 'apertura_credito',     party: 'client',   sort_order: 3 },
      { label: 'CURP',                        deal_stage: 'apertura_credito',     party: 'client',   sort_order: 4 },
      { label: 'Escritura (borrador)',         deal_stage: 'procesos_notariales',  party: 'property', sort_order: 1 },
      { label: 'Avalúo fiscal',               deal_stage: 'procesos_notariales',  party: 'property', sort_order: 2 },
      { label: 'Cert. libertad de gravamen',  deal_stage: 'procesos_notariales',  party: 'property', sort_order: 3 },
      { label: 'Escritura protocolizada',     deal_stage: 'entrega_inmueble',     party: 'property', sort_order: 1 },
      { label: 'Acta de entrega',             deal_stage: 'entrega_inmueble',     party: 'client',   sort_order: 2 },
    ],
  },
  {
    name: 'Compra - INFONAVIT',
    deal_type: 'compra',
    credit_type: 'infonavit',
    is_default: false,
    items: [
      { label: 'INE / Pasaporte',             deal_stage: 'contrato_compraventa', party: 'client',   sort_order: 1 },
      { label: 'Comprobante de domicilio',    deal_stage: 'contrato_compraventa', party: 'client',   sort_order: 2 },
      { label: 'Carta oferta firmada',        deal_stage: 'contrato_compraventa', party: 'client',   sort_order: 3 },
      { label: 'Contrato de promesa',         deal_stage: 'contrato_compraventa', party: 'client',   sort_order: 4 },
      { label: 'Comprobante de enganche',     deal_stage: 'contrato_compraventa', party: 'client',   sort_order: 5 },
      { label: 'Número de Seguridad Social',  deal_stage: 'apertura_credito',     party: 'client',   sort_order: 1 },
      { label: 'CURP',                        deal_stage: 'apertura_credito',     party: 'client',   sort_order: 2 },
      { label: 'Constancia de semanas cotizadas', deal_stage: 'apertura_credito', party: 'client',   sort_order: 3 },
      { label: 'Estados de cuenta AFORE',     deal_stage: 'apertura_credito',     party: 'client',   sort_order: 4 },
      { label: 'Carta de crédito INFONAVIT',  deal_stage: 'apertura_credito',     party: 'client',   sort_order: 5 },
      { label: 'Orden de valuación INFONAVIT',deal_stage: 'valuacion',            party: 'client',   sort_order: 1 },
      { label: 'Dictamen del valuador',       deal_stage: 'valuacion',            party: 'property', sort_order: 2 },
      { label: 'Escritura (borrador)',         deal_stage: 'procesos_notariales',  party: 'property', sort_order: 1 },
      { label: 'Avalúo fiscal',               deal_stage: 'procesos_notariales',  party: 'property', sort_order: 2 },
      { label: 'Cert. libertad de gravamen',  deal_stage: 'procesos_notariales',  party: 'property', sort_order: 3 },
      { label: 'Escritura protocolizada',     deal_stage: 'entrega_inmueble',     party: 'property', sort_order: 1 },
      { label: 'Acta de entrega',             deal_stage: 'entrega_inmueble',     party: 'client',   sort_order: 2 },
    ],
  },
  {
    name: 'Renta',
    deal_type: 'renta',
    credit_type: null,
    is_default: true,
    items: [
      { label: 'INE / Pasaporte',              deal_stage: 'revision_docs',          party: 'client',   sort_order: 1 },
      { label: 'Comprobante de domicilio',     deal_stage: 'revision_docs',          party: 'client',   sort_order: 2 },
      { label: 'Comprobante de ingresos',      deal_stage: 'revision_docs',          party: 'client',   sort_order: 3 },
      { label: 'INE del aval',                 deal_stage: 'aprobacion_propietario', party: 'client',   sort_order: 1 },
      { label: 'Documentos del aval',          deal_stage: 'aprobacion_propietario', party: 'client',   sort_order: 2 },
      { label: 'Contrato de arrendamiento',    deal_stage: 'firma_contrato',         party: 'property', sort_order: 1 },
      { label: 'Depósito de garantía',         deal_stage: 'firma_contrato',         party: 'client',   sort_order: 2 },
      { label: 'Acta de entrega / inventario', deal_stage: 'entrega_llaves',         party: 'client',   sort_order: 1 },
    ],
  },
  {
    name: 'Captación',
    deal_type: 'captacion',
    credit_type: null,
    is_default: true,
    items: [
      { label: 'INE del propietario',         deal_stage: 'contrato_compraventa', party: 'property', sort_order: 1 },
      { label: 'Escritura del inmueble',      deal_stage: 'contrato_compraventa', party: 'property', sort_order: 2 },
      { label: 'Contrato de exclusiva',       deal_stage: 'contrato_compraventa', party: 'property', sort_order: 3 },
      { label: 'Pago de predial al corriente',deal_stage: 'valuacion',            party: 'property', sort_order: 1 },
      { label: 'Dictamen del valuador',       deal_stage: 'valuacion',            party: 'property', sort_order: 2 },
      { label: 'Cert. libertad de gravamen',  deal_stage: 'procesos_notariales',  party: 'property', sort_order: 1 },
      { label: 'Escritura protocolizada',     deal_stage: 'entrega_inmueble',     party: 'property', sort_order: 1 },
    ],
  },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useDocumentTemplates() {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: ['document-templates', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('document_templates')
        .select('*, items:document_template_items(*)')
        .eq('tenant_id', tenantId)
        .order('deal_type')
        .order('name');
      if (error) throw error;
      // Sort items by sort_order within each template
      return (data ?? []).map((t: any) => ({
        ...t,
        items: (t.items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
      })) as DocumentTemplate[];
    },
    enabled: !!tenantId,
  });
}

export function useTemplatesForDealType(dealType: DealType | null) {
  const tenantId = useEffectiveTenantId();
  return useQuery({
    queryKey: ['document-templates-by-type', tenantId, dealType],
    queryFn: async () => {
      if (!tenantId || !dealType) return [];
      const { data, error } = await supabase
        .from('document_templates')
        .select('*, items:document_template_items(*)')
        .eq('tenant_id', tenantId)
        .eq('deal_type', dealType)
        .order('name');
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        ...t,
        items: (t.items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
      })) as DocumentTemplate[];
    },
    enabled: !!tenantId && !!dealType,
  });
}

export function useCreateDocumentTemplate() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      deal_type: DealType;
      credit_type: CreditType | null;
      is_default: boolean;
      country?: string;
    }) => {
      if (!tenantId) throw new Error('No tenant');
      const { data, error } = await supabase
        .from('document_templates')
        .insert({ tenant_id: tenantId, country: 'MX', ...params })
        .select()
        .single();
      if (error) throw error;
      return data as DocumentTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      toast.success('Plantilla creada');
    },
    onError: (err: Error) => toast.error('Error al crear plantilla', { description: err.message }),
  });
}

export function useUpdateDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string;
      name?: string;
      is_default?: boolean;
      credit_type?: CreditType | null;
    }) => {
      const { error } = await supabase
        .from('document_templates')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      toast.success('Plantilla actualizada');
    },
    onError: (err: Error) => toast.error('Error', { description: err.message }),
  });
}

export function useDeleteDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('document_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      toast.success('Plantilla eliminada');
    },
    onError: (err: Error) => toast.error('Error al eliminar', { description: err.message }),
  });
}

export function useAddTemplateItem() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();
  return useMutation({
    mutationFn: async (params: {
      template_id: string;
      label: string;
      deal_stage: DealStage;
      party: DocParty;
      sort_order: number;
    }) => {
      if (!tenantId) throw new Error('No tenant');
      const { data, error } = await supabase
        .from('document_template_items')
        .insert({ tenant_id: tenantId, ...params })
        .select()
        .single();
      if (error) throw error;
      return data as DocumentTemplateItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
    },
    onError: (err: Error) => toast.error('Error', { description: err.message }),
  });
}

export function useDeleteTemplateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('document_template_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
    },
    onError: (err: Error) => toast.error('Error', { description: err.message }),
  });
}

export function useSeedDefaultTemplates() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();
  return useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('No tenant');
      for (const seed of DEFAULT_TEMPLATE_SEEDS) {
        const { data: tmpl, error: tmplErr } = await supabase
          .from('document_templates')
          .insert({
            tenant_id: tenantId,
            name: seed.name,
            deal_type: seed.deal_type,
            credit_type: seed.credit_type,
            is_default: seed.is_default,
            country: 'MX',
          })
          .select()
          .single();
        if (tmplErr) throw tmplErr;
        if (seed.items.length > 0) {
          const { error: itemsErr } = await supabase
            .from('document_template_items')
            .insert(
              seed.items.map((item) => ({
                template_id: tmpl.id,
                tenant_id: tenantId,
                label: item.label,
                deal_stage: item.deal_stage,
                party: item.party,
                sort_order: item.sort_order,
              }))
            );
          if (itemsErr) throw itemsErr;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      toast.success('Plantillas predeterminadas cargadas', {
        description: `${DEFAULT_TEMPLATE_SEEDS.length} plantillas inicializadas`,
      });
    },
    onError: (err: Error) => toast.error('Error al cargar plantillas', { description: err.message }),
  });
}
