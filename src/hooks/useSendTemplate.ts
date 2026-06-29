import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SendTemplateParams {
  conversationId: string;
  templateId: string;
  variables: Record<string, string>;
}

export interface SendTemplateResponse {
  message_id: string;
  provider_message_id: string | null;
  status: string;
  wallet_balance: number;
}

export interface SendTemplateError {
  code: string;
  message: string;
  details?: string;
}

export function useSendTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendTemplateParams): Promise<SendTemplateResponse> => {
      const { data, error } = await supabase.functions.invoke('send-template-message', {
        body: {
          conversation_id: params.conversationId,
          template_id: params.templateId,
          variables: params.variables,
        },
      });

      if (error) {
        // FunctionsHttpError wraps the real response — extract the JSON body for a useful error code.
        try {
          const ctx = (error as unknown as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json() as { code?: string; message?: string; details?: string };
            if (body?.code) throw { code: body.code, message: body.message, details: body.details };
          }
        } catch (inner) {
          const structured = inner as { code?: string };
          if (structured?.code) throw inner;
        }
        throw { code: 'NETWORK_ERROR', message: error.message };
      }

      if (data?.code && data.code !== 'SUCCESS') {
        throw { code: data.code, message: data.message };
      }

      return data as SendTemplateResponse;
    },
    onSuccess: (data, variables) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      // New credits source-of-truth (tenants) used by header + plans modal
      queryClient.invalidateQueries({ queryKey: ['tenant-credits'] });
      toast.success('Plantilla enviada correctamente');
    },
    onError: (error: SendTemplateError) => {
      if (error.code === 'INSUFFICIENT_BALANCE') {
        toast.error('Saldo insuficiente', { description: 'Recarga mensajes para continuar' });
      } else if (error.code === 'TEMPLATE_NOT_APPROVED') {
        toast.error('Plantilla no aprobada', { description: 'Solo puedes enviar plantillas aprobadas' });
      } else if (error.code === 'SEND_FAILED') {
        toast.error('Error al enviar', { description: error.details || error.message });
      } else {
        toast.error(`Error [${error.code}]`, { description: error.details || error.message });
      }
    },
  });
}
