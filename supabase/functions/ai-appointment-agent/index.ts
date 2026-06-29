import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const REGIONAL_CONTEXT: Record<string, string> = {
  CO: `Vocabulario colombiano: "apartamento", "parqueadero", "arriendo". Trato respetuoso.`,
  MX: `Vocabulario mexicano: "departamento", "estacionamiento", "renta". Amigable con "usted" en contextos formales.`,
  AR: `Vocabulario argentino: "departamento", "cochera", "alquiler". Voseo rioplatense.`,
  CL: `Vocabulario chileno: "departamento", "estacionamiento", "arriendo". Tuteo.`,
  ES: `Vocabulario español: "piso", "aparcamiento", "alquiler". Trato formal.`,
};

function formatDateTime(isoString: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: timezone || 'America/Mexico_City',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

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
  const now = new Date();

  console.log(`📅 Appointment agent triggered at ${now.toISOString()}`);

  try {
    // ── 1. Load all tenants with agent enabled ───────────────────────────────
    const { data: allSettings, error: settingsErr } = await supabase
      .from('tenant_appointment_agent_settings' as any)
      .select('*')
      .eq('enabled', true);

    if (settingsErr) throw settingsErr;
    if (!allSettings?.length) {
      console.log('ℹ️  No tenants with appointment agent enabled');
      return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
    }

    console.log(`📋 ${allSettings.length} tenant(s) with appointment agent enabled`);

    let totalProcessed = 0;

    for (const ts of allSettings as any[]) {
      const tenantId: string = ts.tenant_id;
      const hoursBefore: number = ts.hours_before ?? 24;
      const includeAddress: boolean = ts.include_address ?? true;
      const includeRecommendations: boolean = ts.include_recommendations ?? true;
      const customContext: string = ts.custom_context ?? '';

      // Confirmation window: events starting in [hoursBefore ± 0.5h]
      const windowStart = new Date(now.getTime() + (hoursBefore - 0.5) * 60 * 60 * 1000);
      const windowEnd   = new Date(now.getTime() + (hoursBefore + 0.5) * 60 * 60 * 1000);

      console.log(`📋 Tenant ${tenantId}: window ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

      // ── 2. Find events needing confirmation ──────────────────────────────
      const { data: events, error: eventsErr } = await supabase
        .from('events')
        .select(`
          id, title, event_type, start_at, end_at, timezone, notes, metadata,
          contact:contacts(id, name, phone)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'scheduled')
        .is('confirmation_sent_at', null)
        .gte('start_at', windowStart.toISOString())
        .lte('start_at', windowEnd.toISOString());

      if (eventsErr) {
        console.error(`❌ Error fetching events for tenant ${tenantId}:`, eventsErr);
        continue;
      }
      if (!events?.length) {
        console.log(`ℹ️  No events to confirm for tenant ${tenantId}`);
        continue;
      }

      console.log(`📅 ${events.length} event(s) to confirm for tenant ${tenantId}`);

      // ── 3. Load Twilio integration ───────────────────────────────────────
      const { data: integration } = await supabase
        .from('tenant_integrations')
        .select('account_sid, auth_token_encrypted, phone_number')
        .eq('tenant_id', tenantId)
        .eq('provider', 'twilio')
        .eq('status', 'connected')
        .maybeSingle();

      if (!integration) {
        console.error(`❌ No Twilio integration for tenant ${tenantId}`);
        continue;
      }

      const authToken: string | null = (integration as any).auth_token_encrypted
        ? atob((integration as any).auth_token_encrypted)
        : null;

      if (!authToken) {
        console.error(`❌ No auth token for tenant ${tenantId}`);
        continue;
      }

      // ── 4. Load AI settings ──────────────────────────────────────────────
      const { data: aiSettings } = await supabase
        .from('tenant_ai_settings' as any)
        .select('agent_name, region_code, formality')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const agentName: string   = (aiSettings as any)?.agent_name ?? 'Sofía';
      const regionCode: string  = (aiSettings as any)?.region_code ?? 'MX';
      const formality: string   = (aiSettings as any)?.formality ?? 'tu';
      const regionContext = REGIONAL_CONTEXT[regionCode] ?? REGIONAL_CONTEXT['MX'];
      const formalityNote = formality === 'usted' ? 'Trata de "usted" al cliente.' :
                            formality === 'vos'   ? 'Trata de "vos" al cliente.'   :
                                                    'Trata de "tú" al cliente.';

      // ── 5. Process each event ─────────────────────────────────────────────
      for (const event of events as any[]) {
        try {
          const contact = event.contact;
          if (!contact?.id || !contact?.phone) {
            console.log(`⚠️  Event ${event.id} — no contact with phone, skipping`);
            continue;
          }

          // Find most recent open conversation for this contact
          const { data: conv } = await supabase
            .from('conversations')
            .select('id, customer_whatsapp, twilio_whatsapp_number, last_customer_message_at')
            .eq('tenant_id', tenantId)
            .eq('contact_id', contact.id)
            .eq('status', 'open')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!conv) {
            console.log(`⚠️  No open conversation for contact ${contact.id} (event ${event.id}), skipping`);
            continue;
          }

          // ── Determine send strategy: free-form (24h window) or template ──
          const lastMsgAt = conv.last_customer_message_at
            ? new Date(conv.last_customer_message_at).getTime() : 0;
          const windowOpen = now.getTime() - lastMsgAt <= 24 * 60 * 60 * 1000;

          const customerPhone: string = conv.customer_whatsapp;
          let fromNumber: string = conv.twilio_whatsapp_number || (integration as any).phone_number || '';
          fromNumber = fromNumber.replace(/^whatsapp:/i, '');
          if (!fromNumber.startsWith('+')) fromNumber = '+' + fromNumber;

          if (!customerPhone || !fromNumber) {
            console.log(`⚠️  Missing phones for conv ${conv.id}`);
            continue;
          }

          // Build event context (shared by both paths)
          const formattedDateTime = formatDateTime(event.start_at, event.timezone ?? 'America/Mexico_City');
          const metadata = (event.metadata as Record<string, string>) || {};
          const propertyTitle   = metadata.property_title ?? null;
          const propertyAddress = metadata.property_address ?? null;

          const eventTypeLabels: Record<string, string> = {
            visita_inmueble: 'visita al inmueble',
            llamada_revision_credito: 'llamada de revisión de crédito',
          };
          const eventTypeLabel = eventTypeLabels[event.event_type] ?? event.event_type ?? 'cita';

          // State for both paths
          let confirmationMessage = '';
          let useTemplateSid: string | null = null;
          let useTemplateId: string | null = null;
          let contentVariables: Record<string, string> = {};

          if (windowOpen) {
            // ── PATH A: 24h window open → free-form AI message ─────────────
            console.log(`📅 Event ${event.id}: 24h window open, using free-form AI`);

            if (openrouterKey) {
              const systemPrompt = `Eres ${agentName}, asesora inmobiliaria. Escribe UN mensaje de WhatsApp para recordar y confirmar una cita con el cliente.

CONFIGURACIÓN REGIONAL (${regionCode}):
${regionContext}
FORMALIDAD: ${formalityNote}

DATOS DE LA CITA:
- Tipo: ${eventTypeLabel}
- Fecha y hora: ${formattedDateTime}
${propertyTitle   ? `- Inmueble: ${propertyTitle}` : ''}
${includeAddress && propertyAddress ? `- Dirección: ${propertyAddress}` : ''}
${event.notes ? `- Notas: ${event.notes}` : ''}
${customContext ? `\nCONTEXTO ADICIONAL:\n${customContext}` : ''}

INSTRUCCIONES:
- Saluda al cliente${contact.name ? ` usando su nombre "${contact.name}"` : ''} al inicio.
- Recuérdale la cita: tipo, fecha y hora.
${includeAddress && propertyAddress ? '- Menciona la dirección.' : ''}
${includeRecommendations ? '- Incluye 2 recomendaciones prácticas breves (ej: llegar a tiempo, traer identificación).' : ''}
- Termina preguntando si confirma su asistencia.
- Máximo 5 oraciones. Sin asteriscos ni markdown.
- Escribe SOLO el mensaje.`;

              try {
                const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openrouterKey}`, 'HTTP-Referer': supabaseUrl },
                  body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages: [{ role: 'user', content: systemPrompt }], max_tokens: 300, temperature: 0.6 }),
                });
                if (llmRes.ok) confirmationMessage = (await llmRes.json())?.choices?.[0]?.message?.content?.trim() ?? '';
                else console.error(`❌ LLM error for event ${event.id}:`, await llmRes.text());
              } catch (e) { console.error(`❌ LLM call failed:`, e); }
            }

            if (!confirmationMessage) {
              confirmationMessage = `Hola${contact.name ? ` ${contact.name}` : ''}, te recordamos tu ${eventTypeLabel} programada para el ${formattedDateTime}.${propertyTitle ? ` Inmueble: ${propertyTitle}.` : ''} ¿Confirmas tu asistencia?`;
            }

          } else {
            // ── PATH B: no 24h window → must use WhatsApp template ─────────
            console.log(`📅 Event ${event.id}: no 24h window, using template`);

            const templateIds: string[] = ts.confirmation_template_ids ?? [];
            if (!templateIds.length) {
              console.log(`⚠️  No templates configured for tenant ${tenantId} and no 24h window — skipping event ${event.id}`);
              continue;
            }

            // Load approved templates from configured set
            const { data: candidateTemplates } = await supabase
              .from('templates')
              .select('id, name, body, variables, variable_index_map, twilio_template_sid')
              .eq('tenant_id', tenantId)
              .eq('approval_status', 'approved')
              .not('twilio_template_sid', 'is', null)
              .in('id', templateIds);

            if (!candidateTemplates?.length) {
              console.log(`⚠️  No approved+synced templates for tenant ${tenantId} — skipping event ${event.id}`);
              continue;
            }

            // ── AI picks the most appropriate template ──────────────────────
            let selectedTemplate = candidateTemplates[0] as any;

            if (openrouterKey && candidateTemplates.length > 1) {
              try {
                const templateList = (candidateTemplates as any[])
                  .map((t, i) => `${i + 1}. "${t.name}": ${(t.body as string).substring(0, 120)}`)
                  .join('\n');

                const pickRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openrouterKey}` },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: [{ role: 'user', content: `Eres un selector de plantillas. Tipo de cita: "${eventTypeLabel}". Selecciona la plantilla más adecuada de la lista para confirmar esta cita:

${templateList}

Responde ÚNICAMENTE con el número de la plantilla seleccionada (1, 2, 3...).` }],
                    max_tokens: 5,
                    temperature: 0,
                  }),
                });

                if (pickRes.ok) {
                  const raw = (await pickRes.json())?.choices?.[0]?.message?.content?.trim() ?? '';
                  const idx = parseInt(raw, 10);
                  if (!isNaN(idx) && idx >= 1 && idx <= candidateTemplates.length) {
                    selectedTemplate = candidateTemplates[idx - 1] as any;
                    console.log(`🤖 AI selected template "${selectedTemplate.name}" (#${idx}) for event ${event.id}`);
                  }
                }
              } catch (e) { console.error('❌ Template selection error:', e); }
            }

            // ── Auto-fill template variables from event/contact data ────────
            const varNames: string[] = selectedTemplate.variables ?? [];
            const indexMap: Record<string, number> = (selectedTemplate.variable_index_map as Record<string, number>) ?? {};
            const varValues: Record<string, string> = {};

            for (const varName of varNames) {
              const key = varName.toLowerCase().replace(/[_\s-]/g, '');
              if (['nombre', 'name', 'cliente', 'client'].some(k => key.includes(k))) {
                varValues[varName] = contact.name ?? contact.phone ?? '';
              } else if (['fecha', 'date', 'dia', 'horario', 'cita'].some(k => key.includes(k))) {
                varValues[varName] = formattedDateTime;
              } else if (['propiedad', 'property', 'inmueble', 'titulo'].some(k => key.includes(k))) {
                varValues[varName] = propertyTitle ?? '';
              } else if (['direccion', 'address', 'ubicacion', 'location'].some(k => key.includes(k))) {
                varValues[varName] = propertyAddress ?? '';
              } else if (['asesor', 'agente', 'agent', 'vendedor'].some(k => key.includes(k))) {
                varValues[varName] = agentName;
              } else if (['tipo', 'type'].some(k => key.includes(k))) {
                varValues[varName] = eventTypeLabel;
              } else {
                varValues[varName] = '';
              }
            }

            // Build ContentVariables using index map (same logic as send-template-message)
            const hasIndexMap = Object.keys(indexMap).length > 0;
            if (hasIndexMap) {
              for (const [name, idx] of Object.entries(indexMap)) {
                contentVariables[String(idx)] = varValues[name] ?? '';
              }
            } else {
              varNames.forEach((v, i) => { contentVariables[String(i + 1)] = varValues[v] ?? ''; });
            }

            useTemplateSid = selectedTemplate.twilio_template_sid;
            useTemplateId  = selectedTemplate.id;

            // Build preview body (for last_message_preview + message record)
            confirmationMessage = selectedTemplate.body as string;
            for (const [vn, val] of Object.entries(varValues)) {
              confirmationMessage = confirmationMessage.replace(new RegExp(`\\{\\{${vn}\\}\\}`, 'g'), val);
            }
          }

          // ── Insert message record ───────────────────────────────────────
          const { data: msgRecord, error: msgErr } = await supabase
            .from('messages')
            .insert({
              tenant_id: tenantId,
              conversation_id: conv.id,
              direction: 'outbound',
              channel: 'whatsapp',
              provider: 'twilio',
              from_number: fromNumber,
              to_number: customerPhone,
              body: confirmationMessage,
              media_urls: [],
              status: 'queued',
              ai_generated: windowOpen,
              source: windowOpen ? 'ai' : 'template',
              ...(useTemplateId ? { template_id: useTemplateId } : {}),
            })
            .select('id')
            .single();

          if (msgErr || !msgRecord) {
            console.error(`❌ Failed to insert message for event ${event.id}:`, msgErr);
            continue;
          }

          // ── Debit credit ────────────────────────────────────────────────
          const { data: creditResult } = await supabase.rpc('fn_apply_credit_movement', {
            p_tenant_id: tenantId,
            p_movement_type: 'debit',
            p_amount: 1,
            p_reason: windowOpen ? 'ai_reply' : 'template_message',
            p_source_table: 'messages',
            p_source_id: msgRecord.id,
            p_idempotency_key: `appt-confirm:${event.id}`,
          });

          if (!creditResult?.[0]?.success) {
            await supabase.from('messages').delete().eq('id', msgRecord.id);
            console.warn(`⚠️  Insufficient credits for tenant ${tenantId}, stopping`);
            break;
          }

          // ── Send via Twilio ─────────────────────────────────────────────
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${(integration as any).account_sid}/Messages.json`;
          const twilioAuthHeader = btoa(`${(integration as any).account_sid}:${authToken}`);
          const formData = new URLSearchParams();

          // From / MessagingServiceSid (mutually exclusive)
          if ((integration as any).messaging_service_sid) {
            formData.append('MessagingServiceSid', (integration as any).messaging_service_sid);
          } else {
            formData.append('From', `whatsapp:${fromNumber}`);
          }
          formData.append('To', `whatsapp:${customerPhone}`);

          if (useTemplateSid) {
            // Template path: use ContentSid + ContentVariables
            formData.append('ContentSid', useTemplateSid);
            if (Object.keys(contentVariables).length > 0) {
              formData.append('ContentVariables', JSON.stringify(contentVariables));
            }
          } else {
            // Free-form path
            formData.append('Body', confirmationMessage);
          }

          const twilioRes = await fetch(twilioUrl, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${twilioAuthHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
          });

          const twilioData = await twilioRes.json();
          const msgStatus = twilioRes.ok ? 'sent' : 'failed';

          await supabase.from('messages')
            .update({ status: msgStatus, twilio_message_sid: twilioData.sid ?? null })
            .eq('id', msgRecord.id);

          if (!twilioRes.ok) {
            console.error(`❌ Twilio error for event ${event.id}:`, twilioData);
            continue;
          }

          // ── Update conversation: enter agendamiento mode ────────────────
          await supabase.from('conversations').update({
            agent_mode:           'agendamiento',
            pending_event_id:     event.id,
            last_message_preview: confirmationMessage.substring(0, 120),
            last_message_direction: 'outbound',
            last_message_source:  'ai',
            last_agent_message_at: now.toISOString(),
            updated_at:           now.toISOString(),
          }).eq('id', conv.id);

          // ── Mark event as confirmation sent ─────────────────────────────
          await supabase.from('events').update({
            confirmation_sent_at:          now.toISOString(),
            confirmation_conversation_id:  conv.id,
          }).eq('id', event.id);

          console.log(`✅ Confirmation sent for event ${event.id} → conv ${conv.id}`);
          totalProcessed++;

        } catch (eventError) {
          console.error(`❌ Error processing event ${event.id}:`, eventError);
        }
      }
    }

    console.log(`🎉 Appointment agent done. Processed: ${totalProcessed}`);
    return new Response(JSON.stringify({ processed: totalProcessed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Appointment agent fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
