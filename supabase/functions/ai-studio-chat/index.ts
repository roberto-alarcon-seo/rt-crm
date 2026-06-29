import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function currentDateMX(): string {
  const now = new Date();
  const local = new Date(now.getTime() + -6 * 3600000);
  const days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${days[local.getUTCDay()]}, ${local.getUTCDate()} de ${months[local.getUTCMonth()]} de ${local.getUTCFullYear()}`;
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

function weekStart(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const daysBack = day === 0 ? 6 : day - 1;
  return isoDate(new Date(d.getTime() - daysBack * 86400000));
}

function weekEnd(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const daysForward = day === 0 ? 0 : 7 - day;
  return isoDate(new Date(d.getTime() + daysForward * 86400000));
}

function monthStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  // ── READ TOOLS ──
  {
    type: "function",
    function: {
      name: "get_productivity_report",
      description: "Reporte de productividad: leads nuevos, deals ganados y citas agendadas por asesor en un rango de fechas. Usar cuando pregunten por rendimiento, desempeño o productividad del equipo.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Fecha inicio YYYY-MM-DD" },
          date_to:   { type: "string", description: "Fecha fin YYYY-MM-DD" },
          period_label: { type: "string", description: "Etiqueta del período, ej: 'esta semana'" },
        },
        required: ["date_from", "date_to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description: "Estado actual del pipeline: cuántos leads hay en cada etapa. Usar cuando pregunten por el pipeline, embudo de ventas o cómo están los leads.",
      parameters: {
        type: "object",
        properties: {
          pipeline_type: { type: "string", description: "Tipo de pipeline, ej: 'compra', 'renta' (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_conversion_funnel",
      description: "Embudo de conversión del pipeline con porcentajes entre etapas. Usar cuando pregunten por la tasa de conversión, el funnel o en qué etapa se pierden más leads.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Fecha inicio YYYY-MM-DD (opcional)" },
          date_to:   { type: "string", description: "Fecha fin YYYY-MM-DD (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_leads_without_response",
      description: "Leads que llevan N horas o días sin respuesta del equipo. Usar cuando pregunten por leads abandonados, sin atención o sin respuesta.",
      parameters: {
        type: "object",
        properties: {
          hours_threshold: { type: "number", description: "Horas mínimas sin respuesta (por defecto 48)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_followups_overdue",
      description: "Seguimientos vencidos o próximos a vencer. Usar cuando pregunten por seguimientos atrasados, vencidos o sin completar.",
      parameters: {
        type: "object",
        properties: {
          days_past_due: { type: "number", description: "Días mínimos vencidos para incluir (por defecto 0)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaign_stats",
      description: "Estadísticas de campañas de WhatsApp: enviados, entregados, respondidos. Usar cuando pregunten por campañas, resultados de envíos o marketing.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Número de campañas recientes a mostrar (por defecto 5)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_agent_ranking",
      description: "Ranking de asesores por deals cerrados y leads atendidos. Usar cuando pregunten quién cierra más, ranking del equipo o comparativa de asesores.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Fecha inicio YYYY-MM-DD" },
          date_to:   { type: "string", description: "Fecha fin YYYY-MM-DD" },
          period_label: { type: "string", description: "Etiqueta del período" },
        },
        required: ["date_from", "date_to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_appointments",
      description: "Citas, visitas y eventos agendados en un rango de fechas. SIEMPRE usar esta herramienta cuando el usuario pregunte por citas, agenda, visitas, eventos, qué tiene hoy, mañana, esta semana o cualquier período. NUNCA responder sobre citas sin llamar esta herramienta primero.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Fecha inicio YYYY-MM-DD. Si piden 'esta semana' usar el lunes de esta semana. Si piden 'hoy' usar la fecha de hoy." },
          date_to:   { type: "string", description: "Fecha fin YYYY-MM-DD. Si piden 'esta semana' usar el domingo de esta semana. Si piden 'hoy' usar la fecha de hoy." },
          period_label: { type: "string", description: "Etiqueta del período, ej: 'hoy', 'esta semana', 'este mes'" },
        },
        required: ["date_from", "date_to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_inquiries",
      description: "Propiedades con más solicitudes de información: cuántos leads/contactos se interesaron en cada propiedad, ordenadas de mayor a menor demanda. Usar cuando pregunten qué propiedad tuvo más solicitudes, cuál es la más popular, qué inmuebles generan más interés o qué propiedad se pidió más información.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Número de propiedades a mostrar (por defecto 10)" },
          date_from: { type: "string", description: "Filtrar leads creados desde esta fecha YYYY-MM-DD (opcional)" },
          date_to:   { type: "string", description: "Filtrar leads creados hasta esta fecha YYYY-MM-DD (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_stats",
      description: "Estadísticas del inventario de propiedades por zona, tipo o estado. Usar cuando pregunten por propiedades, inventario, disponibilidad o inmuebles.",
      parameters: {
        type: "object",
        properties: {
          zone:   { type: "string", description: "Filtrar por zona (opcional)" },
          status: { type: "string", description: "Estado: 'active', 'sold', 'rented' (opcional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_at_risk_contacts",
      description: "Leads en riesgo de perderse: sin actividad reciente o sin asignar. Usar cuando pregunten por leads en riesgo, abandonados o sin seguimiento.",
      parameters: {
        type: "object",
        properties: {
          inactive_days: { type: "number", description: "Días sin actividad para considerar en riesgo (por defecto 7)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_contact",
      description: "Buscar un contacto por nombre, teléfono o email. Usar cuando pregunten por una persona específica, quieran encontrar a un lead o cliente.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nombre, teléfono o email a buscar" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_credits_remaining",
      description: "Créditos de WhatsApp disponibles, consumo y proyección de días restantes. Usar cuando pregunten por créditos, mensajes disponibles o saldo.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_period_comparison",
      description: "Comparativa entre el período actual y el anterior (leads, deals, citas). Usar cuando pregunten cómo vamos vs antes, comparar períodos o tendencia.",
      parameters: {
        type: "object",
        properties: {
          current_from: { type: "string", description: "Inicio período actual YYYY-MM-DD" },
          current_to:   { type: "string", description: "Fin período actual YYYY-MM-DD" },
          label:        { type: "string", description: "Etiqueta del período, ej: 'este mes vs mes pasado'" },
        },
        required: ["current_from", "current_to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deals_closing_soon",
      description: "Deals en etapas avanzadas con alta probabilidad de cierre. Usar cuando pregunten qué deals priorizar, cuáles van a cerrar o deals calientes.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Máximo de deals a mostrar (por defecto 10)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_vs_human_stats",
      description: "Tasa de resolución IA vs humano en conversaciones. Usar cuando pregunten por el bot, la IA, cuánto resuelve solo o cuándo intervienen los asesores.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_response_time_stats",
      description: "Tiempo promedio de respuesta del equipo a los leads. Usar cuando pregunten por rapidez de respuesta, tiempo de atención o velocidad del equipo.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_segment_suggestions",
      description: "Sugerencias de segmentos para campañas basadas en el comportamiento de los contactos. Usar cuando pregunten a quién enviar una campaña o cómo segmentar.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },

  {
    type: "function",
    function: {
      name: "get_deal_scores",
      description: "Deals abiertos ordenados por score de probabilidad de cierre (0-100). Usar cuando pregunten qué deals priorizar, cuáles van a cerrar pronto o pidan un scoring predictivo.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Máximo de deals (por defecto 10)" },
        },
        required: [],
      },
    },
  },

  // ── WRITE TOOLS (devuelven action-confirm, NO ejecutan) ──
  {
    type: "function",
    function: {
      name: "create_contact",
      description: "Crear un nuevo contacto en el CRM. Usar cuando pidan agregar, crear o registrar un contacto/lead/cliente.",
      parameters: {
        type: "object",
        properties: {
          name:  { type: "string", description: "Nombre completo" },
          phone: { type: "string", description: "Teléfono con código de país" },
          email: { type: "string", description: "Email (opcional)" },
          notes: { type: "string", description: "Notas o interés del contacto (opcional)" },
          source: { type: "string", description: "Fuente del lead (opcional)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_followup",
      description: "Agendar un seguimiento para un contacto. Usar cuando pidan recordatorio, seguimiento o dar seguimiento a alguien.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Nombre del contacto" },
          due_at:       { type: "string", description: "Fecha y hora del seguimiento ISO 8601" },
          note:         { type: "string", description: "Nota o razón del seguimiento (opcional)" },
        },
        required: ["contact_name", "due_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description: "Agendar una cita, visita o evento. Usar cuando pidan agendar, programar una visita o cita.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Nombre del contacto" },
          title:        { type: "string", description: "Título del evento" },
          start_at:     { type: "string", description: "Fecha y hora de inicio ISO 8601" },
          event_type:   { type: "string", description: "Tipo: 'visita', 'llamada', 'reunion'" },
          notes:        { type: "string", description: "Notas adicionales (opcional)" },
        },
        required: ["contact_name", "title", "start_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal_stage",
      description: "Cambiar la etapa de un deal en el pipeline. Usar cuando pidan mover, avanzar o cambiar el estado de un deal.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Nombre del contacto asociado al deal" },
          new_stage:    { type: "string", description: "Nueva etapa del deal" },
          deal_title:   { type: "string", description: "Título del deal (opcional, para identificarlo si hay varios)" },
        },
        required: ["contact_name", "new_stage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reassign_lead",
      description: "Reasignar un contacto o leads a otro asesor. Usar cuando pidan cambiar el asesor asignado o redistribuir leads.",
      parameters: {
        type: "object",
        properties: {
          contact_name:    { type: "string", description: "Nombre del contacto (o 'todos los leads de X asesor')" },
          new_agent_name:  { type: "string", description: "Nombre del asesor que recibirá los leads" },
          from_agent_name: { type: "string", description: "Nombre del asesor origen (opcional)" },
        },
        required: ["contact_name", "new_agent_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_contact_note",
      description: "Agregar una nota interna a un contacto. Usar cuando pidan anotar, registrar información o agregar notas sobre un contacto.",
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Nombre del contacto" },
          content:      { type: "string", description: "Contenido de la nota" },
        },
        required: ["contact_name", "content"],
      },
    },
  },
];

// ── Deal scoring ──────────────────────────────────────────────────────────────

const STAGE_SCORES: Record<string, number> = {
  'nuevo': 5, 'nuevo lead': 5, 'entrada': 5,
  'contactado': 10, 'contacto': 10,
  'calificado': 20, 'calificacion': 20,
  'visita': 30, 'visita programada': 30, 'cita': 30,
  'propuesta': 40, 'propuesta enviada': 40,
  'negociacion': 45, 'negociación': 45,
  'cierre': 50, 'firma': 50, 'promesa': 50, 'escritura': 50,
};
const TEMP_BONUS: Record<string, number> = { hot: 20, warm: 10, cold: 0 };

function calcDealScore(deal: any, contact: any, eventCount: number): number {
  const stageScore = STAGE_SCORES[(deal.stage ?? '').toLowerCase().trim()] ?? 10;
  const tempBonus = TEMP_BONUS[(contact?.lead_temperature ?? '').toLowerCase()] ?? 0;
  const lastInt = contact?.last_interaction_at ? new Date(contact.last_interaction_at) : null;
  const days = lastInt ? (Date.now() - lastInt.getTime()) / 86400000 : null;
  let recency = 0;
  if (days !== null) {
    if (days < 1)       recency = 20;
    else if (days < 3)  recency = 15;
    else if (days < 7)  recency = 10;
    else if (days < 14) recency = 5;
  }
  return Math.min(100, stageScore + tempBonus + recency + (deal.assigned_agent_id ? 5 : 0) + (eventCount > 0 ? 5 : 0));
}

async function runDealScores(admin: any, tenantId: string, limit: number) {
  const { data: deals } = await admin
    .from('deals')
    .select('id, stage, title, assigned_agent_id, contact_id, offered_price_mxn, contacts(name, lead_temperature, last_interaction_at), profiles!deals_assigned_agent_id_fkey(name)')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .not('stage', 'in', '("ganado","perdido")')
    .limit(100);

  const contactIds = [...new Set((deals ?? []).map((d: any) => d.contact_id))];
  const { data: events } = contactIds.length
    ? await admin.from('events').select('contact_id').eq('tenant_id', tenantId).in('contact_id', contactIds)
    : { data: [] };
  const evByContact: Record<string, number> = {};
  (events ?? []).forEach((e: any) => { evByContact[e.contact_id] = (evByContact[e.contact_id] ?? 0) + 1; });

  return (deals ?? [])
    .map((d: any) => ({
      score: calcDealScore(d, d.contacts, evByContact[d.contact_id] ?? 0),
      'Deal': d.title ?? (d.contacts as any)?.name ?? '—',
      'Etapa': d.stage ?? '—',
      'Contacto': (d.contacts as any)?.name ?? '—',
      'Asesor': (d.profiles as any)?.name ?? 'Sin asignar',
      'Precio': d.offered_price_mxn ? `$${Number(d.offered_price_mxn).toLocaleString('es-MX')}` : '—',
      'Score': '',
    }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit)
    .map((d: any) => ({ ...d, 'Score': `${d.score}/100` }));
}

// ── OpenRouter ────────────────────────────────────────────────────────────────

async function callOpenRouter(
  apiKey: string,
  messages: { role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string }[],
  tools?: any[],
): Promise<any> {
  const body: any = { model: 'google/gemini-2.5-flash', messages };
  if (tools) body.tools = tools;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getAnalysisText(apiKey: string, data: string, instruction: string): Promise<string> {
  const res = await callOpenRouter(apiKey, [
    { role: 'system', content: 'Eres un analista de CRM inmobiliario. Responde en español, en markdown, 2-3 oraciones máximo. Sé directo y específico.' },
    { role: 'user', content: `${instruction}\n\n${data}` },
  ]);
  return res.choices?.[0]?.message?.content ?? '';
}

// ── READ TOOL RUNNERS ────────────────────────────────────────────────────────

async function runProductivityReport(admin: any, tenantId: string, dateFrom: string, dateTo: string) {
  const { data: agentsData } = await admin.from('profiles').select('id, name').eq('tenant_id', tenantId).eq('status', 'active');
  const agents = (agentsData ?? []) as { id: string; name: string }[];
  if (!agents.length) return { agents: [], totals: { leads: 0, deals: 0, citas: 0 } };

  const agentIds = agents.map(a => a.id);
  const from = `${dateFrom}T00:00:00.000Z`;
  const to = `${dateTo}T23:59:59.999Z`;

  const [leadsRes, dealsRes, eventsRes] = await Promise.all([
    admin.from('contacts').select('assigned_agent_id').eq('tenant_id', tenantId).in('assigned_agent_id', agentIds).gte('created_at', from).lte('created_at', to),
    admin.from('deals').select('assigned_agent_id').eq('tenant_id', tenantId).eq('status', 'won').in('assigned_agent_id', agentIds).gte('closed_at', from).lte('closed_at', to),
    admin.from('events').select('created_by').eq('tenant_id', tenantId).in('created_by', agentIds).gte('created_at', from).lte('created_at', to),
  ]);

  const byAgent: Record<string, { leads: number; deals: number; citas: number }> = {};
  agents.forEach(a => { byAgent[a.id] = { leads: 0, deals: 0, citas: 0 }; });
  (leadsRes.data ?? []).forEach((r: any) => { if (byAgent[r.assigned_agent_id]) byAgent[r.assigned_agent_id].leads++; });
  (dealsRes.data ?? []).forEach((r: any) => { if (byAgent[r.assigned_agent_id]) byAgent[r.assigned_agent_id].deals++; });
  (eventsRes.data ?? []).forEach((r: any) => { if (byAgent[r.created_by]) byAgent[r.created_by].citas++; });

  const result = agents.map(a => ({
    id: a.id, name: a.name, firstName: a.name.split(' ')[0], ...byAgent[a.id],
    score: byAgent[a.id].leads + byAgent[a.id].deals * 3 + byAgent[a.id].citas * 2,
  })).sort((a, b) => b.score - a.score);

  return {
    agents: result,
    totals: { leads: result.reduce((s, a) => s + a.leads, 0), deals: result.reduce((s, a) => s + a.deals, 0), citas: result.reduce((s, a) => s + a.citas, 0) },
  };
}

async function runPipelineSummary(admin: any, tenantId: string, pipelineType?: string) {
  let q = admin.from('contacts').select('pipeline_stage').eq('tenant_id', tenantId).not('pipeline_stage', 'is', null);
  if (pipelineType) q = q.eq('pipeline_type', pipelineType);
  const { data } = await q;
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r: any) => { counts[r.pipeline_stage] = (counts[r.pipeline_stage] ?? 0) + 1; });
  return Object.entries(counts).map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count);
}

async function runConversionFunnel(admin: any, tenantId: string, dateFrom?: string, dateTo?: string) {
  let q = admin.from('contacts').select('pipeline_stage').eq('tenant_id', tenantId).not('pipeline_stage', 'is', null);
  if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00.000Z`);
  if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59.999Z`);
  const { data } = await q;
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r: any) => { counts[r.pipeline_stage] = (counts[r.pipeline_stage] ?? 0) + 1; });
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  return Object.entries(counts).map(([stage, count]) => ({
    name: stage, value: count, pct: total > 0 ? Math.round((count / total) * 100) : 0,
  })).sort((a, b) => b.value - a.value);
}

async function runLeadsWithoutResponse(admin: any, tenantId: string, hoursThreshold: number) {
  const cutoff = new Date(Date.now() - hoursThreshold * 3600000).toISOString();
  const { data } = await admin
    .from('contacts')
    .select('id, name, phone, assigned_agent_id, last_interaction_at, pipeline_stage')
    .eq('tenant_id', tenantId)
    .or(`last_interaction_at.is.null,last_interaction_at.lte.${cutoff}`)
    .in('status', ['lead', 'active'])
    .not('pipeline_stage', 'in', '("cerrado","ganado","perdido")')
    .order('last_interaction_at', { ascending: true, nullsFirst: true })
    .limit(50);

  const { data: agents } = await admin.from('profiles').select('id, name').eq('tenant_id', tenantId);
  const agentMap: Record<string, string> = {};
  (agents ?? []).forEach((a: any) => { agentMap[a.id] = a.name; });

  return (data ?? []).map((c: any) => {
    const lastInt = c.last_interaction_at ? new Date(c.last_interaction_at) : null;
    const hoursAgo = lastInt ? Math.floor((Date.now() - lastInt.getTime()) / 3600000) : null;
    return {
      'Contacto': c.name,
      'Teléfono': c.phone ?? '—',
      'Asesor': agentMap[c.assigned_agent_id] ?? 'Sin asignar',
      'Etapa': c.pipeline_stage ?? '—',
      'Última interacción': hoursAgo !== null ? `${hoursAgo}h` : 'Nunca',
    };
  });
}

async function runFollowupsOverdue(admin: any, tenantId: string, daysPastDue: number) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - daysPastDue * 86400000).toISOString();
  const { data } = await admin
    .from('conversation_followups')
    .select('id, due_at, note, assigned_user_id, contact_id, contacts(name, phone)')
    .eq('tenant_id', tenantId)
    .eq('status', 'scheduled')
    .lte('due_at', cutoff)
    .order('due_at', { ascending: true })
    .limit(50);

  const { data: agents } = await admin.from('profiles').select('id, name').eq('tenant_id', tenantId);
  const agentMap: Record<string, string> = {};
  (agents ?? []).forEach((a: any) => { agentMap[a.id] = a.name; });

  return (data ?? []).map((f: any) => {
    const dueDate = new Date(f.due_at);
    const daysLate = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
    return {
      label: (f.contacts as any)?.name ?? 'Contacto desconocido',
      description: `${agentMap[f.assigned_user_id] ?? 'Sin asignar'} · ${f.note ?? 'Sin nota'}`,
      severity: daysLate >= 3 ? 'danger' : daysLate >= 1 ? 'warning' : 'normal',
      meta: `Vencido hace ${daysLate} día${daysLate !== 1 ? 's' : ''}`,
    };
  });
}

async function runCampaignStats(admin: any, tenantId: string, limit: number) {
  const { data } = await admin
    .from('campaigns')
    .select('id, name, status, total_contacts, sent_count, delivered_count, failed_count, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []);
}

async function runAgentRanking(admin: any, tenantId: string, dateFrom: string, dateTo: string) {
  const { data: agentsData } = await admin.from('profiles').select('id, name').eq('tenant_id', tenantId).eq('status', 'active');
  const agents = (agentsData ?? []) as { id: string; name: string }[];
  if (!agents.length) return [];

  const agentIds = agents.map(a => a.id);
  const from = `${dateFrom}T00:00:00.000Z`;
  const to = `${dateTo}T23:59:59.999Z`;

  const [dealsWon, dealsAll, leadsNew] = await Promise.all([
    admin.from('deals').select('assigned_agent_id').eq('tenant_id', tenantId).eq('status', 'won').in('assigned_agent_id', agentIds).gte('closed_at', from).lte('closed_at', to),
    admin.from('deals').select('assigned_agent_id').eq('tenant_id', tenantId).in('assigned_agent_id', agentIds).gte('created_at', from).lte('created_at', to),
    admin.from('contacts').select('assigned_agent_id').eq('tenant_id', tenantId).in('assigned_agent_id', agentIds).gte('created_at', from).lte('created_at', to),
  ]);

  const byAgent: Record<string, { won: number; total: number; leads: number }> = {};
  agents.forEach(a => { byAgent[a.id] = { won: 0, total: 0, leads: 0 }; });
  (dealsWon.data ?? []).forEach((r: any) => { if (byAgent[r.assigned_agent_id]) byAgent[r.assigned_agent_id].won++; });
  (dealsAll.data ?? []).forEach((r: any) => { if (byAgent[r.assigned_agent_id]) byAgent[r.assigned_agent_id].total++; });
  (leadsNew.data ?? []).forEach((r: any) => { if (byAgent[r.assigned_agent_id]) byAgent[r.assigned_agent_id].leads++; });

  return agents.map(a => ({
    name: a.name,
    firstName: a.name.split(' ')[0],
    'Deals cerrados': byAgent[a.id].won,
    'Leads nuevos': byAgent[a.id].leads,
    'Tasa cierre': byAgent[a.id].total > 0 ? `${Math.round((byAgent[a.id].won / byAgent[a.id].total) * 100)}%` : '0%',
    score: byAgent[a.id].won * 3 + byAgent[a.id].leads,
  })).sort((a, b) => b.score - a.score);
}

async function runAppointments(admin: any, tenantId: string, dateFrom: string, dateTo: string) {
  console.log(`runAppointments: tenant=${tenantId} from=${dateFrom} to=${dateTo}`);

  const { data, error } = await admin
    .from('events')
    .select('id, title, event_type, start_at, status, contacts(id, name, phone), created_by')
    .eq('tenant_id', tenantId)
    .gte('start_at', `${dateFrom}T00:00:00.000Z`)
    .lte('start_at', `${dateTo}T23:59:59.999Z`)
    .order('start_at', { ascending: true })
    .limit(50);

  if (error) console.error('runAppointments error:', error);
  console.log(`runAppointments: found ${data?.length ?? 0} events`);

  // Fetch agent names separately to avoid FK join issues
  const agentIds = [...new Set((data ?? []).map((e: any) => e.created_by).filter(Boolean))];
  const agentMap: Record<string, string> = {};
  if (agentIds.length) {
    const { data: agents } = await admin.from('profiles').select('id, name').in('id', agentIds);
    (agents ?? []).forEach((a: any) => { agentMap[a.id] = a.name; });
  }

  return (data ?? []).map((e: any) => {
    const contact = e.contacts as any;
    const timeStr = new Date(e.start_at).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return {
      label: e.title ?? e.event_type ?? 'Cita',
      description: `${contact?.name ?? 'Sin contacto'} · ${agentMap[e.created_by] ?? 'Sin asesor'}`,
      meta: timeStr,
      severity: e.status === 'canceled' ? 'warning' : 'normal' as 'normal' | 'warning',
      href: contact?.id ? `/contacts/${contact.id}` : '/events',
    };
  });
}

async function runPropertyInquiries(admin: any, tenantId: string, limit: number, dateFrom?: string, dateTo?: string) {
  // Fetch contacts with a property interest
  let q = admin
    .from('contacts')
    .select('re_property_interest_id')
    .eq('tenant_id', tenantId)
    .not('re_property_interest_id', 'is', null);
  if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00.000Z`);
  if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59.999Z`);
  const { data: contacts, error } = await q;
  if (error) console.error('runPropertyInquiries contacts error:', error);

  // Count leads per property
  const counts: Record<string, number> = {};
  (contacts ?? []).forEach((c: any) => {
    counts[c.re_property_interest_id] = (counts[c.re_property_interest_id] ?? 0) + 1;
  });

  const topIds = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (!topIds.length) return [];

  const { data: props } = await admin
    .from('properties')
    .select('id, title, property_code, zone, operation_type, property_type, price, currency, status')
    .in('id', topIds);

  const propMap: Record<string, any> = {};
  (props ?? []).forEach((p: any) => { propMap[p.id] = p; });

  return topIds.map(id => {
    const p = propMap[id];
    if (!p) return null;
    const price = p.price ? `$${Number(p.price).toLocaleString('es-MX')} ${p.currency ?? ''}`.trim() : '—';
    return {
      label: p.title ?? p.property_code ?? 'Sin nombre',
      description: [p.zone, p.operation_type, p.property_type].filter(Boolean).join(' · '),
      meta: `${counts[id]} solicitud${counts[id] !== 1 ? 'es' : ''}`,
      severity: 'normal' as const,
      href: `/properties` ,
      _count: counts[id],
      _price: price,
      _code: p.property_code ?? '—',
      _status: p.status ?? '—',
    };
  }).filter(Boolean);
}

async function runPropertyStats(admin: any, tenantId: string, zone?: string, status?: string) {
  let q = admin.from('properties').select('id, title, property_code, zone, operation_type, property_type, price, currency, status, is_active, bedrooms, bathrooms, sq_meters').eq('tenant_id', tenantId).eq('is_active', true);
  if (zone) q = q.ilike('zone', `%${zone}%`);
  if (status) q = q.eq('status', status);
  const { data } = await q.limit(100);
  return (data ?? []);
}

async function runAtRiskContacts(admin: any, tenantId: string, inactiveDays: number) {
  const cutoff = new Date(Date.now() - inactiveDays * 86400000).toISOString();
  const { data } = await admin
    .from('contacts')
    .select('id, name, phone, assigned_agent_id, last_interaction_at, pipeline_stage, lead_temperature')
    .eq('tenant_id', tenantId)
    .or(`last_interaction_at.is.null,last_interaction_at.lte.${cutoff}`)
    .not('pipeline_stage', 'in', '("cerrado","ganado","perdido")')
    .order('last_interaction_at', { ascending: true, nullsFirst: true })
    .limit(30);

  const { data: agents } = await admin.from('profiles').select('id, name').eq('tenant_id', tenantId);
  const agentMap: Record<string, string> = {};
  (agents ?? []).forEach((a: any) => { agentMap[a.id] = a.name; });

  return (data ?? []).map((c: any) => {
    const lastInt = c.last_interaction_at ? new Date(c.last_interaction_at) : null;
    const days = lastInt ? Math.floor((Date.now() - lastInt.getTime()) / 86400000) : null;
    return {
      'Contacto': c.name,
      'Asesor': agentMap[c.assigned_agent_id] ?? 'Sin asignar',
      'Etapa': c.pipeline_stage ?? '—',
      'Temperatura': c.lead_temperature ?? '—',
      'Sin actividad': days !== null ? `${days} días` : 'Nunca',
    };
  });
}

async function runSearchContact(admin: any, tenantId: string, query: string) {
  const { data } = await admin
    .from('contacts')
    .select('id, name, phone, email, pipeline_stage, status, assigned_agent_id, last_interaction_at')
    .eq('tenant_id', tenantId)
    .or(`name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(10);

  const { data: agents } = await admin.from('profiles').select('id, name').eq('tenant_id', tenantId);
  const agentMap: Record<string, string> = {};
  (agents ?? []).forEach((a: any) => { agentMap[a.id] = a.name; });

  return (data ?? []).map((c: any) => ({
    'Nombre': c.name,
    'Teléfono': c.phone ?? '—',
    'Email': c.email ?? '—',
    'Etapa': c.pipeline_stage ?? '—',
    'Asesor': agentMap[c.assigned_agent_id] ?? 'Sin asignar',
  }));
}

