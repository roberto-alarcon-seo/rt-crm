import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useForceApproveTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      // Allow super_admin (global) or administrador (tenant role)
      const { data: globalRole } = await supabase
        .from('user_roles')
        .select('global_role, tenant_role')
        .eq('user_id', user.id)
        .maybeSingle();

      const isSuperAdmin = globalRole?.global_role === 'super_admin';

      if (!isSuperAdmin) {
        if (globalRole?.tenant_role !== 'administrador') {
          throw new Error('Solo un administrador puede forzar la aprobación');
        }
      }

      const { error } = await supabase
        .from('templates')
        .update({ approval_status: 'approved', rejection_reason: null })
        .eq('id', templateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Plantilla marcada como aprobada');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Error al actualizar el estado');
    },
  });
}
