// Lead scoring B2B del Agente SDR.
//
// Antes: el prompt estaba escrito a mano para bienes raíces ("Eres un experto en
// lead scoring para bienes raíces en México") con pesos fijos sobre campos
// inmobiliarios (crédito preaprobado, propiedad de interés, no-show de visita).
// Para cambiar un peso había que editar y redesplegar la función. Y el `reasoning`
// que el modelo devolvía se imprimía en consola y se descartaba: el UPDATE solo
// escribía lead_score y lead_temperature.
//
// Ahora: los criterios, sus pesos y los umbrales viven en la BD
// (sdr_qualification_criteria, tenant_sdr_settings) y se configuran desde
// /settings/sdr-agent. Se guarda la razón, el desglose por criterio y el origen.
// Al cruzar el umbral de lead caliente se agenda un seguimiento para el comercial.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Criterion {
  criterion_key: string;
  label: string;
  guide_question: string;
  weight: number;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { tenant_id, contact_id } = await req.json();

    if (!tenant_id || !contact_id) {
      return json({ error: "tenant_id and contact_id required" }, 400);
    }
    if (!openRouterKey) {
      console.error("OPENROUTER_API_KEY not configured");
      return json({ error: "AI not configured" }, 500);
    }

    // ── Configuración del agente: umbrales y criterios con peso ───────────────
    const { data: sdrSettings } = await supabase
      .from("tenant_sdr_settings")
      .select("hot_threshold, nurture_threshold, notify_owner_on_hot, demo_sla_hours")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    const hotThreshold = sdrSettings?.hot_threshold ?? 70;
    const nurtureThreshold = sdrSettings?.nurture_threshold ?? 40;
    const notifyOwnerOnHot = sdrSettings?.notify_owner_on_hot ?? true;
    const demoSlaHours = sdrSettings?.demo_sla_hours ?? 48;

    const { data: criteriaRows } = await supabase
      .from("sdr_qualification_criteria")
      .select("criterion_key, label, guide_question, weight")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .order("sort_order");

    const criteria: Criterion[] = criteriaRows ?? [];
    if (criteria.length === 0) {
      return json(
        { error: "No hay criterios de calificación activos para este tenant" },
        400,
      );
    }

    const { data: productRows } = await supabase
      .from("sdr_products")
      .select("name, description, entry_signal")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .order("sort_order");

    // ── Datos del lead ────────────────────────────────────────────────────────
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contact_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (contactError || !contact) return json({ error: "Contact not found" }, 404);

    // Empresa asociada: tamaño e industria son insumo directo de la calificación.
    let account: Record<string, unknown> | null = null;
    if (contact.account_id) {
      const { data } = await supabase
        .from("accounts")
        .select("name, industry, employee_count, country, city, annual_revenue_usd")
        .eq("id", contact.account_id)
        .maybeSingle();
      account = data ?? null;
    }

    // Campos personalizados: aquí viven Presupuesto, Urgencia, Interés principal…
    const { data: customValues } = await supabase
      .from("contact_custom_field_values")
      .select("value_text, contact_custom_fields(key, name)")
      .eq("contact_id", contact_id);

    const customFields: Record<string, string> = {};
    for (const row of customValues ?? []) {
      const field = (row as Record<string, unknown>).contact_custom_fields as
        | { key: string; name: string }
        | null;
      const value = (row as Record<string, unknown>).value_text as string | null;
      if (field?.key && value) customFields[field.key] = value;
    }

    const { data: conversations } = await supabase
      .from("conversations")
      .select("id, status, needs_human, last_customer_message_at, last_agent_message_at")
      .eq("contact_id", contact_id)
      .eq("tenant_id", tenant_id);

    const conversationIds = (conversations ?? []).map((c) => c.id);
    let recentMessages: Record<string, unknown>[] = [];
    if (conversationIds.length > 0) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("direction, body, created_at, ai_generated")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(20);
      recentMessages = msgs ?? [];
    }

    const { data: events } = await supabase
      .from("events")
      .select("event_type, status, start_at")
      .eq("contact_id", contact_id)
      .eq("tenant_id", tenant_id)
      .order("start_at", { ascending: false })
      .limit(10);

    // Notas del timeline: aquí queda registrado lo que el comercial averigua.
    const { data: timelineNotes } = await supabase
      .from("contact_notes")
      .select("content, note_type, created_at")
      .eq("contact_id", contact_id)
      .eq("tenant_id", tenant_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const contactSummary = {
      name: contact.name,
      job_title: contact.job_title,
      country: contact.country,
      source: contact.source,
      entry_source: contact.entry_source,
      pipeline_stage: contact.pipeline_stage,
      operational_status: contact.operational_status,
      engagement_level: contact.engagement_level,
      created_at: contact.created_at,
      last_interaction_at: contact.last_interaction_at,
      tags: contact.tags,
      has_email: !!contact.email,
      has_phone: !!contact.phone,
      has_linkedin: !!contact.linkedin_url,
      // Las notas son donde el comercial anota lo que descubrió en la llamada
      // (tamaño real, presupuesto, urgencia). Sin ellas el modelo puntuaba casi
      // todo en 0 porque "no hay información adicional disponible".
      notes: typeof contact.notes === "string" ? contact.notes.slice(0, 2000) : null,
    };

    const messagesSummary = recentMessages.map((m) => ({
      direction: m.direction,
      text_preview: typeof m.body === "string" ? m.body.substring(0, 160) : null,
      ai_generated: m.ai_generated,
      created_at: m.created_at,
    }));

    const totalInbound = recentMessages.filter((m) => m.direction === "inbound").length;
    const totalOutbound = recentMessages.filter((m) => m.direction === "outbound").length;

    const criteriaBlock = criteria
      .map(
        (c) =>
          `- ${c.criterion_key} — ${c.label} (0 a ${c.weight} puntos)\n  Qué evalúa: ${c.guide_question}`,
      )
      .join("\n");

    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);

    const catalogBlock = (productRows ?? [])
      .map((p) => `- ${p.name}: ${p.description}${p.entry_signal ? ` | Señal: ${p.entry_signal}` : ""}`)
      .join("\n");

    const prompt = `Eres el sistema de calificación de leads B2B de este CRM. Analiza el lead y asigna puntos por criterio.

## Criterios y su peso máximo
${criteriaBlock}

La suma de los pesos es ${totalWeight}. Asigna a cada criterio un valor entre 0 y su peso máximo, según la evidencia disponible. Si no hay evidencia de un criterio, asigna 0 — no inventes ni asumas.

## Penalizaciones (réstalas del total)
- El lead dejó de responder o está en ghosting: hasta -20
- Pidió explícitamente no ser contactado: -30
- Solo hay mensajes salientes sin ninguna respuesta del lead: -10

${catalogBlock ? `## Productos y servicios disponibles (para evaluar el fit)\n${catalogBlock}\n` : ""}
## Datos del lead