async function runCreditsRemaining(admin: any, tenantId: string) {
  const { data } = await admin
    .from('tenants')
    .select('monthly_credits_remaining, accumulated_credits, extra_credits, next_refill_at, billing_state')
    .eq('id', tenantId)
    .single();
  return data;
}

async function runPeriodComparison(admin: any, tenantId: string, currentFrom: string, currentTo: string) {
  const currDays = (new Date(currentTo).getTime() - new Date(currentFrom).getTime()) / 86400000;
  const prevTo = new Date(new Date(currentFrom).getTime() - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(new Date(currentFrom).getTime() - currDays * 86400000).toISOString().slice(0, 10);

  const fromC = `${currentFrom}T00:00:00.000Z`, toC = `${currentTo}T23:59:59.999Z`;
  const fromP = `${prevFrom}T00:00:00.000Z`, toP = `${prevTo}T23:59:59.999Z`;

  const [currLeads, prevLeads, currDeals, prevDeals, currEvents, prevEvents] = await Promise.all([
    admin.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', fromC).lte('created_at', toC),
    admin.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', fromP).lte('created_at', toP),
    admin.from('deals').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'won').gte('closed_at', fromC).lte('closed_at', toC),
    admin.from('deals').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'won').gte('closed_at', fromP).lte('closed_at', toP),
    admin.from('events').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', fromC).lte('created_at', toC),
    admin.from('events').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', fromP).lte('created_at', toP),
  ]);

  return {
    leads: { current: currLeads.count ?? 0, previous: prevLeads.count ?? 0 },
    deals: { current: currDeals.count ?? 0, previous: prevDeals.count ?? 0 },
    events: { current: currEvents.count ?? 0, previous: prevEvents.count ?? 0 },
  };
}

