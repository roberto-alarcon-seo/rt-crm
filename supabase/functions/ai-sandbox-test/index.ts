import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REGION_CONTEXT: Record<string, { country: string; currency: string; modismos: string }> = {
  MX: { country: "MÃ©xico", currency: "MXN ($)", modismos: 'EspaÃ±ol de MÃ©xico neutral. USA: "departamento", "recÃ¡mara", "alberca", "cochera", "Infonavit/Fovissste", "enganche", "mensualidades", "ahorita", "platicar". EVITA: "piso" (usa departamento), "habitaciÃ³n" (usa recÃ¡mara), "coche" (usa carro/auto), "vale" (usa "ok/sale"), "vosotros", "tÃ­o/tÃ­a".' },
  CO: { country: "Colombia", currency: "COP ($)", modismos: 'EspaÃ±ol colombiano (acento bogotano neutro). USA: "apartamento", "habitaciÃ³n/alcoba", "parqueadero", "subsidio MiCasaYa", "cuota inicial", "arriendo", "chÃ©vere", "parcero" (informal), "Â¿cÃ³mo le va?", "le cuento queâ€¦", "con mucho gusto". EVITA: "departamento", "recÃ¡mara", "piso", "vale", "guay", "tÃ­o/tÃ­a", "vosotros".' },
  PE: { country: "PerÃº", currency: "PEN (S/)", modismos: 'EspaÃ±ol peruano. USA: "departamento", "dormitorio", "cochera", "crÃ©dito Mivivienda/Techo Propio", "inicial", "cuotas", "chÃ©vere", "bacÃ¡n". EVITA: "piso", "vale", "vosotros".' },
  AR: { country: "Argentina", currency: "ARS ($)", modismos: 'EspaÃ±ol rioplatense. USA "vos" y conjugaciÃ³n voseante (tenÃ©s, querÃ©s, podÃ©s, sabÃ©s). USA: "departamento", "ambientes" (no "recÃ¡maras"), "expensas", "cochera", "che", "dale", "barbaro". EVITA: "tÃº", "vosotros", "piso".' },
  CL: { country: "Chile", currency: "CLP ($)", modismos: 'EspaÃ±ol chileno. USA: "departamento", "dormitorio", "estacionamiento", "UF", "pie" (enganche), "bacÃ¡n", "cachÃ¡i". EVITA: "piso", "recÃ¡mara", "vale", "vosotros".' },
  ES: { country: "EspaÃ±a", currency: "EUR (â‚¬)", modismos: 'OBLIGATORIO ESPAÃ‘OL DE ESPAÃ‘A (castellano peninsular). USA SIEMPRE: "piso" (NUNCA "departamento" ni "apartamento" salvo unifamiliar pequeÃ±o), "habitaciÃ³n" (NUNCA "recÃ¡mara" ni "dormitorio" como tÃ©rmino principal), "salÃ³n", "cocina", "cuarto de baÃ±o/aseo", "plaza de garaje", "trastero", "comunidad de propietarios", "IBI", "arras", "hipoteca", "nÃ³mina", "Hacienda", "ascensor". USA expresiones locales: "vale", "venga", "estupendo", "genial", "que tal", "perfecto", "encantado/a", "un saludo cordial". USA "coger" (tomar), "ordenador" (no "computadora"), "mÃ³vil" (no "celular"), "coche" (no "carro/auto"). PROHIBIDO: "ahorita", "platicar", "departamento", "recÃ¡mara", "carro", "celular", "computadora", "okey", "sale", "chÃ©vere", "bacÃ¡n", "parqueadero", "alberca" (di "piscina"), "cochera" (di "garaje"), "enganche" (di "entrada"), "mensualidades" (di "cuota mensual/letra"). NO uses "vosotros" salvo para grupo informal; con cliente usa "usted" o "tÃº" segÃºn formalidad.' },
  US: { country: "Estados Unidos (hispano)", currency: "USD ($)", modismos: "EspaÃ±ol neutro latino, tÃ©rminos bilingÃ¼es si el cliente cambia de idioma." },
};

const FORMALITY_TEXT: Record<string, string> = {
  tu: 'Trata al cliente de "tÃº" (informal cercano).',
  usted: 'Trata al cliente de "usted" (formal y respetuoso). Nunca uses "tÃº".',
  vos: 'Trata al cliente de "vos" (informal rioplatense).',
};

