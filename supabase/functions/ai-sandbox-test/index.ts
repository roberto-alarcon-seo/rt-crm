import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REGION_CONTEXT: Record<string, { country: string; currency: string; context: string }> = {
  MX: { country: "México", currency: "MXN ($)", context: 'Español de México neutro. Trato profesional y directo. Usa "ahorita", "platicar", "¿cómo le va?" si el contexto lo permite. Evita formalismos exagerados.' },
  CO: { country: "Colombia", currency: "COP ($)", context: 'Español colombiano (acento bogotano neutro). Profesional y cálido. Usa "con mucho gusto", "le cuento que…", "¿cómo le va?". Trato respetuoso y cercano.' },
  PE: { country: "Perú", currency: "PEN (S/)", context: 'Español peruano. Profesional y cordial. Usa "claro que sí", "con gusto", "le indico". Tono cálido y directo.' },
  AR: { country: "Argentina", currency: "ARS ($)", context: 'Español rioplatense. Usa "vos" y conjugación voseante (tenés, querés, podés). Profesional pero cercano. Usa "dale", "bárbaro", "che" en contexto informal.' },
  CL: { country: "Chile", currency: "CLP ($)", context: 'Español chileno. Profesional. Usa "bacán", "cachai", tono directo y eficiente. Trato respetuoso.' },
  ES: { country: "España", currency: "EUR (€)", context: 'Español castellano peninsular. Usa "vale", "venga", "estupendo". Usa "ordenador" (no "computadora"), "móvil" (no "celular"). Tono profesional europeo.' },
  US: { country: "Estados Unidos (hispano)", currency: "USD ($)", context: "Español neutro latino. Puede mezclar términos en inglés si el cliente lo hace. Tono profesional y ágil." },
};

const FORMALITY_TEXT: Record<string, string> = {
  tu: 'Trata al cliente de "tú" (informal cercano).',
  usted: 'Trata al cliente de "usted" (formal y respetuoso). Nunca uses "tú".',
  vos: 'Trata al cliente de "vos" (informal rioplatense).',
};

const LANGUAGE_TEXT: Record<string, string> = {
  es: "Responde SIEMPRE en español.",
  en: "Responde SIEMPRE en inglés.",
  pt: "Responde SIEMPRE en portugués.",
};

// === B2B Trigger lists ===
const HUMAN_REQUEST_TRIGGERS = [
  "hablar con persona", "agente humano", "representante", "persona real",
  "no quiero bot", "quiero hablar con alguien", "asesor", "ejecutivo",
  "hablar con humano", "hablar con un humano", "una persona", "con una persona",
  "eres una maquina", "eres una máquina", "eres un bot", "eres robot",
  "quiero un humano", "pasame con", "pásome con", "comunicame con", "comunícame con",
  "me atienda alguien", "que me atienda", "alguien que me atienda",
];
const FRUSTRATION_TRIGGERS = [
  "esto no sirve", "no me ayudas", "eres inutil", "eres inútil", "incompetente",
  "urgente", "es una emergencia", "llevo horas", "llevo días", "llevo dias",
  "estoy enojado", "estoy enojada", "estoy molesto", "estoy molesta",
  "estoy harto", "estoy harta", "estoy furioso", "estoy furiosa",
  "estoy cabreado", "estoy cabreada", "qué frustrante", "que frustrante",
  "me tienen harto", "me tienen harta", "esto es ridículo", "esto es ridiculo",
  "pésimo servicio", "pesimo servicio", "mal servicio", "una vergüenza", "una verguenza",
  "no me sirve", "estoy frustrado", "estoy frustrada", "no entiendes nada",
  "coño", "joder", "mierda", "estafa", "estafadores",
];
const DEMO_TRIGGERS = [
  "agendar demo", "agendar una demo", "quiero ver una demo", "demo del producto",
  "quiero ver cómo funciona", "presentación del producto", "agendar llamada",
  "reunión con el equipo", "hablar con ventas", "hablar con comercial",
  "cuando podemos hablar", "cuándo podemos hablar", "programar reunión",
];
const PRICE_NEGOTIATION_TRIGGERS = [
  "descuento", "rebaja", "negociar precio", "negociable", "mejor precio",
  "más barato", "mas barato", "bajar el precio", "reducir el precio",
  "precio especial", "oferta", "promoción", "promocion",
];
const LEGAL_TRIGGERS = [
  "contrato", "acuerdo", "NDA", "convenio", "términos legales", "terminos legales",
  "cláusulas", "clausulas", "facturación", "facturacion", "orden de compra",
  "proceso de compras", "alta de proveedor", "validación de proveedor",
];

function isWithinBusinessHours(bh: any): { open: boolean; configured: boolean } {
  if (!bh || !bh.enabled) return { open: true, configured: false };
  try {
    const tz = bh.timezone || "America/Mexico_City";
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    const parts = fmt.formatToParts(now);
    const wd = parts.find(p => p.type === "weekday")?.value?.toLowerCase().slice(0, 3) || "";
    const hh = parts.find(p => p.type === "hour")?.value || "00";
    const mm = parts.find(p => p.type === "minute")?.value || "00";
    const day = bh.days?.[wd];
    if (!day || !day.open || !day.close) return { open: false, configured: true };
    const cur = `${hh}:${mm}`;
    return { open: cur >= day.open && cur <= day.close, configured: true };
  } catch { return { open: true, configured: false }; }
}

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

