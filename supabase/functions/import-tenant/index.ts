/**
 * import-tenant — carga un archivo de importación con la estructura:
 * { agencia, agente, total_inmuebles, inmuebles }
 *
 * Crea (o reutiliza) el tenant, da de alta al asesor e importa el inventario.
 * Idempotente: omite registros que ya existen por email / property_code.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // — Auth: solo super_admin global puede importar —
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ success: false, error: "Missing authorization" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) return json({ success: false, error: "Unauthorized" }, 401);

    const { data: roleRow } = await db
      .from("user_roles").select("global_role, partner_scope").eq("user_id", user.id).single();
    if (roleRow?.global_role !== "super_admin" || roleRow?.partner_scope !== null)
      return json({ success: false, error: "Requiere super_admin global" }, 403);

    // — Payload —
    const body = await req.json();
    const { agencia, agente, inmuebles } = body;

    if (!agencia?.name || !agente?.email || !Array.isArray(inmuebles))
      return json({ success: false, error: "Estructura inválida: se requiere agencia, agente e inmuebles" }, 400);

    // Obtener el único partner de esta instancia
    const { data: partner } = await db.from("partners").select("id").limit(1).single();
    if (!partner) return json({ success: false, error: "No hay partner configurado. Ejecuta setup-instance primero." }, 400);

    const stats = { tenant: "", tenantCreated: false, userId: "", userCreated: false, propertiesInserted: 0, propertiesSkipped: 0, imagesInserted: 0 };

    // ── 1. TENANT ──────────────────────────────────────────────────────────────
    const { data: existingTenant } = await db
      .from("tenants").select("id").eq("name", agencia.name).eq("partner_id", partner.id).maybeSingle();

    let tenantId: string;
    if (existingTenant) {
      tenantId = existingTenant.id;
      stats.tenant = tenantId;
    } else {
      const { data: newTenant, error: tenantErr } = await db
        .from("tenants")
        .insert({
          name: agencia.name,
          partner_id: partner.id,
          country_code: "CO",
          plan: "trial",
          status: "active",
          max_users: 20,
          max_contacts: 5000,
        })
        .select("id").single();
      if (tenantErr) return json({ success: false, error: `Error creando tenant: ${tenantErr.message}` }, 500);
      tenantId = newTenant.id;
      stats.tenant = tenantId;
      stats.tenantCreated = true;
    }

    // ── 2. ASESOR ──────────────────────────────────────────────────────────────
    const { data: existingUsers } = await db.auth.admin.listUsers({ perPage: 1000 });
    const existingAuthUser = existingUsers?.users?.find((u) => u.email === agente.email);

    let userId: string;
    if (existingAuthUser) {
      userId = existingAuthUser.id;
      stats.userId = userId;
    } else {
      const { data: newAuthUser, error: authCreateErr } = await db.auth.admin.createUser({
        email: agente.email,
        email_confirm: true,
        user_metadata: { name: agente.name, global_role: "user", tenant_role: "asesor" },
      });
      if (authCreateErr) return json({ success: false, error: `Error creando auth user: ${authCreateErr.message}` }, 500);
      userId = newAuthUser.user.id;
      stats.userId = userId;
      stats.userCreated = true;
    }

    // Upsert profile
    const phone = agente.phoneNumber
      ? `${agente.phoneCountryCode ?? ""}${agente.phoneNumber}`.replace(/^\+?/, "+")
      : null;

    await db.from("profiles").upsert({
      id: userId,
      tenant_id: tenantId,
      name: agente.name,
      email: agente.email,
      status: "active",
      first_login_required: true,
      phone: phone,
      phone_country_code: agente.phoneCountryCode ?? null,
    }, { onConflict: "id" });

    // Upsert user_role
    await db.from("user_roles").upsert({
      user_id: userId,
      global_role: "user",
      tenant_role: "asesor",
    }, { onConflict: "user_id" });

    // ── 3. INMUEBLES ───────────────────────────────────────────────────────────
    for (const p of inmuebles) {
      const propertyCode = p.iid ?? p._id;

      // Dedup por property_code + tenant_id
      const { data: existingProp } = await db
        .from("properties").select("id").eq("tenant_id", tenantId).eq("property_code", propertyCode).maybeSingle();

      if (existingProp) {
        stats.propertiesSkipped++;
        continue;
      }

      const { data: newProp, error: propErr } = await db
        .from("properties")
        .insert({
          tenant_id: tenantId,
          property_code: propertyCode,
          title: p.title,
          operation_type: (p.listing_type ?? "SALE").toLowerCase(),
          property_type: p.property_type ?? null,
          zone: p.neighborhood ?? "",
          address: p.address ?? null,
          city: p.city ?? null,
          price: p.price ?? 0,
          currency: "COP",
          bedrooms: p.bedrooms ?? null,
          bathrooms: p.bathrooms ?? null,
          parking_spots: p.parking ?? null,
          sq_meters: p.area ?? null,
          maintenance_fee: p.admin_fee ?? null,
          is_active: p.is_active !== false && p.is_disabled !== true,
          latitude: p.lat ?? null,
          longitude: p.lng ?? null,
          description: p.description ?? null,
          ai_prompt: p.improved_description ?? p.description ?? null,
          stratum: p.stratum ?? null,
          external_id: p._id ?? null,
          assigned_user_id: userId,
          status: "available",
        })
        .select("id").single();

      if (propErr) {
        console.error(`Error inserting property ${propertyCode}:`, propErr.message);
        stats.propertiesSkipped++;
        continue;
      }

      stats.propertiesInserted++;

      // Imágenes
      const images: string[] = Array.isArray(p.images) ? p.images : (p.image_cover ? [p.image_cover] : []);
      if (images.length) {
        const imageRows = images.map((url: string, idx: number) => ({
          tenant_id: tenantId,
          property_id: newProp.id,
          file_url: url,
          file_path: url,
          is_cover: idx === 0,
          sort_order: idx,
        }));
        const { error: imgErr } = await db.from("property_images").insert(imageRows);
        if (!imgErr) stats.imagesInserted += imageRows.length;
      }
    }

    return json({
      success: true,
      stats: {
        tenantId: stats.tenant,
        tenantCreated: stats.tenantCreated,
        userId: stats.userId,
        userCreated: stats.userCreated,
        propertiesInserted: stats.propertiesInserted,
        propertiesSkipped: stats.propertiesSkipped,
        imagesInserted: stats.imagesInserted,
      },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("import-tenant error:", msg);
    return json({ success: false, error: msg }, 500);
  }
});