**Contacto:**
${JSON.stringify(contactSummary, null, 2)}

**Empresa asociada:**
${account ? JSON.stringify(account, null, 2) : "sin empresa asociada"}

**Campos personalizados (presupuesto, urgencia, interés, etc.):**
${Object.keys(customFields).length ? JSON.stringify(customFields, null, 2) : "sin datos"}

**Mensajes recientes (${totalInbound} entrantes, ${totalOutbound} salientes):**
${JSON.stringify(messagesSummary, null, 2)}

**Reuniones / eventos:**
${JSON.stringify(events ?? [], null, 2)}

**Notas del equipo comercial:**
${timelineNotes?.length ? JSON.stringify(timelineNotes, null, 2) : "sin notas en el timeline"}

**Conversaciones:** ${conversations?.length ?? 0}

Responde SOLO usando la función suggest_lead_score. La razón debe explicar en español, en una frase, qué sostiene el score.`;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Eres un sistema de calificación de leads B2B. Puntúas con la evidencia disponible, sin inventar datos, y devuelves el resultado usando la función proporcionada.",
          },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_lead_score",
              description: "Devuelve el score calculado y el desglose por criterio",
              parameters: {
                type: "object",
                properties: {
                  breakdown: {
                    type: "array",
                    description: "Puntos otorgados por cada criterio evaluado",
                    items: {
                      type: "object",
                      properties: {
                        criterion_key: {
                          type: "string",
                          enum: criteria.map((c) => c.criterion_key),
                        },
                        awarded: { type: "number", description: "Puntos otorgados" },
                      },
                      required: ["criterion_key", "awarded"],
                      additionalProperties: false,
                    },
                  },
                  penalty: {
                    type: "number",
                    description: "Puntos restados por penalizaciones (0 si no aplica)",
                  },
                  lead_score: {
                    type: "number",
                    description: "Score final de 0 a 100 (suma del desglose menos penalizaciones)",
                  },
                  reasoning: {
                    type: "string",
                    description: "Una frase en español que explique el score (máx 200 caracteres)",
                  },
                },
                required: ["breakdown", "lead_score", "reasoning"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_lead_score" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return json({ error: "AI scoring failed" }, 500);
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiResult));
      return json({ error: "Invalid AI response" }, 500);
    }

    const scoring = JSON.parse(toolCall.function.arguments);

    // El desglose se recalcula del lado nuestro y se topa a cada peso: así el
    // score nunca puede exceder lo que los criterios configurados permiten,
    // aunque el modelo se pase de listo.
    const weightByKey = new Map(criteria.map((c) => [c.criterion_key, c.weight]));
    const breakdown: Record<string, { awarded: number; weight: number }> = {};
    let awardedTotal = 0;
    for (const item of scoring.breakdown ?? []) {
      const weight = weightByKey.get(item.criterion_key);
      if (weight === undefined) continue;
      const awarded = Math.max(0, Math.min(weight, Math.round(Number(item.awarded) || 0)));
      breakdown[item.criterion_key] = { awarded, weight };
      awardedTotal += awarded;
    }

    const penalty = Math.max(0, Math.round(Number(scoring.penalty) || 0));
    const newScore = Math.max(0, Math.min(100, awardedTotal - penalty));

    // La temperatura se deriva de los umbrales configurados, no de lo que diga
    // el modelo: si el usuario mueve el umbral, la clasificación lo respeta.
    const newTemp = newScore >= hotThreshold ? "hot" : newScore >= nurtureThreshold ? "warm" : "cold";

    const reasoning = String(scoring.reasoning ?? "").slice(0, 500) || null;
    const scoredAt = new Date().toISOString();

    console.log(
      `[ai-lead-scoring] ${contact.name}: score=${newScore} (${awardedTotal} - ${penalty}), temp=${newTemp}, razón="${reasoning}"`,
    );

    const { error: updateError } = await supabase
      .from("contacts")
      .update({
        lead_score: newScore,
        lead_temperature: newTemp,
        lead_score_reason: reasoning,
        lead_score_source: "ai",
        lead_score_updated_at: scoredAt,
        lead_score_breakdown: { ...breakdown, _penalty: penalty },
        updated_at: scoredAt,
      })
      .eq("id", contact_id)
      .eq("tenant_id", tenant_id);

    if (updateError) {
      console.error("Failed to update contact scoring:", updateError);
      return json({ error: "Failed to update scoring" }, 500);
    }

    // ── Lead caliente: avisar al comercial y agendar la propuesta de demo ─────
    let notified = false;
    if (newScore >= hotThreshold && notifyOwnerOnHot) {
      const dueAt = new Date(Date.now() + demoSlaHours * 60 * 60 * 1000).toISOString();

      await supabase
        .from("contacts")
        .update({ next_action_at: dueAt })
        .eq("id", contact_id)
        .eq("tenant_id", tenant_id);

      const conversationId = conversationIds[0] ?? null;
      if (conversationId) {
        const note = `Lead caliente (score ${newScore}). Proponer demo dentro de ${demoSlaHours} h. ${reasoning ?? ""}`.trim();

        const { error: followupError } = await supabase.from("conversation_followups").insert({
          tenant_id,
          conversation_id: conversationId,
          contact_id,
          assigned_user_id: contact.assigned_agent_id ?? null,
          status: "scheduled",
          due_at: dueAt,
          note,
        });
        if (followupError) console.error("No se pudo agendar el seguimiento:", followupError);

        await supabase.from("conversation_activity").insert({
          tenant_id,
          conversation_id: conversationId,
          contact_id,
          actor_type: "ai",
          event_type: "sdr_lead_hot",
          payload: {
            lead_score: newScore,
            hot_threshold: hotThreshold,
            reason: reasoning,
            demo_due_at: dueAt,
            assigned_agent_id: contact.assigned_agent_id ?? null,
          },
        });
        notified = !followupError;
      } else {
        // Sin conversación no hay dónde colgar el seguimiento; queda al menos
        // el next_action_at para que el lead aparezca como pendiente.
        console.log(`[ai-lead-scoring] lead caliente sin conversación: ${contact_id}`);
      }
    }

    return json({
      success: true,
      lead_score: newScore,
      lead_temperature: newTemp,
      reasoning,
      breakdown,
      penalty,
      is_hot: newScore >= hotThreshold,
      notified,
    });
  } catch (e) {
    console.error("Lead scoring error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