function buildSystemPrompt(s: any) {
  const region = REGION_CONTEXT[(s.region_code || "MX").toUpperCase()] || REGION_CONTEXT.MX;
  const formality = FORMALITY_TEXT[s.formality || "tu"] || FORMALITY_TEXT.tu;
  const language = LANGUAGE_TEXT[s.language || "es"] || LANGUAGE_TEXT.es;
  const maxLen = s.max_message_length || 320;

  const tone: Record<string, string> = {
    cordial: "Sé amable y respetuoso en todo momento.",
    professional: "Mantén un tono profesional y directo.",
    friendly: "Sé casual y cercano, como si hablaras con un colega.",
    adaptive: "Adapta tu tono al estilo del cliente.",
    consultive: "Actúa como consultor experto: escucha, diagnostica, recomienda.",
  };
  const emojiInstr = s.use_emojis
    ? `Puedes usar hasta ${s.max_emojis_per_message || 2} emoji(s) por mensaje. NUNCA superes ese límite.`
    : "PROHIBIDO usar emojis. No incluyas ningún emoji bajo ninguna circunstancia.";
  const identity = s.never_reveal_ai
    ? "NUNCA reveles que eres una IA. Actúa como un asistente humano."
    : "";

  const ht = s.handoff_triggers || {};
  const handoffRules: string[] = [];
  if (s.escalate_on_human_request !== false) handoffRules.push('Si el cliente pide hablar con una persona/asesor/ejecutivo/humano, responde brevemente y AÑADE al final el marcador literal [ESCALAR].');
  if (s.escalate_on_frustration !== false) handoffRules.push('Si detectas frustración, enojo o molestia ("estoy molesto/harto", "no me ayudas", "esto no sirve", insultos, mayúsculas sostenidas), discúlpate brevemente y AÑADE [ESCALAR]. NO intentes resolver tú mismo.');
  if (ht.on_price_negotiation) handoffRules.push("Si el cliente quiere negociar precio, descuento o condiciones comerciales especiales, AÑADE [ESCALAR] al final.");
  if (ht.on_legal_question) handoffRules.push("Si el cliente pregunta por contratos, NDAs, términos legales, proceso de compras o alta de proveedor, AÑADE [ESCALAR] al final.");
  if (ht.on_schedule_visit) handoffRules.push("Si el cliente quiere agendar una demo, reunión o llamada con el equipo, AÑADE [ESCALAR] al final.");
  if (s.escalate_on_no_answer !== false) handoffRules.push("Si NO tienes la información en la base de conocimiento, NO inventes. Responde brevemente y AÑADE [ESCALAR].");
  const handoffBlock = handoffRules.length
    ? `\n\nREGLAS DE ESCALAMIENTO A HUMANO (CRÍTICO — debes obedecer SIEMPRE):\n- ${handoffRules.join("\n- ")}\n- El marcador [ESCALAR] debe ir SIEMPRE al final del mensaje, en mayúsculas y entre corchetes literales. Es invisible para el cliente; el sistema lo detecta para reasignar.`
    : "";

  return `Eres ${s.agent_name || "Asistente"}, representante de ${s.company_name || "la empresa"}.

CONTEXTO REGIONAL (OBLIGATORIO):
- País del cliente: ${region.country}
- Moneda de referencia: ${region.currency}
- ${region.context}
- ${formality}
- ${language}
- LONGITUD MÁXIMA: cada mensaje debe tener máximo ${maxLen} caracteres. Sé breve y directo.

INSTRUCCIONES DE ESTILO:
- ${tone[s.tone] || tone.professional}
- ${emojiInstr}
- ${identity}${handoffBlock}

REGLA CRÍTICA ANTI-ALUCINACIÓN:
- Responde ÚNICAMENTE con datos que aparezcan textualmente en BASE DE CONOCIMIENTO más abajo.
- Si el cliente pregunta por algo que NO está en la base de conocimiento, NO inventes. Responde una frase breve y AÑADE [ESCALAR] al final.

MODO SANDBOX: Esta es una conversación de prueba para validar el comportamiento configurado. Responde como lo harías con un prospecto real, respetando todas las reglas.

COMPORTAMIENTO DEL NEGOCIO:
${s.behavior_prompt || "(sin instrucciones específicas)"}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { settings, messages, tenant_id, simulate_delay } = await req.json();
    if (!settings || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "settings y messages requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openrouterKey) throw new Error("OPENROUTER_API_KEY missing");

    // === Pre-AI checks ===
    const lastUser = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    const lower = lastUser.toLowerCase();
    const ht = settings.handoff_triggers || {};

    // Business hours check
    const bh = isWithinBusinessHours(settings.business_hours);
    if (bh.configured && !bh.open && ht.on_after_hours !== false) {
      const oohMsg = settings.out_of_hours_message || "Gracias por escribirnos. Te responderemos en cuanto abramos.";
      return new Response(JSON.stringify({
        response: oohMsg, raw: oohMsg,
        detected: { escalar: true, seguimiento: false },
        pre_ai_escalation: "after_hours",
        system_prompt_preview: "[Pre-AI] Fuera de horario de atención.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Max AI turns check
    const aiTurns = messages.filter((m: any) => m.role === "assistant").length;
    const maxTurns = settings.max_ai_turns_before_handoff || 8;
    if (ht.on_max_turns !== false && aiTurns >= maxTurns) {
      const msg = settings.fallback_message || "Enseguida te atiende un asesor.";
      return new Response(JSON.stringify({
        response: msg, raw: `${msg} [ESCALAR]`,
        detected: { escalar: true, seguimiento: false },
        pre_ai_escalation: "max_turns",
        system_prompt_preview: `[Pre-AI] Máximo de ${maxTurns} turnos alcanzado.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Trigger keyword matching
    const triggerHits: { reason: string; matched: string } | null = (() => {
      if (settings.escalate_on_human_request !== false) {
        const m = HUMAN_REQUEST_TRIGGERS.find(t => lower.includes(t));
        if (m) return { reason: "human_request", matched: m };
      }
      if (settings.escalate_on_frustration !== false) {
        const m = FRUSTRATION_TRIGGERS.find(t => lower.includes(t));
        if (m) return { reason: "frustration", matched: m };
      }
      if (ht.on_schedule_visit !== false) {
        const m = DEMO_TRIGGERS.find(t => lower.includes(t));
        if (m) return { reason: "demo_request", matched: m };
      }
      if (ht.on_price_negotiation) {
        const m = PRICE_NEGOTIATION_TRIGGERS.find(t => lower.includes(t));
        if (m) return { reason: "price_negotiation", matched: m };
      }
      if (ht.on_legal_question) {
        const m = LEGAL_TRIGGERS.find(t => lower.includes(t));
        if (m) return { reason: "legal_question", matched: m };
      }
      return null;
    })();
    if (triggerHits) {
      const msg = settings.fallback_message || "Enseguida te atiende un asesor.";
      return new Response(JSON.stringify({
        response: msg, raw: `${msg} [ESCALAR]`,
        detected: { escalar: true, seguimiento: false },
        pre_ai_escalation: triggerHits.reason,
        matched_trigger: triggerHits.matched,
        system_prompt_preview: `[Pre-AI] Trigger "${triggerHits.matched}" → ${triggerHits.reason}.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load knowledge base for realistic sandbox context
    let kbContext = "";
    if (tenant_id) {
      const { data: kb } = await supabase
        .from("ai_knowledge_base")
        .select("question, answer, category, collection, entry_type, url, file_name")
        .eq("tenant_id", tenant_id)
        .eq("is_active", true)
        .limit(100);
      if (kb?.length) {
        kbContext = "\n\nBASE DE CONOCIMIENTO:\n" +
          kb.map((k: any) => {
            const prefix = `[${k.collection || k.category || "general"}]`;
            switch (k.entry_type) {
              case 'info': return `${prefix} INFO: ${k.question ? k.question + '\n' : ''}${k.answer}`;
              case 'url': return `${prefix} RECURSO: ${k.question}\nURL: ${k.url || ''}\n${k.answer || ''}`;
              case 'file': return `${prefix} DOCUMENTO: ${k.question}${k.file_name ? ' (' + k.file_name + ')' : ''}\n${k.answer}`;
              default: return `${prefix} P: ${k.question}\nR: ${k.answer}`;
            }
          }).join("\n\n");
      }
    }

    const systemPrompt = buildSystemPrompt(settings) + kbContext;

    const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Límite de solicitudes excedido. Intenta de nuevo en unos segundos." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "Sin créditos de IA. Recarga tu workspace." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Error en el modelo de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    let text: string = data.choices?.[0]?.message?.content || "";

    if (!settings.use_emojis) text = stripEmojis(text);
    text = enforceMaxLength(text, settings.max_message_length || 320);

    const markers = {
      escalar: /\[ESCALAR\]/g,
      seguimiento: /\[SEGUIMIENTO_HUMANO\]/g,
    };
    const detected = {
      escalar: markers.escalar.test(text),
      seguimiento: markers.seguimiento.test(text),
    };
    let clean = text;
    for (const re of Object.values(markers)) clean = clean.replace(re, "").trim();

    const delaySec = Math.min(Number(settings.response_delay_seconds || 0), 5);
    if (simulate_delay && delaySec > 0) {
      await new Promise(r => setTimeout(r, delaySec * 1000));
    }

    return new Response(
      JSON.stringify({
        response: clean, raw: text, detected,
        applied_delay_seconds: simulate_delay ? delaySec : 0,
        system_prompt_preview: systemPrompt.slice(0, 1200),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sandbox error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