async function runDealsClosingSoon(admin: any, tenantId: string, limit: number) {
  const { data } = await admin
    .from('deals')
    .select('id, title, stage, offered_price_mxn, contacts(name, phone), profiles!deals_assigned_agent_id_fkey(name), expected_close_date, updated_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .in('stage', ['propuesta', 'negociacion', 'cierre', 'promesa', 'escritura'])
    .order('updated_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((d: any) => {
    const price = d.offered_price_mxn ? `$${Number(d.offered_price_mxn).toLocaleString('es-MX')}` : '—';
    return {
      label: d.title ?? (d.contacts as any)?.name ?? 'Deal sin título',
      description: `${(d.contacts as any)?.name ?? '—'} · ${(d.profiles as any)?.name ?? '—'} · ${d.stage}`,
      meta: price,
      severity: 'normal',
    };
  });
}

async function runAiVsHumanStats(admin: any, tenantId: string) {
  const [aiOnly, needsHuman, total] = await Promise.all([
    admin.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('ai_enabled', true).eq('needs_human', false),
    admin.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('needs_human', true),
    admin.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ]);
  const humanCount = needsHuman.count ?? 0;
  const aiCount = aiOnly.count ?? 0;
  const totalCount = total.count ?? 0;
  const mixed = totalCount - aiCount - humanCount;
  return [
    { name: 'IA sola', value: aiCount },
    { name: 'Requirió humano', value: humanCount },
    { name: 'Mixto / sin IA', value: Math.max(0, mixed) },
  ];
}

