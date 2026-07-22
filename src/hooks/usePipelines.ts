import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { toast } from 'sonner';

export type StageType = 'open' | 'won' | 'lost';

export interface Pipeline {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_default: boolean;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  tenant_id: string;
  pipeline_id: string;
  name: string;
  color: string;
  sort_order: number;
  stage_type: StageType;
  probability_default: number;
  legacy_stage_key: string | null;
  created_at: string;
  updated_at: string;
}

// Default stages seeded when a brand-new pipeline is created from the UI.
// Every pipeline needs at least a won and a lost stage for the forecast to work.
const DEFAULT_NEW_STAGES: Omit<PipelineStage, 'id' | 'tenant_id' | 'pipeline_id' | 'created_at' | 'updated_at'>[] = [
  { name: 'Nuevo',     color: '#64748b', sort_order: 0, stage_type: 'open', probability_default: 10, legacy_stage_key: null },
  { name: 'En proceso', color: '#3b82f6', sort_order: 1, stage_type: 'open', probability_default: 50, legacy_stage_key: null },
  { name: 'Ganada',    color: '#22c55e', sort_order: 2, stage_type: 'won', probability_default: 100, legacy_stage_key: null },
  { name: 'Perdida',   color: '#ef4444', sort_order: 3, stage_type: 'lost', probability_default: 0, legacy_stage_key: null },
];

// ─── Fetch all (non-archived) pipelines for the tenant ────────────────────────
export function usePipelines() {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['pipelines', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('pipelines')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Pipeline[];
    },
    enabled: !!tenantId,
  });
}

// ─── Fetch stages for a pipeline ──────────────────────────────────────────────
export function usePipelineStages(pipelineId: string | undefined) {
  const tenantId = useEffectiveTenantId();

  return useQuery({
    queryKey: ['pipeline-stages', tenantId, pipelineId],
    queryFn: async () => {
      if (!tenantId || !pipelineId) return [];
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('pipeline_id', pipelineId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PipelineStage[];
    },
    enabled: !!tenantId && !!pipelineId,
  });
}

// ─── Create a pipeline (+ seed default stages) ────────────────────────────────
export function useCreatePipeline() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (params: { name: string; description?: string | null; is_default?: boolean }) => {
      if (!tenantId) throw new Error('No tenant');

      // sort_order = next available
      const { count } = await supabase
        .from('pipelines')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      const { data: pipeline, error } = await supabase
        .from('pipelines')
        .insert({
          tenant_id: tenantId,
          name: params.name,
          description: params.description ?? null,
          is_default: params.is_default ?? false,
          sort_order: count ?? 0,
        })
        .select()
        .single();
      if (error) throw error;

      // Seed the four default stages
      await supabase.from('pipeline_stages').insert(
        DEFAULT_NEW_STAGES.map((s) => ({
          tenant_id: tenantId,
          pipeline_id: pipeline.id,
          name: s.name,
          color: s.color,
          sort_order: s.sort_order,
          stage_type: s.stage_type,
          probability_default: s.probability_default,
          legacy_stage_key: s.legacy_stage_key,
        }))
      );

      return pipeline as Pipeline;
    },
    onSuccess: (pipeline) => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages', tenantId, pipeline.id] });
      toast.success('Pipeline creado');
    },
    onError: (err: Error) => toast.error('Error al crear pipeline', { description: err.message }),
  });
}

// ─── Update a pipeline ────────────────────────────────────────────────────────
export function useUpdatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<Pipeline, 'name' | 'description' | 'is_default' | 'sort_order'>> }) => {
      const { error } = await supabase.from('pipelines').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast.success('Pipeline actualizado');
    },
    onError: (err: Error) => toast.error('Error al actualizar pipeline', { description: err.message }),
  });
}

// ─── Archive a pipeline (soft delete) ─────────────────────────────────────────
export function useArchivePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pipelines').update({ is_archived: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast.success('Pipeline archivado');
    },
    onError: (err: Error) => toast.error('Error al archivar pipeline', { description: err.message }),
  });
}

// ─── Stage CRUD ───────────────────────────────────────────────────────────────
export function useCreateStage() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async (params: {
      pipeline_id: string;
      name: string;
      color?: string;
      stage_type?: StageType;
      probability_default?: number;
    }) => {
      if (!tenantId) throw new Error('No tenant');
      const { count } = await supabase
        .from('pipeline_stages')
        .select('id', { count: 'exact', head: true })
        .eq('pipeline_id', params.pipeline_id);

      const { error } = await supabase.from('pipeline_stages').insert({
        tenant_id: tenantId,
        pipeline_id: params.pipeline_id,
        name: params.name,
        color: params.color ?? '#64748b',
        stage_type: params.stage_type ?? 'open',
        probability_default: params.probability_default ?? 0,
        sort_order: count ?? 0,
      });
      if (error) throw error;
      return params.pipeline_id;
    },
    onSuccess: (pipelineId) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages', tenantId, pipelineId] });
      toast.success('Etapa creada');
    },
    onError: (err: Error) => toast.error('Error al crear etapa', { description: err.message }),
  });
}

export function useUpdateStage() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async ({ id, pipeline_id, updates }: {
      id: string;
      pipeline_id: string;
      updates: Partial<Pick<PipelineStage, 'name' | 'color' | 'stage_type' | 'probability_default' | 'sort_order'>>;
    }) => {
      const { error } = await supabase.from('pipeline_stages').update(updates).eq('id', id);
      if (error) throw error;
      return pipeline_id;
    },
    onSuccess: (pipelineId) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages', tenantId, pipelineId] });
      toast.success('Etapa actualizada');
    },
    onError: (err: Error) => toast.error('Error al actualizar etapa', { description: err.message }),
  });
}

export function useDeleteStage() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async ({ id, pipeline_id }: { id: string; pipeline_id: string }) => {
      const { error } = await supabase.from('pipeline_stages').delete().eq('id', id);
      if (error) throw error;
      return pipeline_id;
    },
    onSuccess: (pipelineId) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages', tenantId, pipelineId] });
      toast.success('Etapa eliminada');
    },
    onError: (err: Error) =>
      toast.error('No se pudo eliminar la etapa', {
        description: 'Si tiene oportunidades, muévelas a otra etapa primero.',
      }),
  });
}

// ─── Reorder stages (batch sort_order) ────────────────────────────────────────
export function useReorderStages() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();

  return useMutation({
    mutationFn: async ({ pipeline_id, orderedIds }: { pipeline_id: string; orderedIds: string[] }) => {
      // Persist new sort_order for each stage
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('pipeline_stages').update({ sort_order: idx }).eq('id', id)
        )
      );
      return pipeline_id;
    },
    onSuccess: (pipelineId) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages', tenantId, pipelineId] });
    },
    onError: (err: Error) => toast.error('Error al reordenar etapas', { description: err.message }),
  });
}
