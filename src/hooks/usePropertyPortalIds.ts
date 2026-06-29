import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PropertyPortalId {
  id: string;
  property_id: string;
  tenant_id: string;
  portal_id: string;
  portal_name: string | null;
  portal_url: string | null;
  created_at: string;
}

export function usePropertyPortalIds(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["property-portal-ids", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_portal_ids")
        .select("*")
        .eq("property_id", propertyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PropertyPortalId[];
    },
  });
}

export function usePropertyPortalIdMutations(propertyId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["property-portal-ids", propertyId];

  const add = useMutation({
    mutationFn: async (payload: {
      tenant_id: string;
      portal_id: string;
      portal_name: string | null;
      portal_url: string | null;
    }) => {
      const { error } = await supabase.from("property_portal_ids").insert({
        property_id: propertyId,
        ...payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "ID de portal agregado" });
    },
    onError: (e: Error) => {
      const msg = e.message.includes("unique")
        ? "Ese ID ya está registrado en este tenant."
        : e.message;
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("property_portal_ids")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "ID de portal eliminado" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return { add, remove };
}
