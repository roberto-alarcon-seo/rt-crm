import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Regional context ─────────────────────────────────────────────────────────
const REGION_CONTEXT: Record<string, { country: string; currency: string; context: string }> = {
  MX: { country: "México", currency: "MXN ($)", context: 'Español de México neutro. Trato profesional y directo. Usa "ahorita", "platicar", "¿cómo le va?" si el contexto lo permite.' },
  CO: { country: "Colombia", currency: "COP ($)", context: 'Español colombiano. Profesional y cálido. Usa "con mucho gusto", "le cuento que…".' },
  PE: { country: "Perú", currency: "PEN (S/)", context: "Español peruano. Profesional y cordial." },
  AR: { country: "Argentina", currency: "ARS ($)", context: 'Español rioplatense. Usa "vos" y conjugación voseante. Profesional pero cercano.' },
  CL: { country: "Chile", currency: "CLP ($)", context: "Español chileno. Profesional y directo." },
  ES: { country: "España", currency: "EUR (€)", context: 'Castellano peninsular. Usa "vale", "venga". Tono profesional europeo.' },
  US: { country: "Estados Unidos (hispano)", currency: "USD ($)", context: "Español neutro latino. Tono profesional y ágil." },
};

const FORMALITY_TEXT: Record<string, string> = {
  tu: 'Trata al cliente de "tú" (informal cercano).',
  usted: 'Trata al cliente de "usted" (formal). Nunca uses "tú".',
  vos: 'Trata al cliente de "vos" (informal rioplatense).',
};

const LANGUAGE_TEXT: Record<string, string> = {
  es: "Responde SIEMPRE en español.",
  en: "Respond ALWAYS in English.",
  pt: "Responda SEMPRE em português.",
};

