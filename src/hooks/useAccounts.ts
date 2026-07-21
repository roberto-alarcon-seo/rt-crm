import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import { removeAccountDocumentFiles } from "@/hooks/useAccountDocuments";
import { toast } from "sonner";

/** Campos capturables de una empresa, compartidos por el editor y la ficha. */
export interface AccountFields {
  name: string;
  account_type: string;
  industry?: string;
  website?: string;
  country?: string;
  city?: string;
  employee_count?: string;
  notes?: string;

  // Fiscales / legales
  legal_name?: string;
  tax_id?: string;
  tax_regime?: string;
  fiscal_street?: string;
  fiscal_ext_number?: string;
  fiscal_int_number?: string;
  fiscal_neighborhood?: string;
  fiscal_zip?: string;
  fiscal_state?: string;
  fiscal_country?: string;
  incorporation_country?: string;

  // Firmográficos
  annual_revenue?: number | null;
  revenue_currency?: string;
  locations_count?: number | null;
  parent_company?: string;
  stock_ticker?: string;
  founded_year?: number | null;
  linkedin_url?: string;

  // Comerciales / CRM
  account_tier?: string;
  lifecycle_stage?: string;
  lead_source?: string;
  preferred_currency?: string;
  /** Owner interno de la cuenta (usuario del CRM). */
  assigned_to?: string | null;

  // Contacto / operación
  main_phone?: string;
  general_email?: string;
  email_domains?: string[];
  timezone?: string;

  /**
   * LEGACY: sustituidos por account_executives + account_executives_link.
   * Se siguen leyendo para no romper AccountDetailPanel ni datos históricos.
   */
  gcp_ae_name?: string;
  gcp_ae_email?: string;
}

export interface Account extends AccountFields {
  id: string;
  tenant_id: string;
  pnh_account_id?: string;
  status: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type AccountFormData = AccountFields;

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
      const { data, error } = await (supabase as any)
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

/** Campos numéricos: un "" del formulario rompe el INSERT en columnas numeric/int. */
const NUMERIC_FIELDS = ["annual_revenue", "locations_count", "founded_year"] as const;

/**
 * Convierte los vacíos del formulario en NULL antes de mandarlos a Postgres.
 * Sin esto, un `annual_revenue: ""` aborta el guardado completo con
 * "invalid input syntax for type numeric".
 */
function normalizeAccountPayload<T extends Record<string, any>>(payload: T): T {
  const out: Record<string, any> = { ...payload };
  for (const [key, value] of Object.entries(out)) {
    if (value === "" || value === undefined) {
      out[key] = null;
    } else if ((NUMERIC_FIELDS as readonly string[]).includes(key) && typeof value === "string") {
      const n = Number(value);
      out[key] = Number.isFinite(n) ? n : null;
    }
  }
  // Un array vacío de dominios se guarda como {} y no como NULL, para poder
  // distinguir "sin dominios" de "nunca se capturó".
  if (Array.isArray(payload.email_domains)) {
    out.email_domains = payload.email_domains.filter(Boolean);
  }
  return out as T;
}

export function useCreateAccount() {
  const effectiveTenantId = useEffectiveTenantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: AccountFormData) => {
      if (!effectiveTenantId) throw new Error("No tenant");
      const { data, error } = await (supabase as any)
        .from("accounts")
        .insert({
          ...normalizeAccountPayload(formData),
          name: formData.name,
          tenant_id: effectiveTenantId,
          status: "active",
        })
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
        .update({ ...normalizeAccountPayload(updates), updated_at: new Date().toISOString() })
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

/** Mapa accountId → nº de contactos vinculados (para la lista de empresas). */
export function useAccountContactCounts() {
  const effectiveTenantId = useEffectiveTenantId();

  const { data = {} } = useQuery<Record<string, number>>({
    queryKey: ["account-contact-counts", effectiveTenantId],
    enabled: !!effectiveTenantId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!effectiveTenantId) return {};
      const { data, error } = await (supabase as any)
        .from("contacts")
        .select("account_id")
        .eq("tenant_id", effectiveTenantId)
        .neq("status", "deleted")
        .not("account_id", "is", null);
      if (error) return {};
      const counts: Record<string, number> = {};
      (data || []).forEach((r: { account_id: string | null }) => {
        if (r.account_id) counts[r.account_id] = (counts[r.account_id] || 0) + 1;
      });
      return counts;
    },
  });

