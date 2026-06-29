import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function dealScore(deal: any, contact: any): number {
  const stageKey = (deal.stage ?? '').toLowerCase().trim();
  const stageScore = STAGE_SCORES[stageKey] ?? 10;

  const temp = (contact?.lead_temperature ?? '').toLowerCase();
  const tempBonus = TEMP_BONUS[temp] ?? 0;

  const lastInt = contact?.last_interaction_at ? new Date(contact.last_interaction_at) : null;
  const daysSince = lastInt ? (Date.now() - lastInt.getTime()) / 86400000 : null;
  let recencyScore = 0;
  if (daysSince !== null) {
    if (daysSince < 1)       recencyScore = 20;
    else if (daysSince < 3)  recencyScore = 15;
    else if (daysSince < 7)  recencyScore = 10;
    else if (daysSince < 14) recencyScore = 5;
  }

  const agentBonus = deal.assigned_agent_id ? 5 : 0;
  const hasEvents  = (deal._eventCount ?? 0) > 0 ? 5 : 0;

  return Math.min(100, stageScore + tempBonus + recencyScore + agentBonus + hasEvents);
}

// ── OpenRouter ────────────────────────────────────────────────────────────────

async function briefingText(apiKey: string, context: string): Promise<string> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Eres el asistente de inteligencia de negocio de un CRM inmobiliario. Genera un briefing matutino en español, en markdown, máximo 4 oraciones. Sé directo y accionable. Resalta los puntos más urgentes.' },
          { role: 'user', content: context },
        ],
      }),
    });
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  } catch {
    return '';
  }
}

// ── Anomaly detection ────────────────────────────────────────────────────────

async function detectAnomalies(admin: any, tenantId: string) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  // Leads sin respuesta (+24h)
  const cutoff24h = new Date(now.getTime() - 24 * 3600000).toISOString();
  const { count: noResponseCount } = await admin
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .or(`last_interaction_at.is.null,last_interaction_at.lte.${cutoff24h}`)
    .in('status', ['lead', 'active'])
    .not('pipeline_stage', 'in', '("cerrado","ganado","perdido")');

  // Seguimientos vencidos
  const { count: overdueCount } = await admin
    .from('conversation_followups')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'scheduled')
    .lt('due_at', now.toISOString());

  // Deals estancados >7 días en etapas intermedias
  const { count: stagnantCount } = await admin
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .not('stage', 'in', '("cierre","promesa","escritura","ganado")')
    .lt('updated_at', weekAgo.toISOString());

  // Leads nuevos hoy
  const { count: leadsToday } = await admin
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', todayStart.toISOString());

  // Promedio diario de leads últimos 7 días
  const { count: leadsWeek } = await admin
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', weekAgo.toISOString());
  const dailyAvg = Math.round((leadsWeek ?? 0) / 7);

  // Citas para hoy
  const todayEnd = new Date(now); todayEnd.setUTCHours(23, 59, 59, 999);
  const { count: citasHoy } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('start_at', todayStart.toISOString())
    .lte('start_at', todayEnd.toISOString());

  return {
    noResponseCount: noResponseCount ?? 0,
    overdueCount: overdueCount ?? 0,
    stagnantCount: stagnantCount ?? 0,
    leadsToday: leadsToday ?? 0,
    dailyAvg,
    citasHoy: citasHoy ?? 0,
  };
}

// ── Deal scoring ─────────────────────────────────────────────────────────────

