import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import { toast } from "sonner";

/**
 * "Empresas a cargo" de un proyecto/cuenta. Sustituye al catálogo ae_organizations
 * y a la tabla account_executives: la empresa a cargo es una EMPRESA real del CRM
 * (accounts) y los ejecutivos son sus CONTACTOS (contacts.account_id). Un proyecto
 * puede tener varias empresas a cargo (proveedor + tercero que refiere), cada una
 * con su rol.
 */

export type PartnerRole = "proveedor" | "referidor" | "otro";

export const PARTNER_ROLES: { value: PartnerRole; label: string }[] = [
  { value: "proveedor", label: "Proveedor" },
  { value: "referidor", label: "Referidor" },
  { value: "otro", label: "Otro" },
];

export interface PartnerContact {
  id: string;            // account_partner_contacts.id
  contact_id: string;
  name: string;
  email: string | null;
  job_title: string | null;
}

export interface ProjectPartner {
  id: string;            // account_project_partners.id
  account_id: string;
  partner_account_id: string;
  partner_name: string;
  role: PartnerRole;
  notes: string | null;
  contacts: PartnerContact[];
}

export interface SimpleContact {
  id: string;
  name: string;
  email: string | null;
  job_title: string | null;
}

// ─── Contactos que pertenecen a una empresa (contacts.account_id) ─────────────
export function useContactsByAccount(accountId?: string | null) {
  const tenantId = useEffectiveTenantId();
  return useQuery<SimpleContact[]>({
    queryKey: ["contacts-by-account", accountId, tenantId],
    enabled: !!accountId && !!tenantId,
    queryFn: async () => {
      if (!accountId || !tenantId) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, email, job_title")
        .eq("tenant_id", tenantId)
        .eq("account_id", accountId)
        .neq("status", "deleted")
        .order("name");
      if (error) throw error;
      return (data ?? []) as SimpleContact[];
    },
  });
}

// ─── Empresas a cargo (+ sus contactos) de una cuenta ─────────────────────────
export function useAccountPartners(accountId?: string) {
  const tenantId = useEffectiveTenantId();

  return useQuery<ProjectPartner[]>({
    queryKey: ["account-partners", accountId, tenantId],
    enabled: !!accountId && !!tenantId,
    queryFn: async () => {
      if (!accountId || !tenantId) return [];
      const { data, error } = await supabase
        .from("account_project_partners")
        .select(`
          id, account_id, partner_account_id, role, notes,
          partner:accounts!account_project_partners_partner_account_id_fkey(name),
          contacts:account_partner_contacts(
            id, contact_id,
            contact:contacts!account_partner_contacts_contact_id_fkey(name, email, job_title)
          )
        `)
        .eq("account_id", accountId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((row) => ({
        id: row.id,
        account_id: row.account_id,
        partner_account_id: row.partner_account_id,
        partner_name: row.partner?.name ?? "Empresa",
        role: row.role as PartnerRole,
        notes: row.notes ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contacts: (row.contacts ?? []).map((c: any) => ({
          id: c.id,
          contact_id: c.contact_id,
          name: c.contact?.name ?? "Contacto",
          email: c.contact?.email ?? null,
          job_title: c.contact?.job_title ?? null,
        })),
      }));
    },
  });
}

// ─── Agregar una empresa a cargo al proyecto ──────────────────────────────────
export function useAddProjectPartner() {
  const tenantId = useEffectiveTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, partnerAccountId, role = "proveedor" }: {
      accountId: string; partnerAccountId: string; role?: PartnerRole;
    }) => {
      if (!tenantId) throw new Error("No tenant");
      const { error } = await supabase.from("account_project_partners").insert({
        tenant_id: tenantId, account_id: accountId, partner_account_id: partnerAccountId, role,
      });
      if (error) throw error;
      return accountId;
    },
    onSuccess: (accountId) => {
      qc.invalidateQueries({ queryKey: ["account-partners", accountId] });
      toast.success("Empresa a cargo agregada");
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      if (err?.code === "23505") toast.error("Esa empresa ya está a cargo del proyecto");
      else toast.error("Error al agregar la empresa", { description: err?.message });
    },
  });
}

export function useUpdateProjectPartnerRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accountId, role }: { id: string; accountId: string; role: PartnerRole }) => {
      const { error } = await supabase.from("account_project_partners").update({ role }).eq("id", id);
      if (error) throw error;
      return accountId;
    },
    onSuccess: (accountId) => qc.invalidateQueries({ queryKey: ["account-partners", accountId] }),
    onError: (err: Error) => toast.error("Error al cambiar el rol", { description: err.message }),
  });
}

export function useRemoveProjectPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accountId }: { id: string; accountId: string }) => {
      const { error } = await supabase.from("account_project_partners").delete().eq("id", id);
      if (error) throw error;
      return accountId;
    },
    onSuccess: (accountId) => {
      qc.invalidateQueries({ queryKey: ["account-partners", accountId] });
      toast.success("Empresa a cargo eliminada");
    },
    onError: (err: Error) => toast.error("Error al eliminar", { description: err.message }),
  });
}

// ─── Asignar / quitar contactos de una empresa a cargo ────────────────────────
export function useAddPartnerContact() {
  const tenantId = useEffectiveTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectPartnerId, contactId, accountId }: {
      projectPartnerId: string; contactId: string; accountId: string;
    }) => {
      if (!tenantId) throw new Error("No tenant");
      const { error } = await supabase.from("account_partner_contacts").insert({
        tenant_id: tenantId, project_partner_id: projectPartnerId, contact_id: contactId,
      });
      if (error) throw error;
      return accountId;
    },
    onSuccess: (accountId) => qc.invalidateQueries({ queryKey: ["account-partners", accountId] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      if (err?.code === "23505") toast.error("Ese contacto ya está asignado");
      else toast.error("Error al asignar el contacto", { description: err?.message });
    },
  });
}

export function useRemovePartnerContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accountId }: { id: string; accountId: string }) => {
      const { error } = await supabase.from("account_partner_contacts").delete().eq("id", id);
      if (error) throw error;
      return accountId;
    },
    onSuccess: (accountId) => qc.invalidateQueries({ queryKey: ["account-partners", accountId] }),
    onError: (err: Error) => toast.error("Error al quitar el contacto", { description: err.message }),
  });
}