const TONE_TEXT: Record<string, string> = {
  cordial: "Sé amable y respetuoso en todo momento.",
  professional: "Mantén un tono profesional y directo.",
  friendly: "Sé casual y cercano, como si hablaras con un colega.",
  adaptive: "Adapta tu tono al estilo del cliente.",
  consultive: "Actúa como consultor experto: escucha, diagnostica, recomienda.",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function stripEmojis(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function enforceMaxLength(text: string, maxLen: number): string {
  if (!maxLen || text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.7 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

function buildSystemPrompt(s: Record<string, unknown>): string {
  const region = REGION_CONTEXT[((s.region_code as string) || "MX").toUpperCase()] || REGION_CONTEXT.MX;
  const formality = FORMALITY_TEXT[(s.formality as string) || "tu"] || FORMALITY_TEXT.tu;
  const language = LANGUAGE_TEXT[(s.language as string) || "es"] || LANGUAGE_TEXT.es;
  const maxLen = (s.max_message_length as number) || 320;
  const emojiInstr = s.use_emojis
    ? `Puedes usar hasta ${(s.max_emojis_per_message as number) || 2} emoji(s) por mensaje.`
    : "PROHIBIDO usar emojis.";
  const identity = s.never_reveal_ai ? "NUNCA reveles que eres una IA. Actúa como un asistente humano." : "";

  return `Eres ${(s.agent_name as string) || "Asistente"}, representante de ${(s.company_name as string) || "la empresa"}.

CONTEXTO REGIONAL:
- País: ${region.country} | Moneda: ${region.currency}
- ${region.context}
- ${formality}
- ${language}
- LONGITUD MÁXIMA: ${maxLen} caracteres por mensaje. Sé breve y directo.

ESTILO:
- ${TONE_TEXT[(s.tone as string)] || TONE_TEXT.professional}
- ${emojiInstr}
- ${identity}

REGLA ANTI-ALUCINACIÓN:
Responde ÚNICAMENTE con información de la BASE DE CONOCIMIENTO. Si no tienes la respuesta, indícalo brevemente.

COMPORTAMIENTO DEL NEGOCIO:
${(s.behavior_prompt as string) || "(sin instrucciones específicas)"}`;
}

function buildCaptureInstructions(
  hasName: boolean,
  hasEmail: boolean,
  hasPhone: boolean,
  isConverted: boolean,
  captureEmail: boolean,
  capturePhone: boolean,
): string {
  const parts: string[] = ["\n\n=== INSTRUCCIONES DE CAPTURA DE LEAD (WEB CHAT) ==="];

  if (isConverted) {
    parts.push("El lead ya fue registrado en el CRM. Continúa la conversación normalmente y ayuda al usuario.");
  } else if (!hasName) {
    parts.push(
      "AÚN NO TIENES EL NOMBRE DEL VISITANTE. En los primeros 2 mensajes preséntate brevemente y pregunta su nombre de forma natural. Ejemplo: '¡Hola! Soy [nombre], ¿con quién tengo el gusto?'"
    );
  } else if (!hasEmail && !hasPhone) {
    const what = captureEmail && capturePhone
      ? "correo electrónico O su número de WhatsApp"
      : captureEmail ? "correo electrónico" : "número de WhatsApp";
    parts.push(
      `Ya tienes el nombre. Cuando sea el momento natural en la conversación, pide su ${what} para enviarle información o darle seguimiento. Ejemplo: '¿Me compartes tu correo para enviarte los detalles?' o '¿Tienes WhatsApp para darte seguimiento personalizado?'`
    );
  }

  parts.push(
    "\nMARCERS (invisibles para el visitante — el sistema los detecta):",
    "- Cuando tengas nombre + (email O teléfono), añade [LEAD_CAPTURED] al FINAL de tu mensaje.",
    "- Si detectas que el visitante quiere hablar con una persona, añade [ESCALAR] al FINAL."
  );

  parts.push(
    "\nSUGERENCIAS: Al FINAL de CADA respuesta (después del texto y markers), añade EXACTAMENTE:",
    "[SUGERENCIAS: Pregunta corta 1 | Pregunta corta 2 | Pregunta corta 3]",
    "Las sugerencias deben ser 3 preguntas o frases cortas (máx 45 caracteres c/u) que el visitante podría querer preguntar a continuación, basadas en el contexto actual de la conversación."
  );

  return parts.join("\n");
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_token, message, visitor_name, visitor_email, visitor_phone } = await req.json();

    if (!session_token || !message?.trim()) {
      return new Response(JSON.stringify({ error: "session_token y message requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Validate session and load widget settings in parallel
    const { data: session, error: sessionError } = await supabase
      .from("widget_sessions")
      .select("*")
      .eq("session_token", session_token)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Sesión inválida o expirada" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = session.tenant_id;

    const { data: widgetSettings } = await supabase
      .from("widget_settings")
      .select("capture_email, capture_phone")
      .eq("tenant_id", tenantId)
      .single();

    const captureEmail = widgetSettings?.capture_email !== false;
    const capturePhone = widgetSettings?.capture_phone !== false;

    // 2. Merge incoming visitor data with what we already have
    const effectiveName = (visitor_name?.trim() || session.visitor_name) ?? null;
    const effectiveEmail = (visitor_email?.trim()?.toLowerCase() || session.visitor_email) ?? null;
    const effectivePhone = (visitor_phone?.trim() || session.visitor_phone) ?? null;

    const dataUpdates: Record<string, unknown> = {};
    if (effectiveName && effectiveName !== session.visitor_name) dataUpdates.visitor_name = effectiveName;
    if (effectiveEmail && effectiveEmail !== session.visitor_email) dataUpdates.visitor_email = effectiveEmail;
    if (effectivePhone && effectivePhone !== session.visitor_phone) dataUpdates.visitor_phone = effectivePhone;

    // 3. Create contact + conversation if we have name + (email or phone) and lead not yet captured
    let contactId: string | null = session.contact_id;
    let conversationId: string | null = session.conversation_id;

    const shouldConvert = !contactId && effectiveName && (effectiveEmail || effectivePhone);

    if (shouldConvert) {
      const { data: contact } = await supabase
        .from("contacts")
        .insert({
          tenant_id: tenantId,
          name: effectiveName,
          email: effectiveEmail || null,
          phone: effectivePhone || null,
          source: "website",
          entry_source: "web_widget",
          source_context: session.landing_page || null,
          status: "active",
          lead_score: 20,
          lead_temperature: "warm",
          pipeline_stage: "etapa_0_captacion",
          operational_status: "ACTIVE",
        })
        .select("id")
        .single();

      if (contact) {
        contactId = contact.id;
        dataUpdates.contact_id = contactId;
        dataUpdates.lead_captured_at = new Date().toISOString();
        dataUpdates.status = "converted";

        // Attribution record with UTMs
        if (session.utm_source || session.landing_page) {
          await supabase.from("attribution").insert({
            tenant_id: tenantId,
            contact_id: contactId,
            utm_source: session.utm_source || null,
            utm_medium: session.utm_medium || null,
            utm_campaign: session.utm_campaign || null,
            utm_content: session.utm_content || null,
            utm_term: session.utm_term || null,
            landing_page: session.landing_page || null,
            referrer: session.referrer || null,
            entry_channel: "web_chat",
            captured_at: new Date().toISOString(),
          });
        }

        // Create conversation (web_chat channel)
        const { data: conv } = await supabase
          .from("conversations")
          .insert({
            tenant_id: tenantId,
            contact_id: contactId,
            channel: "web_chat",
            customer_whatsapp: effectivePhone || null,
            ai_enabled: true,
            ai_state: "active",
            status: "active",
            last_customer_message_at: new Date().toISOString(),
            last_message_preview: message.slice(0, 120),
            last_message_direction: "inbound",
            last_message_source: "manual",
          })
          .select("id")
          .single();

        if (conv) {
          conversationId = conv.id;
          dataUpdates.conversation_id = conversationId;

          // Bulk-insert previous messages from session history
          const prevMsgs = (session.messages as Array<{ role: string; content: string; ts?: string }>) || [];
          if (prevMsgs.length > 0) {
            await supabase.from("messages").insert(
              prevMsgs.map((m) => ({
                tenant_id: tenantId,
                conversation_id: conversationId!,
                contact_id: contactId,
                direction: m.role === "user" ? "inbound" : "outbound",
                source: m.role === "user" ? "manual" : "ai",
                channel: "web_chat",
                body: m.content,
                ai_generated: m.role === "assistant",
                created_at: m.ts || new Date().toISOString(),
              }))
            );
          }
        }
      }
    }

    // 4. Load AI settings and knowledge base in parallel
    const [{ data: aiSettings }, { data: kb }] = await Promise.all([
      supabase.from("tenant_ai_settings").select("*").eq("tenant_id", tenantId).single(),
      supabase
        .from("ai_knowledge_base")
        .select("question, answer, category")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .limit(80),
    ]);

    // 5. Build prompt
    const kbBlock = kb?.length
      ? "\n\nBASE DE CONOCIMIENTO:\n" +
        kb.map((e: { question: string; answer: string; category: string }) =>
          `[${e.category}] P: ${e.question}\nR: ${e.answer}`
        ).join("\n\n")
      : "\n\nBASE DE CONOCIMIENTO: (sin entradas configuradas — responde solo con información general sobre la empresa)";

    const captureBlock = buildCaptureInstructions(
      !!effectiveName,
      !!effectiveEmail,
      !!effectivePhone,
      session.status === "converted" || !!dataUpdates.status,
      captureEmail,
      capturePhone,
    );

    const systemPrompt = buildSystemPrompt(aiSettings || {}) + captureBlock + kbBlock;

    // 6. Build messages array for OpenRouter
    const historyMsgs = (session.messages as Array<{ role: string; content: string }>) || [];
    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...historyMsgs.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    // 7. Call OpenRouter
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openrouterKey) throw new Error("OPENROUTER_API_KEY no configurado");

    const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error(`OpenRouter error ${aiResp.status}: ${errText}`);
    }

    const aiData = await aiResp.json();
    const rawResponse: string =
      aiData.choices?.[0]?.message?.content ||
      "Lo siento, tuve un problema al procesar tu mensaje. ¿Puedes intentarlo de nuevo?";

    // 8. Parse markers
    const leadCaptured = rawResponse.includes("[LEAD_CAPTURED]");
    const escalar = rawResponse.includes("[ESCALAR]");
    const requestEmail = rawResponse.includes("[SOLICITAR_EMAIL]");
    const requestPhone = rawResponse.includes("[SOLICITAR_TELEFONO]");

    // Extract suggestions
    let suggestions: string[] = [];
    const sugMatch = rawResponse.match(/\[SUGERENCIAS:\s*([^\]]+)\]/);
    if (sugMatch) {
      suggestions = sugMatch[1]
        .split("|")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .slice(0, 4);
    }

    // Clean response (remove all system markers)
    let clean = rawResponse
      .replace(/\[LEAD_CAPTURED\]/g, "")
      .replace(/\[ESCALAR\]/g, "")
      .replace(/\[SOLICITAR_EMAIL\]/g, "")
      .replace(/\[SOLICITAR_TELEFONO\]/g, "")
      .replace(/\[SUGERENCIAS:[^\]]+\]/g, "")
      .trim();

    if (aiSettings && !(aiSettings as Record<string, unknown>).use_emojis) clean = stripEmojis(clean);
    const maxLen = (aiSettings as Record<string, unknown>)?.max_message_length as number;
    if (maxLen) clean = enforceMaxLength(clean, maxLen);

    // 9. Save messages and insert into conversations table if it exists
    const now = new Date().toISOString();
    const updatedMessages = [
      ...historyMsgs,
      { role: "user", content: message, ts: now },
      { role: "assistant", content: clean, ts: now },
    ];

    // Insert current message pair into messages table if conversation exists
    const currentConvId = conversationId || (dataUpdates.conversation_id as string | null);
    if (currentConvId && contactId) {
      await supabase.from("messages").insert([
        {
          tenant_id: tenantId,
          conversation_id: currentConvId,
          contact_id: contactId,
          direction: "inbound",
          source: "manual",
          channel: "web_chat",
          body: message,
        },
        {
          tenant_id: tenantId,
          conversation_id: currentConvId,
          contact_id: contactId,
          direction: "outbound",
          source: "ai",
          channel: "web_chat",
          body: clean,
          ai_generated: true,
        },
      ]);

      // Update conversation last_message fields
      await supabase
        .from("conversations")
        .update({
          last_customer_message_at: now,
          last_message_preview: clean.slice(0, 120),
          last_message_direction: "outbound",
          last_message_source: "ai",
          unread_count: 1,
          updated_at: now,
        })
        .eq("id", currentConvId);
    }

    // 10. Persist session updates
    await supabase
      .from("widget_sessions")
      .update({
        messages: updatedMessages,
        ai_turns: (session.ai_turns || 0) + 1,
        updated_at: now,
        ...dataUpdates,
      })
      .eq("id", session.id);

    return new Response(
      JSON.stringify({
        response: clean,
        suggestions,
        detected: {
          lead_captured: leadCaptured || !!dataUpdates.contact_id,
          request_email: requestEmail,
          request_phone: requestPhone,
          escalate: escalar,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[widget-chat] error:", err);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
