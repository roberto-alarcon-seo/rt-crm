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
  display_mode: "floating" | "sidebar";
  bubble_icon: "logo" | "sparkles" | "bot" | "zap";
  powered_by_text: string;
  cta_buttons: Array<{ label: string; icon: string; url: string }>;
  header_subtitle: string;
  theme: "light" | "dark";
  product_chips: Array<{ label: string; icon: string; color: string; url: string }>;
  initial_suggestions: string[];
  created_at: string;
  updated_at: string;
}

export interface WidgetStats {
  sessions_this_week: number;
  leads_captured: number;
}

/**
 * `product_chips`, `cta_buttons` e `initial_suggestions` viajan como `Json` en el
 * esquema generado. Aquí se estrecha al contrato real que usan la UI y widget.js.
 */
type WidgetSettingsRow = Record<string, unknown>;

const asWidgetSettings = (row: WidgetSettingsRow | null): WidgetSettings | null =>
  row ? (row as unknown as WidgetSettings) : null;

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
      const { data, error } = await supabase
        .from("widget_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (error) {
        console.error("[useWidgetSettings] fetch error:", error);
        toast.error(`Error al cargar configuración del widget: ${error.message}`);
        return;
      }

      if (data) {
        setSettings(asWidgetSettings(data));
      } else {
        const { data: created, error: insertError } = await supabase
          .from("widget_settings")
          .insert({ tenant_id: tenantId })
          .select()
          .single();

        if (insertError) {
          console.error("[useWidgetSettings] insert error:", insertError);
          toast.error(`Error al crear configuración del widget: ${insertError.message}`);
          return;
        }
        if (created) setSettings(asWidgetSettings(created));
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
        .from("widget_sessions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", weekAgo),
      supabase
        .from("widget_sessions")
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
      if (!tenantId) { toast.error("Sin tenant"); return; }
      if (!settings) { toast.error("Configuración no cargada, recarga la página"); return; }
      setIsSaving(true);
      try {
        const { data, error } = await supabase
          .from("widget_settings")
          .update(updates as WidgetSettingsRow)
          .eq("tenant_id", tenantId)
          .select()
          .single();

        if (error) {
          console.error("[useWidgetSettings] save error:", error);
          throw new Error(error.message);
        }
        if (data) setSettings(asWidgetSettings(data));
        toast.success("Widget guardado");
      } catch (err) {
        toast.error(`Error al guardar: ${err instanceof Error ? err.message : "error desconocido"}`);
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