async function runResponseTimeStats(admin: any, tenantId: string) {
  const { data } = await admin
    .from('conversations')
    .select('last_customer_message_at, last_agent_message_at')
    .eq('tenant_id', tenantId)
    .not('last_customer_message_at', 'is', null)
    .not('last_agent_message_at', 'is', null)
    .limit(200);

  const deltas = (data ?? [])
    .map((c: any) => {
      const customer = new Date(c.last_customer_message_at).getTime();
      const agent = new Date(c.last_agent_message_at).getTime();
      return agent - customer;
    })
    .filter(d => d > 0 && d < 86400000); // < 24h, válidos

  if (!deltas.length) return { avgMinutes: null, medianMinutes: null, samples: 0 };
  const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length / 60000;
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] / 60000;
  return { avgMinutes: Math.round(avg), medianMinutes: Math.round(median), samples: deltas.length };
}

async function runSegmentSuggestions(admin: any, tenantId: string) {
  const [sources, temperatures, stages] = await Promise.all([
    admin.from('contacts').select('source').eq('tenant_id', tenantId).not('source', 'is', null),
    admin.from('contacts').select('lead_temperature').eq('tenant_id', tenantId).not('lead_temperature', 'is', null),
    admin.from('contacts').select('pipeline_stage').eq('tenant_id', tenantId).not('pipeline_stage', 'is', null),
  ]);

  const sourceCounts: Record<string, number> = {};
  (sources.data ?? []).forEach((r: any) => { sourceCounts[r.source] = (sourceCounts[r.source] ?? 0) + 1; });
  const tempCounts: Record<string, number> = {};
  (temperatures.data ?? []).forEach((r: any) => { tempCounts[r.lead_temperature] = (tempCounts[r.lead_temperature] ?? 0) + 1; });
  const stageCounts: Record<string, number> = {};
  (stages.data ?? []).forEach((r: any) => { stageCounts[r.pipeline_stage] = (stageCounts[r.pipeline_stage] ?? 0) + 1; });

  const suggestions = [];
  const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];
  if (topSource) suggestions.push({ label: `Leads de ${topSource[0]}`, description: `${topSource[1]} contactos de esta fuente`, severity: 'normal' });

  const warm = tempCounts['warm'] ?? 0;
  if (warm > 0) suggestions.push({ label: 'Leads tibios (warm)', description: `${warm} contactos con temperatura media`, severity: 'normal' });

  const hot = tempCounts['hot'] ?? 0;
  if (hot > 0) suggestions.push({ label: 'Leads calientes (hot)', description: `${hot} contactos listos para cerrar`, severity: 'warning' });

  const topStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0];
  if (topStage) suggestions.push({ label: `Etapa: ${topStage[0]}`, description: `${topStage[1]} leads en esta etapa`, severity: 'normal' });

  return suggestions;
}

