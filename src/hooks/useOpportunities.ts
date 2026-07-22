import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';

export type OpportunityStatus = 'open' | 'won' | 'lost';

export interface Opportunity {
  id: string;
  tenant_id: string;
  name: string;
  pipeline_id: string | null;
  stage_id: string | null;
  status: OpportunityStatus;
  position: number;
  account_id: string | null;
  partner_account_id: string | null;
  primary_contact_id: string | null;
  total_amount_usd: number | null;
  currency: string | null;
  close_probability: number | null;
  estimated_close_date: string | null;
  actual_close_date: string | null;
  origin_channel: string | null;
  lost_reason: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  contact?: { name: string; phone: string | null; email: string | null } | null;
  account?: { name: string } | null;
}

export interface OpportunityLine {
  id: string;
  opportunity_id: string;
  tenant_id: string;
  line_type: 'licencia' | 'servicio' | 'gcp' | 'tercero';
  subtype: string;
  description: string | null;
  quantity: number;
  unit_price: number | null;
  cost: number | null;
  currency: string;
  recurrence: 'one_time' | 'monthly' | 'annual';
  created_at: string;
}

const OPP_SELECT = `
  *,
  contact:contacts!opportunities_primary_contact_id_fkey(name, phone, email),
  account:accounts!opportunities_account_id_fkey(name)
`;

// ─── Fetch opportunities for a pipeline (kanban) ──────────────────────────────
export function useOpportunities(pipelineId: string | undefined, filters?: { search?: string }) {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['opportunities', tenantId, pipelineId, filters],
    queryFn: async () => {
      if (!tenantId || !pipelineId) return [];
      const { data, error } = await supabase
        .from('opportunities')
        .select(OPP_SELECT)
        .eq('tenant_id', tenantId)
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Opportunity[];
    },
    enabled: !!tenantId && !!pipelineId,
  });
}

// ─── Fetch opportunities for a specific contact (tab in ContactEditor) ────────
export function useContactOpportunities(contactId: string | undefined) {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['opportunities', 'contact', contactId],
    queryFn: async () => {
      if (!tenantId || !contactId) return [];
      const { data, error } = await supabase
        .from('opportunities')
        .select(`${OPP_SELECT}, pipeline:pipelines(name), stage:pipeline_stages!opportunities_stage_id_fkey(name, color, stage_type)`)
        .eq('tenant_id', tenantId)
        .eq('primary_contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as (Opportunity & {
        pipeline?: { name: string } | null;
        stage?: { name: string; color: string; stage_type: OpportunityStatus } | null;
      })[];
    },
    enabled: !!tenantId && !!contactId,
  });
}

export interface CreateOpportunityParams {
  name: string;
  pipeline_id: string;
  stage_id?: string | null;
  primary_contact_id?: string | null;
  account_id?: string | null;
  total_amount_usd?: number | null;
  currency?: string | null;
  close_probability?: number | null;
  estimated_close_date?: string | null;
  assigned_to?: string | null;
  origin_channel?: string | null;
}

// ─── Create an opportunity (defaults to first open stage of the pipeline) ──────
export function useCreateOpportunity() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (params: CreateOpportunityParams): Promise<Opportunity> => {
      if (!tenantId) throw new Error('No tenant');

      let stageId = params.stage_id ?? null;
      if (!stageId) {
        const { data: firstStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', params.pipeline_id)
          .eq('stage_type', 'open')
          .order('sort_order', { ascending: true })
          .limit(1)
          .maybeSingle();
        stageId = firstStage?.id ?? null;
      }

      // position = last within the destination stage
      const { count } = await supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('pipeline_id', params.pipeline_id)
        .eq('stage_id', stageId ?? '');

      const { data, error } = await supabase
        .from('opportunities')
        .insert({
          tenant_id: tenantId,
          name: params.name,
          pipeline_id: params.pipeline_id,
          stage_id: stageId,
          primary_contact_id: params.primary_contact_id ?? null,
          account_id: params.account_id ?? null,
          total_amount_usd: params.total_amount_usd ?? null,
          currency: params.currency ?? 'USD',
          close_probability: params.close_probability ?? null,
          estimated_close_date: params.estimated_close_date ?? null,
          assigned_to: params.assigned_to ?? null,
          origin_channel: params.origin_channel ?? null,
          position: count ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Opportunity;
    },
    onSuccess: (opp) => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      if (opp.primary_contact_id) {
        queryClient.invalidateQueries({ queryKey: ['opportunities', 'contact', opp.primary_contact_id] });
      }
      toast.success('Oportunidad creada');
    },
    onError: (err: Error) => toast.error('Error al crear oportunidad', { description: err.message }),
  });
}

// ─── Update an opportunity ────────────────────────────────────────────────────
export function useUpdateOpportunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: {
      id: string;
      updates: Partial<Pick<Opportunity,
        'name' | 'stage_id' | 'primary_contact_id' | 'account_id' | 'total_amount_usd' |
        'currency' | 'close_probability' | 'estimated_close_date' | 'assigned_to' | 'lost_reason' | 'origin_channel'
      >>;
    }) => {
      const { error } = await supabase.from('opportunities').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast.success('Oportunidad actualizada');
    },
    onError: (err: Error) => toast.error('Error al actualizar oportunidad', { description: err.message }),
  });
}

export function useDeleteOpportunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('opportunities').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast.success('Oportunidad eliminada');
    },
    onError: (err: Error) => toast.error('Error al eliminar oportunidad', { description: err.message }),
  });
}

// ─── Opportunity revenue lines ────────────────────────────────────────────────
export function useOpportunityLines(opportunityId: string | undefined) {
  return useQuery({
    queryKey: ['opportunity-lines', opportunityId],
    queryFn: async () => {
      if (!opportunityId) return [];
      const { data, error } = await supabase
        .from('opportunity_lines')
        .select('*')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OpportunityLine[];
    },
    enabled: !!opportunityId,
  });
}

export function useUpsertOpportunityLine() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (line: Partial<OpportunityLine> & { opportunity_id: string }) => {
      if (!tenantId) throw new Error('No tenant');
      const payload = {
        tenant_id: tenantId,
        opportunity_id: line.opportunity_id,
        line_type: line.line_type ?? 'servicio',
        subtype: line.subtype ?? 'Otros',
        description: line.description ?? null,
        quantity: line.quantity ?? 1,
        unit_price: line.unit_price ?? null,
        cost: line.cost ?? null,
        currency: line.currency ?? 'USD',
        recurrence: line.recurrence ?? 'one_time',
      };
      if (line.id) {
        const { error } = await supabase.from('opportunity_lines').update(payload).eq('id', line.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('opportunity_lines').insert(payload);
        if (error) throw error;
      }
      return line.opportunity_id;
    },
    onSuccess: (opportunityId) => {
      queryClient.invalidateQueries({ queryKey: ['opportunity-lines', opportunityId] });
    },
    onError: (err: Error) => toast.error('Error al guardar línea', { description: err.message }),
  });
}

export function useDeleteOpportunityLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, opportunity_id }: { id: string; opportunity_id: string }) => {
      const { error } = await supabase.from('opportunity_lines').delete().eq('id', id);
      if (error) throw error;
      return opportunity_id;
    },
    onSuccess: (opportunityId) => {
      queryClient.invalidateQueries({ queryKey: ['opportunity-lines', opportunityId] });
    },
    onError: (err: Error) => toast.error('Error al eliminar línea', { description: err.message }),
  });
}
