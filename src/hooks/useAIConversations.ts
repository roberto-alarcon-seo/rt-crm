import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveTenantId } from '@/hooks/useEffectiveTenantId';

export interface AIConversation {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string | null;
  conversation_type: 'user' | 'system';
  unread: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export function useAIConversations() {
  const tenantId = useEffectiveTenantId();
  const { user } = useAuth();

  return useQuery({
    queryKey: ['ai-conversations', tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user?.id) return [];
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AIConversation[];
    },
    enabled: !!tenantId && !!user?.id,
  });
}
