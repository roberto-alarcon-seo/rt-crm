import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  status: string;
  first_login_required: boolean;
  last_login_at: string | null;
  created_at: string;
  tenant_role: string | null;
}

export interface InviteUserPayload {
  email: string;
  name: string;
  password: string;
  tenantRole: "administrador" | "manager" | "asesor";
}

export function useTeamUsers() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["team-users", tenantId],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, name, email, status, first_login_required, last_login_at, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const ids = (profiles ?? []).map((p) => p.id);
      if (ids.length === 0) return [] as TeamUser[];

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, tenant_role")
        .in("user_id", ids);

      const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.tenant_role]));
      return (profiles ?? []).map((p: any) => ({
        ...p,
        tenant_role: roleMap.get(p.id) ?? null,
      })) as TeamUser[];
    },
  });

  const invite = useMutation({
    mutationFn: async (payload: InviteUserPayload) => {
      const { data, error } = await supabase.functions.invoke("invite-tenant-user", {
        body: payload,
      });
      if (error) throw new Error(error.message);
      if (data?.error) {
        const err = new Error(data.error) as any;
        err.code = data.code;
        err.max_users = data.max_users;
        err.current_users = data.current_users;
        throw err;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-users", tenantId] });
      toast.success("Usuario creado correctamente");
    },
    onError: (err: any) => {
      if (err.code === "USER_LIMIT_REACHED") {
        toast.error(`Límite alcanzado: ${err.current_users}/${err.max_users} usuarios. Contacta a soporte para ampliar tu plan.`);
      } else {
        toast.error(err.message || "Error al crear usuario");
      }
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ tenant_role: role })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-users", tenantId] });
      toast.success("Rol actualizado");
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al actualizar rol");
    },
  });

  const resetPassword = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke("reset-tenant-user-password", {
        body: { userId, password },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-users", tenantId] });
      toast.success("Contraseña restablecida. El usuario deberá cambiarla al iniciar sesión.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error al restablecer contraseña");
    },
  });

  const remove = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-tenant-user", {
        body: { userId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-users", tenantId] });
      toast.success("Usuario eliminado");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Error al eliminar usuario");
    },
  });

  return { users, isLoading, invite, updateRole, resetPassword, remove };
}
