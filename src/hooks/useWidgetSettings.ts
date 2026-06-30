import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface WidgetSettings {
  id: string;
  tenant_id: string;
  enabled: boolean;
  widget_token: string;
  greeting_name: string;
  greeting_message: string;
  primary_color: string | null;
  capture_name: boolean;
  capture_email: boolean;
  capture_phone: boolean;
  position: "bottom-right" | "bottom-left";
  initial_suggestions: string[];
  created_at: string;
  updated_at: string;
}

export interface WidgetStats {
  sessions_this_week: number;
  leads_captured: number;
}

export function useWidgetSettings() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? null;
  const [settings, setSettings] = useState<WidgetSettings | null>(null);
  const [stats, setStats] = useState<WidgetStats>({ sessions_this_week: 0, leads_captured: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("widget_settings" as never)
        .select("*")
        .eq("tenant_id", tenantId)
        .single();

      if (data) {
        setSettings(data as unknown as WidgetSettings);
      } else {
        // No settings row yet — create defaults
        const { data: created } = await supabase
          .from("widget_settings" as never)
          .insert({ tenant_id: tenantId })
          .select()
          .single();
        if (created) setSettings(created as unknown as WidgetSettings);
      }
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  const fetchStats = useCallback(async () => {
    if (!tenantId) return;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ count: total }, { count: converted }] = await Promise.all([
      supabase
        .from("widget_sessions" as never)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", weekAgo),
      supabase
        .from("widget_sessions" as never)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "converted"),
    ]);
    setStats({ sessions_this_week: total || 0, leads_captured: converted || 0 });
  }, [tenantId]);

  useEffect(() => {
    fetch();
    fetchStats();
  }, [fetch, fetchStats]);

  const save = useCallback(
    async (updates: Partial<Omit<WidgetSettings, "id" | "tenant_id" | "widget_token" | "created_at" | "updated_at">>) => {
      if (!tenantId || !settings) return;
      setIsSaving(true);
      try {
        const { data, error } = await supabase
          .from("widget_settings" as never)
          .update(updates as never)
          .eq("tenant_id", tenantId)
          .select()
          .single();

        if (error) throw error;
        setSettings(data as unknown as WidgetSettings);
        toast.success("Widget guardado");
      } catch {
        toast.error("Error al guardar el widget");
      } finally {
        setIsSaving(false);
      }
    },
    [tenantId, settings],
  );

  const regenerateToken = useCallback(async () => {
    if (!tenantId) return;
    const newToken = crypto.randomUUID();
    await save({ widget_token: newToken } as never);
    toast.success("Token regenerado — actualiza el código en tu sitio web");
  }, [tenantId, save]);

  return { settings, stats, isLoading, isSaving, save, regenerateToken, reload: fetch };
}
