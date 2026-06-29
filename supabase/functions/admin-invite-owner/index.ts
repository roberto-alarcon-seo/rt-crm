import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateTenantUserRequest {
  tenantId: string;
  ownerEmail: string;
  ownerName: string;
  password: string;
  isTemporary: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify caller is super_admin
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !callerUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: callerRole, error: roleError } = await supabaseAdmin
    .from("user_roles").select("global_role").eq("user_id", callerUser.id).single();
  if (roleError || callerRole?.global_role !== "super_admin") {
    return new Response(JSON.stringify({ error: "Only super_admin can perform this action" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    // ── CREATE tenant admin with password ────────────────────────────────────
    if (path === "invite" || path === "admin-invite-owner") {
      const { tenantId, ownerEmail, ownerName, password, isTemporary }: CreateTenantUserRequest =
        await req.json();

      if (!tenantId || !ownerEmail || !ownerName || !password) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Seat validation
      const { data: tenantRow, error: tenantErr } = await supabaseAdmin
        .from("tenants").select("max_users").eq("id", tenantId).maybeSingle();
      if (tenantErr || !tenantRow) {
        return new Response(JSON.stringify({ error: "Tenant not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { count: currentUsers } = await supabaseAdmin
        .from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      const maxUsers = tenantRow.max_users ?? 0;
      if ((currentUsers ?? 0) >= maxUsers) {
        return new Response(JSON.stringify({
          error: "Has alcanzado el límite de usuarios del tenant.",
          code: "USER_LIMIT_REACHED",
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check email uniqueness (paginated list is fine for small user counts)
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      if (existingUsers?.users?.find((u) => u.email === ownerEmail)) {
        return new Response(JSON.stringify({ error: "Este email ya está registrado en la plataforma." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create auth user WITH password — no recovery link needed
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: ownerEmail,
        password,
        email_confirm: true,
        user_metadata: { name: ownerName, tenant_id: tenantId },
      });
      if (createError || !newUser?.user) {
        return new Response(JSON.stringify({ error: createError?.message || "Error creating user" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = newUser.user.id;
      const now = new Date().toISOString();

      // Upsert profile
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        tenant_id: tenantId,
        name: ownerName,
        email: ownerEmail,
        status: isTemporary ? "inactive" : "active",
        first_login_required: isTemporary,
        password_set_at: isTemporary ? null : now,
        invited_at: now,
        invited_by: callerUser.id,
      }, { onConflict: "id" });

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return new Response(JSON.stringify({ error: "Error creating profile" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert role — administrador (not owner)
      const { error: roleUpsertError } = await supabaseAdmin.from("user_roles").upsert({
        user_id: userId,
        global_role: "user",
        tenant_role: "administrador",
      }, { onConflict: "user_id" });

      if (roleUpsertError) {
        await supabaseAdmin.from("profiles").delete().eq("id", userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return new Response(JSON.stringify({ error: "Error creating user role" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("security_events").insert({
        event_type: "tenant_admin_created",
        user_id: callerUser.id,
        tenant_id: tenantId,
        metadata: { email: ownerEmail, user_id: userId, is_temporary: isTemporary },
      });

      console.log(`✅ Tenant admin created: ${ownerEmail} (temporary=${isTemporary})`);

      return new Response(JSON.stringify({ success: true, userId }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── RESEND invite (legacy — generates a recovery link for passwordless users) ──
    if (path === "resend") {
      const { userId } = await req.json();
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing userId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles").select("email, name, status, first_login_required").eq("id", userId).single();
      if (!profile) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (profile.status === "active" && !profile.first_login_required) {
        return new Response(JSON.stringify({ error: "User already activated" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const requestOrigin = req.headers.get("origin");
      const appBaseUrl = requestOrigin || Deno.env.get("APP_BASE_URL") || "";
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: profile.email,
        options: { redirectTo: `${appBaseUrl}/auth/complete-signup` },
      });

      if (linkError || !linkData?.properties?.action_link) {
        return new Response(JSON.stringify({ error: "Error generating link" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        activationLink: linkData.properties.action_link,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid endpoint" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in admin-invite-owner:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
