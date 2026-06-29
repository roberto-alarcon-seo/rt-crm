import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify caller session
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get caller profile + role
  const { data: callerProfile } = await supabaseAdmin
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!callerProfile?.tenant_id) {
    return new Response(JSON.stringify({ error: "Caller profile not found" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: callerRole } = await supabaseAdmin
    .from("user_roles")
    .select("global_role, tenant_role")
    .eq("user_id", user.id)
    .single();

  const isAdmin =
    callerRole?.global_role === "super_admin" ||
    callerRole?.tenant_role === "administrador" ||
    callerRole?.tenant_role === "owner";

  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Only administrators can reset passwords" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { userId, password } = await req.json();

    if (!userId || !password) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify target user belongs to the same tenant
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id, name, email")
      .eq("id", userId)
      .single();

    if (!targetProfile || targetProfile.tenant_id !== callerProfile.tenant_id) {
      return new Response(JSON.stringify({ error: "User not found in your tenant" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reset password via Admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
    });

    if (updateError) {
      console.error("Error resetting password:", updateError);
      return new Response(JSON.stringify({ error: updateError.message || "Error resetting password" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark first_login_required so they go through the change-password flow
    await supabaseAdmin
      .from("profiles")
      .update({ first_login_required: true, status: "active" })
      .eq("id", userId);

    // Log security event
    await supabaseAdmin.from("security_events").insert({
      event_type: "tenant_user_password_reset",
      user_id: user.id,
      tenant_id: callerProfile.tenant_id,
      metadata: {
        target_user_id: userId,
        target_email: targetProfile.email,
        reset_by: user.id,
      },
    });

    console.log(`Password reset for user ${userId} by admin ${user.id}`);

    return new Response(JSON.stringify({ success: true, message: "Contraseña restablecida correctamente" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in reset-tenant-user-password:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