// ── RESPONSE BUILDERS ────────────────────────────────────────────────────────

function buildProductivityResponse(toolResult: any, periodLabel: string, analysisText: string) {
  const { agents, totals } = toolResult;
  return {
    type: 'report-chart', chartType: 'bar',
    text: analysisText,
    data: {
      chartTitle: `Productividad del equipo — ${periodLabel}`,
      chartData: agents.map((a: any) => ({ name: a.firstName, 'Leads': a.leads, 'Deals': a.deals, 'Citas': a.citas })),
      dataKeys: [{ key: 'Leads', label: 'Leads nuevos', color: '#8b5cf6' }, { key: 'Deals', label: 'Deals ganados', color: '#10b981' }, { key: 'Citas', label: 'Citas agendadas', color: '#06b6d4' }],
      nameKey: 'name',
      columns: ['Asesor', 'Leads nuevos', 'Deals ganados', 'Citas agendadas'],
      rows: agents.map((a: any) => ({ 'Asesor': a.name, 'Leads nuevos': String(a.leads), 'Deals ganados': String(a.deals), 'Citas agendadas': String(a.citas) })),
      caption: `Total: ${totals.leads} leads · ${totals.deals} deals · ${totals.citas} citas`,
    },
  };
}

function buildAgentRankingResponse(agents: any[], periodLabel: string, analysisText: string) {
  return {
    type: 'report-chart', chartType: 'bar',
    text: analysisText,
    data: {
      chartTitle: `Ranking de asesores — ${periodLabel}`,
      chartData: agents.map((a: any) => ({ name: a.firstName, 'Deals cerrados': a['Deals cerrados'], 'Leads nuevos': a['Leads nuevos'] })),
      dataKeys: [{ key: 'Deals cerrados', label: 'Deals cerrados', color: '#10b981' }, { key: 'Leads nuevos', label: 'Leads nuevos', color: '#8b5cf6' }],
      nameKey: 'name',
      columns: ['Asesor', 'Deals cerrados', 'Leads nuevos', 'Tasa cierre'],
      rows: agents.map((a: any) => ({ 'Asesor': a.name, 'Deals cerrados': String(a['Deals cerrados']), 'Leads nuevos': String(a['Leads nuevos']), 'Tasa cierre': a['Tasa cierre'] })),
    },
  };
}

function buildPipelineResponse(stages: any[], analysisText: string) {
  return {
    type: 'report-chart', chartType: 'bar',
    text: analysisText,
    data: {
      chartTitle: 'Estado del pipeline',
      chartData: stages.map((s: any) => ({ name: s.stage, 'Leads': s.count })),
      dataKey: 'Leads', nameKey: 'name',
      columns: ['Etapa', 'Leads'],
      rows: stages.map((s: any) => ({ 'Etapa': s.stage, 'Leads': String(s.count) })),
      caption: `Total: ${stages.reduce((s, x) => s + x.count, 0)} leads`,
    },
  };
}

function buildFunnelResponse(stages: any[], analysisText: string) {
  return {
    type: 'report-chart', chartType: 'funnel',
    text: analysisText,
    data: {
      chartTitle: 'Embudo de conversión',
      chartData: stages.map((s: any) => ({ name: s.name, value: s.value })),
      dataKey: 'value', nameKey: 'name',
      columns: ['Etapa', 'Leads', '%'],
      rows: stages.map((s: any) => ({ 'Etapa': s.name, 'Leads': String(s.value), '%': `${s.pct}%` })),
    },
  };
}

function buildTableResponse(columns: string[], rows: Record<string, string>[], caption: string, analysisText: string) {
  return { type: 'table', text: analysisText, data: { columns, rows, caption } };
}

function buildListResponse(items: any[], title: string, analysisText: string) {
  return { type: 'list', text: analysisText, data: { title, items } };
}

function buildInsightResponse(insights: any[], analysisText: string) {
  return { type: 'insight', text: analysisText, data: { insights } };
}

function buildActionConfirm(tool: string, args: Record<string, unknown>, title: string, summary: string, actions?: { label: string; description?: string }[]) {
  return {
    type: 'action-confirm',
    text: `[Acción pendiente de confirmación: ${title}. ${summary}]`,
    data: {
      title,
      summary,
      actions: actions ?? [],
      pendingAction: { tool, params: args },
    },
  };
}

// ── RATE LIMITING ─────────────────────────────────────────────────────────────

