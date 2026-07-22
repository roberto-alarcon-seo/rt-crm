import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { usePipelineStageChange } from '@/hooks/usePipelineStageChange';
import type { Opportunity } from '@/hooks/useOpportunities';
import { toast } from 'sonner';

interface MoveParams {
  opportunityId: string;
  pipelineId: string;
  toStageId: string;
  toPosition: number;
  /** primary contact of the opportunity (to mirror contacts.pipeline_stage) */
  contactId?: string | null;
  /** legacy_stage_key of the DESTINATION stage (null for custom pipelines) */
  newLegacyKey?: string | null;
  /** legacy_stage_key of the SOURCE stage */
  oldLegacyKey?: string | null;
}

/**
 * Moves an opportunity to a new stage/position and keeps the legacy machinery in
 * sync: mirrors contacts.pipeline_stage and fires usePipelineStageChange so that
 * Meta Pixel/CAPI events and internal conversions keep working exactly as before.
 * Only mirrors when the destination stage has a legacy_stage_key (default pipeline).
 */
export function useMoveOpportunityStage() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();
  const { handlePipelineStageChange } = usePipelineStageChange();

  return useMutation({
    mutationFn: async ({ opportunityId, toStageId, toPosition, contactId, newLegacyKey, oldLegacyKey }: MoveParams) => {
      // 1. Move the opportunity (trigger derives status + actual_close_date)
      const { error } = await supabase
        .from('opportunities')
        .update({ stage_id: toStageId, position: toPosition })
        .eq('id', opportunityId);
      if (error) throw error;

      // 2. Mirror to contacts.pipeline_stage + fire legacy stage-change machinery
      if (contactId && newLegacyKey) {
        await supabase
          .from('contacts')
          .update({ pipeline_stage: newLegacyKey })
          .eq('id', contactId);
        await handlePipelineStageChange(contactId, oldLegacyKey || newLegacyKey, newLegacyKey);
      }

      return { opportunityId, toStageId };
    },
    // Optimistic update so the card moves instantly
    onMutate: async ({ opportunityId, pipelineId, toStageId, toPosition }: MoveParams) => {
      await queryClient.cancelQueries({ queryKey: ['opportunities', tenantId, pipelineId] });
      const snapshots = queryClient.getQueriesData<Opportunity[]>({ queryKey: ['opportunities', tenantId, pipelineId] });
      queryClient.setQueriesData<Opportunity[]>({ queryKey: ['opportunities', tenantId, pipelineId] }, (old) => {
        if (!old) return old;
        return old.map((o) => (o.id === opportunityId ? { ...o, stage_id: toStageId, position: toPosition } : o));
      });
      return { snapshots };
    },
    onError: (err: Error, _vars, ctx) => {
      // rollback
      ctx?.snapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error('Error al mover la oportunidad', { description: err.message });
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ['opportunities', tenantId, vars.pipelineId] });
      if (vars.contactId) {
        queryClient.invalidateQueries({ queryKey: ['opportunities', 'contact', vars.contactId] });
      }
    },
  });
}
