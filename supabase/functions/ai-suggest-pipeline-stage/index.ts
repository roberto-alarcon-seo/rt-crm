import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Stage definitions per pipeline type ──────────────────────────────────────

const CALIFICACION_STAGES = [
  { value: 'new_lead',             label: 'Nuevo lead' },
  { value: 'interest_confirmed',   label: 'Interés confirmado' },
  { value: 'financial_validation', label: 'Validación financiera' },
  { value: 'searching',            label: 'En búsqueda activa' },
  { value: 'visit_scheduled',      label: 'Visita agendada' },
  { value: 'visit_done',           label: 'Visita realizada' },
  { value: 'follow_up',            label: 'Seguimiento' },
  { value: 'negotiation',          label: 'Oferta / Negociación' },
  { value: 'closed_won',           label: 'Cerrado ganado' },
  { value: 'closed_lost',          label: 'Perdido' },
];

const CAPTACION_STAGES = [
  { value: 'captacion_new',       label: 'Nuevo propietario' },
  { value: 'captacion_valuation', label: 'Valuación acordada' },
  { value: 'captacion_signed',    label: 'Exclusiva firmada' },
  { value: 'captacion_listed',    label: 'Publicado' },
  { value: 'captacion_offers',    label: 'Ofertas recibidas' },
  { value: 'captacion_sold',      label: 'Vendido' },
  { value: 'captacion_lost',      label: 'Perdido' },
];

const RENTAS_STAGES = [
  { value: 'renta_nuevo',        label: 'Nuevo lead renta' },
  { value: 'renta_calificacion', label: 'Calificación' },
  { value: 'renta_busqueda',     label: 'En búsqueda' },
  { value: 'renta_visita',       label: 'Visita agendada' },
  { value: 'renta_solicitud',    label: 'Solicitud de renta' },
  { value: 'renta_cerrado',      label: 'Cerrado' },
  { value: 'renta_perdido',      label: 'Perdido' },
];

// ─── Per-pipeline transition hints for the AI ─────────────────────────────────

const CALIFICACION_HINTS = `
- new_lead → interest_confirmed: El cliente hace MÚLTIPLES preguntas sobre precio, ubicación, fotos, crédito. Una sola pregunta NO es suficiente.
- interest_confirmed → financial_validation: El cliente menciona crédito, INFONAVIT, COFINAVIT, banco, enganche, presupuesto.
- financial_validation → searching: El cliente pide ver más opciones, compara propiedades.
- searching → visit_scheduled: El cliente quiere agendar visita, pide fecha/hora.
- visit_scheduled → visit_done: El cliente confirma que ya realizó la visita.
- visit_done → follow_up: El cliente dice que lo piensa, necesita consultarlo.
- follow_up → negotiation: El cliente hace oferta, pregunta por apartado o contrato.
- negotiation → closed_won: El cliente confirma la compra.
- Cualquier etapa → closed_lost: El cliente rechaza o ya compró en otro lado.`;

const CAPTACION_HINTS = `
- captacion_new → captacion_valuation: El propietario acepta hacer avalúo o hablar de precio de lista.
- captacion_valuation → captacion_signed: El propietario acepta las condiciones y quiere firmar la exclusiva.
- captacion_signed → captacion_listed: La propiedad ya está publicada o lista para publicarse.
- captacion_listed → captacion_offers: Llegan interesados o se recibe una oferta formal.
- captacion_offers → captacion_sold: Se acepta una oferta y se concreta la venta.
- Cualquier etapa → captacion_lost: El propietario rechaza, quita la exclusiva o vende por su cuenta.`;

const RENTAS_HINTS = `
- renta_nuevo → renta_calificacion: El arrendatario comparte ingresos, trabajo o referencias para calificar.
- renta_calificacion → renta_busqueda: El cliente califica y se le muestran opciones disponibles.
- renta_busqueda → renta_visita: El cliente quiere ver un inmueble en específico.
- renta_visita → renta_solicitud: El cliente le gustó el inmueble y quiere proceder con la solicitud formal.
- renta_solicitud → renta_cerrado: Se firma el contrato de arrendamiento y se entregan llaves.
- Cualquier etapa → renta_perdido: El cliente desiste, no califica o renta en otro lado.`;

