import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration for retry and timeout handling
const CONFIG = {
  AI_TIMEOUT_MS: 15000,
  AI_MAX_RETRIES: 2,
  AI_RETRY_DELAY_MS: 1000,
  MAX_EXECUTION_TIME_MS: 25000,
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ========== DISPATCHER: intent classification ==========

const CAPTACION_KEYWORDS = [
  // Direct sell intent
  'quiero vender', 'quisiera vender', 'deseo vender', 'necesito vender',
  'me interesa vender', 'voy a vender', 'pensando en vender', 'busco vender',
  // Direct rent-out intent (propietario que quiere rentar su inmueble — siempre llevan "mi")
  'quiero rentar mi', 'quisiera rentar mi', 'quiero arrendar mi',
  'deseo rentar mi', 'busco rentar mi', 'necesito rentar mi',
  // Ownership declarations
  'tengo una propiedad', 'tengo un inmueble', 'tengo un departamento',
  'tengo una casa', 'tengo un terreno', 'tengo un local', 'tengo una oficina',
  'soy propietario', 'soy propietaria', 'soy el dueño', 'soy la dueña',
  'soy dueño', 'soy dueña',
  // Listing intent
  'poner en venta', 'poner en renta', 'poner en arriendo',
  'quiero publicar', 'quiero anunciar', 'quiero listar',
  'publicar mi propiedad', 'anunciar mi propiedad',
  // Explicit sell phrases
  'vender mi casa', 'vender mi departamento', 'vender mi propiedad',
  'vender mi inmueble', 'vender mi terreno', 'vender mi local',
  'rentar mi casa', 'rentar mi departamento', 'rentar mi propiedad',
  // Valuation requests
  'cuanto vale mi', 'cuánto vale mi', 'valuar mi propiedad',
  'valuacion de mi', 'valuación de mi', 'avaluo de mi', 'avalúo de mi',
  // Help to sell
  'ayuda para vender', 'ayúdame a vender', 'me ayudan a vender',
  'asesoria para vender', 'asesoría para vender',
];

// Keywords for tenants looking to rent (arrendatarios)
// Checked AFTER captacion so "quiero rentar mi" never falls here
const RENTAS_KEYWORDS = [
  // Explicit renting intent
  'quiero rentar', 'quisiera rentar', 'deseo rentar',
  'me interesa rentar', 'busco rentar', 'necesito rentar',
  'estoy buscando para rentar', 'busco para rentar',
  // Property type + "en renta"
  'casa en renta', 'departamento en renta', 'depto en renta',
  'apartamento en renta', 'local en renta', 'oficina en renta',
  'cuarto en renta', 'habitacion en renta', 'habitación en renta',
  'propiedad en renta', 'inmueble en renta', 'terreno en renta',
  // General renta search
  'busco en renta', 'busco renta', 'buscar renta',
  'estoy buscando renta', 'busco algo en renta',
  // Arriendo / arrendamiento (Colombia, Chile, otros)
  'en arriendo', 'para arrendar', 'busco arrendar',
  'quiero arrendar', 'quisiera arrendar', 'me interesa arrendar',
  'busco arriendo', 'necesito arriendo', 'apartamento en arriendo',
  'casa en arriendo', 'local en arriendo', 'oficina en arriendo',
  // Alquiler (España y mercados generales)
  'quiero alquilar', 'busco alquilar', 'para alquilar',
  'me interesa alquilar', 'alquiler de', 'busco alquiler',
  'apartamento en alquiler', 'casa en alquiler', 'piso en alquiler',
];

// Regex to detect property codes (16-char hex) that may appear in WhatsApp deep-links
const PROPERTY_CODE_REGEX = /\b[0-9a-f]{16}\b/i;

async function dispatchIntent(
  message: string,
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<'calificacion' | 'captacion' | 'rentas'> {
  const lower = message.toLowerCase();

  // 1. Captación: owner wants to sell or list their property (highest priority)
  if (CAPTACION_KEYWORDS.some(kw => lower.includes(kw))) return 'captacion';

  // 2. Rentas: tenant looking to rent
  if (RENTAS_KEYWORDS.some(kw => lower.includes(kw))) return 'rentas';

  // 3. Property code in message → look up operation_type in DB
  //    This covers WhatsApp deep-links that pre-fill the property code in the first message
  const codeMatch = message.match(PROPERTY_CODE_REGEX);
  if (codeMatch) {
    const { data: prop } = await supabase
      .from('properties')
      .select('operation_type')
      .eq('tenant_id', tenantId)
      .eq('property_code', codeMatch[0])
      .maybeSingle();
    if (prop?.operation_type === 'rent') {
      console.log(`🔑 Dispatcher: property ${codeMatch[0]} is rent → rentas pipeline`);
      return 'rentas';
    }
    if (prop) {
      console.log(`🏠 Dispatcher: property ${codeMatch[0]} is sale → calificacion pipeline`);
      return 'calificacion';
    }
  }

  // 4. Default: buyer looking to purchase
  return 'calificacion';
}

serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const contentType = req.headers.get('content-type') || '';
    let body: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        body[key] = value.toString();
      });
    } else if (contentType.includes('application/json')) {
      body = await req.json();
    }

    console.log('📨 Twilio inbound webhook received');

    const messageSid = body.MessageSid || body.SmsSid;
    const from = body.From;
    const to = body.To;
    const messageBody = body.Body || '';
    const numMedia = parseInt(body.NumMedia || '0');
    const accountSid = body.AccountSid;
    const profileName = body.ProfileName || null;

    if (!from || !to || !accountSid) {
      console.error('❌ Missing required fields');
      return emptyTwiml();
    }

    const customerPhone = from.replace('whatsapp:', '');
    const businessPhone = to.replace('whatsapp:', '');

    console.log(`📱 Message from ${customerPhone} to ${businessPhone}`);

    // Find tenant
    const { data: integration, error: integrationError } = await supabase
      .from('tenant_integrations')
      .select('tenant_id, account_sid, phone_number')
      .eq('provider', 'twilio')
      .eq('status', 'connected')
      .or(`account_sid.eq.${accountSid},phone_number.eq.${businessPhone}`)
      .maybeSingle();

    if (integrationError || !integration) {
      console.error('❌ No tenant found');
      return emptyTwiml();
    }

    const tenantId = integration.tenant_id;
    console.log(`✅ Found tenant: ${tenantId}`);

    // Upsert contact
    let contactId: string;
    let wasDeletedContact = false;
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id, name, pipeline_stage, status')
      .eq('tenant_id', tenantId)
      .eq('phone', customerPhone)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      // Reactivate deleted contacts: restore to active and reset pipeline
      if (existingContact.status === 'deleted') {
        wasDeletedContact = true;
        const { error: reactivateError } = await supabase.from('contacts').update({
          status: 'active',
          pipeline_stage: 'new_lead',
          operational_status: 'ACTIVE',
          lead_temperature: 'cold',
        }).eq('id', existingContact.id);
        if (reactivateError) {
          console.error(`❌ Failed to reactivate deleted contact ${existingContact.id}:`, reactivateError);
        } else {
          console.log(`🔄 Reactivated deleted contact ${existingContact.id} → new_lead`);
        }
      }
      // Update contact name if it was a generic "WhatsApp Lead" and we now have a profile name
      if (profileName && existingContact.name === 'WhatsApp Lead') {
        await supabase.from('contacts').update({ name: profileName }).eq('id', existingContact.id);
        console.log(`📝 Updated contact name from "WhatsApp Lead" to "${profileName}"`);
      }
      // Reactivate closed_lost contacts: reset pipeline to new_lead
      if (existingContact.pipeline_stage === 'closed_lost') {
        const { error: reactivateError } = await supabase.from('contacts').update({
          pipeline_stage: 'new_lead',
          status: 'active',
          operational_status: 'ACTIVE',
          lead_temperature: 'cold',
        }).eq('id', existingContact.id);
        if (reactivateError) {
          console.error(`❌ Failed to reactivate closed_lost contact ${existingContact.id}:`, reactivateError);
        } else {
          console.log(`🔄 Reactivated closed_lost contact ${existingContact.id} → new_lead`);
        }
      }
    } else {
      const contactName = profileName || 'WhatsApp Lead';
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({ tenant_id: tenantId, phone: customerPhone, name: contactName, status: 'active' })
        .select('id')
        .single();

      if (contactError || !newContact) {
        console.error('❌ Failed to create contact:', contactError);
        return emptyTwiml();
      }
      contactId = newContact.id;
      console.log(`👤 Created contact "${contactName}" for ${customerPhone}`);
    }

    // Parse media
    const mediaUrls: string[] = [];
    let mediaType: string | null = null;
    let mediaMimeType: string | null = null;
    let mediaFilename: string | null = null;
    
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = body[`MediaUrl${i}`];
      const ct = body[`MediaContentType${i}`];
      if (mediaUrl) {
        mediaUrls.push(mediaUrl);
        if (i === 0 && ct) {
          mediaMimeType = ct;
          if (ct.startsWith('image/')) mediaType = 'image';
          else if (ct.startsWith('video/')) mediaType = 'video';
          else if (ct.startsWith('audio/')) mediaType = 'audio';
          else if (ct.startsWith('application/')) mediaType = 'document';
          else mediaType = 'unknown';
          mediaFilename = `File_${new Date().toISOString().slice(0, 10)}`;
        }
      }
    }

    const locationLat = body.Latitude ? parseFloat(body.Latitude) : null;
    const locationLng = body.Longitude ? parseFloat(body.Longitude) : null;
    if (locationLat && locationLng) mediaType = 'location';

    let messagePreview = messageBody.substring(0, 120);
    if (!messageBody && mediaType) {
      const labels: Record<string, string> = { image: '📷 Imagen', video: '🎥 Video', audio: '🎙️ Audio', document: '📎 Documento', location: '📍 Ubicación' };
      messagePreview = labels[mediaType] || '📎 Archivo';
    }

    // Upsert conversation
    let conversationId: string;
    let aiEnabled = true;
    let conversationAgentMode: string | null = null;
    let captacionStep: number | null = null;

    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, unread_count, ai_enabled, agent_mode, captacion_step, pending_event_id')
      .eq('tenant_id', tenantId)
      .eq('customer_whatsapp', customerPhone)
      .maybeSingle();

    let pendingEventId: string | null = null;

    if (existingConv) {
      conversationId = existingConv.id;
      aiEnabled = existingConv.ai_enabled ?? true;
      conversationAgentMode = existingConv.agent_mode ?? null;
      captacionStep = existingConv.captacion_step ?? null;
      pendingEventId = existingConv.pending_event_id ?? null;

      // Build update payload - reopen conversation if contact was reactivated from closed_lost
      const convUpdate: Record<string, unknown> = {
        last_customer_message_at: new Date().toISOString(),
        last_message_preview: messagePreview,
        last_message_direction: 'inbound',
        last_message_source: 'customer',
        unread_count: (existingConv.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      };

      // Reopen conversation for reactivated contacts (deleted or closed_lost)
      if (wasDeletedContact || existingContact?.pipeline_stage === 'closed_lost') {
        convUpdate.status = 'open';
        convUpdate.ai_enabled = true;
        convUpdate.ai_state = 'active';
        convUpdate.needs_human = false;
        convUpdate.ai_pause_reason = null;
        convUpdate.agent_mode = null; // re-classify on reopen
        convUpdate.captacion_step = null;
        conversationAgentMode = null;
        captacionStep = null;
        aiEnabled = true;
        console.log(`🔄 Reopening conversation for reactivated contact (wasDeleted=${wasDeletedContact})`);
      }

      await supabase.from('conversations').update(convUpdate).eq('id', conversationId);
    } else {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenantId, contact_id: contactId, twilio_subaccount_sid: accountSid,
          twilio_whatsapp_number: businessPhone, customer_whatsapp: customerPhone,
          status: 'open', ai_enabled: true, last_customer_message_at: new Date().toISOString(),
          last_message_preview: messagePreview, last_message_direction: 'inbound',
          last_message_source: 'customer', unread_count: 1,
        })
        .select('id, ai_enabled').single();

      if (convError || !newConv) {
        console.error('❌ Failed to create conversation:', convError);
        return emptyTwiml();
      }
      conversationId = newConv.id;
      aiEnabled = newConv.ai_enabled ?? true;

      // Trigger automatic assignment for new conversations
      try {
        const { data: assignRes, error: assignErr } = await supabase.rpc('fn_assign_conversation', {
          p_conversation_id: conversationId,
          p_force_strategy: null,
          p_force_agent_id: null,
          p_assigned_by: null,
          p_reason: 'new_conversation',
        });
        if (assignErr) console.warn('⚠️ fn_assign_conversation error:', assignErr);
        else console.log('🎯 New conversation assigned:', assignRes?.[0]);
      } catch (e) {
        console.warn('⚠️ assignment skipped:', e);
      }
    }

    // Insert message
    const { data: newMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        tenant_id: tenantId, conversation_id: conversationId, direction: 'inbound',
        channel: 'whatsapp', provider: 'twilio', twilio_message_sid: messageSid,
        from_number: customerPhone, to_number: businessPhone, body: messageBody,
        media_urls: mediaUrls, media_type: mediaType, media_mime_type: mediaMimeType,
        media_filename: mediaFilename, location_lat: locationLat, location_lng: locationLng,
        status: 'received',
      })
      .select('id').single();

    if (msgError) {
      console.error('❌ Failed to insert message:', msgError);
      return emptyTwiml();
    }

    // Check if tenant can send (using centralized function)
    const { data: canSendResult } = await supabase.rpc('can_send_message', { p_tenant_id: tenantId });
    
    if (!canSendResult) {
      console.log('⚠️ No balance - cannot process inbound');
      return emptyTwiml();
    }

    // Debit using centralized function with idempotency
    const idempotencyKey = `inbound:${newMessage.id}`;
    const { data: creditResult, error: creditError } = await supabase.rpc('fn_apply_credit_movement', {
      p_tenant_id: tenantId,
      p_movement_type: 'debit',
      p_amount: 1,
      p_reason: 'inbound_message',
      p_source_table: 'messages',
      p_source_id: newMessage.id,
      p_idempotency_key: idempotencyKey
    });

    if (creditError || !creditResult?.[0]?.success) {
      console.log('⚠️ Failed to debit for inbound:', creditError || creditResult?.[0]?.error_code);
      return emptyTwiml();
    }

    console.log(`✅ Inbound message credited. New balance: ${creditResult[0].new_balance}`);

    // ========== EMIT AUTOMATION EVENT ==========
    const { error: eventBusError } = await supabase.from('system_event_bus').insert({
      tenant_id: tenantId,
      event_name: 'inbound_message',
      entity_type: 'message',
      entity_id: newMessage.id,
      payload: {
        contact_id: contactId,
        conversation_id: conversationId,
        message_id: newMessage.id,
        message_body: messageBody,
        media_type: mediaType,
        trigger_data: {
          from: customerPhone,
          to: businessPhone,
          body: messageBody,
          media_type: mediaType,
          has_media: numMedia > 0,
        },
      },
      status: 'pending',
    });
    if (eventBusError) {
      console.error('❌ Failed to emit inbound_message event:', eventBusError);
    } else {
      console.log('📤 Emitted inbound_message event to automation bus');
    }

    // ========== CHECK FOR CAMPAIGN REPLY ==========
    const { data: recentCampaignDelivery } = await supabase
      .from('campaign_deliveries')
      .select('campaign_id, updated_at')
      .eq('contact_id', contactId)
      .eq('tenant_id', tenantId)
      .eq('status', 'sent')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentCampaignDelivery) {
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('name, template_id')
        .eq('id', recentCampaignDelivery.campaign_id)
        .single();

      const campaignName = campaignData?.name || 'Unknown Campaign';

      const { error: campaignReplyError } = await supabase.from('system_event_bus').insert({
        tenant_id: tenantId,
        event_name: 'campaign_replied',
        entity_type: 'campaign',
        entity_id: recentCampaignDelivery.campaign_id,
        payload: {
          contact_id: contactId,
          conversation_id: conversationId,
          message_id: newMessage.id,
          campaign_id: recentCampaignDelivery.campaign_id,
          campaign_name: campaignName,
          reply_body: messageBody,
          trigger_data: {
            campaign_id: recentCampaignDelivery.campaign_id,
            campaign_name: campaignName,
            reply_body: messageBody,
            has_media: numMedia > 0,
          },
        },
        status: 'pending',
      });
      if (campaignReplyError) {
        console.error('❌ Failed to emit campaign_replied event:', campaignReplyError);
      } else {
        console.log(`📤 Emitted campaign_replied event for campaign ${recentCampaignDelivery.campaign_id}`);
      }
    }

    // ========== DISPATCHER ==========
    // Classify conversation intent on first message; reuse stored mode on subsequent messages
    if (!conversationAgentMode && messageBody.trim()) {
      conversationAgentMode = await dispatchIntent(messageBody, supabase, tenantId);
      await supabase
        .from('conversations')
        .update({ agent_mode: conversationAgentMode })
        .eq('id', conversationId);
      console.log(`🧭 Dispatcher → ${conversationAgentMode} (new classification)`);

      // Auto-route contact to the correct pipeline based on intent
      if (conversationAgentMode === 'captacion') {
        await supabase
          .from('contacts')
          .update({ pipeline_type: 'captacion', pipeline_stage: 'captacion_new' })
          .eq('id', contactId);
        console.log(`🏠 Contact ${contactId} routed to Captación pipeline`);
      } else if (conversationAgentMode === 'rentas') {
        await supabase
          .from('contacts')
          .update({ pipeline_type: 'rentas', pipeline_stage: 'renta_nuevo' })
          .eq('id', contactId);
        console.log(`🔑 Contact ${contactId} routed to Rentas pipeline`);
      } else {
        // Buyer (calificacion): ensure pipeline_type stays calificacion (no-op if already set)
        await supabase
          .from('contacts')
          .update({ pipeline_type: 'calificacion' })
          .eq('id', contactId)
          .eq('pipeline_type', 'calificacion');
      }
    } else {
      console.log(`🧭 Dispatcher → ${conversationAgentMode ?? 'calificacion'} (existing)`);
    }

    // ========== AGENDAMIENTO AGENT ==========
    // Handles responses to appointment confirmation messages sent by ai-appointment-agent.
    const currentBalance = creditResult[0].new_balance;

    if (aiEnabled && currentBalance > 0 && conversationAgentMode === 'agendamiento' && pendingEventId && messageBody.trim()) {
      const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');

      // Load the pending event
      const { data: pendingEvent } = await supabase
        .from('events')
        .select('id, title, event_type, start_at, timezone, status, metadata')
        .eq('id', pendingEventId)
        .maybeSingle();

      if (pendingEvent) {
        // ── Classify client response ──────────────────────────────────────
        let classification: 'confirmed' | 'declined' | 'question' = 'question';

        if (openrouterKey) {
          try {
            const classRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [{ role: 'user', content: `El cliente respondió a un recordatorio de cita. Clasifica su respuesta:
- "confirmed": confirma asistencia (sí, confirmo, ahí estaré, claro, por supuesto, de acuerdo, etc.)
- "declined": no puede ir o cancela (no puedo, cancelo, tengo otro compromiso, no asistiré, etc.)
- "question": pregunta algo o no queda claro

Mensaje del cliente: "${messageBody}"

Responde ÚNICAMENTE con una palabra: confirmed, declined, o question` }],
                max_tokens: 10,
                temperature: 0,
              }),
            });
            if (classRes.ok) {
              const raw = (await classRes.json())?.choices?.[0]?.message?.content?.trim().toLowerCase() ?? '';
              if (raw.includes('confirmed')) classification = 'confirmed';
              else if (raw.includes('declined')) classification = 'declined';
              else classification = 'question';
            }
          } catch (e) {
            console.error('❌ Agendamiento classification error:', e);
          }
        }

        console.log(`📅 Agendamiento: "${classification}" for event ${pendingEventId}`);

        const { data: apptAiSettings } = await supabase
          .from('tenant_ai_settings' as any)
          .select('agent_name, region_code')
          .eq('tenant_id', tenantId)
          .maybeSingle();
        const apptAgentName: string = (apptAiSettings as any)?.agent_name ?? 'Sofía';

        const formattedApptDate = (() => {
          try {
            return new Intl.DateTimeFormat('es-MX', {
              weekday: 'long', day: 'numeric', month: 'long',
              hour: '2-digit', minute: '2-digit',
              timeZone: (pendingEvent as any).timezone || 'America/Mexico_City',
            }).format(new Date((pendingEvent as any).start_at));
          } catch { return (pendingEvent as any).start_at; }
        })();

        if (classification === 'confirmed') {
          // Update event status
          await supabase.from('events').update({ status: 'confirmed' }).eq('id', pendingEventId);

          // Log activity for advisor notification
          await supabase.from('conversation_activity').insert({
            tenant_id: tenantId,
            conversation_id: conversationId,
            contact_id: contactId,
            event_type: 'appointment_confirmed',
            actor_type: 'ai',
            payload: {
              event_id: pendingEventId,
              title: (pendingEvent as any).title,
              start_at: (pendingEvent as any).start_at,
              confirmed_via: 'whatsapp',
            },
          });

          // Generate confirmation response
          let responseMsg = `¡Perfecto! Tu asistencia ha sido confirmada para el ${formattedApptDate}. ¡Te esperamos!`;
          if (openrouterKey) {
            try {
              const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'google/gemini-2.5-flash',
                  messages: [{ role: 'user', content: `El cliente confirmó su cita "${(pendingEvent as any).title}" para el ${formattedApptDate}. Escribe un mensaje breve de confirmación (máx 3 oraciones): agradece, confirma la fecha/hora y da 1-2 tips prácticos. Tono cálido. Sin asteriscos.` }],
                  max_tokens: 150, temperature: 0.6,
                }),
              });
              if (r.ok) responseMsg = (await r.json())?.choices?.[0]?.message?.content?.trim() || responseMsg;
            } catch { /* use fallback */ }
          }

          await sendAIResponse(supabase, tenantId, conversationId, businessPhone, customerPhone, responseMsg, newMessage.id, undefined);

          // Exit agendamiento mode
          await supabase.from('conversations').update({ agent_mode: null, pending_event_id: null }).eq('id', conversationId);
          console.log(`✅ Appointment ${pendingEventId} confirmed by client`);

        } else if (classification === 'declined') {
          // Update event status
          await supabase.from('events').update({ status: 'canceled' }).eq('id', pendingEventId);

          // Log activity for advisor notification
          await supabase.from('conversation_activity').insert({
            tenant_id: tenantId,
            conversation_id: conversationId,
            contact_id: contactId,
            event_type: 'appointment_declined',
            actor_type: 'ai',
            payload: {
              event_id: pendingEventId,
              title: (pendingEvent as any).title,
              start_at: (pendingEvent as any).start_at,
              client_message: messageBody,
            },
          });

          // Generate empathetic response
          let declineMsg = 'Entendemos, no hay problema. Si deseas reagendar la cita para otra fecha, con gusto te ayudamos. ¡Quedo a tus órdenes!';
          if (openrouterKey) {
            try {
              const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'google/gemini-2.5-flash',
                  messages: [{ role: 'user', content: `El cliente no puede asistir a su cita "${(pendingEvent as any).title}". Escribe un mensaje empático (máx 2 oraciones): entiende la situación y ofrece reagendar. Tono cálido. Sin asteriscos.` }],
                  max_tokens: 100, temperature: 0.6,
                }),
              });
              if (r.ok) declineMsg = (await r.json())?.choices?.[0]?.message?.content?.trim() || declineMsg;
            } catch { /* use fallback */ }
          }

          await sendAIResponse(supabase, tenantId, conversationId, businessPhone, customerPhone, declineMsg, newMessage.id, undefined);

          // Escalate to human advisor (they need to reschedule)
          await supabase.from('conversations').update({
            needs_human: true, ai_state: 'escalated', ai_pause_reason: 'appointment_declined',
            agent_mode: null, pending_event_id: null,
          }).eq('id', conversationId);
          console.log(`📅 Appointment ${pendingEventId} declined — escalating to human`);

        } else {
          // question — answer and stay in agendamiento mode
          let questionMsg = 'Con gusto te ayudo con tu duda sobre la cita.';
          if (openrouterKey) {
            try {
              const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'google/gemini-2.5-flash',
                  messages: [{ role: 'user', content: `El cliente tiene una pregunta sobre su cita "${(pendingEvent as any).title}" el ${formattedApptDate}. Pregunta: "${messageBody}". Responde brevemente (máx 2 oraciones) con información útil. Sin asteriscos.` }],
                  max_tokens: 150, temperature: 0.6,
                }),
              });
              if (r.ok) questionMsg = (await r.json())?.choices?.[0]?.message?.content?.trim() || questionMsg;
            } catch { /* use fallback */ }
          }
          await sendAIResponse(supabase, tenantId, conversationId, businessPhone, customerPhone, questionMsg, newMessage.id, undefined);
          console.log(`📅 Agendamiento: answered question for event ${pendingEventId}`);
        }
      }

      return emptyTwiml(); // Handled — skip captacion/calificacion agents
    }

    // ========== CAPTACION AGENT ==========
    if (aiEnabled && currentBalance > 0 && conversationAgentMode === 'captacion') {
      // Load captacion settings — auto-seed defaults if tenant hasn't configured yet
      let { data: capSettings } = await supabase
        .from('tenant_captacion_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!capSettings) {
        const defaults = {
          tenant_id: tenantId,
          enabled: true,
          agent_name: 'Sofía',
          operation_focus: 'both',
          greeting_message: '¡Hola! Me da mucho gusto que nos contactes. Me gustaría conocer un poco más sobre tu inmueble para conectarte con el asesor ideal. ¿Me permites hacerte algunas preguntas? 🏡',
          questions: [
            { id: 'tipo_propiedad', label: 'Tipo de inmueble', question: '¿Qué tipo de inmueble deseas vender o rentar?', type: 'choice', options: ['Casa', 'Departamento', 'Local comercial', 'Terreno', 'Otro'], required: true, enabled: true, order: 0 },
            { id: 'ubicacion', label: 'Ubicación', question: '¿En qué colonia o zona se encuentra el inmueble?', type: 'open', required: true, enabled: true, order: 1 },
            { id: 'caracteristicas', label: 'Características', question: '¿Cuántas recámaras y baños tiene? ¿Y cuántos metros cuadrados aproximadamente?', type: 'open', required: false, enabled: true, order: 2 },
            { id: 'precio', label: 'Precio esperado', question: '¿Cuál es el precio que tienes en mente para tu inmueble?', type: 'open', required: false, enabled: true, order: 3 },
            { id: 'urgencia', label: 'Urgencia', question: '¿En qué plazo necesitas concretar la operación?', type: 'choice', options: ['Lo antes posible', 'En los próximos 3-6 meses', 'Sin prisa'], required: false, enabled: true, order: 4 },
          ],
          completion_message: '¡Excelente! Ya tenemos toda la información necesaria. Un asesor especializado en captación se pondrá en contacto contigo muy pronto. ¡Gracias por tu confianza! 🙌',
          handoff_message: 'Ya registré los datos del inmueble. Un asesor te contactará a la brevedad.',
          auto_escalate: true,
        };
        const { data: inserted } = await supabase
          .from('tenant_captacion_settings')
          .insert(defaults)
          .select('*')
          .single();
        capSettings = inserted;
        console.log('🏠 Auto-seeded default captacion settings for tenant');
      }

      const { data: aiSettings } = await supabase
        .from('tenant_ai_settings')
        .select('agent_name, company_name, response_delay_seconds, region_code, language, formality')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const delayMs = (aiSettings?.response_delay_seconds ?? 2) * 1000;
      const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');

      // If captacion agent disabled or no API key, fall back to immediate escalation
      if (!capSettings?.enabled || !openrouterKey) {
        console.log('🏠 Captacion agent disabled or no API key — escalating immediately');
        const fallbackMsg = `¡Hola! Qué bueno que nos contactas sobre tu propiedad. Un asesor especializado se comunicará contigo en breve. 🏡`;
        if (delayMs > 0) await delay(delayMs);
        await supabase.from('conversations').update({
          ai_enabled: false, ai_state: 'escalated', needs_human: true,
          ai_pause_reason: 'captacion', ai_paused_at: new Date().toISOString(),
        }).eq('id', conversationId);
        await sendAIResponse(supabase, tenantId, conversationId, businessPhone, customerPhone, fallbackMsg, newMessage.id, undefined);

      } else if (captacionStep === -1) {
        // Flow already completed — ensure advisor is flagged and client gets a holding message
        console.log('🏠 Captacion flow already completed, escalating to human');
        const alreadyEscalated = (await supabase
          .from('conversations')
          .select('needs_human')
          .eq('id', conversationId)
          .single()).data?.needs_human;

        if (!alreadyEscalated) {
          await supabase.from('conversations').update({
            needs_human: true,
            ai_state: 'escalated',
            ai_pause_reason: 'captacion_complete',
          }).eq('id', conversationId);

          const holdingMsg = capSettings?.handoff_message || 'Ya registré los datos del inmueble. Un asesor te contactará a la brevedad.';
          await sendAIResponse(supabase, tenantId, conversationId, businessPhone, customerPhone, holdingMsg, newMessage.id, undefined);
        }

      } else {
        // ── CONVERSATIONAL AI CAPTACION FLOW ──────────────────────────────
        const agentName = capSettings.agent_name || aiSettings?.agent_name || 'Sofía';
        const companyName = aiSettings?.company_name || '';
        const regionCode = aiSettings?.region_code || 'MX';
        const formality = aiSettings?.formality || 'tu';

        // Regional context — vocabulary + modismos by country, same source as Agente de Calificación
        const REGIONAL_CONTEXT: Record<string, string> = {
          MX: 'Español de México. USA: "departamento", "recámara", "alberca", "cochera", "enganche", "mensualidades". EVITA: "apartamento", "habitación", "parqueadero", "arriendo", "piso".',
          CO: 'Español colombiano. USA SIEMPRE: "apartamento" (NUNCA "departamento"), "habitación/alcoba" (NUNCA "recámara"), "parqueadero" (NUNCA "estacionamiento"), "arriendo" (NUNCA "renta"), "arrendar" (NUNCA "rentar"), "cuota inicial", "con mucho gusto", "le cuento que…". EVITA: "departamento", "recámara", "estacionamiento", "renta".',
          AR: 'Español rioplatense. USA "vos" y conjugación voseante (tenés, querés, podés). USA: "departamento", "ambientes", "expensas", "cochera", "alquiler" (no "renta"), "che", "dale". EVITA: "tú", "recámara".',
          CL: 'Español chileno. USA: "departamento", "dormitorio", "estacionamiento", "arriendo" (no "renta"), "pie" (no "enganche"), "UF". EVITA: "recámara", "piso".',
          PE: 'Español peruano. USA: "departamento", "dormitorio", "cochera", "alquiler" (no "renta"). EVITA: "recámara", "piso".',
          ES: 'Español de España. USA SIEMPRE: "piso" (NUNCA "departamento"), "habitación", "plaza de garaje", "alquiler" (NUNCA "renta"), "arras", "comunidad de propietarios", "vale", "venga". EVITA: "departamento", "recámara", "estacionamiento", "ahorita".',
          US: 'Español neutro latinoamericano, términos bilingües si aplica.',
        };

        const regionContext = REGIONAL_CONTEXT[regionCode] || REGIONAL_CONTEXT.MX;
        const vocabBlock = `\nCONFIGURACIÓN REGIONAL (${regionCode}):\n${regionContext}`;

        const formalityNote = formality === 'usted'
          ? 'Trata siempre de "usted" al vendedor, nunca de "tú".'
          : formality === 'vos'
          ? 'Trata de "vos" al vendedor (rioplatense), nunca de "tú" ni "usted".'
          : 'Trata de "tú" al vendedor.';

        const enabledQs: Array<{ id: string; label: string; question: string; type: string; options?: string[] }> =
          ((capSettings.questions as unknown as Array<any>) || [])
            .filter((q: any) => q.enabled)
            .sort((a: any, b: any) => a.order - b.order);

        // Load contact name and existing cap_data
        const { data: contactRow } = await supabase
          .from('contacts').select('name, cap_data').eq('id', contactId).single();
        const contactName = contactRow?.name || null;
        const existingCapData: Record<string, string> = (contactRow?.cap_data as any) || {};

        // Load recent conversation history for LLM context (last 16 messages)
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('direction, body, created_at')
          .eq('conversation_id', conversationId)
          .not('body', 'is', null)
          .order('created_at', { ascending: false })
          .limit(16);

        const conversationHistory = (recentMessages || [])
          .reverse()
          .slice(0, -1) // exclude current message (already in inbound)
          .map((m: any) => ({
            role: m.direction === 'inbound' ? 'user' : 'assistant',
            content: m.body as string,
          }));

        // Build "already collected" summary for the prompt
        const collectedSummary = enabledQs
          .filter(q => existingCapData[`cap_${q.id}`])
          .map(q => `- ${q.label}: ${existingCapData[`cap_${q.id}`]}`)
          .join('\n');

        const pendingQs = enabledQs.filter(q => !existingCapData[`cap_${q.id}`]);

        // Build captacion system prompt
        const captacionSystemPrompt = `Eres ${agentName}${companyName ? `, asesora de ${companyName}` : ''}, especialista en captación inmobiliaria.

Tu misión es recopilar la información del inmueble que el vendedor quiere poner en ${capSettings.operation_focus === 'sale' ? 'venta' : capSettings.operation_focus === 'rent' ? 'renta' : 'venta o renta'}, de manera natural y cálida, como lo haría una asesora humana experta.

INFORMACIÓN QUE NECESITAS RECOPILAR:
${enabledQs.map((q, i) => `${i + 1}. ${q.label}${q.options?.length ? ` (opciones locales: ${q.options.join(', ')})` : ''}`).join('\n')}

INFORMACIÓN YA RECOPILADA:
${collectedSummary || 'Ninguna todavía — es el primer mensaje del vendedor.'}

INFORMACIÓN PENDIENTE:
${pendingQs.length > 0 ? pendingQs.map(q => `- ${q.label}`).join('\n') : 'Ninguna — ya tienes todo.'}
${vocabBlock}

INSTRUCCIONES DE COMPORTAMIENTO:
- Habla como una asesora humana cálida y profesional. NUNCA como un bot.
- Haz UNA SOLA pregunta a la vez, en orden natural de la conversación.
- Si el vendedor ya mencionó un dato, NO lo vuelvas a preguntar.
- ${formalityNote}
${contactName ? `- Puedes usar el nombre "${contactName}" solo al inicio o cuando sea muy natural. NO lo repitas en cada mensaje — una conversación real no menciona el nombre constantemente.` : ''}
- Si el vendedor da información extra no solicitada, acúsalo recibo con naturalidad y continúa.
- Cuando hayas conseguido TODA la información pendiente, escribe exactamente al final: [CAPTACION_COMPLETADA]
- NUNCA menciones que eres IA, bot, sistema o automatización.
- Máximo 2 oraciones por mensaje para que fluya como WhatsApp real.`;

        // Call OpenRouter LLM
        let aiReply = '';
        try {
          const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openrouterKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                { role: 'system', content: captacionSystemPrompt },
                ...conversationHistory,
                { role: 'user', content: messageBody },
              ],
            }),
          });

          if (llmRes.ok) {
            const llmJson = await llmRes.json();
            aiReply = llmJson.choices?.[0]?.message?.content?.trim() || '';
          } else {
            console.error('❌ Captacion LLM error:', llmRes.status, await llmRes.text());
          }
        } catch (e) {
          console.error('❌ Captacion LLM call failed:', e);
        }

        if (!aiReply) {
          // Fallback if LLM fails
          aiReply = pendingQs.length > 0
            ? pendingQs[0].question
            : capSettings.completion_message;
        }

        const isCompleted = aiReply.includes('[CAPTACION_COMPLETADA]');
        const cleanReply = aiReply.replace('[CAPTACION_COMPLETADA]', '').trim();

        // Mark step as in-progress (0) if this was the first message
        if (captacionStep === null) {
          await supabase.from('conversations')
            .update({ captacion_step: 0 }).eq('id', conversationId);
        }

        // Extract and save structured answers from conversation via LLM
        try {
          const extractRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openrouterKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [{
                role: 'user',
                content: `Analiza este mensaje del vendedor y extrae SOLO los datos que se mencionan explícitamente. Devuelve un JSON válido con las claves correspondientes a los datos encontrados, usando null para los no mencionados.

Claves posibles: ${enabledQs.map(q => `cap_${q.id}`).join(', ')}

Mensaje del vendedor: "${messageBody}"

Responde ÚNICAMENTE con el JSON, sin explicación.`,
              }],
            }),
          });

          if (extractRes.ok) {
            const extractJson = await extractRes.json();
            const rawExtract = extractJson.choices?.[0]?.message?.content?.trim() || '{}';
            const jsonMatch = rawExtract.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const extracted = JSON.parse(jsonMatch[0]);
              const newCapData = { ...existingCapData };
              for (const [k, v] of Object.entries(extracted)) {
                if (v !== null && v !== undefined && String(v).trim()) {
                  newCapData[k] = String(v);
                }
              }
              if (Object.keys(newCapData).length > Object.keys(existingCapData).length) {
                await supabase.from('contacts')
                  .update({ cap_data: newCapData }).eq('id', contactId);
                console.log('🏠 Extracted and saved cap_data:', Object.keys(newCapData));
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ Cap data extraction failed (non-critical):', e);
        }

        if (delayMs > 0) await delay(delayMs);

        if (isCompleted) {
          // Send completion message (clean reply without token)
          const completionMsg = cleanReply || capSettings.completion_message;
          console.log('🏠 Captacion flow completed by LLM');
          await supabase.from('conversations').update({ captacion_step: -1 }).eq('id', conversationId);
          await sendAIResponse(supabase, tenantId, conversationId, businessPhone, customerPhone, completionMsg, newMessage.id, undefined);

          if (capSettings.auto_escalate) {
            await supabase.from('conversations').update({
              ai_enabled: false, ai_state: 'escalated', needs_human: true,
              ai_pause_reason: 'captacion', ai_paused_at: new Date().toISOString(),
            }).eq('id', conversationId);
          }
          await supabase.from('ai_interaction_logs').insert({
            tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
            inbound_message: messageBody, ai_response: completionMsg,
            was_escalated: capSettings.auto_escalate,
            escalation_reason: capSettings.auto_escalate ? 'captacion_complete' : null,
          });
        } else {
          // Continue conversation
          await sendAIResponse(supabase, tenantId, conversationId, businessPhone, customerPhone, cleanReply, newMessage.id, undefined);
          await supabase.from('ai_interaction_logs').insert({
            tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId,
            inbound_message: messageBody, ai_response: cleanReply, was_escalated: false,
          });
        }
      }
    }

    // AI call with retry (check balance again) — only for calificacion
    if (aiEnabled && currentBalance > 0 && conversationAgentMode !== 'captacion') {
      try {
        const { data: contact } = await supabase.from('contacts').select('name').eq('id', contactId).single();
        
        for (let attempt = 0; attempt <= CONFIG.AI_MAX_RETRIES; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.AI_TIMEOUT_MS);
            
            const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat-response`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
              body: JSON.stringify({ tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId, inbound_message: messageBody, contact_name: contact?.name }),
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            const aiResult = await aiResponse.json();
            console.log('🤖 AI response:', aiResult.action);
            
            if ((aiResult.action === 'respond' || aiResult.action === 'escalate') && (aiResult.response || aiResult.message)) {
              const textToSend = aiResult.response || aiResult.message;
              if (aiResult.delay_seconds > 0) await delay(aiResult.delay_seconds * 1000);
              await sendAIResponse(supabase, tenantId, conversationId, businessPhone, customerPhone, textToSend, newMessage.id, aiResult.media_urls);
            }
            break;
          } catch (e) {
            console.warn(`AI attempt ${attempt + 1} failed`);
            if (attempt < CONFIG.AI_MAX_RETRIES) await delay(CONFIG.AI_RETRY_DELAY_MS * Math.pow(2, attempt));
          }
        }
      } catch (aiError) {
        console.error('❌ AI error:', aiError);
      }
    }

    // Trigger AI pipeline stage analysis (fire-and-forget, non-blocking)
    try {
      fetch(`${supabaseUrl}/functions/v1/ai-suggest-pipeline-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ tenant_id: tenantId, conversation_id: conversationId, contact_id: contactId }),
      }).catch(e => console.warn('Pipeline suggestion fire-and-forget error:', e));
    } catch (e) {
      console.warn('Pipeline suggestion trigger error:', e);
    }

    // Trigger AI lead scoring (fire-and-forget, non-blocking)
    try {
      fetch(`${supabaseUrl}/functions/v1/ai-lead-scoring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ tenant_id: tenantId, contact_id: contactId }),
      }).catch(e => console.warn('Lead scoring fire-and-forget error:', e));
    } catch (e) {
      console.warn('Lead scoring trigger error:', e);
    }

    console.log(`✅ Webhook completed in ${Date.now() - startTime}ms`);
    return emptyTwiml();

  } catch (error) {
    console.error('❌ Error:', error);
    return emptyTwiml();
  }
});

function emptyTwiml() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/xml' } });
}

// Convert Supabase Storage URLs to Twilio-compatible format (JPEG)
// WebP is not reliably supported by Twilio WhatsApp outbound
function toTwilioCompatibleUrl(url: string): string {
  // Only transform Supabase Storage public URLs with webp extension
  if (url.includes('/storage/v1/object/public/') && url.toLowerCase().endsWith('.webp')) {
    // Use Supabase image render/transform endpoint to serve as JPEG
    return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + '?format=origin';
  }
  return url;
}

// Helper function to send AI-generated response via Twilio
// deno-lint-ignore no-explicit-any
async function sendAIResponse(
  supabase: any,
  tenantId: string,
  conversationId: string,
  fromNumber: string,
  toNumber: string,
  message: string,
  inboundMessageId: string,
  mediaUrls?: string[]
): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  try {
    // Get Twilio credentials
    const { data: integration, error: intError } = await supabase
      .from('tenant_integrations')
      .select('account_sid, auth_token_encrypted')
      .eq('tenant_id', tenantId)
      .eq('provider', 'twilio')
      .eq('status', 'connected')
      .maybeSingle();

    if (intError || !integration) {
      return { success: false, error: 'No Twilio integration found' };
    }

    const accountSid = integration.account_sid;
    // Tokens are stored base64-encoded in auth_token_encrypted
    const authToken = integration.auth_token_encrypted ? atob(integration.auth_token_encrypted) : null;

    if (!accountSid || !authToken) {
      return { success: false, error: 'Missing Twilio credentials' };
    }

    // Insert message first to get ID for idempotency
    const { data: aiMessage, error: msgError } = await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'outbound',
      channel: 'whatsapp',
      provider: 'twilio',
      from_number: fromNumber,
      to_number: toNumber,
      body: message,
      media_urls: mediaUrls?.length ? mediaUrls : [],
      media_type: mediaUrls?.length ? 'image' : null,
      status: 'queued',
      ai_generated: true,
      source: 'ai',
    }).select('id').single();

    if (msgError || !aiMessage) {
      return { success: false, error: 'Failed to create message' };
    }

    // Debit using centralized function with idempotency
    const idempotencyKey = `ai_reply:${aiMessage.id}`;
    const { data: creditResult, error: creditError } = await supabase.rpc('fn_apply_credit_movement', {
      p_tenant_id: tenantId,
      p_movement_type: 'debit',
      p_amount: 1,
      p_reason: 'ai_reply',
      p_source_table: 'messages',
      p_source_id: aiMessage.id,
      p_idempotency_key: idempotencyKey
    });

    if (creditError || !creditResult?.[0]?.success) {
      // Delete the queued message
      await supabase.from('messages').delete().eq('id', aiMessage.id);
      return { success: false, error: 'Insufficient credits for AI reply' };
    }

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const authHeader = `Basic ${btoa(`${accountSid}:${authToken}`)}`;
    
    // Send text message first
    const formData = new URLSearchParams();
    formData.append('From', `whatsapp:${fromNumber}`);
    formData.append('To', `whatsapp:${toNumber}`);
    formData.append('Body', message);
    
    // WhatsApp only supports 1 media per message, so we send the first image with the text
    const imagesToSend = (mediaUrls?.slice(0, 10) || []).map(toTwilioCompatibleUrl);
    if (imagesToSend.length > 0) {
      formData.append('MediaUrl', imagesToSend[0]);
    }

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    console.log(`📤 Twilio first message sent. Status: ${twilioResponse.status}, MediaUrls: ${imagesToSend.length > 0 ? imagesToSend[0] : 'none'}`);

    // Send remaining images as separate messages
    if (imagesToSend.length > 1) {
      for (let i = 1; i < imagesToSend.length; i++) {
        try {
          const imgForm = new URLSearchParams();
          imgForm.append('From', `whatsapp:${fromNumber}`);
          imgForm.append('To', `whatsapp:${toNumber}`);
          imgForm.append('MediaUrl', imagesToSend[i]);
          
          const imgResponse = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: imgForm,
          });
          if (!imgResponse.ok) {
            const imgError = await imgResponse.json();
            console.warn(`⚠️ Twilio error sending image ${i + 1}:`, imgError.message || imgError);
          } else {
            console.log(`📸 Image ${i + 1}/${imagesToSend.length} sent`);
          }
          // Small delay between sends to avoid rate limits
          await delay(300);
        } catch (imgErr) {
          console.warn(`⚠️ Failed to send image ${i + 1}:`, imgErr);
        }
      }
    }

    const twilioResult = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error('Twilio error:', twilioResult);
      
      // Revert credit
      const revertKey = `revert:${aiMessage.id}`;
      await supabase.rpc('fn_apply_credit_movement', {
        p_tenant_id: tenantId,
        p_movement_type: 'credit',
        p_amount: 1,
        p_reason: 'revert_ai_send_failed',
        p_source_table: 'messages',
        p_source_id: aiMessage.id,
        p_idempotency_key: revertKey
      });
      
      // Update message as failed
      await supabase.from('messages').update({ status: 'failed', error_message: twilioResult.message }).eq('id', aiMessage.id);
      
      return { success: false, error: twilioResult.message || 'Twilio API error' };
    }

    // Update message with Twilio SID
    await supabase.from('messages').update({
      status: 'sent',
      twilio_message_sid: twilioResult.sid,
    }).eq('id', aiMessage.id);

    // Update conversation
    await supabase
      .from('conversations')
      .update({
        last_agent_message_at: new Date().toISOString(),
        last_message_preview: message.substring(0, 120),
        last_message_direction: 'outbound',
        last_message_source: 'ai',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    console.log(`✅ AI response sent. New balance: ${creditResult[0].new_balance}`);

    return { success: true, messageSid: twilioResult.sid };
  } catch (error) {
    console.error('Error sending AI response:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}