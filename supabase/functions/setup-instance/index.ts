import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Require global super_admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("global_role, partner_scope")
      .eq("user_id", user.id)
      .single();

    if (roleRow?.global_role !== "super_admin" || roleRow?.partner_scope !== null) {
      return new Response(JSON.stringify({ success: false, error: "Requiere super_admin global" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: only one partner allowed per instance
    const { data: existingPartner } = await supabaseAdmin
      .from("partners")
      .select("id, name")
      .limit(1)
      .maybeSingle();

    if (existingPartner) {
      return new Response(JSON.stringify({
        success: false,
        error: `Esta instancia ya tiene un partner: "${existingPartner.name}" (${existingPartner.id})`,
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const {
      id,                          // slug: "mlslatam"
      name,                        // "MLS LATAM"
      primaryDomain,               // "app.mlslatam.com"
      countryCode = "MX",
      logoUrl,
      primaryColorHex,             // "#1a73e8"
      primaryColorHsl,             // "213 89% 50%"
      emailSenderName,             // "MLS LATAM"
      emailSenderAddress,          // "no-reply@mlslatam.com"
      initialCredits = 0,
      dashboardUrl = null,
      logoutRedirectUrl = null,
    } = body;

    const missing = ["id", "name", "primaryDomain", "logoUrl", "primaryColorHex", "primaryColorHsl", "emailSenderName", "emailSenderAddress"]
      .filter((k) => !body[k]);
    if (missing.length) {
      return new Response(JSON.stringify({ success: false, error: `Campos requeridos faltantes: ${missing.join(", ")}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof initialCredits !== "number" || initialCredits < 0) {
      return new Response(JSON.stringify({ success: false, error: "initialCredits debe ser un número >= 0" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create partner
    const { data: partner, error: partnerError } = await supabaseAdmin
      .from("partners")
      .insert({
        id,
        name,
        primary_domain: primaryDomain,
        country_code: countryCode,
        logo_url: logoUrl,
        primary_color_hex: primaryColorHex,
        primary_color_hsl: primaryColorHsl,
        email_sender_name: emailSenderName,
        email_sender_address: emailSenderAddress,
        dashboard_url: dashboardUrl,
        logout_redirect_url: logoutRedirectUrl,
        is_active: true,
      })
      .select()
      .single();

    if (partnerError) {
      return new Response(JSON.stringify({ success: false, error: partnerError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create wallet
    const { error: walletError } = await supabaseAdmin
      .from("partner_super_wallets")
      .insert({ partner_id: id, balance_credits: initialCredits });

    if (walletError) {
      await supabaseAdmin.from("partners").delete().eq("id", id);
      return new Response(JSON.stringify({ success: false, error: walletError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log initial credits in ledger
    if (initialCredits > 0) {
      await supabaseAdmin.from("partner_wallet_ledger").insert({
        partner_id: id,
        movement_type: "TOPUP",
        amount: initialCredits,
        balance_before: 0,
        balance_after: initialCredits,
        actor_user_id: user.id,
        description: "Créditos iniciales de configuración",
      });
    }

    return new Response(JSON.stringify({
      success: true,
      partner,
      wallet: { balance_credits: initialCredits },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("setup-instance error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