function getPipelineConfig(pipelineType: string) {
  switch (pipelineType) {
    case 'captacion':
      return { stages: CAPTACION_STAGES, hints: CAPTACION_HINTS, label: 'captación (propietario vendiendo su inmueble)' };
    case 'rentas':
      return { stages: RENTAS_STAGES, hints: RENTAS_HINTS, label: 'rentas (arrendatario buscando inmueble para rentar)' };
    default:
      return { stages: CALIFICACION_STAGES, hints: CALIFICACION_HINTS, label: 'compradores (lead buscando inmueble para comprar)' };
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, conversation_id, contact_id } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');

    if (!openrouterKey) {
      return new Response(JSON.stringify({ action: 'skip', reason: 'no_api_key' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch contact — include pipeline_type now
    const { data: contact } = await supabase
      .from('contacts')
      .select('pipeline_stage, pipeline_type, name')
      .eq('id', contact_id)
      .single();

    if (!contact) {
      return new Response(JSON.stringify({ action: 'skip', reason: 'no_contact' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { stages, hints, label } = getPipelineConfig(contact.pipeline_type ?? 'calificacion');

    // Check for existing pending suggestion
    const { data: existingSuggestion } = await supabase
      .from('pipeline_stage_suggestions')
      .select('id, suggested_stage')
      .eq('conversation_id', conversation_id)
      .eq('status', 'pending')
      .maybeSingle();

    // Get recent messages
    const { data: messages } = await supabase
      .from('messages')
      .select('direction, body, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(15);

    if (!messages || messages.length < 2) {
      return new Response(JSON.stringify({ action: 'skip', reason: 'insufficient_messages' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const conversationText = messages
      .reverse()
      .filter((m: any) => m.body)
      .map((m: any) => `${m.direction === 'inbound' ? 'CLIENTE' : 'ASESOR'}: ${m.body}`)
      .join('\n');

    const stagesDescription = stages.map(s => `- ${s.value}: ${s.label}`).join('\n');

    const systemPrompt = `Eres un analista experto en ventas inmobiliarias. Tu tarea es analizar una conversación de WhatsApp entre un asesor y un cliente, y determinar en qué etapa del pipeline se encuentra.

TIPO DE PIPELINE: ${label}

ETAPAS DEL PIPELINE (en orden de avance):
${stagesDescription}

ETAPA ACTUAL: ${contact.pipeline_stage}

REGLAS:
1. Solo sugiere un cambio si hay evidencia CLARA en la conversación de que el cliente avanzó o retrocedió.
2. No sugieras la misma etapa en la que ya está.
3. Sé conservador: es mejor NO sugerir que sugerir algo incorrecto.
4. Analiza principalmente los mensajes del CLIENTE.
5. Responde ÚNICAMENTE con una llamada a la función suggest_stage_change.
6. Si no hay evidencia suficiente, usa should_change: false.

SEÑALES CLAVE:
${hints}`;

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analiza esta conversación y determina si el cliente debería cambiar de etapa:\n\n${conversationText}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'suggest_stage_change',
            description: 'Suggest a pipeline stage change based on conversation analysis',
            parameters: {
              type: 'object',
              properties: {
                should_change: { type: 'boolean', description: 'Whether a stage change is recommended' },
                suggested_stage: {
                  type: 'string',
                  enum: stages.map(s => s.value),
                  description: 'The suggested new pipeline stage',
                },
                confidence: { type: 'number', description: 'Confidence score from 0.0 to 1.0' },
                reasoning: { type: 'string', description: 'Brief explanation in Spanish of why this change is suggested (max 120 chars)' },
              },
              required: ['should_change', 'suggested_stage', 'confidence', 'reasoning'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'suggest_stage_change' } },
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI gateway error:', aiResponse.status);
      return new Response(JSON.stringify({ action: 'error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ action: 'skip', reason: 'no_tool_call' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const suggestion = JSON.parse(toolCall.function.arguments);
    console.log('AI Pipeline Suggestion:', suggestion);

    if (!suggestion.should_change || suggestion.suggested_stage === contact.pipeline_stage || suggestion.confidence < 0.6) {
      if (existingSuggestion) {
        await supabase
          .from('pipeline_stage_suggestions')
          .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
          .eq('id', existingSuggestion.id);
      }
      return new Response(JSON.stringify({ action: 'no_change' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (existingSuggestion?.suggested_stage === suggestion.suggested_stage) {
      return new Response(JSON.stringify({ action: 'already_suggested' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (existingSuggestion) {
      await supabase
        .from('pipeline_stage_suggestions')
        .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
        .eq('id', existingSuggestion.id);
    }

    const { data: newSuggestion, error: insertError } = await supabase
      .from('pipeline_stage_suggestions')
      .insert({
        tenant_id,
        conversation_id,
        contact_id,
        current_stage: contact.pipeline_stage,
        suggested_stage: suggestion.suggested_stage,
        confidence: Math.min(suggestion.confidence, 0.99),
        reasoning: suggestion.reasoning?.substring(0, 200) || 'Análisis de conversación',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting suggestion:', insertError);
      return new Response(JSON.stringify({ action: 'error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ action: 'suggested', suggestion: newSuggestion }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Pipeline suggestion error:', error);
    return new Response(JSON.stringify({ action: 'error', error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
