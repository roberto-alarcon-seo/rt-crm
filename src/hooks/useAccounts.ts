import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import { toast } from "sonner";

export interface Account {
  id: string;
  tenant_id: string;
  name: string;
  account_type: string;
  industry?: string;
  website?: string;
  country?: string;
  city?: string;
  employee_count?: string;
  gcp_ae_name?: string;
  gcp_ae_email?: string;
  pnh_account_id?: string;
  status: string;
  notes?: string;
  assigned_to?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountFormData {
  name: string;
  account_type: string;
  industry?: string;
  website?: string;
  country?: string;
  city?: string;
  employee_count?: string;
  gcp_ae_name?: string;
  gcp_ae_email?: string;
  notes?: string;
}

export function useAccounts() {
  const effectiveTenantId = useEffectiveTenantId();

  const { data: accounts = [], isLoading, error } = useQuery<Account[]>({
    queryKey: ["accounts", effectiveTenantId],
    enabled: !!effectiveTenantId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      if (!effectiveTenantId) return [];
      // Table will exist once migrations run; graceful empty return until then
      const { data, error } = await (supabase as any)
        .from("accounts")
        .select("*")
        .eq("tenant_id", effectiveTenantId)
        .eq("status", "active")
        .order("name");
      if (error) {
        if (error.code === "42P01") return []; // table doesn't exist yet
        throw error;
      }
      return (data || []) as Account[];
    },
  });

  return { accounts, isLoading, error };
}

export function useAccount(id?: string) {
  const effectiveTenantId = useEffectiveTenantId();

  const { data: account, isLoading: accountLoading } = useQuery<Account | null>({
    queryKey: ["account", id, effectiveTenantId],
    enabled: !!id && !!effectiveTenantId,
    queryFn: async () => {
      if (!id || !effectiveTenantId) return null;
      const { data, error } = await (supabase as any)
        .from("accounts")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", effectiveTenantId)
        .single();
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST116") return null;
        throw error;
      }
      return data as Account;
    },
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["account-contacts", id, effectiveTenantId],
    enabled: !!id && !!effectiveTenantId,
    queryFn: async () => {
      if (!id || !effectiveTenantId) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, email, phone, last_interaction_at, pipeline_stage")
        .eq("tenant_id", effectiveTenantId)
        .eq("account_id" as any, id)
        .order("name");
      if (error) return [];
      return data || [];
    },
  });

  return {
    account,
    contacts,
    isLoading: accountLoading || contactsLoading,
  };
}

export function useCreateAccount() {
  const effectiveTenantId = useEffectiveTenantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: AccountFormData) => {
      if (!effectiveTenantId) throw new Error("No tenant");
      const { data, error } = await (supabase as any)
        .from("accounts")
        .insert({ ...formData, tenant_id: effectiveTenantId, status: "active" })
        .select()
        .single();
      if (error) throw error;
      return data as Account;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", effectiveTenantId] });
      toast.success("Empresa creada");
    },
    onError: () => {
      toast.error("Error al crear empresa");
    },
  });
}

export function useUpdateAccount() {
  const effectiveTenantId = useEffectiveTenantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AccountFormData> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("accounts")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Account;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["accounts", effectiveTenantId] });
      queryClient.invalidateQueries({ queryKey: ["account", vars.id] });
      toast.success("Empresa actualizada");
    },
    onError: () => {
      toast.error("Error al actualizar empresa");
    },
  });
}
