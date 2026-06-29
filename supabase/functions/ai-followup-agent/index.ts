import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ── Regional vocabulary (same as captación agent) ────────────────────────────

const REGIONAL_CONTEXT: Record<string, string> = {
  CO: `Vocabulario colombiano: usa "apartamento" (no departamento), "parqueadero" (no estacionamiento/cochera), "arriendo" (no renta/alquiler), "conjunto residencial", "estrato", "inmueble". Tuteo casual pero respetuoso.`,
  MX: `Vocabulario mexicano: usa "departamento", "estacionamiento", "renta", "colonia", "fraccionamiento". Trato amigable con "usted" en contextos formales.`,
  AR: `Vocabulario argentino: usa "departamento", "cochera", "alquiler", "barrio", "PH". Voseo: "vos tenés", "¿te interesa?", "¿qué querés?".`,
  CL: `Vocabulario chileno: usa "departamento", "estacionamiento", "arriendo", "condominio". Tuteo: "tú", "¿te interesa?".`,
  ES: `Vocabulario español: usa "piso", "aparcamiento", "alquiler", "urbanización", "comunidad de propietarios". Tratamiento formal con "usted".`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (!openrouterKey) {
    console.error('❌ OPENROUTER_API_KEY not set');
    return new Response(JSON.stringify({ error: 'OpenRouter key not configured' }), { status: 500 });
  }

  const now = new Date();
  const window24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  console.log(`🔔 Follow-up agent triggered at ${now.toISOString()}`);

  try {
    // ── 1. Load all tenants with follow-up enabled ───────────────────────────
    const { data: tenantSettings, error: tsErr } = await supabase
      .from('tenant_followup_settings' as any)
      .select('*')
      .eq('enabled', true);

    if (tsErr) throw tsErr;
    if (!tenantSettings || tenantSettings.length === 0) {
      console.log('ℹ️  No tenants with follow-up enabled');
      return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
    }

    console.log(`📋 ${tenantSettings.length} tenant(s) with follow-up enabled`);

    let totalProcessed = 0;

    for (const ts of tenantSettings as any[]) {
      const tenantId: string = ts.tenant_id;
      const followupStyle: string = ts.followup_style ?? 'warm';
      const customContext: string = ts.custom_context ?? '';
      const afterAttempts: string = ts.after_attempts ?? 'escalate';
      const markAsLost = afterAttempts === 'lost';
      const escalateToHuman = afterAttempts === 'escalate';
      const enableCaptacion: boolean = ts.enable_captacion ?? true;
      const enableVenta: boolean = ts.enable_venta ?? true;

      // Resolve schedule — fall back to legacy delay_minutes/max_followups if new field not set
      const schedule: Array<{ delay_minutes: number }> = Array.isArray(ts.followup_schedule) && ts.followup_schedule.length > 0
        ? ts.followup_schedule
        : Array.from({ length: ts.max_followups ?? 2 }, () => ({ delay_minutes: ts.delay_minutes ?? 30 }));

      const maxFollowups = schedule.length;

      // Use the smallest delay in the schedule as the DB pre-filter (conservative)
      const minDelayMs = Math.min(...schedule.map((s: any) => s.delay_minutes)) * 60 * 1000;
      const cutoff = new Date(now.getTime() - minDelayMs).toISOString();

      // ── 2. Find eligible conversations ─────────────────────────────────────
      const { data: conversations, error: convErr } = await supabase
        .from('conversations')
        .select(`
          id, customer_whatsapp, twilio_whatsapp_number,
          twilio_subaccount_sid, followup_count, last_followup_at,
          last_customer_message_at, ai_state, needs_human,
          contact:contacts(id, name, pipeline_type, pipeline_stage)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
        .eq('ai_state', 'active')
        .eq('needs_human', false)
        .lt('last_customer_message_at', cutoff)
        .gt('last_customer_message_at', window24h);

      if (convErr) {
        console.error(`❌ Error fetching conversations for tenant ${tenantId}:`, convErr);
        continue;
      }

      if (!conversations || conversations.length === 0) {
        console.log(`ℹ️  No eligible conversations for tenant ${tenantId}`);
        continue;
      }

      // Filter per-conversation using the correct step delay and pipeline toggles
      const eligible = (conversations as any[]).filter((c) => {
        // Respect per-pipeline toggles
        const isCaptacion = c.contact?.pipeline_type === 'captacion';
        if (isCaptacion && !enableCaptacion) return false;
        if (!isCaptacion && !enableVenta) return false;

        const step = c.followup_count ?? 0;
        if (step >= maxFollowups) return false; // all steps exhausted

        const stepDelay = (schedule[step]?.delay_minutes ?? 30) * 60 * 1000;

        if (step === 0) {
          // First follow-up: delay relative to last customer message
          const lastMsg = new Date(c.last_customer_message_at).getTime();
          return now.getTime() - lastMsg >= stepDelay;
        } else {
          // Subsequent: delay relative to last follow-up sent
          if (!c.last_followup_at) return false;
          const lastFollowup = new Date(c.last_followup_at).getTime();
          return now.getTime() - lastFollowup >= stepDelay;
        }
      });

      // Conversations that exhausted all steps — apply after-attempts actions
      // (also respect pipeline toggles to avoid marking leads from disabled flows)
      const exhausted = (conversations as any[]).filter((c) => {
        const isCaptacion = c.contact?.pipeline_type === 'captacion';
        if (isCaptacion && !enableCaptacion) return false;
        if (!isCaptacion && !enableVenta) return false;
        const step = c.followup_count ?? 0;
        return step >= maxFollowups;
      });

      for (const conv of exhausted) {
        const convUpdate: Record<string, unknown> = {};
        if (markAsLost) {
          const isCaptacion = conv.contact?.pipeline_type === 'captacion';
          convUpdate.pipeline_stage = isCaptacion ? 'captacion_lost' : 'closed_lost';
          await supabase.from('contacts').update({ pipeline_stage: convUpdate.pipeline_stage }).eq('id', conv.contact?.id);
          console.log(`💀 Marked contact ${conv.contact?.id} as lost (${convUpdate.pipeline_stage})`);
        }
        if (escalateToHuman) {
          await supabase.from('conversations').update({
            needs_human: true, ai_state: 'escalated', ai_pause_reason: 'no_answer',
          }).eq('id', conv.id);
          console.log(`🚨 Escalated conv ${conv.id} to human after all follow-ups exhausted`);
        }
      }

      console.log(`📬 ${eligible.length} conversation(s) eligible for follow-up in tenant ${tenantId}`);

      // ── 3. Load AI settings for regional context ────────────────────────────
      const { data: aiSettings } = await supabase
        .from('tenant_ai_settings' as any)
        .select('region_code, language, formality, agent_name')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const regionCode: string = (aiSettings as any)?.region_code ?? 'MX';
      const language: string = (aiSettings as any)?.language ?? 'es';
      const formality: string = (aiSettings as any)?.formality ?? 'balanced';
      const agentName: string = (aiSettings as any)?.agent_name ?? 'Sofía';
      const regionContext = REGIONAL_CONTEXT[regionCode] ?? REGIONAL_CONTEXT['MX'];

      const formalityNote =
        formality === 'formal' ? 'Usa un tono formal con "usted".' :
        formality === 'casual' ? 'Usa un tono casual y cercano con tuteo.' :
        'Usa un tono equilibrado, amable pero profesional.';

      const styleDescriptions: Record<string, string> = {
        warm:         'cálido y empático, como un amigo que genuinamente quiere ayudar',
        professional: 'profesional y orientado al valor, conciso y claro',
        casual:       'casual y relajado, usando lenguaje cotidiano y sin formalismos',
      };
      const styleNote = styleDescriptions[followupStyle] ?? styleDescriptions.warm;

      // ── 4. Load Twilio integration for this tenant ──────────────────────────
      const { data: integration, error: intErr } = await supabase
        .from('tenant_integrations')
        .select('account_sid, auth_token_encrypted')
        .eq('tenant_id', tenantId)
        .eq('provider', 'twilio')
        .eq('status', 'connected')
        .maybeSingle();

      if (intErr || !integration) {
        console.error(`❌ No Twilio integration for tenant ${tenantId}`);
        continue;
      }

      const accountSid: string = (integration as any).account_sid;
      const authToken: string | null = (integration as any).auth_token_encrypted
        ? atob((integration as any).auth_token_encrypted)
        : null;

      if (!accountSid || !authToken) {
        console.error(`❌ Missing Twilio credentials for tenant ${tenantId}`);
        continue;
      }

      // ── 5. Process each eligible conversation ──────────────────────────────
      for (const conv of eligible) {
        try {
          const convId: string = conv.id;
          const customerPhone: string = conv.customer_whatsapp;
          const businessPhone: string = conv.twilio_whatsapp_number;
          const contactName: string | null = conv.contact?.name ?? null;
          const currentFollowupCount: number = conv.followup_count ?? 0;

          // Load last 12 messages for context
          const { data: messages } = await supabase
            .from('messages')
            .select('direction, body, created_at, source')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: false })
            .limit(12);

          const recentMessages = (messages ?? []).reverse();
          const historyText = recentMessages
            .filter((m: any) => m.body?.trim())
            .map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : agentName}: ${m.body}`)
            .join('\n');

          const followupNumber = currentFollowupCount + 1;
          const isLastAttempt = followupNumber >= maxFollowups;
          const afterAllHint = isLastAttempt && (markAsLost || escalateToHuman)
            ? markAsLost
              ? '- Es el último intento. Si no responde, el lead será marcado como perdido. Ofrece una alternativa concreta antes de cerrar.'
              : '- Es el último intento antes de pasar el caso a un asesor. Ofrece alternativas concretas y deja la puerta abierta.'
            : '';

          // ── Build system prompt ────────────────────────────────────────────
          const systemPrompt = `Eres ${agentName}, asesora inmobiliaria especializada. Tu tarea es escribir UN SOLO mensaje de seguimiento para retomar contacto con un cliente que no ha respondido.

CONFIGURACIÓN REGIONAL (${regionCode}):
${regionContext}

IDIOMA: ${language === 'es' ? 'Español' : language}
FORMALIDAD: ${formalityNote}
ESTILO: Sé ${styleNote}.

HISTORIAL DE LA CONVERSACIÓN:
${historyText || '(Sin historial previo disponible)'}

${customContext ? `CONTEXTO ADICIONAL:\n${customContext}\n` : ''}INSTRUCCIONES CRÍTICAS:
- Escribe SOLO el mensaje de seguimiento, sin encabezados, sin comillas, sin explicaciones.
- Máximo 2 oraciones cortas — que suene a WhatsApp real, no a correo corporativo.
- Referencia algo concreto de la conversación anterior para que se sienta personalizado.
${contactName ? `- Puedes mencionar "${contactName}" al inicio si es natural, pero NO lo uses más de una vez.` : ''}
- NO uses frases genéricas como "¿Sigues interesado?" en solitario — añade contexto y valor.
${afterAllHint}
- Sé breve, humano y genuino.`;

          // ── Call OpenRouter ───────────────────────────────────────────────
          const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openrouterKey}`,
              'HTTP-Referer': supabaseUrl,
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [{ role: 'user', content: systemPrompt }],
              max_tokens: 200,
              temperature: 0.7,
            }),
          });

          if (!llmRes.ok) {
            console.error(`❌ OpenRouter error for conv ${convId}:`, await llmRes.text());
            continue;
          }

          const llmJson = await llmRes.json();
          const followupMessage: string = llmJson.choices?.[0]?.message?.content?.trim();

          if (!followupMessage) {
            console.error(`❌ Empty LLM response for conv ${convId}`);
            continue;
          }

          console.log(`✍️  Follow-up for ${convId}: "${followupMessage.substring(0, 60)}..."`);

          // ── Insert message record ─────────────────────────────────────────
          const { data: msgRecord, error: msgErr } = await supabase
            .from('messages')
            .insert({
              tenant_id: tenantId,
              conversation_id: convId,
              direction: 'outbound',
              channel: 'whatsapp',
              provider: 'twilio',
              from_number: businessPhone,
              to_number: customerPhone,
              body: followupMessage,
              media_urls: [],
              status: 'queued',
              ai_generated: true,
              source: 'ai',
            })
            .select('id')
            .single();

          if (msgErr || !msgRecord) {
            console.error(`❌ Failed to insert message for conv ${convId}:`, msgErr);
            continue;
          }

          // ── Debit credit ──────────────────────────────────────────────────
          const idempotencyKey = `followup:${msgRecord.id}`;
          const { data: creditResult } = await supabase.rpc('fn_apply_credit_movement', {
            p_tenant_id: tenantId,
            p_movement_type: 'debit',
            p_amount: 1,
            p_reason: 'ai_reply',
            p_source_table: 'messages',
            p_source_id: msgRecord.id,
            p_idempotency_key: idempotencyKey,
          });

          if (!creditResult?.[0]?.success) {
            await supabase.from('messages').delete().eq('id', msgRecord.id);
            console.warn(`⚠️  Insufficient credits for tenant ${tenantId}, skipping`);
            break; // Stop processing this tenant if no credits
          }

          // ── Send via Twilio ───────────────────────────────────────────────
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
          const authHeader = `Basic ${btoa(`${accountSid}:${authToken}`)}`;
          const formData = new URLSearchParams();
          formData.append('From', `whatsapp:${businessPhone}`);
          formData.append('To', `whatsapp:${customerPhone}`);
          formData.append('Body', followupMessage);

          const twilioRes = await fetch(twilioUrl, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
          });

          const twilioData = await twilioRes.json();
          const newStatus = twilioRes.ok ? 'sent' : 'failed';
          const twilioSid = twilioData.sid ?? null;

          await supabase
            .from('messages')
            .update({ status: newStatus, twilio_message_sid: twilioSid })
            .eq('id', msgRecord.id);

          if (!twilioRes.ok) {
            console.error(`❌ Twilio send failed for conv ${convId}:`, twilioData);
            continue;
          }

          // ── Update conversation tracking ──────────────────────────────────
          const newFollowupCount = currentFollowupCount + 1;
          const convUpdate: Record<string, unknown> = {
            followup_count: newFollowupCount,
            last_followup_at: now.toISOString(),
            last_message_preview: followupMessage.substring(0, 200),
            last_message_direction: 'outbound',
            last_message_source: 'ai',
            last_agent_message_at: now.toISOString(),
            updated_at: now.toISOString(),
          };

          // After-attempts actions handled separately in the exhausted loop above

          await supabase
            .from('conversations')
            .update(convUpdate)
            .eq('id', convId);

          console.log(`✅ Follow-up ${newFollowupCount}/${maxFollowups} sent for conv ${convId}`);
          totalProcessed++;

        } catch (convError) {
          console.error(`❌ Error processing conversation ${conv.id}:`, convError);
        }
      }
    }

    console.log(`🎉 Follow-up agent done. Processed: ${totalProcessed}`);
    return new Response(JSON.stringify({ processed: totalProcessed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Follow-up agent fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
