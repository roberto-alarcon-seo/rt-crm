import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useAIMessageFeedback(conversationId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, feedback }: { messageId: string; feedback: 'positive' | 'negative' | null }) => {
      const { error } = await supabase
        .from('ai_messages')
        .update({ feedback })
        .eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: ['ai-messages', conversationId] });
      }
    },
  });
}
