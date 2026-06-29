import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const META_API = "https://graph.facebook.com/v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decryptToken(encrypted: string): string {
  const salt = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").slice(0, 16);
  try {
    const decoded = atob(encrypted);
    return decoded.startsWith(`${salt}::`) ? decoded.slice(salt.length + 2) : decoded;
  } catch {
    return "";
  }
}

function stripJsonFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

async function metaPost(path: string, params: Record<string, string>) {
  const res = await fetch(`${META_API}${path}`, {
    method: "POST",
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("OPENROUTER_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const jwt = authHeader.replace("Bearer ", "");

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.tenant_id) {
      return json({ error: "Usuario sin tenant asociado" }, 403);
    }
    const tenantId = profile.tenant_id as string;

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("tenant_role, global_role")
      .eq("user_id", userId)
      .maybeSingle();
    const isSuperAdmin = roleRow?.global_role === "super_admin";
    const tenantRole = roleRow?.tenant_role;
    if (!isSuperAdmin && tenantRole !== "administrador" && tenantRole !== "manager") {
      return json({ error: "No tienes permisos para gestionar campaÃ±as de Meta Ads" }, 403);
    }

    const body = await req.json();
    const action = body?.action as string;

    // --- GENERATE -----------------------------------------------------------
    if (action === "generate") {
      if (!body?.property_id) return json({ error: "property_id requerido" }, 400);
      if (!lovableKey) return json({ error: "OPENROUTER_API_KEY no configurado" }, 500);

      const objective: "LEAD_GENERATION" | "MESSAGES" =
        body?.objective === "MESSAGES" ? "MESSAGES" : "LEAD_GENERATION";
      const facebookPageId = body?.facebook_page_id
        ? String(body.facebook_page_id).trim()
        : null;

      let whatsappNumber: string | null = null;
      if (objective === "MESSAGES") {
        const { data: integ } = await admin
          .from("tenant_integrations")
          .select("phone_number")
          .eq("tenant_id", tenantId)
          .eq("provider", "twilio")
          .eq("status", "connected")
          .maybeSingle();
        whatsappNumber = integ?.phone_number ?? null;
        if (!whatsappNumber) {
          return json({ error: "No se encontrÃ³ nÃºmero de WhatsApp configurado. Verifica tu integraciÃ³n de Twilio en ConfiguraciÃ³n." }, 400);
        }
      }

      const { data: property, error: propErr } = await admin
        .from("properties")
        .select(
          "id, title, description, price, currency, operation_type, property_type, bedrooms, bathrooms, sq_meters, zone, address, property_images(file_url, is_cover, sort_order)",
        )
        .eq("id", body.property_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (propErr || !property) {
        return json({ error: "Propiedad no encontrada" }, 403);
      }

      const { data: connection } = await admin
        .from("meta_ads_connections")
        .select("ad_account_id, pixel_id")
        .eq("tenant_id", tenantId)
        .eq("status", "connected")
        .maybeSingle();
      if (!connection) {
        return json({ error: "Conecta tu cuenta de Meta Ads primero" }, 400);
      }

      const objectiveContext = objective === "MESSAGES"
        ? `El objetivo es que el lead haga clic y abra WhatsApp directamente para preguntar por la propiedad. El mensaje pre-llenado de WhatsApp mencionarÃ¡ el nombre e ID de la propiedad. El copy debe invitar a escribir por WhatsApp para obtener mÃ¡s informaciÃ³n, precio y disponibilidad.`
        : `El objetivo es que el lead llene un formulario nativo de Meta con su nombre, telÃ©fono y email para ser contactado por un asesor. El copy debe generar urgencia y destacar los beneficios de la propiedad.`;
      const ctaForObjective = objective === "MESSAGES" ? "WHATSAPP_MESSAGE" : "LEARN_MORE";

      const priceFormatted = property.price != null
        ? Number(property.price).toLocaleString("es-MX")
        : "N/A";
      const suggestedBudget = Math.max(
        15000,
        Math.min(50000, Math.round((Number(property.price) || 1000000) / 100000) * 1000),
      );
      const prompt = `Eres un experto en publicidad inmobiliaria digital
en MÃ©xico. Tu tarea es crear copies publicitarios para Meta Ads
altamente especÃ­ficos para esta propiedad exacta.

OBJETIVO: ${objectiveContext}

DATOS COMPLETOS DE LA PROPIEDAD:
- Nombre: ${property.title}
- Tipo: ${property.property_type ?? "No especificado"}
- OperaciÃ³n: ${property.operation_type}
- Precio: $${priceFormatted} ${property.currency}
- RecÃ¡maras: ${property.bedrooms ?? "N/A"}
- BaÃ±os: ${property.bathrooms ?? "N/A"}
- Superficie: ${property.sq_meters ?? "N/A"} mÂ²
- Zona/Colonia: ${property.zone ?? "N/A"}
- DirecciÃ³n: ${property.address ?? "No especificada"}
- DescripciÃ³n completa: ${property.description ?? "Sin descripciÃ³n"}

REGLAS PARA LOS COPIES:
1. Usa datos REALES de la propiedad â€” nunca inventes caracterÃ­sticas
2. El headline DEBE mencionar algo especÃ­fico: zona, precio, mÂ² o
   nÃºmero de recÃ¡maras
3. El texto principal debe crear deseo e incluir llamada a la acciÃ³n
4. Cada copy debe tener un enfoque distinto:
   - Copy 1: CaracterÃ­sticas y datos concretos (precio, mÂ², zona)
   - Copy 2: Estilo de vida y aspiraciÃ³n (quÃ© se siente vivir ahÃ­)
   - Copy 3: Urgencia o escasez (oportunidad limitada, inversiÃ³n)
5. LÃ­mites de caracteres:
   - headline: mÃ¡ximo 40 caracteres (tÃ­tulo debajo de la imagen)
   - primary_text: mÃ¡ximo 400 caracteres (texto encima de la imagen,
     debe incluir caracterÃ­sticas completas con emojis como bullets)
   - description: mÃ¡ximo 30 caracteres

REGLAS ADICIONALES DE FORMATO:
- SIEMPRE incluye 1-2 emojis relevantes en cada copy
  (ðŸ  casa/depto, ðŸŒŸ lujo, ðŸ’° precio, ðŸ“ ubicaciÃ³n, ðŸ”‘ entrega,
   ðŸŠ amenidades, ðŸš— estacionamiento, ðŸŒ³ jardÃ­n, etc.)
- El precio SIEMPRE debe aparecer formateado en el copy cuando sea
  relevante: "$${priceFormatted} ${property.currency}"
- Menciona SIEMPRE al menos un dato numÃ©rico concreto:
  mÂ², recÃ¡maras, baÃ±os o precio
- Los emojis van al INICIO del headline o intercalados en el texto,
  nunca al final
- Ejemplo de headline bueno: "ðŸ  Penthouse 210mÂ² en Chico Reservado"
- Ejemplo de headline malo: "Hermosa propiedad disponible"

EJEMPLO DE COPY COMPLETO ESPERADO PARA INMOBILIARIA:
{
  "headline": "ðŸ  Penthouse 210mÂ² Â· Chico Reservado",
  "primary_text": "ðŸŒŸ Penthouse Vista GalÃ¡ctica â€” La joya de Chico Reservado\\n\\nðŸ“ 210 mÂ² de diseÃ±o arquitectÃ³nico exclusivo\\nðŸ› 3 recÃ¡maras con vestidor en suite\\nðŸš¿ 4 baÃ±os completos de lujo\\nðŸŒ¿ Terraza privada con vista panorÃ¡mica\\nðŸŠ Acceso a amenidades de primer nivel\\nðŸš— 2 lugares de estacionamiento\\n\\nðŸ’° Precio: $2,500,000,000 COP\\nðŸ“ Chico Reservado, BogotÃ¡\\n\\nÂ¿Te interesa conocerlo? Â¡EscrÃ­benos ahora y agenda tu visita! ðŸ”‘",
  "description": "Agenda tu visita hoy"
}

REGLA CLAVE: El primary_text debe incluir TODAS las caracterÃ­sticas
importantes de la propiedad usando emojis como bullets visuales.
Formato: emoji + caracterÃ­stica, una por lÃ­nea (usa \\n para saltos).
Incluye SIEMPRE: mÂ², recÃ¡maras, baÃ±os, amenidades destacadas, precio
formateado y llamada a la acciÃ³n.

INTERESES SUGERIDOS: elige los mÃ¡s relevantes segÃºn el tipo de
propiedad y precio. Para propiedades de lujo (>$3M MXN) incluye
intereses de inversiÃ³n. Para propiedades medias incluye primera
vivienda. Para rentas incluye bÃºsqueda de departamento.

Retorna ÃšNICAMENTE este JSON sin texto adicional ni backticks:
{
  "name": "nombre descriptivo con zona y tipo",
  "copies": [
    {
      "headline": "especÃ­fico con dato real de la propiedad",
      "primary_text": "texto que usa caracterÃ­sticas reales",
      "description": "corto y directo"
    },
    {
      "headline": "enfoque aspiracional con dato real",
      "primary_text": "evoca el estilo de vida, menciona zona",
      "description": "corto y directo"
    },
    {
      "headline": "urgencia con dato real del precio o zona",
      "primary_text": "crea urgencia, menciona oportunidad Ãºnica",
      "description": "corto y directo"
    }
  ],
  "cta_type": "${ctaForObjective}",
  "age_min": 28,
  "age_max": 60,
  "genders": ["1", "2"],
  "geo_locations": {
    "cities": [{ "key": "ciudad_key", "name": "${property.zone ?? "Ciudad de MÃ©xico"}" }],
    "countries": ["MX"]
  },
  "interests": [
    { "id": "6003107902433", "name": "Bienes raÃ­ces" },
    { "id": "6002714398172", "name": "Compra de vivienda" },
    { "id": "6003377666416", "name": "InversiÃ³n inmobiliaria" }
  ],
  "daily_budget_cents": ${suggestedBudget},
  "lead_form_fields": [
    { "type": "FULL_NAME" },
    { "type": "PHONE" },
    { "type": "EMAIL" }
  ],
  "recommendations": [
    "recomendaciÃ³n especÃ­fica basada en el precio $${priceFormatted} y la zona ${property.zone ?? "N/A"}",
    "recomendaciÃ³n sobre el tipo ${property.property_type ?? "propiedad"} en ${property.operation_type}",
    "recomendaciÃ³n sobre presupuesto publicitario para este segmento de precio"
  ]
}`;

      const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 3000,
        }),
      });
      if (aiRes.status === 429) return json({ error: "LÃ­mite de uso de IA alcanzado, intenta en unos minutos" }, 429);
      if (aiRes.status === 402) return json({ error: "CrÃ©ditos de IA agotados, agrega mÃ¡s en tu workspace" }, 402);
      if (!aiRes.ok) {
        const t = await aiRes.text();
        return json({ error: `Error de IA: ${t.slice(0, 200)}` }, 500);
      }
      const aiData = await aiRes.json();
      const content = aiData?.choices?.[0]?.message?.content ?? "";
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stripJsonFences(content));
      } catch {
        return json({ error: "La IA devolviÃ³ un formato no vÃ¡lido" }, 500);
      }

      const copiesRaw = Array.isArray((parsed as any).copies)
        ? ((parsed as any).copies as Array<Record<string, unknown>>)
        : [];
      const validCopies = copiesRaw
        .map((c) => ({
          headline: String(c?.headline ?? "").slice(0, 40),
          primary_text: String(c?.primary_text ?? "").slice(0, 500),
          description: c?.description ? String(c.description).slice(0, 30) : "",
        }))
        .filter((c) => c.headline.length > 0 && c.primary_text.length > 0);
      if (validCopies.length === 0) {
        return json({ error: "La IA no generÃ³ copies vÃ¡lidos. Intenta de nuevo." }, 500);
      }
      while (validCopies.length < 3) {
        validCopies.push(validCopies[validCopies.length - 1]);
      }
      const copies = validCopies;
      const firstCopy = copies[0];
      const recommendations = Array.isArray((parsed as any).recommendations)
        ? ((parsed as any).recommendations as unknown[]).map((r) => String(r)).slice(0, 5)
        : [];

      const images = (property.property_images ?? []) as Array<{
        file_url: string;
        is_cover: boolean;
        sort_order: number;
      }>;
      const cover = images.find((i) => i.is_cover) ??
        images.sort((a, b) => a.sort_order - b.sort_order)[0];

      const insertPayload = {
        tenant_id: tenantId,
        property_id: property.id,
        objective: objective,
        campaign_objective: objective,
        whatsapp_phone_number: whatsappNumber,
        facebook_page_id: facebookPageId,
        name: String(parsed.name ?? `CampaÃ±a ${property.title}`).slice(0, 200),
        headline: firstCopy.headline,
        primary_text: firstCopy.primary_text,
        description: firstCopy.description || null,
        cta_type: (parsed.cta_type as string) ?? ctaForObjective,
        age_min: Number(parsed.age_min ?? 25),
        age_max: Number(parsed.age_max ?? 65),
        genders: Array.isArray(parsed.genders) ? (parsed.genders as string[]) : ["1", "2"],
        geo_locations: parsed.geo_locations ?? null,
        interests: parsed.interests ?? null,
        daily_budget_cents: Number(parsed.daily_budget_cents ?? 25000),
        lead_form_fields: parsed.lead_form_fields ?? [
          { type: "FULL_NAME" },
          { type: "PHONE" },
          { type: "EMAIL" },
        ],
        image_url: cover?.file_url ?? null,
        status: "review",
        ai_generated_at: new Date().toISOString(),
        created_by: userId,
      };

      const { data: campaign, error: insertErr } = await admin
        .from("meta_ads_campaigns")
        .insert(insertPayload)
        .select()
        .single();
      if (insertErr) return json({ error: insertErr.message }, 500);

      return json({ campaign, copies, recommendations });
    }

    // --- PUBLISH / PAUSE / RESUME -------------------------------------------
    if (action === "publish" || action === "pause" || action === "resume") {
      if (!body?.campaign_id) return json({ error: "campaign_id requerido" }, 400);

      const { data: campaign } = await admin
        .from("meta_ads_campaigns")
        .select("*")
        .eq("id", body.campaign_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!campaign) return json({ error: "CampaÃ±a no encontrada" }, 404);

      const { data: connection } = await admin
        .from("meta_ads_connections")
        .select("access_token_encrypted, ad_account_id")
        .eq("tenant_id", tenantId)
        .eq("status", "connected")
        .maybeSingle();
      if (!connection) return json({ error: "Conecta tu cuenta de Meta Ads primero" }, 400);

      const token = decryptToken(connection.access_token_encrypted as string);
      if (!token) return json({ error: "Token de Meta invÃ¡lido, reconecta tu cuenta" }, 400);

      const adAccountId = connection.ad_account_id as string;

      if (action === "pause" || action === "resume") {
        if (!campaign.meta_campaign_id) return json({ error: "La campaÃ±a no estÃ¡ publicada en Meta" }, 400);
        try {
          await metaPost(`/${campaign.meta_campaign_id}`, {
            status: action === "pause" ? "PAUSED" : "ACTIVE",
            access_token: token,
          });
          await admin
            .from("meta_ads_campaigns")
            .update({ status: action === "pause" ? "paused" : "active" })
            .eq("id", campaign.id);
          return json({ success: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return json({ error: msg }, 400);
        }
      }

      // publish
      await admin
        .from("meta_ads_campaigns")
        .update({ status: "publishing", publish_error: null })
        .eq("id", campaign.id);

      try {
        if (campaign.campaign_objective === "MESSAGES") {
          if (!campaign.facebook_page_id) {
            throw new Error("Falta PÃ¡gina de Facebook para campaÃ±a de Mensajes");
          }
          if (!campaign.whatsapp_phone_number) {
            throw new Error("Falta nÃºmero de WhatsApp para campaÃ±a de Mensajes");
          }

          // Construir mensaje pre-llenado con tÃ­tulo e ID de propiedad
          const { data: propertyForMsg } = await admin
            .from("properties")
            .select("title, code")
            .eq("id", campaign.property_id)
            .maybeSingle();
          const propertyIdentifier = propertyForMsg?.code ?? campaign.property_id;
          const prefilledMessage =
            `Hola, me interesa la propiedad ` +
            `${propertyForMsg?.title ?? campaign.name} ` +
            `ID:${propertyIdentifier}`;

          const campaignRes = await metaPost(`/${adAccountId}/campaigns`, {
            name: campaign.name,
            objective: "MESSAGES",
            status: "ACTIVE",
            special_ad_categories: "[]",
            access_token: token,
          });
          const metaCampaignId = campaignRes.id as string;

          const adSetRes = await metaPost(`/${adAccountId}/adsets`, {
            name: `AdSet - ${campaign.name}`.slice(0, 100),
            campaign_id: metaCampaignId,
            billing_event: "IMPRESSIONS",
            optimization_goal: "CONVERSATIONS",
            destination_type: "WHATSAPP",
            daily_budget: String(campaign.daily_budget_cents ?? 25000),
            targeting: JSON.stringify({
              age_min: campaign.age_min,
              age_max: campaign.age_max,
              genders: (campaign.genders ?? []).map((g: string) => Number(g)),
              geo_locations: campaign.geo_locations ?? { countries: ["MX"] },
              interests: campaign.interests ?? [],
            }),
            status: "ACTIVE",
            access_token: token,
          });
          const metaAdSetId = adSetRes.id as string;

          let metaAdId: string | null = null;
          if (campaign.image_url) {
            const creativeRes = await metaPost(`/${adAccountId}/adcreatives`, {
              name: `Creative - ${campaign.name}`.slice(0, 100),
              object_story_spec: JSON.stringify({
                page_id: campaign.facebook_page_id,
                link_data: {
                  image_url: campaign.image_url,
                  message: campaign.primary_text,
                  name: campaign.headline,
                  description: campaign.description ?? "",
                  call_to_action: {
                    type: "WHATSAPP_MESSAGE",
                    value: {
                      app_destination: "WHATSAPP",
                      whatsapp_number: campaign.whatsapp_phone_number,
                      user_message_prompt: prefilledMessage,
                    },
                  },
                },
              }),
              access_token: token,
            });
            const creativeId = creativeRes.id as string;

            const adRes = await metaPost(`/${adAccountId}/ads`, {
              name: `Ad - ${campaign.name}`.slice(0, 100),
              adset_id: metaAdSetId,
              creative: JSON.stringify({ creative_id: creativeId }),
              status: "ACTIVE",
              access_token: token,
            });
            metaAdId = adRes.id as string;
          }

          await admin
            .from("meta_ads_campaigns")
            .update({
              meta_campaign_id: metaCampaignId,
              meta_adset_id: metaAdSetId,
              meta_ad_id: metaAdId,
              meta_form_id: null,
              status: "active",
              published_at: new Date().toISOString(),
              publish_error: null,
            })
            .eq("id", campaign.id);

          return json({ success: true });
        }

        const campaignRes = await metaPost(`/${adAccountId}/campaigns`, {
          name: campaign.name,
          objective: "LEAD_GENERATION",
          status: "ACTIVE",
          special_ad_categories: "[]",
          access_token: token,
        });
        const metaCampaignId = campaignRes.id as string;

        const formRes = await metaPost(`/${adAccountId}/leadgen_forms`, {
          name: `Form - ${campaign.name}`.slice(0, 100),
          questions: JSON.stringify(campaign.lead_form_fields ?? []),
          privacy_policy: JSON.stringify({
            url: "https://brokia24.com/privacidad",
            link_text: "PolÃ­tica de privacidad",
          }),
          access_token: token,
        });
        const metaFormId = formRes.id as string;

        const adSetRes = await metaPost(`/${adAccountId}/adsets`, {
          name: `AdSet - ${campaign.name}`.slice(0, 100),
          campaign_id: metaCampaignId,
          billing_event: "IMPRESSIONS",
          optimization_goal: "LEAD_GENERATION",
          daily_budget: String(campaign.daily_budget_cents ?? 25000),
          targeting: JSON.stringify({
            age_min: campaign.age_min,
            age_max: campaign.age_max,
            genders: (campaign.genders ?? []).map((g: string) => Number(g)),
            geo_locations: campaign.geo_locations ?? { countries: ["MX"] },
            interests: campaign.interests ?? [],
          }),
          status: "ACTIVE",
          access_token: token,
        });
        const metaAdSetId = adSetRes.id as string;

        let metaAdId: string | null = null;
        if (campaign.image_url) {
          const creativeRes = await metaPost(`/${adAccountId}/adcreatives`, {
            name: `Creative - ${campaign.name}`.slice(0, 100),
            object_story_spec: JSON.stringify({
              link_data: {
                image_url: campaign.image_url,
                message: campaign.primary_text,
                name: campaign.headline,
                description: campaign.description ?? "",
                call_to_action: {
                  type: campaign.cta_type ?? "LEARN_MORE",
                  value: { lead_gen_form_id: metaFormId },
                },
              },
            }),
            access_token: token,
          });
          const creativeId = creativeRes.id as string;

          const adRes = await metaPost(`/${adAccountId}/ads`, {
            name: `Ad - ${campaign.name}`.slice(0, 100),
            adset_id: metaAdSetId,
            creative: JSON.stringify({ creative_id: creativeId }),
            status: "ACTIVE",
            access_token: token,
          });
          metaAdId = adRes.id as string;
        }

        await admin
          .from("meta_ads_campaigns")
          .update({
            meta_campaign_id: metaCampaignId,
            meta_adset_id: metaAdSetId,
            meta_ad_id: metaAdId,
            meta_form_id: metaFormId,
            status: "active",
            published_at: new Date().toISOString(),
            publish_error: null,
          })
          .eq("id", campaign.id);

        return json({ success: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin
          .from("meta_ads_campaigns")
          .update({ status: "error", publish_error: msg })
          .eq("id", campaign.id);
        return json({ error: msg }, 400);
      }
    }

    return json({ error: "AcciÃ³n no soportada" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error inesperado";
    return json({ error: msg }, 500);
  }
});