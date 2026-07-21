import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import { toast } from "sonner";

/**
 * Account Executives y las organizaciones a las que pertenecen.
 *
 * El módulo nació soldado a Google Cloud; ahora un AE pertenece a una
 * organización (Google Cloud, Oracle, Salesforce, AWS…) y una empresa puede
 * tener AEs de VARIAS organizaciones a la vez — el selector de organización
 * filtra la búsqueda, no restringe la cuenta.
 *
 * El catálogo es interno a propósito: los AEs son externos (@google.com,
 * @oracle.com), así que ni un directorio corporativo ni los contactos
 * personales del usuario son una fuente fiable.
 */

export interface AeOrganization {
  id: string;
  tenant_id: string;
  name: string;
  website?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AccountExecutive {
  id: string;
  tenant_id: string;
  organization_id?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  region?: string | null;
  title?: string | null;
  is_active: boolean;
  created_at: string;
  /** Nombre de la organización, resuelto en el join. */
  organization_name?: string | null;
}

/** AE tal como viene vinculado a una empresa concreta. */
export interface LinkedAccountExecutive extends AccountExecutive {
  is_primary: boolean;
}

export interface AccountExecutiveInput {
  name: string;
  organization_id: string;
  email?: string | null;
  phone?: string | null;
  region?: string | null;
  title?: string | null;
}

/** Aplana el join anidado de PostgREST a un campo plano. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenExecutive(row: any): AccountExecutive {
  const { ae_organizations, ...rest } = row;
  return { ...rest, organization_name: ae_organizations?.name ?? null };
}

/* ─────────────────────────── Organizaciones ─────────────────────────── */

export function useAeOrganizations() {
  const effectiveTenantId = useEffectiveTenantId();

  const { data: organizations = [], isLoading } = useQuery<AeOrganization[]>({
    queryKey: ["ae-organizations", effectiveTenantId],
    enabled: !!effectiveTenantId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      if (!effectiveTenantId) return [];
      const { data, error } = await (supabase as any)
        .from("ae_organizations")
        .select("*")
        .eq("tenant_id", effectiveTenantId)
        .eq("is_active", true)
        .order("name");
      if (error) {
        if (error.code === "42P01") return []; // tabla aún no migrada
        throw error;
      }
      return (data || []) as AeOrganization[];
    },
  });

  return { organizations, isLoading };
}

/** Alta de organización desde el propio selector (tenants nuevos empiezan vacíos). */
export function useCreateAeOrganization() {
  const effectiveTenantId = useEffectiveTenantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; website?: string | null }) => {
      if (!effectiveTenantId) throw new Error("No tenant");
      const { data, error } = await (supabase as any)
        .from("ae_organizations")
        .insert({
          tenant_id: effectiveTenantId,
          name: input.name.trim(),
          website: input.website?.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AeOrganization;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ae-organizations", effectiveTenantId] });
      toast.success("Organización creada");
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      if (error?.code === "23505") {
        toast.error("Ya existe una organización con ese nombre");
      } else {
        toast.error("Error al crear la organización");
      }
    },
  });
}

/* ──────────────────────── Account Executives ───────────────────────── */

/**
 * Catálogo de AEs del tenant. `organizationId` filtra por organización; sin él
 * devuelve todos (necesario para poder pintar los chips ya seleccionados
 * aunque pertenezcan a otra organización que la del filtro activo).
 */
export function useAccountExecutives(organizationId?: string | null) {
  const effectiveTenantId = useEffectiveTenantId();

  const { data: executives = [], isLoading } = useQuery<AccountExecutive[]>({
    queryKey: ["account-executives", effectiveTenantId, organizationId ?? "all"],
    enabled: !!effectiveTenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!effectiveTenantId) return [];
      let query = (supabase as any)
        .from("account_executives")
        .select("*, ae_organizations(id, name)")
        .eq("tenant_id", effectiveTenantId)
        .eq("is_active", true)
        .order("name");
      if (organizationId) query = query.eq("organization_id", organizationId);

      const { data, error } = await query;
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data || []).map(flattenExecutive);
    },
  });

  return { executives, isLoading };
}

