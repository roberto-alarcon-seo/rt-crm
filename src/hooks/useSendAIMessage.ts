import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AIMessage } from '@/hooks/useAIMessages';

export interface SendMessageParams {
  prompt: string;
  conversationId: string | null;
}

export interface SendMessageResult {
  conversation_id: string;
  message: AIMessage;
}

export function useSendAIMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ prompt, conversationId }: SendMessageParams): Promise<SendMessageResult> => {
      const { data, error } = await supabase.functions.invoke('ai-studio-chat', {
        body: { prompt, conversation_id: conversationId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as SendMessageResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['ai-messages', result.conversation_id] });
    },
    onError: (err: Error) => {
      toast.error('Error al enviar mensaje', { description: err.message });
    },
  });
}
