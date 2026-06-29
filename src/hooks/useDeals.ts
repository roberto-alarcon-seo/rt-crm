import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';

export type DealStage =
  | 'contrato_compraventa'
  | 'valuacion'
  | 'apertura_credito'
  | 'procesos_notariales'
  | 'entrega_inmueble'
  // Renta deal stages
  | 'revision_docs'
  | 'aprobacion_propietario'
  | 'firma_contrato'
  | 'entrega_llaves'
  // Shared closed stages
  | 'cerrado_ganado'
  | 'cerrado_perdido';

export type DealType = 'compra' | 'renta' | 'captacion';
export type DealStatus = 'active' | 'won' | 'lost';
export type DealOrigin = 'pipeline_conversion' | 'site_visit' | 'manual';
export type DocumentStatus = 'pending' | 'received' | 'validated' | 'expired';

export interface Deal {
  id: string;
  tenant_id: string;
  contact_id: string;
  property_id: string | null;
  title: string;
  deal_type: DealType;
  stage: DealStage;
  offered_price_mxn: number | null;
  commission_pct: number | null;
  expected_close_date: string | null;
  closed_at: string | null;
  assigned_agent_id: string | null;
  status: DealStatus;
  lost_reason: string | null;
  notes: string | null;
  origin: DealOrigin;
  created_at: string;
  updated_at: string;
  // Joins
  contact?: { name: string; phone: string | null; email: string | null; lead_temperature: string };
  property?: { title: string; zone: string | null; price: number | null } | null;
  pending_docs_count?: number;
}