const LANGUAGE_TEXT: Record<string, string> = {
  es: "Responde SIEMPRE en espaÃ±ol.",
  en: "Responde SIEMPRE en inglÃ©s.",
  pt: "Responde SIEMPRE en portuguÃ©s.",
};

// === Trigger lists (must match ai-chat-response) ===
const HUMAN_REQUEST_TRIGGERS = [
  "hablar con persona", "agente humano", "representante", "persona real",
  "no quiero bot", "quiero hablar con alguien", "asesor", "ejecutivo",
  "hablar con humano", "hablar con un humano", "una persona", "con una persona",
  "eres una maquina", "eres una mÃ¡quina", "eres un bot", "eres robot",
  "quiero un humano", "pasame con", "pÃ¡same con", "comunicame con", "comunÃ­came con",
  "me atienda alguien", "que me atienda", "alguien que me atienda",
];
const FRUSTRATION_TRIGGERS = [
  "esto no sirve", "no me ayudas", "eres inutil", "eres inÃºtil", "incompetente",
  "urgente", "es una emergencia", "llevo horas", "llevo dÃ­as", "llevo dias",
  "estoy enojado", "estoy enojada", "estoy molesto", "estoy molesta",
  "estoy harto", "estoy harta", "estoy furioso", "estoy furiosa",
  "estoy cabreado", "estoy cabreada", "quÃ© frustrante", "que frustrante",
  "me tienen harto", "me tienen harta", "esto es ridÃ­culo", "esto es ridiculo",
  "pÃ©simo servicio", "pesimo servicio", "mal servicio", "una vergÃ¼enza", "una verguenza",
  "no me sirve", "estoy frustrado", "estoy frustrada", "no entiendes nada",
  "coÃ±o", "joder", "mierda", "estafa", "estafadores",
];
const VISIT_TRIGGERS = [
  "agendar visita", "agendar cita", "quiero visitar", "quiero ver el", "quiero ver la",
  "puedo ir a ver", "puedo verla", "puedo verlo", "ir a verla", "ir a verlo",
  "visitar el inmueble", "visitar la propiedad", "ver la casa", "ver el departamento",
  "cuando puedo ir", "cuÃ¡ndo puedo ir", "horario para visita", "programar visita",
];
const PRICE_NEGOTIATION_TRIGGERS = [
  "descuento", "rebaja", "negociar precio", "negociable", "mejor precio",
  "mÃ¡s barato", "mas barato", "bajar el precio", "reducir el precio",
];
const LEGAL_TRIGGERS = [
  "escritura", "notario", "notarÃ­a", "notaria", "impuestos", "fiscal",
  "simulaciÃ³n de crÃ©dito", "simulacion de credito", "trÃ¡mite legal", "tramite legal",
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
  return (lastSpace > maxLen * 0.7 ? cut.slice(0, lastSpace) : cut).trim() + "â€¦";
}

