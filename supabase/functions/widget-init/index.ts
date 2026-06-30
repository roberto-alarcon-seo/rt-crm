import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      widget_token,
      session_token,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      landing_page,
      referrer,
    } = body;

    if (!widget_token) {
      return new Response(JSON.stringify({ error: "widget_token requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Validate widget token and get config
    const { data: settings, error: settingsError } = await supabase
      .from("widget_settings")
      .select("*")
      .eq("widget_token", widget_token)
      .eq("enabled", true)
      .single();

    if (settingsError || !settings) {
      return new Response(JSON.stringify({ error: "Widget no encontrado o desactivado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Try to resume existing session
    let session = null;
    if (session_token) {
      const { data: existing } = await supabase
        .from("widget_sessions")
        .select("*")
        .eq("session_token", session_token)
        .eq("tenant_id", settings.tenant_id)
        .neq("status", "expired")
        .single();
      if (existing) session = existing;
    }

    // 3. Create new session if none found
    if (!session) {
      const { data: newSession, error: sessionError } = await supabase
        .from("widget_sessions")
        .insert({
          tenant_id: settings.tenant_id,
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: utm_term || null,
          landing_page: landing_page || null,
          referrer: referrer || null,
          messages: [],
        })
        .select()
        .single();

      if (sessionError || !newSession) {
        throw new Error("Error creando sesión: " + (sessionError?.message || "unknown"));
      }
      session = newSession;
    }

    // 4. Resolve primary color (widget setting → tenant branding → default)
    let primaryColor = settings.primary_color;
    if (!primaryColor) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("branding")
        .eq("id", settings.tenant_id)
        .single();
      primaryColor = (tenant?.branding as Record<string, string> | null)?.primary_color || "#6366F1";
    }

    return new Response(JSON.stringify({
      session_token: session.session_token,
      config: {
        greeting_name: settings.greeting_name,
        greeting_message: settings.greeting_message,
        primary_color: primaryColor,
        position: settings.position,
        capture_name: settings.capture_name,
        capture_email: settings.capture_email,
        capture_phone: settings.capture_phone,
        initial_suggestions: settings.initial_suggestions || [],
      },
      messages: session.messages || [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[widget-init] error:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