export interface DealDocument {
  id: string;
  deal_id: string;
  tenant_id: string;
  document_type: string;
  label: string;
  deal_stage: DealStage;
  party: 'client' | 'property';
  status: DocumentStatus;
  received_at: string | null;
  expires_at: string | null;
  reference_link: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDealParams {
  contact_id: string;
  property_id?: string | null;
  title: string;
  deal_type: DealType;
  credit_type?: string | null;
  template_id?: string | null;
  offered_price_mxn?: number | null;
  commission_pct?: number | null;
  expected_close_date?: string | null;
  assigned_agent_id?: string | null;
  notes?: string | null;
  origin?: DealOrigin;
}

// Document checklist templates per deal type
export const DOCUMENT_TEMPLATES: Record<DealType, { document_type: string; label: string; deal_stage: DealStage; sort_order: number }[]> = {
  compra: [
    { document_type: 'ine',                   label: 'INE / Pasaporte',              deal_stage: 'contrato_compraventa', sort_order: 1 },
    { document_type: 'comprobante_domicilio',  label: 'Comprobante de domicilio',     deal_stage: 'contrato_compraventa', sort_order: 2 },
    { document_type: 'carta_oferta',           label: 'Carta oferta firmada',         deal_stage: 'contrato_compraventa', sort_order: 3 },
    { document_type: 'contrato_promesa',       label: 'Contrato de promesa',          deal_stage: 'contrato_compraventa', sort_order: 4 },
    { document_type: 'comprobante_enganche',   label: 'Comprobante de enganche',      deal_stage: 'contrato_compraventa', sort_order: 5 },
    { document_type: 'orden_valuacion',        label: 'Orden de valuación',           deal_stage: 'valuacion',            sort_order: 1 },
    { document_type: 'dictamen_valuador',      label: 'Dictamen del valuador',        deal_stage: 'valuacion',            sort_order: 2 },
    { document_type: 'carta_preaprobacion',    label: 'Carta de preaprobación',       deal_stage: 'apertura_credito',     sort_order: 1 },
    { document_type: 'estados_cuenta',         label: 'Estados de cuenta (3 meses)',  deal_stage: 'apertura_credito',     sort_order: 2 },
    { document_type: 'comprobante_ingresos',   label: 'Comprobante de ingresos',      deal_stage: 'apertura_credito',     sort_order: 3 },
    { document_type: 'curp',                   label: 'CURP',                         deal_stage: 'apertura_credito',     sort_order: 4 },
    { document_type: 'escritura_borrador',     label: 'Escritura (borrador)',         deal_stage: 'procesos_notariales',  sort_order: 1 },
    { document_type: 'avaluo_fiscal',          label: 'Avalúo fiscal',                deal_stage: 'procesos_notariales',  sort_order: 2 },
    { document_type: 'cert_libertad_gravamen', label: 'Cert. libertad de gravamen',   deal_stage: 'procesos_notariales',  sort_order: 3 },
    { document_type: 'escritura_protocolizada',label: 'Escritura protocolizada',      deal_stage: 'entrega_inmueble',     sort_order: 1 },
    { document_type: 'acta_entrega',           label: 'Acta de entrega',              deal_stage: 'entrega_inmueble',     sort_order: 2 },
  ],
  renta: [
    { document_type: 'ine',                    label: 'INE / Pasaporte',              deal_stage: 'revision_docs',          sort_order: 1 },
    { document_type: 'comprobante_domicilio',   label: 'Comprobante de domicilio',     deal_stage: 'revision_docs',          sort_order: 2 },
    { document_type: 'comprobante_ingresos',    label: 'Comprobante de ingresos',      deal_stage: 'revision_docs',          sort_order: 3 },
    { document_type: 'ine_aval',               label: 'INE del aval',                 deal_stage: 'aprobacion_propietario', sort_order: 1 },
    { document_type: 'docs_aval',              label: 'Documentos del aval',          deal_stage: 'aprobacion_propietario', sort_order: 2 },
    { document_type: 'contrato_arrendamiento',  label: 'Contrato de arrendamiento',    deal_stage: 'firma_contrato',         sort_order: 1 },
    { document_type: 'deposito_garantia',       label: 'Depósito de garantía',         deal_stage: 'firma_contrato',         sort_order: 2 },
    { document_type: 'acta_entrega',            label: 'Acta de entrega / inventario', deal_stage: 'entrega_llaves',         sort_order: 1 },
  ],
  captacion: [
    { document_type: 'ine',                   label: 'INE del propietario',          deal_stage: 'contrato_compraventa', sort_order: 1 },
    { document_type: 'escritura',             label: 'Escritura del inmueble',       deal_stage: 'contrato_compraventa', sort_order: 2 },
    { document_type: 'contrato_exclusiva',    label: 'Contrato de exclusiva',        deal_stage: 'contrato_compraventa', sort_order: 3 },
    { document_type: 'predial',               label: 'Pago de predial al corriente', deal_stage: 'valuacion',            sort_order: 1 },
    { document_type: 'dictamen_valuador',     label: 'Dictamen del valuador',        deal_stage: 'valuacion',            sort_order: 2 },
    { document_type: 'cert_libertad_gravamen',label: 'Cert. libertad de gravamen',   deal_stage: 'procesos_notariales',  sort_order: 1 },
    { document_type: 'escritura_protocolizada',label: 'Escritura protocolizada',     deal_stage: 'entrega_inmueble',     sort_order: 1 },
  ],
};

export const DEAL_STAGES: { value: DealStage; label: string; color: string; bgColor: string }[] = [
  { value: 'contrato_compraventa', label: 'Contrato C-V',       color: 'text-blue-400',   bgColor: 'bg-blue-500' },
  { value: 'valuacion',            label: 'Valuación',           color: 'text-indigo-400', bgColor: 'bg-indigo-500' },
  { value: 'apertura_credito',     label: 'Apertura de crédito', color: 'text-violet-400', bgColor: 'bg-violet-500' },
  { value: 'procesos_notariales',  label: 'Procesos notariales', color: 'text-amber-400',  bgColor: 'bg-amber-500' },
  { value: 'entrega_inmueble',     label: 'Entrega del inmueble',color: 'text-emerald-400',bgColor: 'bg-emerald-500' },
];

export const RENTA_DEAL_STAGES: { value: DealStage; label: string; color: string; bgColor: string }[] = [
  { value: 'revision_docs',          label: 'Revisión de docs',      color: 'text-blue-400',    bgColor: 'bg-blue-500' },
  { value: 'aprobacion_propietario', label: 'Aprob. propietario',    color: 'text-violet-400',  bgColor: 'bg-violet-500' },
  { value: 'firma_contrato',         label: 'Firma de contrato',     color: 'text-amber-400',   bgColor: 'bg-amber-500' },
  { value: 'entrega_llaves',         label: 'Entrega de llaves',     color: 'text-emerald-400', bgColor: 'bg-emerald-500' },
];

export const DEAL_CLOSED_STAGES: { value: DealStage; label: string }[] = [
  { value: 'cerrado_ganado',  label: 'Cerrado ✓' },
  { value: 'cerrado_perdido', label: 'Perdido' },
];

export function getDealStagesForType(dealType: DealType): { value: DealStage; label: string; color: string; bgColor: string }[] {
  return dealType === 'renta' ? RENTA_DEAL_STAGES : DEAL_STAGES;
}

// ─── Fetch all active deals for a tenant (for /clientes Kanban) ───────────────
export function useDeals(filters?: { search?: string; agentId?: string; dateFrom?: string; dateTo?: string }) {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['deals', tenantId, filters],
    queryFn: async () => {
      if (!tenantId) return [];

      let query = supabase
        .from('deals')
        .select(`
          *,
          contact:contacts(name, phone, email, lead_temperature),
          property:properties(title, zone, price)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false });

      if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59');

      const { data, error } = await query;
      if (error) throw error;

      // Attach pending doc count per deal
      const dealIds = (data ?? []).map((d: any) => d.id);
      let pendingCounts: Record<string, number> = {};

      if (dealIds.length > 0) {
        const { data: docCounts } = await supabase
          .from('deal_documents')
          .select('deal_id, status')
          .in('deal_id', dealIds)
          .eq('status', 'pending');

        (docCounts ?? []).forEach((d: any) => {
          pendingCounts[d.deal_id] = (pendingCounts[d.deal_id] ?? 0) + 1;
        });
      }

      return (data ?? []).map((d: any) => ({
        ...d,
        pending_docs_count: pendingCounts[d.id] ?? 0,
      })) as Deal[];
    },
    enabled: !!tenantId,
  });
}

// ─── Fetch deals for a specific contact ───────────────────────────────────────
export function useContactDeals(contactId: string | undefined) {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['deals', 'contact', contactId],
    queryFn: async () => {
      if (!tenantId || !contactId) return [];
      const { data, error } = await supabase
        .from('deals')
        .select(`*, property:properties(title, zone, price)`)
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Deal[];
    },
    enabled: !!tenantId && !!contactId,
  });
}

// ─── Create deal + seed document checklist + update contact lifecycle ─────────
export function useCreateDeal() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (params: CreateDealParams): Promise<Deal> => {
      if (!tenantId) throw new Error('No tenant');

      // 1. Create the deal
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .insert({
          tenant_id: tenantId,
          contact_id: params.contact_id,
          property_id: params.property_id ?? null,
          title: params.title,
          deal_type: params.deal_type,
          credit_type: params.credit_type ?? null,
          offered_price_mxn: params.offered_price_mxn ?? null,
          commission_pct: params.commission_pct ?? null,
          expected_close_date: params.expected_close_date ?? null,
          assigned_agent_id: params.assigned_agent_id ?? null,
          notes: params.notes ?? null,
          origin: params.origin ?? 'manual',
          stage: params.deal_type === 'renta' ? 'revision_docs' : 'contrato_compraventa',
          status: 'active',
        })
        .select()
        .single();

      if (dealError) throw dealError;

      // 2. Seed document checklist — from DB template if available, else hardcoded fallback
      let seeded = false;
      if (params.template_id) {
        const { data: tmplItems } = await supabase
          .from('document_template_items')
          .select('*')
          .eq('template_id', params.template_id)
          .order('sort_order');
        if (tmplItems && tmplItems.length > 0) {
          await supabase.from('deal_documents').insert(
            tmplItems.map((item: any) => ({
              deal_id: deal.id,
              tenant_id: tenantId,
              document_type: item.id,
              label: item.label,
              deal_stage: item.deal_stage,
              party: item.party,
              sort_order: item.sort_order,
              status: 'pending',
            }))
          );
          seeded = true;
        }
      }

      if (!seeded) {
        const template = DOCUMENT_TEMPLATES[params.deal_type] ?? DOCUMENT_TEMPLATES.compra;
        if (template.length > 0) {
          await supabase.from('deal_documents').insert(
            template.map((doc) => ({
              deal_id: deal.id,
              tenant_id: tenantId,
              document_type: doc.document_type,
              label: doc.label,
              deal_stage: doc.deal_stage,
              party: 'client',
              sort_order: doc.sort_order,
              status: 'pending',
            }))
          );
        }
      }

      // 3. Update contact lifecycle to 'client'
      await supabase
        .from('contacts')
        .update({ lifecycle: 'client' })
        .eq('id', params.contact_id);

      return deal as Deal;
    },
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['deals', 'contact', deal.contact_id] });
      toast.success('Expediente creado', { description: 'El contacto pasó a Clientes activos' });
    },
    onError: (err: Error) => {
      toast.error('Error al crear expediente', { description: err.message });
    },
  });
}

// ─── Move deal to a new stage ─────────────────────────────────────────────────
export function useMoveDealStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, stage }: { dealId: string; stage: DealStage }) => {
      const updates: Record<string, unknown> = { stage };
      if (stage === 'cerrado_ganado') updates.status = 'won';
      if (stage === 'cerrado_perdido') updates.status = 'lost';
      if (stage === 'cerrado_ganado' || stage === 'cerrado_perdido') {
        updates.closed_at = new Date().toISOString();
      }

      const { error } = await supabase.from('deals').update(updates).eq('id', dealId);
      if (error) throw error;
      return { dealId, stage };
    },
    onSuccess: ({ stage }) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      if (stage === 'cerrado_ganado') toast.success('¡Expediente cerrado con éxito! 🎉');
      else if (stage === 'cerrado_perdido') toast.info('Expediente marcado como perdido');
      else toast.success('Etapa actualizada');
    },
    onError: (err: Error) => {
      toast.error('Error al cambiar etapa', { description: err.message });
    },
  });
}

// ─── Fetch documents for a deal ───────────────────────────────────────────────
export function useDealDocuments(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-documents', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('deal_documents')
        .select('*')
        .eq('deal_id', dealId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DealDocument[];
    },
    enabled: !!dealId,
  });
}

// ─── Update deal notes ───────────────────────────────────────────────────────
export function useUpdateDealNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, notes }: { dealId: string; notes: string }) => {
      const { error } = await supabase
        .from('deals')
        .update({ notes: notes || null, updated_at: new Date().toISOString() })
        .eq('id', dealId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Notas guardadas');
    },
    onError: (err: Error) => toast.error('Error al guardar notas', { description: err.message }),
  });
}

// ─── Update a document status ────────────────────────────────────────────────
export function useUpdateDealDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      docId,
      dealId,
      updates,
    }: {
      docId: string;
      dealId: string;
      updates: Partial<Pick<DealDocument, 'status' | 'received_at' | 'expires_at' | 'reference_link' | 'notes'>>;
    }) => {
      const payload: Record<string, unknown> = { ...updates };
      if (updates.status === 'received' && !updates.received_at) {
        payload.received_at = new Date().toISOString();
      }
      const { error } = await supabase.from('deal_documents').update(payload).eq('id', docId);
      if (error) throw error;
      return { docId, dealId };
    },
    onSuccess: ({ dealId }) => {
      queryClient.invalidateQueries({ queryKey: ['deal-documents', dealId] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
    onError: (err: Error) => {
      toast.error('Error al actualizar documento', { description: err.message });
    },
  });
}