function buildSystemPrompt(s: any) {
  const region = REGION_CONTEXT[(s.region_code || "MX").toUpperCase()] || REGION_CONTEXT.MX;
  const formality = FORMALITY_TEXT[s.formality || "tu"] || FORMALITY_TEXT.tu;
  const language = LANGUAGE_TEXT[s.language || "es"] || LANGUAGE_TEXT.es;
  const maxLen = s.max_message_length || 320;

  const tone: Record<string, string> = {
    cordial: "SÃ© amable y respetuoso en todo momento.",
    professional: "MantÃ©n un tono profesional y directo.",
    friendly: "SÃ© casual y cercano, como si hablaras con un amigo.",
    adaptive: "Adapta tu tono al estilo del cliente.",
  };
  const emojiInstr = s.use_emojis
    ? `Puedes usar hasta ${s.max_emojis_per_message || 2} emoji(s) por mensaje. NUNCA superes ese lÃ­mite.`
    : "PROHIBIDO usar emojis. No incluyas ningÃºn emoji bajo ninguna circunstancia.";
  const identity = s.never_reveal_ai
    ? "NUNCA reveles que eres una IA. ActÃºa como un asistente humano."
    : "";

  // Handoff rules (must be explicit so the model emits [ESCALAR])
  const ht = s.handoff_triggers || {};
  const handoffRules: string[] = [];
  if (s.escalate_on_human_request !== false) handoffRules.push('Si el cliente pide hablar con una persona/asesor/agente/humano (ej: "quiero hablar con alguien", "una persona real", "un humano", "un asesor"), responde una frase breve y empÃ¡tica y AÃ‘ADE al final el marcador literal [ESCALAR].');
  if (s.escalate_on_frustration !== false) handoffRules.push('Si detectas frustraciÃ³n, enojo o molestia ("estoy enojado/molesto/harto", "no me ayudas", "esto no sirve", "llevo horas", "urgente", insultos, mayÃºsculas sostenidas, signos de exclamaciÃ³n mÃºltiples), discÃºlpate brevemente y AÃ‘ADE al final [ESCALAR]. NO intentes resolver tÃº mismo.');
  if (ht.on_price_negotiation) handoffRules.push("Si el cliente quiere negociar precio o pedir descuento, AÃ‘ADE [ESCALAR] al final.");
  if (ht.on_legal_question) handoffRules.push("Si el cliente hace una pregunta legal, fiscal o financiera especÃ­fica (escrituras, notario, simulaciÃ³n de crÃ©dito), AÃ‘ADE [ESCALAR] al final.");
  if (ht.on_schedule_visit) handoffRules.push("Si el cliente pide agendar una visita, AÃ‘ADE [ESCALAR] al final.");
  if (s.escalate_on_no_answer !== false) handoffRules.push("Si NO tienes el dato en la base de conocimiento ni en el inventario, NO inventes. Responde brevemente y AÃ‘ADE [ESCALAR].");
  const handoffBlock = handoffRules.length
    ? `\n\nREGLAS DE ESCALAMIENTO A HUMANO (CRÃTICO â€” debes obedecer SIEMPRE):\n- ${handoffRules.join("\n- ")}\n- El marcador [ESCALAR] debe ir SIEMPRE al final del mensaje, en mayÃºsculas y entre corchetes literales. Es invisible para el cliente; el sistema lo detecta para reasignar.`
    : "";

  return `Eres ${s.agent_name || "Asistente"}, asistente de ${s.company_name || "la empresa"}.

CONTEXTO REGIONAL (OBLIGATORIO):
- PaÃ­s del cliente: ${region.country}
- Moneda local: ${region.currency}
- ${region.modismos}
- ${formality}
- ${language}
- LONGITUD MÃXIMA: cada mensaje debe tener mÃ¡ximo ${maxLen} caracteres. SÃ© breve y directo.

INSTRUCCIONES DE ESTILO:
- ${tone[s.tone] || tone.professional}
- ${emojiInstr}
- ${identity}${handoffBlock}

REGLA CRÃTICA ANTI-ALUCINACIÃ“N:
- Responde ÃšNICAMENTE con datos que aparezcan textualmente en BASE DE CONOCIMIENTO o PROPIEDADES DISPONIBLES mÃ¡s abajo.
- Si el cliente pregunta por un crÃ©dito, requisito, polÃ­tica, comisiÃ³n, horario, direcciÃ³n o cualquier dato que NO estÃ© literal en este prompt, NO inventes. Responde una frase breve ("DÃ©jame conectarte con un asesor para darte el dato exacto.") y AÃ‘ADE [ESCALAR] al final.
- Si te preguntan por una propiedad y NO estÃ¡ en PROPIEDADES DISPONIBLES, di que no la tienes registrada y AÃ‘ADE [ESCALAR].

MODO SANDBOX: Esta es una conversaciÃ³n de prueba para validar el comportamiento configurado. Responde como lo harÃ­as con un cliente real, respetando todas las reglas.

COMPORTAMIENTO DEL NEGOCIO:
${s.behavior_prompt || "(sin instrucciones especÃ­ficas)"}`;
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

    // Auth: require any authenticated tenant user
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

    const lovableKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!lovableKey) throw new Error("OPENROUTER_API_KEY missing");

    // === Pre-AI checks (mirror production) ===
    const lastUser = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    const lower = lastUser.toLowerCase();
    const ht = settings.handoff_triggers || {};

    // Business hours
    const bh = isWithinBusinessHours(settings.business_hours);
    if (bh.configured && !bh.open && ht.on_after_hours !== false) {
      const oohMsg = settings.out_of_hours_message || "Gracias por escribirnos. Te responderemos en cuanto abramos.";
      return new Response(JSON.stringify({
        response: oohMsg, raw: oohMsg,
        detected: { escalar: true, seguimiento: false },
        pre_ai_escalation: "after_hours",
        system_prompt_preview: "[Pre-AI] Fuera de horario de atenciÃ³n.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Max AI turns
    const aiTurns = messages.filter((m: any) => m.role === "assistant").length;
    const maxTurns = settings.max_ai_turns_before_handoff || 8;
    if (ht.on_max_turns !== false && aiTurns >= maxTurns) {
      const msg = settings.fallback_message || "Enseguida te atiende un asesor.";
      return new Response(JSON.stringify({
        response: msg, raw: `${msg} [ESCALAR]`,
        detected: { escalar: true, seguimiento: false },
        pre_ai_escalation: "max_turns",
        system_prompt_preview: `[Pre-AI] MÃ¡ximo de ${maxTurns} turnos alcanzado.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Trigger keywords
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
        const m = VISIT_TRIGGERS.find(t => lower.includes(t));
        if (m) return { reason: "visit_request", matched: m };
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
        system_prompt_preview: `[Pre-AI] Trigger "${triggerHits.matched}" â†’ ${triggerHits.reason}.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cargar inventario y KB del tenant para contexto realista
    let inventoryContext = "";
    let kbContext = "";
    if (tenant_id) {
      const [propsRes, kbRes] = await Promise.all([
        supabase
          .from("properties")
          .select("id, title, property_code, zone, price, currency, operation_type, property_type, status, address, description, accepted_credits")
          .eq("tenant_id", tenant_id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("ai_knowledge_base")
          .select("question, answer, category")
          .eq("tenant_id", tenant_id)
          .eq("is_active", true)
          .limit(100),
      ]);
      const props = propsRes.data || [];
      let faqsByProp: Record<string, { question: string; answer: string }[]> = {};
      if (props.length) {
        const ids = props.map((p: any) => p.id);
        const { data: faqs } = await supabase
          .from("property_faq")
          .select("property_id, question, answer")
          .in("property_id", ids);
        for (const f of faqs || []) {
          (faqsByProp[(f as any).property_id] ||= []).push({ question: (f as any).question, answer: (f as any).answer });
        }
      }
      if (props.length) {
        inventoryContext = "\n\nPROPIEDADES DISPONIBLES (inventario real del tenant):\n" +
          props.map((p: any) => {
            const faqs = faqsByProp[p.id] || [];
            const faqText = faqs.length
              ? `\n  FAQs:\n${faqs.map(f => `    P: ${f.question}\n    R: ${f.answer}`).join("\n")}`
              : "";
            return `- ${p.title} (CÃ³digo: ${p.property_code}) | Zona: ${p.zone} | Precio: $${(p.price || 0).toLocaleString()} ${p.currency} | ${p.operation_type} | Tipo: ${p.property_type || "â€”"} | Estatus: ${p.status}${p.address ? ` | DirecciÃ³n: ${p.address}` : ""}${p.description ? `\n  DescripciÃ³n: ${p.description}` : ""}${p.accepted_credits?.length ? `\n  CrÃ©ditos: ${p.accepted_credits.join(", ")}` : ""}${faqText}`;
          }).join("\n");
      } else {
        inventoryContext = "\n\nPROPIEDADES DISPONIBLES: (no hay inmuebles activos cargados)";
      }
      const kb = kbRes.data || [];
      if (kb.length) {
        kbContext = "\n\nBASE DE CONOCIMIENTO:\n" +
          kb.map((k: any) => `- [${k.category || "general"}] P: ${k.question}\n  R: ${k.answer}`).join("\n");
      }
    }

    const systemPrompt = buildSystemPrompt(settings) + inventoryContext + kbContext;

    const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "LÃ­mite de solicitudes excedido. Intenta de nuevo en unos segundos." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "Sin crÃ©ditos de IA. Recarga tu workspace." }), {
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

    // Post-processing same as production
    if (!settings.use_emojis) text = stripEmojis(text);
    text = enforceMaxLength(text, settings.max_message_length || 320);

    // Strip internal markers from sandbox preview
    const markers = {
      escalar: /\[ESCALAR\]/g,
      seguimiento: /\[SEGUIMIENTO_HUMANO\]/g,
      fotos: /\[FOTOS:[^\]]+\]/g,
      interes: /\[PROPIEDAD_INTERES:[^\]]+\]/g,
    };
    const detected = {
      escalar: markers.escalar.test(text),
      seguimiento: markers.seguimiento.test(text),
    };
    let clean = text;
    for (const re of Object.values(markers)) clean = clean.replace(re, "").trim();

    // Simulate response delay (capped at 5s)
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
