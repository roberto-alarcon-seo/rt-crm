import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import type { AIConversation } from '@/hooks/useAIConversations';

export function useCreateAIConversation() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (title?: string): Promise<AIConversation> => {
      if (!tenantId || !user?.id) throw new Error('No tenant o usuario');
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({ tenant_id: tenantId, user_id: user.id, title: title ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as AIConversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
  });
}
