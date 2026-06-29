import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AIMessageType =
  | 'text'
  | 'report-chart'
  | 'table'
  | 'insight'
  | 'insight-daily'
  | 'action-confirm'
  | 'list'
  | 'error'
  | 'loading';

export interface AIMessageContent {
  type: AIMessageType;
  text?: string;
  data?: unknown;
  chartType?: 'bar' | 'line' | 'pie' | 'funnel';
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: AIMessageContent;
  created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useAIMessages(conversationId: string | null) {
  const isValidId = !!conversationId && UUID_RE.test(conversationId);

  return useQuery({
    queryKey: ['ai-messages', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AIMessage[];
    },
    enabled: isValidId,
  });
}
