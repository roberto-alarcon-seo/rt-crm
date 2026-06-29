import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ExecuteActionParams {
  conversationId: string;
  tool: string;
  params: Record<string, unknown>;
}

export function useExecuteAIAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, tool, params }: ExecuteActionParams) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No hay sesión activa');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-studio-action`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ conversation_id: conversationId, tool, params }),
        },
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      return json as { message: { id: string; content: { type: string; text: string } } };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai-messages', variables.conversationId] });
    },
  });
}