async function checkRateLimit(admin: any, tenantId: string, userId: string): Promise<boolean> {
  try {
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { data: convIds } = await admin
      .from('ai_conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId);

    if (!convIds?.length) return false;

    const { count } = await admin
      .from('ai_messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', convIds.map((c: any) => c.id))
      .eq('role', 'user')
      .gte('created_at', oneMinuteAgo);

    return (count ?? 0) >= 20;
  } catch {
    return false;
  }
}

// ── MAIN TOOL DISPATCHER ──────────────────────────────────────────────────────

async function dispatchTool(
  toolName: string,
  toolArgs: Record<string, any>,
  admin: any,
  tenantId: string,
  openrouterKey: string,
): Promise<Record<string, unknown>> {
  const today = isoDate(new Date());
  const monIso = weekStart();
  const monthIso = monthStart();

  switch (toolName) {
    case 'get_productivity_report': {
      const { date_from = monIso, date_to = today, period_label = 'esta semana' } = toolArgs;
      const result = await runProductivityReport(admin, tenantId, date_from, date_to);
      if (!result.agents.length) return { type: 'text', text: 'No hay asesores activos registrados para el período consultado.' };
      const dataStr = result.agents.map((a: any) => `- ${a.name}: ${a.leads} leads, ${a.deals} deals, ${a.citas} citas`).join('\n');
      const text = await getAnalysisText(openrouterKey, dataStr, `Analiza la productividad del equipo en el período "${period_label}". Menciona quién lidera y señala si alguien necesita atención.`);
      return buildProductivityResponse(result, period_label ?? `${date_from} al ${date_to}`, text);
    }

    case 'get_pipeline_summary': {
      const { pipeline_type } = toolArgs;
      const stages = await runPipelineSummary(admin, tenantId, pipeline_type);
      if (!stages.length) return { type: 'text', text: 'No hay leads en el pipeline actualmente.' };
      const dataStr = stages.map((s: any) => `- ${s.stage}: ${s.count}`).join('\n');
      const text = await getAnalysisText(openrouterKey, dataStr, 'Analiza el estado del pipeline. ¿Dónde se concentran los leads? ¿Hay cuellos de botella?');
      return buildPipelineResponse(stages, text);
    }

    case 'get_conversion_funnel': {
      const { date_from, date_to } = toolArgs;
      const stages = await runConversionFunnel(admin, tenantId, date_from, date_to);
      if (!stages.length) return { type: 'text', text: 'No hay datos suficientes para el embudo de conversión.' };
      const dataStr = stages.map((s: any) => `- ${s.name}: ${s.value} (${s.pct}%)`).join('\n');
      const text = await getAnalysisText(openrouterKey, dataStr, 'Analiza el embudo de conversión. ¿En qué etapa se pierden más leads?');
      return buildFunnelResponse(stages, text);
    }

    case 'get_leads_without_response': {
      const { hours_threshold = 48 } = toolArgs;
      const rows = await runLeadsWithoutResponse(admin, tenantId, hours_threshold);
      if (!rows.length) return { type: 'text', text: `No hay leads sin respuesta por más de ${hours_threshold} horas. ¡Excelente atención!` };
      const text = await getAnalysisText(openrouterKey, `${rows.length} leads sin respuesta en ${hours_threshold}h`, `Hay ${rows.length} leads que llevan más de ${hours_threshold}h sin respuesta. Genera una alerta concisa.`);
      return buildTableResponse(
        ['Contacto', 'Teléfono', 'Asesor', 'Etapa', 'Última interacción'],
        rows, `${rows.length} leads sin respuesta en +${hours_threshold}h`, text,
      );
    }

    case 'get_followups_overdue': {
      const { days_past_due = 0 } = toolArgs;
      const items = await runFollowupsOverdue(admin, tenantId, days_past_due);
      if (!items.length) return { type: 'text', text: 'No hay seguimientos vencidos. ¡Todo al día!' };
      const text = await getAnalysisText(openrouterKey, `${items.length} seguimientos vencidos`, `Hay ${items.length} seguimientos vencidos. Genera una alerta breve y recomendación.`);
      return buildListResponse(items, 'Seguimientos vencidos', text);
    }

    case 'get_campaign_stats': {
      const { limit = 5 } = toolArgs;
      const campaigns = await runCampaignStats(admin, tenantId, limit);
      if (!campaigns.length) return { type: 'text', text: 'No hay campañas registradas todavía.' };
      const dataStr = campaigns.map((c: any) => `- ${c.name}: ${c.sent_count ?? 0} enviados, ${c.delivered_count ?? 0} entregados, estado: ${c.status}`).join('\n');
      const text = await getAnalysisText(openrouterKey, dataStr, 'Analiza el rendimiento de las campañas. ¿Cuál fue más efectiva? ¿Hay alguna con problemas?');
      return buildTableResponse(
        ['Campaña', 'Estado', 'Total', 'Enviados', 'Entregados', 'Fallidos'],
        campaigns.map((c: any) => ({
          'Campaña': c.name, 'Estado': c.status,
          'Total': String(c.total_contacts ?? 0), 'Enviados': String(c.sent_count ?? 0),
          'Entregados': String(c.delivered_count ?? 0), 'Fallidos': String(c.failed_count ?? 0),
        })),
        `Últimas ${campaigns.length} campañas`, text,
      );
    }

    case 'get_agent_ranking': {
      const { date_from = monthIso, date_to = today, period_label = 'este mes' } = toolArgs;
      const agents = await runAgentRanking(admin, tenantId, date_from, date_to);
      if (!agents.length) return { type: 'text', text: 'No hay datos de asesores para el período consultado.' };
      const dataStr = agents.map((a: any) => `- ${a.name}: ${a['Deals cerrados']} deals, ${a['Leads nuevos']} leads, tasa: ${a['Tasa cierre']}`).join('\n');
      const text = await getAnalysisText(openrouterKey, dataStr, `Analiza el ranking de asesores en "${period_label}". ¿Quién lidera? ¿Hay brechas notables?`);
      return buildAgentRankingResponse(agents, period_label ?? `${date_from} al ${date_to}`, text);
    }

    case 'get_appointments': {
      const { date_from = today, date_to = today, period_label = 'hoy' } = toolArgs;
      const items = await runAppointments(admin, tenantId, date_from, date_to);
      if (!items.length) return { type: 'text', text: `No hay citas agendadas para ${period_label}.` };
      const detailStr = items.map((it: any) => `- ${it.meta}: ${it.label} (${it.description})`).join('\n');
      const text = await getAnalysisText(openrouterKey, detailStr, `Resume las ${items.length} citas de "${period_label}" incluyendo hora y contacto de las más relevantes.`);
      return buildListResponse(items, `Agenda — ${period_label}`, text);
    }

    case 'get_property_inquiries': {
      const { limit = 10, date_from, date_to } = toolArgs;
      const items = await runPropertyInquiries(admin, tenantId, limit, date_from, date_to);
      if (!items.length) return { type: 'text', text: 'No hay contactos con propiedad de interés registrada todavía.' };
      const detailStr = items.map((it: any) => `- ${it.label} (${it.description}): ${it._count} solicitudes, precio ${it._price}`).join('\n');
      const text = await getAnalysisText(openrouterKey, detailStr, 'Destaca las propiedades con más solicitudes y cualquier patrón notable (zona, tipo, precio).');
      return buildTableResponse(
        ['Propiedad', 'Clave', 'Zona / Tipo', 'Precio', 'Solicitudes'],
        items.map((it: any) => ({
          'Propiedad': it.label,
          'Clave': it._code,
          'Zona / Tipo': it.description || '—',
          'Precio': it._price,
          'Solicitudes': String(it._count),
        })),
        `Top ${items.length} propiedades por solicitudes`, text,
      );
    }

    case 'get_property_stats': {
      const { zone, status } = toolArgs;
      const props = await runPropertyStats(admin, tenantId, zone, status);
      if (!props.length) return { type: 'text', text: 'No se encontraron propiedades con los filtros indicados.' };

      const byZone: Record<string, number> = {};
      const byType: Record<string, number> = {};
      props.forEach((p: any) => {
        if (p.zone) byZone[p.zone] = (byZone[p.zone] ?? 0) + 1;
        if (p.property_type) byType[p.property_type] = (byType[p.property_type] ?? 0) + 1;
      });
      const prices = props.map((p: any) => Number(p.price)).filter(Boolean);
      const avgPrice = prices.length ? Math.round(prices.reduce((s, v) => s + v, 0) / prices.length) : 0;

      const dataStr = `${props.length} propiedades activas. Precio promedio: $${avgPrice.toLocaleString('es-MX')}. Zonas: ${Object.entries(byZone).map(([z, c]) => `${z} (${c})`).join(', ')}.`;
      const text = await getAnalysisText(openrouterKey, dataStr, 'Analiza el inventario de propiedades. ¿Dónde se concentra? ¿Cuál es el precio promedio?');
      return buildTableResponse(
        ['Clave', 'Título', 'Zona', 'Tipo', 'Precio', 'Estado'],
        props.slice(0, 20).map((p: any) => ({
          'Clave': p.property_code ?? '—', 'Título': p.title ?? '—',
          'Zona': p.zone ?? '—', 'Tipo': p.property_type ?? '—',
          'Precio': p.price ? `$${Number(p.price).toLocaleString('es-MX')} ${p.currency ?? 'MXN'}` : '—',
          'Estado': p.status ?? '—',
        })),
        `${props.length} propiedades activas`, text,
      );
    }

    case 'get_at_risk_contacts': {
      const { inactive_days = 7 } = toolArgs;
      const rows = await runAtRiskContacts(admin, tenantId, inactive_days);
      if (!rows.length) return { type: 'text', text: `No hay leads en riesgo (sin actividad >${inactive_days} días).` };
      const text = await getAnalysisText(openrouterKey, `${rows.length} leads sin actividad en ${inactive_days}+ días`, 'Genera una alerta sobre leads en riesgo. ¿Qué acción recomendarías?');
      return buildTableResponse(['Contacto', 'Asesor', 'Etapa', 'Temperatura', 'Sin actividad'], rows, `${rows.length} leads en riesgo`, text);
    }

    case 'search_contact': {
      const { query } = toolArgs;
      const rows = await runSearchContact(admin, tenantId, query);
      if (!rows.length) return { type: 'text', text: `No encontré contactos con "${query}".` };
      const text = rows.length === 1 ? `Encontré a **${rows[0]['Nombre']}**.` : `Encontré ${rows.length} contactos para "${query}".`;
      return buildTableResponse(['Nombre', 'Teléfono', 'Email', 'Etapa', 'Asesor'], rows, `${rows.length} resultado${rows.length !== 1 ? 's' : ''}`, text);
    }

    case 'get_credits_remaining': {
      const credits = await runCreditsRemaining(admin, tenantId);
      if (!credits) return { type: 'text', text: 'No pude obtener información de créditos.' };
      const total = (credits.monthly_credits_remaining ?? 0) + (credits.extra_credits ?? 0);
      const nextRefill = credits.next_refill_at ? new Date(credits.next_refill_at).toLocaleDateString('es-MX') : 'N/A';
      const text = await getAnalysisText(openrouterKey, `Créditos: ${total} restantes (${credits.monthly_credits_remaining} mensuales + ${credits.extra_credits ?? 0} extra). Próxima recarga: ${nextRefill}.`, 'Resume los créditos disponibles. ¿Hay riesgo de quedarse sin créditos?');
      return buildInsightResponse([
        { label: 'Créditos disponibles', value: String(total), trend: 'neutral', color: total < 100 ? 'danger' : total < 500 ? 'warning' : 'success' },
        { label: 'Créditos mensuales', value: String(credits.monthly_credits_remaining ?? 0), trend: 'neutral', color: 'default' },
        { label: 'Créditos extra', value: String(credits.extra_credits ?? 0), trend: 'neutral', color: 'default' },
        { label: 'Próxima recarga', value: nextRefill, trend: 'neutral', color: 'default' },
      ], text);
    }

    case 'get_period_comparison': {
      const { current_from = monthIso, current_to = today, label = 'este mes vs mes pasado' } = toolArgs;
      const comparison = await runPeriodComparison(admin, tenantId, current_from, current_to);
      const pct = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? '+100%' : '0%') : `${curr >= prev ? '+' : ''}${Math.round(((curr - prev) / prev) * 100)}%`;
      const text = await getAnalysisText(openrouterKey,
        `Leads: ${comparison.leads.current} vs ${comparison.leads.previous}. Deals: ${comparison.deals.current} vs ${comparison.deals.previous}. Citas: ${comparison.events.current} vs ${comparison.events.previous}.`,
        `Compara el rendimiento en "${label}". ¿Hay mejora o caída? ¿Qué métrica destaca?`);
      return buildTableResponse(
        ['Métrica', 'Período actual', 'Período anterior', 'Variación'],
        [
          { 'Métrica': 'Leads nuevos', 'Período actual': String(comparison.leads.current), 'Período anterior': String(comparison.leads.previous), 'Variación': pct(comparison.leads.current, comparison.leads.previous) },
          { 'Métrica': 'Deals ganados', 'Período actual': String(comparison.deals.current), 'Período anterior': String(comparison.deals.previous), 'Variación': pct(comparison.deals.current, comparison.deals.previous) },
          { 'Métrica': 'Citas agendadas', 'Período actual': String(comparison.events.current), 'Período anterior': String(comparison.events.previous), 'Variación': pct(comparison.events.current, comparison.events.previous) },
        ],
        label, text,
      );
    }

    case 'get_deals_closing_soon': {
      const { limit = 10 } = toolArgs;
      const items = await runDealsClosingSoon(admin, tenantId, limit);
      if (!items.length) return { type: 'text', text: 'No hay deals en etapas avanzadas por el momento.' };
      const text = await getAnalysisText(openrouterKey, `${items.length} deals en etapas avanzadas`, 'Analiza los deals próximos a cerrar. ¿Cuáles deberían priorizarse?');
      return buildListResponse(items, 'Deals próximos a cerrar', text);
    }

    case 'get_ai_vs_human_stats': {
      const pieData = await runAiVsHumanStats(admin, tenantId);
      const total = pieData.reduce((s, d) => s + d.value, 0);
      const text = await getAnalysisText(openrouterKey,
        pieData.map(d => `- ${d.name}: ${d.value} (${total > 0 ? Math.round((d.value / total) * 100) : 0}%)`).join('\n'),
        'Analiza la distribución IA vs humano en conversaciones. ¿La IA está resolviendo bien?');
      return { type: 'report-chart', chartType: 'pie', text, data: { chartTitle: 'Resolución IA vs humano', chartData: pieData, dataKey: 'value', nameKey: 'name' } };
    }

    case 'get_response_time_stats': {
      const stats = await runResponseTimeStats(admin, tenantId);
      if (!stats.avgMinutes) return { type: 'text', text: 'No hay suficientes datos de tiempo de respuesta.' };
      const text = await getAnalysisText(openrouterKey,
        `Tiempo promedio de respuesta: ${stats.avgMinutes} minutos (mediana: ${stats.medianMinutes} min, basado en ${stats.samples} conversaciones).`,
        'Evalúa el tiempo de respuesta del equipo. El benchmark ideal para WhatsApp es <5 minutos.');
      return buildInsightResponse([
        { label: 'Tiempo promedio', value: `${stats.avgMinutes} min`, trend: stats.avgMinutes <= 5 ? 'up' : 'down', color: stats.avgMinutes <= 5 ? 'success' : stats.avgMinutes <= 15 ? 'warning' : 'danger' },
        { label: 'Mediana', value: `${stats.medianMinutes} min`, trend: 'neutral', color: 'default' },
        { label: 'Muestra', value: `${stats.samples} convs.`, trend: 'neutral', color: 'default' },
      ], text);
    }

    case 'get_segment_suggestions': {
      const items = await runSegmentSuggestions(admin, tenantId);
      if (!items.length) return { type: 'text', text: 'No hay suficientes datos para generar sugerencias de segmentos.' };
      const text = await getAnalysisText(openrouterKey, `Segmentos encontrados: ${items.length}`, 'Sugiere cómo aprovechar estos segmentos en campañas de WhatsApp.');
      return buildListResponse(items, 'Segmentos sugeridos para campaña', text);
    }

    case 'get_deal_scores': {
      const { limit = 10 } = toolArgs;
      const rows = await runDealScores(admin, tenantId, limit);
      if (!rows.length) return { type: 'text', text: 'No hay deals abiertos para analizar.' };
      const top = rows.slice(0, 3).map((r: any) => `${r['Deal']} (${r['Score']})`).join(', ');
      const text = await getAnalysisText(openrouterKey, `Top deals: ${top}`, 'Analiza los deals con mayor probabilidad de cierre. ¿Cuáles deberían priorizarse esta semana?');
      return buildTableResponse(
        ['Deal', 'Etapa', 'Contacto', 'Asesor', 'Precio', 'Score'],
        rows as any[],
        `${rows.length} deals por probabilidad de cierre`, text,
      );
    }

    // ── WRITE TOOLS — devuelven action-confirm ──
    case 'create_contact': {
      const { name, phone, email, notes, source } = toolArgs;
      const details = [
        name && `Nombre: **${name}**`,
        phone && `Teléfono: ${phone}`,
        email && `Email: ${email}`,
        notes && `Interés: ${notes}`,
        source && `Fuente: ${source}`,
      ].filter(Boolean);
      return buildActionConfirm('create_contact', toolArgs, 'Crear nuevo contacto',
        `Se creará el siguiente contacto en el CRM:`, details.map(d => ({ label: d as string })));
    }

    case 'create_followup': {
      const { contact_name, due_at, note } = toolArgs;
      const date = new Date(due_at).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      return buildActionConfirm('create_followup', toolArgs, 'Agendar seguimiento',
        `Se agendará un seguimiento para **${contact_name}**`,
        [{ label: `Fecha: ${date}` }, note && { label: `Nota: ${note}` }].filter(Boolean) as any[]);
    }

    case 'create_event': {
      const { contact_name, title, start_at, event_type = 'visita', notes } = toolArgs;
      const date = new Date(start_at).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      return buildActionConfirm('create_event', toolArgs, `Agendar ${event_type}`,
        `Se agendará: **${title}**`,
        [{ label: `Contacto: ${contact_name}` }, { label: `Fecha: ${date}` }, notes && { label: `Notas: ${notes}` }].filter(Boolean) as any[]);
    }

    case 'update_deal_stage': {
      const { contact_name, new_stage, deal_title } = toolArgs;
      return buildActionConfirm('update_deal_stage', toolArgs, 'Mover deal de etapa',
        `Se actualizará el deal${deal_title ? ` "${deal_title}"` : ''} de **${contact_name}**`,
        [{ label: `Nueva etapa: **${new_stage}**` }]);
    }

    case 'reassign_lead': {
      const { contact_name, new_agent_name, from_agent_name } = toolArgs;
      return buildActionConfirm('reassign_lead', toolArgs, 'Reasignar lead',
        `Se reasignará **${contact_name}** al asesor **${new_agent_name}**`,
        [from_agent_name && { label: `Asesor actual: ${from_agent_name}` }].filter(Boolean) as any[]);
    }

    case 'add_contact_note': {
      const { contact_name, content } = toolArgs;
      return buildActionConfirm('add_contact_note', toolArgs, 'Agregar nota a contacto',
        `Se agregará una nota a **${contact_name}**:`,
        [{ label: content }]);
    }

    default:
      return { type: 'text', text: 'No pude obtener esa información en este momento.' };
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl   = Deno.env.get('SUPABASE_URL')!;
    const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')!;

    const userClient = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await admin.from('profiles').select('tenant_id').eq('id', user.id).single();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return new Response(JSON.stringify({ error: 'Tenant no encontrado' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Rate limiting
    const rateLimited = await checkRateLimit(admin, tenantId, user.id);
    if (rateLimited) return new Response(JSON.stringify({ error: 'Límite de mensajes alcanzado. Espera un minuto.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { prompt, conversation_id: conversationId } = await req.json();
    if (!prompt?.trim()) return new Response(JSON.stringify({ error: 'Prompt vacío' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Crear conversación si es nueva
    let activeConvId = conversationId as string | null;
    if (!activeConvId) {
      const { data: newConv, error: convErr } = await admin.from('ai_conversations').insert({ tenant_id: tenantId, user_id: user.id, title: null, conversation_type: 'user', unread: false, is_pinned: false }).select('id').single();
      if (convErr) throw convErr;
      activeConvId = newConv.id;
    }

    // Guardar mensaje usuario
    await admin.from('ai_messages').insert({ conversation_id: activeConvId, role: 'user', content: { type: 'text', text: prompt } });

    // Historial (últimos 20 mensajes)
    const { data: historyRows } = await admin.from('ai_messages').select('role, content').eq('conversation_id', activeConvId).order('created_at', { ascending: true }).limit(20);
    const history = (historyRows ?? []).map((m: any) => ({ role: m.role as string, content: (m.content as any)?.text ?? '' }));

    // System prompt
    const today = currentDateMX();
    const nowIso = isoDate(new Date());
    const monIso = weekStart();
    const sunIso = weekEnd();
    const monthIso = monthStart();

    const systemPrompt = `Eres Brokia IA Studio, el asistente inteligente del CRM Brokia24 / MLS LATAM.
Ayudas a equipos inmobiliarios a analizar datos, generar reportes, buscar contactos y ejecutar acciones en el CRM.
Responde siempre en español, de forma concisa y profesional.
Hoy es ${today} (${nowIso}). La semana actual va del ${monIso} al ${sunIso}. El mes actual inició el ${monthIso}.

REGLAS DE USO DE HERRAMIENTAS (crítico):
- SIEMPRE llama la herramienta correspondiente antes de responder cuando el usuario pregunte sobre datos del CRM: citas, leads, contactos, pipeline, campañas, propiedades, asesores, créditos, etc.
- NUNCA respondas "no tengo esa información" o "no hay datos" sobre el CRM sin haber llamado primero la herramienta. Tú no tienes acceso directo a los datos — debes consultarlos con las herramientas.
- Si el usuario pregunta por citas de hoy, esta semana, mañana o cualquier período: usa get_appointments con las fechas correctas.
- Para acciones de escritura (crear contacto, agendar cita, etc.): extrae los datos del mensaje y usa la herramienta — el usuario confirmará antes de ejecutar.
- Solo responde directamente (sin herramientas) si la pregunta es conceptual, de ayuda o no requiere datos del CRM.`;

    // Primera llamada OpenRouter — intent detection
    const firstRes = await callOpenRouter(openrouterKey, [{ role: 'system', content: systemPrompt }, ...history], TOOLS);
    const firstMsg = firstRes.choices?.[0]?.message;

    let assistantContent: Record<string, unknown>;

    if (firstMsg?.tool_calls && firstMsg.tool_calls.length > 0) {
      const toolCall = firstMsg.tool_calls[0];
      const toolName = toolCall.function?.name;
      const toolArgs = JSON.parse(toolCall.function?.arguments ?? '{}');
      console.log(`Tool call: ${toolName}`, toolArgs);

      try {
        assistantContent = await dispatchTool(toolName, toolArgs, admin, tenantId, openrouterKey);
      } catch (err) {
        console.error(`Tool error [${toolName}]:`, err);
        assistantContent = {
          type: 'error',
          text: `No pude obtener los datos para "${toolName}".`,
          data: { suggestion: 'Intenta de nuevo en unos segundos.' },
        };
      }
    } else {
      assistantContent = { type: 'text', text: firstMsg?.content ?? 'No pude generar una respuesta.' };
    }

    // Guardar mensaje asistente
    const { data: savedMessage, error: msgErr } = await admin.from('ai_messages').insert({ conversation_id: activeConvId, role: 'assistant', content: assistantContent }).select().single();
    if (msgErr) throw msgErr;

    // Auto-título: generarlo en el primer intercambio (title = null)
    const { data: convData } = await admin.from('ai_conversations').select('title').eq('id', activeConvId).single();
    if (!convData?.title) {
      try {
        const titleRes = await callOpenRouter(openrouterKey, [
          { role: 'system', content: 'Genera un título corto (4-6 palabras) en español para esta conversación. Solo el título, sin comillas ni puntuación al final.' },
          { role: 'user', content: prompt.slice(0, 200) },
        ]);
        const generatedTitle = titleRes.choices?.[0]?.message?.content?.trim().slice(0, 60);
        if (generatedTitle) {
          await admin.from('ai_conversations').update({ title: generatedTitle, updated_at: new Date().toISOString() }).eq('id', activeConvId);
        }
      } catch {
        await admin.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConvId);
      }
    } else {
      await admin.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConvId);
    }

    return new Response(JSON.stringify({ conversation_id: activeConvId, message: savedMessage }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('ai-studio-chat error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