  return data;
}

/** Count of contacts linked to an account — used to warn before deleting. */
export function useAccountContactCount(accountId?: string, enabled = true) {
  const effectiveTenantId = useEffectiveTenantId();

  const { data: count = 0, isLoading } = useQuery<number>({
    queryKey: ["account-contact-count", accountId, effectiveTenantId],
    enabled: !!accountId && !!effectiveTenantId && enabled,
    queryFn: async () => {
      if (!accountId || !effectiveTenantId) return 0;
      const { count, error } = await (supabase as any)
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", effectiveTenantId)
        .eq("account_id", accountId);
      if (error) return 0;
      return count ?? 0;
    },
  });

  return { count, isLoading };
}

/**
 * Busca otra empresa del tenant con el mismo RFC / Tax ID.
 *
 * No hay constraint UNIQUE en la columna a propósito: puede haber duplicados
 * históricos legítimos y una migración que falle a media aplicación es peor.
 * El aviso se da aquí, sin bloquear el guardado.
 */
export function useDuplicateTaxId(taxId?: string, excludeAccountId?: string) {
  const effectiveTenantId = useEffectiveTenantId();
  const normalized = taxId?.trim().toUpperCase() ?? "";

  const { data: duplicate = null } = useQuery<{ id: string; name: string } | null>({
    queryKey: ["account-duplicate-tax-id", normalized, excludeAccountId, effectiveTenantId],
    enabled: !!effectiveTenantId && normalized.length >= 10,
    staleTime: 30 * 1000,
    queryFn: async () => {
      if (!effectiveTenantId || normalized.length < 10) return null;
      let query = (supabase as any)
        .from("accounts")
        .select("id, name")
        .eq("tenant_id", effectiveTenantId)
        .ilike("tax_id", normalized)
        .limit(1);
      if (excludeAccountId) query = query.neq("id", excludeAccountId);

      const { data, error } = await query;
      if (error) return null;
      return (data && data[0]) || null;
    },
  });

  return duplicate;
}

/**
 * Hard-deletes an account and everything related (contacts, opportunities,
 * attribution, vendor registrations, relationships) via a server-side
 * transactional function. Irreversible.
 *
 * Los documentos en Storage se limpian ANTES de la RPC: account_documents es
 * ON DELETE CASCADE, así que en cuanto se borra la empresa se pierden las
 * rutas y los archivos quedarían huérfanos en el bucket sin forma de
 * localizarlos. delete_account_cascade no puede hacerlo por sí sola porque
 * Postgres no habla con la API de Storage.
 */
export function useDeleteAccount() {
  const effectiveTenantId = useEffectiveTenantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accountId: string) => {
      // El tenant sale de la propia empresa y no del contexto: un super admin
      // puede estar borrando una empresa de otro tenant, y la ruta en Storage
      // lleva el tenant dueño del archivo.
      const { data: row } = await (supabase as any)
        .from("accounts")
        .select("tenant_id")
        .eq("id", accountId)
        .maybeSingle();
      const ownerTenantId = row?.tenant_id ?? effectiveTenantId;

      let orphanedFiles: string[] = [];
      if (ownerTenantId) {
        try {
          orphanedFiles = await removeAccountDocumentFiles(ownerTenantId, accountId);
        } catch {
          // Un fallo limpiando archivos no debe impedir borrar la empresa: la
          // intención del usuario es eliminarla. Se avisa y se sigue.
          orphanedFiles = ["*"];
        }
      }

      const { data, error } = await (supabase as any).rpc("delete_account_cascade", {
        p_account_id: accountId,
      });
      if (error) throw error;
      return {
        ...(data as { deleted: boolean; deleted_contacts: number }),
        orphanedFiles,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["accounts", effectiveTenantId] });
      if (result.orphanedFiles.length) {
        toast.warning("La empresa se eliminó, pero quedaron documentos sin borrar", {
          description: "Sus archivos siguen en almacenamiento. Reporta esto a soporte.",
        });
      }
    },
    onError: () => {
      toast.error("Error al eliminar empresa");
    },
  });
}