async function scoredDeals(admin: any, tenantId: string) {
  const { data: deals } = await admin
    .from('deals')
    .select('id, stage, assigned_agent_id, contact_id, offered_price_mxn, title, contacts(name, lead_temperature, last_interaction_at), profiles!deals_assigned_agent_id_fkey(name)')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .not('stage', 'in', '("ganado","perdido")')
    .limit(100);

  // Contar eventos por deal
  const dealIds = (deals ?? []).map((d: any) => d.id);
  const { data: events } = dealIds.length
    ? await admin.from('events').select('contact_id').eq('tenant_id', tenantId).in('contact_id', (deals ?? []).map((d: any) => d.contact_id))
    : { data: [] };

  const eventsByContact: Record<string, number> = {};
  (events ?? []).forEach((e: any) => { eventsByContact[e.contact_id] = (eventsByContact[e.contact_id] ?? 0) + 1; });

  return (deals ?? [])
    .map((d: any) => ({
      id: d.id,
      title: d.title ?? (d.contacts as any)?.name ?? 'Deal sin título',
      stage: d.stage ?? '—',
      contact: (d.contacts as any)?.name ?? '—',
      agent: (d.profiles as any)?.name ?? 'Sin asignar',
      price: d.offered_price_mxn,
      score: dealScore({ ...d, _eventCount: eventsByContact[d.contact_id] ?? 0 }, d.contacts),
    }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 10);
}

// ── Build insight message content ────────────────────────────────────────────

function buildDailySummaryContent(
  anomalies: ReturnType<typeof detectAnomalies> extends Promise<infer T> ? T : never,
  topDeals: any[],
  analysisText: string,
  dateLabel: string,
): Record<string, unknown> {
  const alerts: { label: string; description: string; severity: 'danger' | 'warning' | 'normal' }[] = [];

  if (anomalies.noResponseCount > 5) {
    alerts.push({ label: `${anomalies.noResponseCount} leads sin respuesta`, description: 'Llevan más de 24h sin atención', severity: 'danger' });
  } else if (anomalies.noResponseCount > 0) {
    alerts.push({ label: `${anomalies.noResponseCount} leads sin respuesta`, description: 'Llevan más de 24h sin atención', severity: 'warning' });
  }

  if (anomalies.overdueCount > 0) {
    alerts.push({ label: `${anomalies.overdueCount} seguimientos vencidos`, description: 'Pendientes de acción', severity: anomalies.overdueCount > 3 ? 'danger' : 'warning' });
  }

  if (anomalies.stagnantCount > 0) {
    alerts.push({ label: `${anomalies.stagnantCount} deals estancados`, description: 'Sin actividad por más de 7 días', severity: 'warning' });
  }

  if (anomalies.leadsToday === 0 && anomalies.dailyAvg > 0) {
    alerts.push({ label: 'Sin leads nuevos hoy', description: `Promedio diario: ${anomalies.dailyAvg} leads`, severity: 'warning' });
  }

  if (anomalies.citasHoy > 0) {
    alerts.push({ label: `${anomalies.citasHoy} cita${anomalies.citasHoy !== 1 ? 's' : ''} hoy`, description: 'Asegúrate de que el equipo esté listo', severity: 'normal' });
  }

  const dealRows = topDeals.slice(0, 5).map(d => ({
    'Deal': d.title,
    'Etapa': d.stage,
    'Asesor': d.agent,
    'Score': `${d.score}/100`,
  }));

  return {
    type: 'insight-daily',
    text: analysisText || `Resumen del ${dateLabel}`,
    data: {
      dateLabel,
      kpis: [
        { label: 'Leads nuevos hoy', value: String(anomalies.leadsToday), trend: anomalies.leadsToday >= anomalies.dailyAvg ? 'up' : 'down', color: anomalies.leadsToday >= anomalies.dailyAvg ? 'success' : 'warning' },
        { label: 'Citas hoy', value: String(anomalies.citasHoy), trend: 'neutral', color: 'default' },
        { label: 'Sin respuesta', value: String(anomalies.noResponseCount), trend: anomalies.noResponseCount > 5 ? 'down' : 'neutral', color: anomalies.noResponseCount > 5 ? 'danger' : anomalies.noResponseCount > 0 ? 'warning' : 'success' },
        { label: 'Seguimientos vencidos', value: String(anomalies.overdueCount), trend: anomalies.overdueCount > 0 ? 'down' : 'neutral', color: anomalies.overdueCount > 3 ? 'danger' : anomalies.overdueCount > 0 ? 'warning' : 'success' },
      ],
      alerts,
      topDeals: {
        columns: ['Deal', 'Etapa', 'Asesor', 'Score'],
        rows: dealRows,
      },
    },
  };
}

// ── Find or create system conversation ──────────────────────────────────────

async function getOrCreateSystemConversation(admin: any, tenantId: string, adminUserId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const title = `Alertas — ${new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  // Buscar conversación de sistema creada hoy para este admin
  const { data: existing } = await admin
    .from('ai_conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', adminUserId)
    .eq('conversation_type', 'system')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .limit(1)
    .single();

  if (existing) {
    await admin.from('ai_conversations').update({ unread: true, updated_at: new Date().toISOString() }).eq('id', existing.id);
    return existing.id;
  }

  const { data: created } = await admin.from('ai_conversations').insert({
    tenant_id: tenantId,
    user_id: adminUserId,
    title,
    conversation_type: 'system',
    unread: true,
    is_pinned: true,
  }).select('id').single();

  return created.id;
}

// ── Process one tenant ────────────────────────────────────────────────────────

async function processTenant(admin: any, tenantId: string, openrouterKey: string): Promise<string> {
  // Verificar si ya corrió hoy
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { data: logged } = await admin
    .from('ai_insights_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('insight_type', 'daily_summary')
    .gte('sent_at', todayStart.toISOString())
    .limit(1)
    .single();

  if (logged) return `tenant ${tenantId}: ya procesado hoy`;

  // Encontrar admin del tenant: primero IDs del tenant, luego cruzar con user_roles
  const { data: tenantProfiles } = await admin
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const tenantUserIds = (tenantProfiles ?? []).map((p: any) => p.id);
  if (!tenantUserIds.length) return `tenant ${tenantId}: sin usuarios activos`;

  const { data: adminRole } = await admin
    .from('user_roles')
    .select('user_id')
    .eq('tenant_role', 'administrador')
    .in('user_id', tenantUserIds)
    .limit(1)
    .single();

  const adminUser = adminRole ? { id: adminRole.user_id } : null;

  if (!adminUser) return `tenant ${tenantId}: sin admin`;

  // Recopilar datos
  const [anomalies, topDeals] = await Promise.all([
    detectAnomalies(admin, tenantId),
    scoredDeals(admin, tenantId),
  ]);

  const dateLabel = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  // Generar texto analítico con OpenRouter
  const contextForAI = [
    `Fecha: ${dateLabel}`,
    `Leads nuevos hoy: ${anomalies.leadsToday} (promedio diario: ${anomalies.dailyAvg})`,
    `Leads sin respuesta +24h: ${anomalies.noResponseCount}`,
    `Seguimientos vencidos: ${anomalies.overdueCount}`,
    `Deals estancados +7 días: ${anomalies.stagnantCount}`,
    `Citas hoy: ${anomalies.citasHoy}`,
    `Top deals por score: ${topDeals.slice(0, 3).map(d => `${d.title} (${d.score}/100, etapa: ${d.stage})`).join('; ')}`,
  ].join('\n');

  const analysis = await briefingText(openrouterKey, contextForAI);

  // Construir contenido del mensaje
  const messageContent = buildDailySummaryContent(anomalies, topDeals, analysis, dateLabel);

  // Crear/actualizar conversación de sistema
  const convId = await getOrCreateSystemConversation(admin, tenantId, adminUser.id);

  // Guardar mensaje
  await admin.from('ai_messages').insert({
    conversation_id: convId,
    role: 'assistant',
    content: messageContent,
  });

  // Registrar en el log
  await admin.from('ai_insights_log').insert({
    tenant_id: tenantId,
    insight_type: 'daily_summary',
    summary: `Leads: ${anomalies.leadsToday}, Sin respuesta: ${anomalies.noResponseCount}, Vencidos: ${anomalies.overdueCount}`,
  });

  return `tenant ${tenantId}: OK`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl   = Deno.env.get('SUPABASE_URL')!;
    const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')!;

    // Verificar secret (pg_cron usa X-Cron-Secret, llamadas manuales igual)
    const cronSecret = Deno.env.get('CRON_SECRET');
    const incoming = req.headers.get('X-Cron-Secret') ?? req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!cronSecret || incoming !== cronSecret) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const specificTenantId: string | null = body.tenant_id ?? null;

    let tenantIds: string[] = [];
    if (specificTenantId) {
      tenantIds = [specificTenantId];
    } else {
      const { data: tenants } = await admin
        .from('tenants')
        .select('id')
        .not('billing_state', 'in', '("cancelled","suspended")');
      tenantIds = (tenants ?? []).map((t: any) => t.id);
    }

    const results: string[] = [];
    for (const tenantId of tenantIds) {
      try {
        const result = await processTenant(admin, tenantId, openrouterKey);
        results.push(result);
      } catch (err) {
        results.push(`tenant ${tenantId}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('ai-studio-insights error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