/** AEs vinculados a una empresa, el principal primero. */
export function useLinkedExecutives(accountId?: string) {
  const effectiveTenantId = useEffectiveTenantId();

  const { data: linked = [], isLoading } = useQuery<LinkedAccountExecutive[]>({
    queryKey: ["account-executives-linked", accountId, effectiveTenantId],
    enabled: !!accountId && !!effectiveTenantId,
    queryFn: async () => {
      if (!accountId || !effectiveTenantId) return [];
      const { data, error } = await (supabase as any)
        .from("account_executives_link")
        .select("is_primary, account_executives(*, ae_organizations(id, name))")
        .eq("account_id", accountId)
        .eq("tenant_id", effectiveTenantId);
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data || []) as any[])
        .filter(row => row.account_executives)
        .map(row => ({
          ...flattenExecutive(row.account_executives),
          is_primary: row.is_primary,
        }))
        .sort((a, b) =>
          a.is_primary === b.is_primary
            ? a.name.localeCompare(b.name)
            : a.is_primary ? -1 : 1
        ) as LinkedAccountExecutive[];
    },
  });

  return { linked, isLoading };
}

/** Alta en línea desde el propio selector, sin salir del formulario. */
export function useCreateAccountExecutive() {
  const effectiveTenantId = useEffectiveTenantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AccountExecutiveInput) => {
      if (!effectiveTenantId) throw new Error("No tenant");
      const { data, error } = await (supabase as any)
        .from("account_executives")
        .insert({
          tenant_id: effectiveTenantId,
          organization_id: input.organization_id,
          name: input.name.trim(),
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          region: input.region?.trim() || null,
          title: input.title?.trim() || null,
        })
        .select("*, ae_organizations(id, name)")
        .single();
      if (error) throw error;
      return flattenExecutive(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-executives"] });
      toast.success("Account Executive creado");
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      // Índice único por (tenant, email)
      if (error?.code === "23505") {
        toast.error("Ya existe un AE con ese email");
      } else {
        toast.error("Error al crear el Account Executive");
      }
    },
  });
}

/**
 * Reemplaza en bloque los AEs de una empresa. Borra los vínculos que ya no
 * están y agrega los nuevos, en lugar de vaciar y reinsertar todo — así no se
 * pierde el created_at de los que siguen asignados.
 */
export function useSetAccountExecutives() {
  const effectiveTenantId = useEffectiveTenantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      accountId,
      aeIds,
      primaryId,
    }: {
      accountId: string;
      aeIds: string[];
      primaryId?: string | null;
    }) => {
      if (!effectiveTenantId) throw new Error("No tenant");

      const { data: existingRows, error: readErr } = await (supabase as any)
        .from("account_executives_link")
        .select("ae_id, is_primary")
        .eq("account_id", accountId)
        .eq("tenant_id", effectiveTenantId);
      if (readErr) throw readErr;

      const existing = (existingRows || []) as { ae_id: string; is_primary: boolean }[];
      const existingIds = existing.map(r => r.ae_id);
      const toRemove = existingIds.filter(id => !aeIds.includes(id));
      const toAdd = aeIds.filter(id => !existingIds.includes(id));

      if (toRemove.length) {
        const { error } = await (supabase as any)
          .from("account_executives_link")
          .delete()
          .eq("account_id", accountId)
          .in("ae_id", toRemove);
        if (error) throw error;
      }

      // El índice único parcial permite un solo principal por empresa, así que
      // hay que bajar el flag anterior ANTES de subir el nuevo.
      const { error: clearErr } = await (supabase as any)
        .from("account_executives_link")
        .update({ is_primary: false })
        .eq("account_id", accountId)
        .eq("is_primary", true);
      if (clearErr) throw clearErr;

      if (toAdd.length) {
        const { error } = await (supabase as any)
          .from("account_executives_link")
          .insert(toAdd.map(ae_id => ({
            account_id: accountId,
            ae_id,
            tenant_id: effectiveTenantId,
            is_primary: false,
          })));
        if (error) throw error;
      }

      const effectivePrimary = primaryId && aeIds.includes(primaryId) ? primaryId : aeIds[0];
      if (effectivePrimary) {
        const { error } = await (supabase as any)
          .from("account_executives_link")
          .update({ is_primary: true })
          .eq("account_id", accountId)
          .eq("ae_id", effectivePrimary);
        if (error) throw error;
      }

      return { count: aeIds.length };
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["account-executives-linked", vars.accountId] });
    },
    onError: () => {
      toast.error("Error al guardar los Account Executives");
    },
  });
}
