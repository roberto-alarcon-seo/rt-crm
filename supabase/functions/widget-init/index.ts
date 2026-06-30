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

    // 4. Resolve primary color and logo from partner branding
    let primaryColor = settings.primary_color;
    let logoUrl: string | null = null;

    const { data: partner } = await supabase
      .from("partners")
      .select("primary_color_hex, branding")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (partner) {
      if (!primaryColor) {
        primaryColor = (partner.branding as Record<string, string> | null)?.primary_color
          ? `hsl(${(partner.branding as Record<string, string>).primary_color})`
          : partner.primary_color_hex || "#6366F1";
      }
      const branding = partner.branding as Record<string, string> | null;
      logoUrl = branding?.logo_collapsed_light_url || branding?.logo_expanded_light_url || null;
    }

    if (!primaryColor) primaryColor = "#6366F1";

    return new Response(JSON.stringify({
      session_token: session.session_token,
      config: {
        greeting_name: settings.greeting_name,
        greeting_message: settings.greeting_message,
        primary_color: primaryColor,
        logo_url: logoUrl,
        position: settings.position,
        display_mode: (settings as Record<string, unknown>).display_mode || "floating",
        bubble_icon: (settings as Record<string, unknown>).bubble_icon || "logo",
        powered_by_text: (settings as Record<string, unknown>).powered_by_text || "RT CRM",
        cta_buttons: (settings as Record<string, unknown>).cta_buttons || [],
        header_subtitle: (settings as Record<string, unknown>).header_subtitle || "",
        theme: (settings as Record<string, unknown>).theme || "light",
        product_chips: (settings as Record<string, unknown>).product_chips || [],
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
