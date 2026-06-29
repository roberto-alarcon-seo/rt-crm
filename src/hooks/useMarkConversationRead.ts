import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';
import { useAuth } from '@/contexts/AuthContext';

export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  const tenantId = useEffectiveTenantId();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('ai_conversations')
        .update({ unread: false })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations', tenantId, user?.id] });
    },
  });
}
