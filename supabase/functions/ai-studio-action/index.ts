import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Helper: find contact by fuzzy name ────────────────────────────────────────

async function findContactByName(admin: any, tenantId: string, name: string): Promise<{ id: string; name: string } | null> {
  const { data } = await admin
    .from('contacts')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .ilike('name', `%${name}%`)
    .limit(1)
    .single();
  return data ?? null;
}

async function findProfileByName(admin: any, tenantId: string, name: string): Promise<{ id: string; name: string } | null> {
  const { data } = await admin
    .from('profiles')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .ilike('name', `%${name}%`)
    .limit(1)
    .single();
  return data ?? null;
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleCreateContact(admin: any, tenantId: string, userId: string, params: Record<string, any>): Promise<string> {
  const { name, phone, email, notes, source } = params;
  const { data, error } = await admin.from('contacts').insert({
    tenant_id: tenantId,
    name,
    phone: phone ?? null,
    email: email ?? null,
    source: source ?? 'ai-studio',
    status: 'lead',
    created_by: userId,
  }).select('id, name').single();
  if (error) throw new Error(`No se pudo crear el contacto: ${error.message}`);
  if (notes) {
    await admin.from('contact_notes').insert({ tenant_id: tenantId, contact_id: data.id, author_id: userId, content: notes, note_type: 'general' });
  }
  return `Contacto **${data.name}** creado exitosamente.`;
}

async function handleCreateFollowup(admin: any, tenantId: string, userId: string, params: Record<string, any>): Promise<string> {
  const { contact_name, due_at, note } = params;
  const contact = await findContactByName(admin, tenantId, contact_name);
  if (!contact) throw new Error(`No encontré un contacto con el nombre "${contact_name}".`);

  const { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contact.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const { error } = await admin.from('conversation_followups').insert({
    tenant_id: tenantId,
    contact_id: contact.id,
    conversation_id: conv?.id ?? null,
    assigned_user_id: userId,
    due_at,
    note: note ?? null,
    status: 'scheduled',
  });
  if (error) throw new Error(`No se pudo crear el seguimiento: ${error.message}`);

  const dateStr = new Date(due_at).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return `Seguimiento agendado para **${contact.name}** el ${dateStr}.`;
}

async function handleCreateEvent(admin: any, tenantId: string, userId: string, params: Record<string, any>): Promise<string> {
  const { contact_name, title, start_at, event_type = 'visita', notes } = params;
  const contact = await findContactByName(admin, tenantId, contact_name);
  if (!contact) throw new Error(`No encontré un contacto con el nombre "${contact_name}".`);

  const endAt = new Date(new Date(start_at).getTime() + 3600000).toISOString();
  const { error } = await admin.from('events').insert({
    tenant_id: tenantId,
    contact_id: contact.id,
    title,
    event_type,
    start_at,
    end_at: endAt,
    status: 'scheduled',
    created_by: userId,
    notes: notes ?? null,
  });
  if (error) throw new Error(`No se pudo crear el evento: ${error.message}`);

  const dateStr = new Date(start_at).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return `**${title}** agendado con **${contact.name}** para el ${dateStr}.`;
}

async function handleUpdateDealStage(admin: any, tenantId: string, _userId: string, params: Record<string, any>): Promise<string> {
  const { contact_name, new_stage, deal_title } = params;
  const contact = await findContactByName(admin, tenantId, contact_name);
  if (!contact) throw new Error(`No encontré un contacto con el nombre "${contact_name}".`);

  let q = admin.from('deals').select('id, stage').eq('tenant_id', tenantId).eq('contact_id', contact.id).eq('status', 'open');
  if (deal_title) q = q.ilike('title', `%${deal_title}%`);
  const { data: deals } = await q.limit(1);

  if (!deals || deals.length === 0) throw new Error(`No encontré un deal abierto para **${contact.name}**.`);

  const deal = deals[0];
  const oldStage = deal.stage;
  const { error } = await admin.from('deals').update({ stage: new_stage, updated_at: new Date().toISOString() }).eq('id', deal.id);
  if (error) throw new Error(`No se pudo actualizar el deal: ${error.message}`);

  return `Deal de **${contact.name}** movido de **${oldStage}** a **${new_stage}**.`;
}

async function handleReassignLead(admin: any, tenantId: string, _userId: string, params: Record<string, any>): Promise<string> {
  const { contact_name, new_agent_name, from_agent_name } = params;
  const newAgent = await findProfileByName(admin, tenantId, new_agent_name);
  if (!newAgent) throw new Error(`No encontré al asesor "${new_agent_name}".`);

  let count = 0;
  if (from_agent_name && (contact_name === 'todos' || contact_name.toLowerCase().includes('todos'))) {
    const fromAgent = await findProfileByName(admin, tenantId, from_agent_name);
    if (!fromAgent) throw new Error(`No encontré al asesor "${from_agent_name}".`);
    const { data: contacts } = await admin.from('contacts').select('id').eq('tenant_id', tenantId).eq('assigned_agent_id', fromAgent.id);
    if (contacts && contacts.length > 0) {
      await admin.from('contacts').update({ assigned_agent_id: newAgent.id }).in('id', contacts.map((c: any) => c.id));
      count = contacts.length;
    }
    return `${count} leads de **${fromAgent.name}** reasignados a **${newAgent.name}**.`;
  }

  const contact = await findContactByName(admin, tenantId, contact_name);
  if (!contact) throw new Error(`No encontré un contacto con el nombre "${contact_name}".`);
  const { error } = await admin.from('contacts').update({ assigned_agent_id: newAgent.id }).eq('id', contact.id).eq('tenant_id', tenantId);
  if (error) throw new Error(`No se pudo reasignar: ${error.message}`);
  return `**${contact.name}** reasignado a **${newAgent.name}**.`;
}

async function handleAddContactNote(admin: any, tenantId: string, userId: string, params: Record<string, any>): Promise<string> {
  const { contact_name, content } = params;
  const contact = await findContactByName(admin, tenantId, contact_name);
  if (!contact) throw new Error(`No encontré un contacto con el nombre "${contact_name}".`);

  const { error } = await admin.from('contact_notes').insert({
    tenant_id: tenantId,
    contact_id: contact.id,
    author_id: userId,
    content,
    note_type: 'general',
    is_pinned: false,
  });
  if (error) throw new Error(`No se pudo agregar la nota: ${error.message}`);
  return `Nota agregada a **${contact.name}** exitosamente.`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await admin.from('profiles').select('tenant_id').eq('id', user.id).single();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return new Response(JSON.stringify({ error: 'Tenant no encontrado' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { conversation_id: conversationId, tool, params = {} } = await req.json();
    if (!conversationId || !tool) return new Response(JSON.stringify({ error: 'Faltan parámetros: conversation_id, tool' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Verificar que la conversación pertenece al tenant
    const { data: conv } = await admin.from('ai_conversations').select('id').eq('id', conversationId).eq('tenant_id', tenantId).single();
    if (!conv) return new Response(JSON.stringify({ error: 'Conversación no encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let successText = '';
    try {
      switch (tool) {
        case 'create_contact':    successText = await handleCreateContact(admin, tenantId, user.id, params); break;
        case 'create_followup':   successText = await handleCreateFollowup(admin, tenantId, user.id, params); break;
        case 'create_event':      successText = await handleCreateEvent(admin, tenantId, user.id, params); break;
        case 'update_deal_stage': successText = await handleUpdateDealStage(admin, tenantId, user.id, params); break;
        case 'reassign_lead':     successText = await handleReassignLead(admin, tenantId, user.id, params); break;
        case 'add_contact_note':  successText = await handleAddContactNote(admin, tenantId, user.id, params); break;
        default: return new Response(JSON.stringify({ error: `Herramienta desconocida: ${tool}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch (actionError) {
      const errMsg = actionError instanceof Error ? actionError.message : 'Error desconocido';
      const { data: errMessage } = await admin.from('ai_messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: { type: 'error', text: errMsg, data: { suggestion: 'Verifica los datos e intenta de nuevo.' } },
      }).select().single();
      return new Response(JSON.stringify({ error: errMsg, message: errMessage }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: savedMessage, error: msgErr } = await admin.from('ai_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: { type: 'text', text: `✓ ${successText}` },
    }).select().single();
    if (msgErr) throw msgErr;

    await admin.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);

    return new Response(JSON.stringify({ message: savedMessage }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('ai-studio-action error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
