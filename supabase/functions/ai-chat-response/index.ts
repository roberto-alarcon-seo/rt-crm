import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration for timeout and retry handling
const CONFIG = {
  AI_API_TIMEOUT_MS: 12000,
  AI_MAX_RETRIES: 2,
  AI_RETRY_DELAY_MS: 500,
  DB_TIMEOUT_MS: 5000,
};

// Helper for timeout wrapper
async function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMsg)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Helper for exponential backoff delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Trigger automatic agent assignment after AI handoff
async function triggerAssignment(
  supabase: any,
  conversationId: string,
  reason: string
) {
  try {
    const { data, error } = await supabase.rpc('fn_assign_conversation', {
      p_conversation_id: conversationId,
      p_force_strategy: null,
      p_force_agent_id: null,
      p_assigned_by: null,
      p_reason: `ai_handoff:${reason}`,
    });
    if (error) console.warn('âš ï¸ assignment error:', error);
    else console.log('ðŸŽ¯ AI handoff assignment:', data?.[0]);
  } catch (e) {
    console.warn('âš ï¸ assignment skipped:', e);
  }
}

interface AISettings {
  enabled: boolean;
  agent_name: string;
  company_name: string | null;
  timezone: string;
  response_delay_seconds: number;
  tone: string;
  use_emojis: boolean;
  max_emojis_per_message: number;
  never_reveal_ai: boolean;
  use_customer_name: boolean;
  escalate_on_frustration: boolean;
  escalate_on_no_answer: boolean;
  escalate_on_human_request: boolean;
  behavior_prompt: string | null;
  fallback_message: string | null;
  region_code?: string;
  language?: string;
  formality?: string;
  max_message_length?: number;
  max_ai_turns_before_handoff?: number;
  business_hours?: any;
  out_of_hours_message?: string | null;
  handoff_triggers?: any;
}

interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
}

// ===== Regional / conversation helpers =====
const REGION_CONTEXT: Record<string, { country: string; currency: string; modismos: string }> = {
  MX: { country: 'MÃ©xico', currency: 'MXN ($)', modismos: 'EspaÃ±ol de MÃ©xico. USA: "departamento", "recÃ¡mara", "alberca", "cochera", "Infonavit/Fovissste", "enganche", "mensualidades", "ahorita", "platicar". EVITA: "piso", "habitaciÃ³n", "vale", "vosotros", "tÃ­o/tÃ­a".' },
  CO: { country: 'Colombia', currency: 'COP ($)', modismos: 'EspaÃ±ol colombiano. USA: "apartamento", "habitaciÃ³n/alcoba", "parqueadero", "subsidio MiCasaYa", "cuota inicial", "arriendo", "chÃ©vere", "con mucho gusto", "le cuento queâ€¦". EVITA: "departamento", "recÃ¡mara", "piso", "vale", "vosotros".' },
  PE: { country: 'PerÃº', currency: 'PEN (S/)', modismos: 'EspaÃ±ol peruano. USA: "departamento", "dormitorio", "cochera", "crÃ©dito Mivivienda/Techo Propio", "inicial", "chÃ©vere", "bacÃ¡n". EVITA: "piso", "vale", "vosotros".' },
  AR: { country: 'Argentina', currency: 'ARS ($)', modismos: 'EspaÃ±ol rioplatense. USA "vos" y conjugaciÃ³n voseante (tenÃ©s, querÃ©s, podÃ©s). USA: "departamento", "ambientes", "expensas", "cochera", "che", "dale". EVITA: "tÃº", "vosotros", "piso".' },
  CL: { country: 'Chile', currency: 'CLP ($)', modismos: 'EspaÃ±ol chileno. USA: "departamento", "dormitorio", "estacionamiento", "UF", "pie", "bacÃ¡n". EVITA: "piso", "recÃ¡mara", "vale", "vosotros".' },
  ES: { country: 'EspaÃ±a', currency: 'EUR (â‚¬)', modismos: 'OBLIGATORIO ESPAÃ‘OL DE ESPAÃ‘A (castellano peninsular). USA SIEMPRE: "piso" (NUNCA "departamento" ni "apartamento"), "habitaciÃ³n" (NUNCA "recÃ¡mara"/"dormitorio" como tÃ©rmino principal), "salÃ³n", "cuarto de baÃ±o/aseo", "plaza de garaje", "trastero", "comunidad de propietarios", "IBI", "arras", "hipoteca", "ascensor". USA expresiones locales: "vale", "venga", "estupendo", "genial", "quÃ© tal", "encantado/a", "un saludo cordial". USA "coger", "ordenador", "mÃ³vil", "coche". PROHIBIDO: "ahorita", "platicar", "departamento", "recÃ¡mara", "carro", "celular", "computadora", "okey", "sale", "chÃ©vere", "parqueadero", "alberca" (di "piscina"), "cochera" (di "garaje"), "enganche" (di "entrada"), "mensualidades" (di "cuota mensual/letra").' },
  US: { country: 'Estados Unidos (hispano)', currency: 'USD ($)', modismos: 'EspaÃ±ol neutro latino, tÃ©rminos bilingÃ¼es si aplica.' },
};

const FORMALITY_TEXT: Record<string, string> = {
  tu: 'Trata al cliente de "tÃº" (informal cercano).',
  usted: 'Trata al cliente de "usted" (formal y respetuoso). Nunca uses "tÃº".',
  vos: 'Trata al cliente de "vos" (informal rioplatense).',
};

const LANGUAGE_TEXT: Record<string, string> = {
  es: 'Responde SIEMPRE en espaÃ±ol.',
  en: 'Responde SIEMPRE en inglÃ©s.',
  pt: 'Responde SIEMPRE en portuguÃ©s.',
};

function stripEmojis(text: string): string {
  return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, '').replace(/\s+/g, ' ').trim();
}

function enforceMaxLength(text: string, maxLen: number): string {
  if (!maxLen || text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.7 ? cut.slice(0, lastSpace) : cut).trim() + 'â€¦';
}

function isWithinBusinessHours(bh: any): { open: boolean; configured: boolean } {
  if (!bh || !bh.enabled) return { open: true, configured: false };
  try {
    const tz = bh.timezone || 'America/Mexico_City';
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    const parts = fmt.formatToParts(now);
    const wd = parts.find(p => p.type === 'weekday')?.value?.toLowerCase().slice(0,3) || '';
    const hh = parts.find(p => p.type === 'hour')?.value || '00';
    const mm = parts.find(p => p.type === 'minute')?.value || '00';
    const dayKey: Record<string,string> = { mon:'mon', tue:'tue', wed:'wed', thu:'thu', fri:'fri', sat:'sat', sun:'sun' };
    const day = bh.days?.[dayKey[wd]];
    if (!day || !day.open || !day.close) return { open: false, configured: true };
    const cur = `${hh}:${mm}`;
    return { open: cur >= day.open && cur <= day.close, configured: true };
  } catch (e) {
    console.warn('business hours check failed', e);
    return { open: true, configured: false };
  }
}

serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      tenant_id, 
      conversation_id, 
      contact_id, 
      inbound_message, 
      contact_name 
    } = await req.json();

    console.log('AI Chat Request:', { tenant_id, conversation_id, inbound_message });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('OPENROUTER_API_KEY');

    if (!lovableApiKey) {
      console.error('âŒ OPENROUTER_API_KEY not configured');
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get AI settings for tenant (or create default if not exists)
    let settings: AISettings | null = null;
    
    try {
      const { data, error: settingsError } = await supabase
        .from('tenant_ai_settings')
        .select('*')
        .eq('tenant_id', tenant_id)
        .single();

      if (settingsError?.code === 'PGRST116' || !data) {
        console.log('No AI settings found, creating default settings with AI enabled');
        const { data: newSettings, error: createError } = await supabase
          .from('tenant_ai_settings')
          .upsert({
            tenant_id,
            enabled: true,
            agent_name: 'Asistente',
            company_name: null,
            timezone: 'America/Mexico_City',
            response_delay_seconds: 2,
            tone: 'professional',
            use_emojis: true,
            max_emojis_per_message: 2,
            never_reveal_ai: true,
            use_customer_name: true,
            escalate_on_frustration: true,
            escalate_on_no_answer: true,
            escalate_on_human_request: true,
          }, { onConflict: 'tenant_id' })
          .select()
          .single();

        if (createError) {
          console.error('Error creating AI settings:', createError);
          // Retry fetching in case another request created it concurrently
          const { data: retryData } = await supabase
            .from('tenant_ai_settings')
            .select('*')
            .eq('tenant_id', tenant_id)
            .single();
          if (retryData) {
            settings = retryData as AISettings;
            console.log('Retrieved AI settings on retry after conflict');
          } else {
            return new Response(JSON.stringify({ 
              action: 'error',
              reason: 'settings_creation_failed' 
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          settings = newSettings as AISettings;
          console.log('Created default AI settings for tenant');
        }
      } else {
        settings = data as AISettings;
      }
    } catch (dbError) {
      console.error('Database error fetching settings:', dbError);
      return new Response(JSON.stringify({ 
        action: 'error',
        reason: 'database_error',
        error: dbError instanceof Error ? dbError.message : 'Unknown DB error'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!settings?.enabled) {
      console.log('AI is disabled for tenant');
      return new Response(JSON.stringify({ 
        action: 'skip',
        reason: 'ai_disabled' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiSettings = settings;

    // ===== Business hours check =====
    const bhCheck = isWithinBusinessHours(aiSettings.business_hours);
    const handoffTriggers = aiSettings.handoff_triggers || {};
    if (bhCheck.configured && !bhCheck.open && handoffTriggers.on_after_hours !== false) {
      console.log('â° Out of business hours, sending OOH message');
      const oohMsg = aiSettings.out_of_hours_message
        || 'Gracias por escribirnos. Te responderemos en cuanto abramos.';
      const customerOoh = aiSettings.use_customer_name && contact_name
        ? `Hola ${contact_name}. ${oohMsg}`
        : oohMsg;
      await supabase.from('conversations').update({
        ai_state: 'paused',
        needs_human: true,
        ai_pause_reason: 'after_hours',
        ai_paused_at: new Date().toISOString(),
      }).eq('id', conversation_id);
      await supabase.from('ai_interaction_logs').insert({
        tenant_id, conversation_id, contact_id, inbound_message,
        was_escalated: true, escalation_reason: 'after_hours',
      });
      return new Response(JSON.stringify({
        action: 'respond',
        response: customerOoh,
        delay_seconds: aiSettings.response_delay_seconds,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check if tenant can send using centralized function
    const { data: canSendResult } = await supabase.rpc('can_send_message', { p_tenant_id: tenant_id });

    if (!canSendResult) {
      console.log('Cannot send - marking needs_human');
      
      // Mark conversation as needs_human due to no balance
      await supabase
        .from('conversations')
        .update({
          ai_enabled: false,  // Force disable AI
          ai_state: 'paused',
          needs_human: true,
          ai_pause_reason: 'no_balance',
          ai_paused_at: new Date().toISOString()
        })
        .eq('id', conversation_id);
      await triggerAssignment(supabase, conversation_id, 'no_balance');

      // Log the interaction
      await supabase.from('ai_interaction_logs').insert({
        tenant_id,
        conversation_id,
        contact_id,
        inbound_message,
        was_escalated: true,
        escalation_reason: 'no_balance',
        wallet_debited: false,
      });

      return new Response(JSON.stringify({ 
        action: 'skip',
        reason: 'no_balance' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get knowledge base entries
    const { data: kbEntries } = await supabase
      .from('ai_knowledge_base')
      .select('id, question, answer, category, collection, entry_type, url, file_name')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true);

    const knowledgeBase = (kbEntries || []) as KnowledgeEntry[];

    // Get active properties with their FAQs as additional knowledge
    const { data: propertiesData } = await supabase
      .from('properties')
      .select('id, title, property_code, zone, price, currency, operation_type, property_type, status, address, description, location_url, metadata, accepted_credits, maintenance_fee, ai_prompt, visit_availability, youtube_url, construction_year, stratum')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true);

    const properties = propertiesData || [];

    // Get FAQs, images and portal IDs for all active properties
    let propertyFaqs: { property_id: string; question: string; answer: string }[] = [];
    let propertyImages: { property_id: string; file_url: string; is_cover: boolean; sort_order: number }[] = [];
    let propertyPortalIds: { property_id: string; portal_id: string; portal_name: string | null }[] = [];
    if (properties.length > 0) {
      const propertyIds = properties.map(p => p.id);
      const [faqResult, imagesResult, portalIdsResult] = await Promise.all([
        supabase
          .from('property_faq')
          .select('property_id, question, answer')
          .in('property_id', propertyIds)
          .order('sort_order', { ascending: true }),
        supabase
          .from('property_images')
          .select('property_id, file_url, is_cover, sort_order')
          .in('property_id', propertyIds)
          .order('sort_order', { ascending: true }),
        supabase
          .from('property_portal_ids')
          .select('property_id, portal_id, portal_name')
          .in('property_id', propertyIds),
      ]);
      propertyFaqs = faqResult.data || [];
      propertyImages = imagesResult.data || [];
      propertyPortalIds = (portalIdsResult.data || []) as typeof propertyPortalIds;
    }

    // Fetch recent conversation history for context
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('direction, body, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(10);

    const conversationHistory = (recentMessages || [])
      .reverse()
      .filter(m => m.body)
      .map(m => ({
        role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
        content: m.body!,
      }));

    // ===== Max AI turns handoff =====
    const maxTurns = aiSettings.max_ai_turns_before_handoff || 8;
    if (handoffTriggers.on_max_turns !== false) {
      const aiTurns = conversationHistory.filter(m => m.role === 'assistant').length;
      if (aiTurns >= maxTurns) {
        console.log(`ðŸ¤ Max AI turns reached (${aiTurns}/${maxTurns}), escalating`);
        await supabase.from('conversations').update({
          ai_enabled: false,
          ai_state: 'escalated',
          needs_human: true,
          ai_pause_reason: 'max_turns',
          ai_paused_at: new Date().toISOString(),
        }).eq('id', conversation_id);
        await triggerAssignment(supabase, conversation_id, 'max_turns');
        await supabase.from('ai_interaction_logs').insert({
          tenant_id, conversation_id, contact_id, inbound_message,
          was_escalated: true, escalation_reason: 'max_turns',
        });
        const fallbackText = aiSettings.fallback_message || 'Enseguida te atiende un asesor.';
        const customerMsg = aiSettings.use_customer_name && contact_name
          ? `Hola ${contact_name}. ${fallbackText}`
          : fallbackText;
        return new Response(JSON.stringify({
          action: 'escalate', reason: 'max_turns', message: customerMsg,
          delay_seconds: aiSettings.response_delay_seconds,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Build properties context for AI
    let propertiesContext = '';
    if (properties.length > 0) {
      const propertyDetails = properties.map(p => {
        const faqs = propertyFaqs.filter(f => f.property_id === p.id);
        const faqText = faqs.length > 0
          ? `\n  Preguntas frecuentes:\n${faqs.map(f => `    P: ${f.question}\n    R: ${f.answer}`).join('\n')}`
          : '';
        const portalIds = propertyPortalIds.filter(pid => pid.property_id === p.id);
        const portalIdsText = portalIds.length > 0
          ? `\n  IDs en portales externos: ${portalIds.map(pid => pid.portal_name ? `${pid.portal_id} (${pid.portal_name})` : pid.portal_id).join(', ')}`
          : '';
        const creditText = p.accepted_credits?.length ? `CrÃ©ditos aceptados: ${p.accepted_credits.join(', ')}` : '';
        const maintenanceText = p.maintenance_fee ? `Mantenimiento: $${p.maintenance_fee.toLocaleString()} ${p.currency}/mes` : '';
        const visitText = p.visit_availability || '';
        const aiPromptText = p.ai_prompt ? `\n  Instrucciones especiales: ${p.ai_prompt}` : '';
        
        // Include image info (max 5)
        const uniqueImages = propertyImages
          .filter(img => img.property_id === p.id)
          .filter((img, idx, arr) => arr.findIndex(i => i.file_url === img.file_url) === idx)
          .slice(0, 10);
        const hasPhotos = uniqueImages.length > 0;
        const photosText = hasPhotos 
          ? `\n  Fotos disponibles: SÃ­ (${uniqueImages.length} fotos). Si el cliente pide fotos, responde con el texto [FOTOS:${p.property_code}] en tu mensaje.`
          : '\n  Fotos disponibles: No';
        
        const meta = (p as any).metadata || {};
        const constructionYear = (p as any).construction_year ?? meta.construction_year ?? null;
        const estrato = (p as any).stratum ?? meta.estrato ?? null;
        const descriptionText = (p as any).description ? `\n  DescripciÃ³n: ${(p as any).description}` : '';
        const locationUrlText = (p as any).location_url ? `\n  UbicaciÃ³n (mapa): ${(p as any).location_url}` : '';
        const constructionYearText = constructionYear ? `\n  AÃ±o de construcciÃ³n: ${constructionYear}` : '';
        const estratoText = estrato !== null && estrato !== undefined ? `\n  Estrato: ${estrato}` : '';

        return `- ${p.title} (CÃ³digo: ${p.property_code})
   Zona: ${p.zone} | Precio: $${p.price.toLocaleString()} ${p.currency} | Tipo: ${p.operation_type}
   Tipo de propiedad: ${p.property_type || 'No especificado'} | Estatus: ${p.status}
   ${p.address ? `DirecciÃ³n: ${p.address}` : ''}${descriptionText}${locationUrlText}${constructionYearText}${estratoText}
   ${creditText}${maintenanceText ? ` | ${maintenanceText}` : ''}
   ${visitText ? `Disponibilidad de visitas: ${visitText}` : ''}
   ${p.youtube_url ? `Video de YouTube disponible: SÃ­ â€” Enlace: ${p.youtube_url}` : 'Video de YouTube disponible: No'}${portalIdsText}${aiPromptText}${photosText}${faqText}`;
      }).join('\n\n');

      propertiesContext = `\nPROPIEDADES DISPONIBLES:\n${propertyDetails}`;
    }

    // Check for escalation triggers first
    const lowerMessage = inbound_message.toLowerCase();
    const humanRequestTriggers = [
      'hablar con persona', 'agente humano', 'representante', 
      'persona real', 'no quiero bot', 'quiero hablar con alguien',
      'asesor', 'ejecutivo'
    ];
    const frustrationTriggers = [
      'esto no sirve', 'no me ayudas', 'eres inutil', 'eres inÃºtil', 'incompetente',
      'urgente', 'es una emergencia', 'llevo horas', 'llevo dÃ­as', 'llevo dias',
      'estoy enojado', 'estoy enojada', 'estoy molesto', 'estoy molesta',
      'estoy harto', 'estoy harta', 'estoy furioso', 'estoy furiosa',
      'estoy cabreado', 'estoy cabreada', 'quÃ© frustrante', 'que frustrante',
      'me tienen harto', 'me tienen harta', 'esto es ridÃ­culo', 'esto es ridiculo',
      'pÃ©simo servicio', 'pesimo servicio', 'mal servicio', 'una vergÃ¼enza', 'una verguenza',
      'no me sirve', 'estoy frustrado', 'estoy frustrada', 'no entiendes nada',
      'coÃ±o', 'joder', 'mierda', 'estafa', 'estafadores'
    ];
    const humanRequestExtras = [
      'hablar con humano', 'hablar con un humano', 'una persona', 'con una persona',
      'eres una maquina', 'eres una mÃ¡quina', 'eres un bot', 'eres robot',
      'quiero un humano', 'pasame con', 'pÃ¡same con', 'comunicame con', 'comunÃ­came con',
      'me atienda alguien', 'que me atienda', 'alguien que me atienda'
    ];
    humanRequestTriggers.push(...humanRequestExtras);

    // Check if customer wants human
    if (aiSettings.escalate_on_human_request) {
      const wantsHuman = humanRequestTriggers.some(t => lowerMessage.includes(t));
      if (wantsHuman) {
        console.log('Customer requested human, escalating');
        
        await supabase
          .from('conversations')
          .update({
            ai_enabled: false,
            ai_state: 'escalated',
            needs_human: true,
            ai_pause_reason: 'human_request',
            ai_paused_at: new Date().toISOString()
          })
          .eq('id', conversation_id);
      await triggerAssignment(supabase, conversation_id, 'human_request');

        await supabase.from('ai_interaction_logs').insert({
          tenant_id,
          conversation_id,
          contact_id,
          inbound_message,
          was_escalated: true,
          escalation_reason: 'human_request',
        });

        const fallbackText = aiSettings.fallback_message || 'Enseguida te atiende un asesor.';
        const customerMessage = aiSettings.use_customer_name && contact_name
          ? `Hola ${contact_name}. ${fallbackText}`
          : fallbackText;

        return new Response(JSON.stringify({
          action: 'escalate',
          reason: 'human_request',
          message: customerMessage,
          delay_seconds: aiSettings.response_delay_seconds,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Check for frustration
    if (aiSettings.escalate_on_frustration) {
      const isFrustrated = frustrationTriggers.some(t => lowerMessage.includes(t));
      if (isFrustrated) {
        console.log('Frustration detected, escalating');
        
        await supabase
          .from('conversations')
          .update({
            ai_enabled: false,
            ai_state: 'escalated',
            needs_human: true,
            ai_pause_reason: 'frustration',
            ai_paused_at: new Date().toISOString()
          })
          .eq('id', conversation_id);
      await triggerAssignment(supabase, conversation_id, 'frustration');

        await supabase.from('ai_interaction_logs').insert({
          tenant_id,
          conversation_id,
          contact_id,
          inbound_message,
          was_escalated: true,
          escalation_reason: 'frustration_detected',
        });

        const fallbackText = aiSettings.fallback_message || 'Enseguida te atiende un asesor.';
        const customerMessage = aiSettings.use_customer_name && contact_name
          ? `Hola ${contact_name}. ${fallbackText}`
          : fallbackText;

        return new Response(JSON.stringify({
          action: 'escalate',
          reason: 'frustration',
          message: customerMessage,
          delay_seconds: aiSettings.response_delay_seconds,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // on_schedule_visit pre-AI check (conditional on handoff settings)
    if (handoffTriggers.on_schedule_visit !== false) {
    const visitTriggers = [
      'agendar visita', 'agendar cita', 'agendar una visita', 'agendar una cita',
      'quiero visitar', 'quiero ver el', 'quiero ver la', 'quiero conocer el', 'quiero conocer la',
      'puedo ir a ver', 'puedo visitarla', 'puedo visitarlo', 'puedo verla', 'puedo verlo',
      'ir a verla', 'ir a verlo', 'ir a conocer',
      'espacio para ver', 'espacio para visitar',
      'visitar el inmueble', 'visitar la propiedad', 'visitar la casa', 'visitar el depa',
      'ver el inmueble', 'ver la propiedad', 'ver la casa', 'ver el departamento',
      'conocer el inmueble', 'conocer la propiedad', 'conocer la casa',
      'tendrias espacio', 'tendrÃ­as espacio', 'tendrian espacio', 'tendrÃ­an espacio',
      'tienen espacio', 'tienen disponibilidad',
      'cuando puedo ir', 'cuÃ¡ndo puedo ir', 'cuando puedo pasar', 'cuÃ¡ndo puedo pasar',
      'me gustaria visitarla', 'me gustarÃ­a visitarla', 'me gustaria verla', 'me gustarÃ­a verla',
      'horario para visita', 'horario para ver',
      'dia para visitar', 'dÃ­a para visitar', 'dia para ver', 'dÃ­a para ver',
      'podemos agendar', 'podrÃ­amos agendar', 'podriamos agendar',
      'hacer una cita', 'programar una visita', 'programar visita',
      'quiero ir a ver', 'quisiera visitar', 'quisiera ver',
    ];
    const wantsVisit = visitTriggers.some(t => lowerMessage.includes(t));
    if (wantsVisit) {
      console.log('ðŸ  Visit request detected pre-AI, escalating immediately');
      
      await supabase
        .from('conversations')
        .update({
          ai_enabled: false,
          ai_state: 'escalated',
          needs_human: true,
          ai_pause_reason: 'visit_request',
          ai_paused_at: new Date().toISOString()
        })
        .eq('id', conversation_id);
      await triggerAssignment(supabase, conversation_id, 'visit_request');

      await supabase.from('ai_interaction_logs').insert({
        tenant_id,
        conversation_id,
        contact_id,
        inbound_message,
        was_escalated: true,
        escalation_reason: 'visit_request',
        wallet_debited: false,
      });

      const visitMessage = aiSettings.use_customer_name && contact_name
        ? `Â¡Con gusto, ${contact_name}! Un asesor se pondrÃ¡ en contacto contigo en breve para coordinar tu visita. ðŸ `
        : 'Â¡Con gusto! Un asesor se pondrÃ¡ en contacto contigo en breve para coordinar tu visita. ðŸ ';

      return new Response(JSON.stringify({
        action: 'escalate',
        reason: 'visit_request',
        message: visitMessage,
        delay_seconds: aiSettings.response_delay_seconds,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    } // end on_schedule_visit check

    // on_price_negotiation pre-AI check
    if (handoffTriggers.on_price_negotiation) {
      const priceNegotiationTriggers = [
        'descuento', 'rebaja', 'negociar precio', 'negociable', 'mejor precio',
        'mas barato', 'bajar el precio', 'reducir el precio',
      ];
      const wantsPriceNeg = priceNegotiationTriggers.some(t => lowerMessage.includes(t));
      if (wantsPriceNeg) {
        console.log('Price negotiation detected pre-AI, escalating');
        await supabase.from('conversations').update({
          ai_enabled: false,
          ai_state: 'escalated',
          needs_human: true,
          ai_pause_reason: 'price_negotiation',
          ai_paused_at: new Date().toISOString(),
        }).eq('id', conversation_id);
        await triggerAssignment(supabase, conversation_id, 'price_negotiation');
        await supabase.from('ai_interaction_logs').insert({
          tenant_id, conversation_id, contact_id, inbound_message,
          was_escalated: true, escalation_reason: 'price_negotiation', wallet_debited: false,
        });
        const fallbackText = aiSettings.fallback_message || 'Enseguida te atiende un asesor.';
        const customerMsg = aiSettings.use_customer_name && contact_name
          ? `Hola ${contact_name}. ${fallbackText}` : fallbackText;
        return new Response(JSON.stringify({
          action: 'escalate', reason: 'price_negotiation', message: customerMsg,
          delay_seconds: aiSettings.response_delay_seconds,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // on_legal_question pre-AI check
    if (handoffTriggers.on_legal_question) {
      const legalTriggers = [
        'escritura', 'notario', 'notaria', 'impuestos', 'fiscal',
        'simulacion de credito', 'tramite legal',
      ];
      const hasLegalQuestion = legalTriggers.some(t => lowerMessage.includes(t));
      if (hasLegalQuestion) {
        console.log('Legal question detected pre-AI, escalating');
        await supabase.from('conversations').update({
          ai_enabled: false,
          ai_state: 'escalated',
          needs_human: true,
          ai_pause_reason: 'legal_question',
          ai_paused_at: new Date().toISOString(),
        }).eq('id', conversation_id);
        await triggerAssignment(supabase, conversation_id, 'legal_question');
        await supabase.from('ai_interaction_logs').insert({
          tenant_id, conversation_id, contact_id, inbound_message,
          was_escalated: true, escalation_reason: 'legal_question', wallet_debited: false,
        });
        const fallbackText = aiSettings.fallback_message || 'Enseguida te atiende un asesor.';
        const customerMsg = aiSettings.use_customer_name && contact_name
          ? `Hola ${contact_name}. ${fallbackText}` : fallbackText;
        return new Response(JSON.stringify({
          action: 'escalate', reason: 'legal_question', message: customerMsg,
          delay_seconds: aiSettings.response_delay_seconds,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Build the AI prompt
    const toneInstructions = {
      cordial: 'SÃ© amable y respetuoso en todo momento.',
      professional: 'MantÃ©n un tono profesional y directo.',
      friendly: 'SÃ© casual y cercano, como si hablaras con un amigo.',
      adaptive: 'Adapta tu tono al estilo del cliente.',
    };

    const emojiInstruction = aiSettings.use_emojis 
      ? `Puedes usar hasta ${aiSettings.max_emojis_per_message} emoji(s) por mensaje. NUNCA superes ese lÃ­mite.`
      : 'PROHIBIDO usar emojis. No incluyas ningÃºn emoji en tu respuesta bajo ninguna circunstancia.';

    const nameInstruction = aiSettings.use_customer_name && contact_name
      ? `El nombre del cliente es ${contact_name}. Úsalo MÁXIMO una vez por conversación (al inicio o cuando sea muy natural). NO lo repitas en cada mensaje — en una conversación real nadie dice el nombre de su interlocutor constantemente.`
      : '';

    const identityInstruction = aiSettings.never_reveal_ai
      ? 'NUNCA reveles que eres una IA o asistente virtual. Siempre actÃºa como un asistente humano.'
      : '';

    const knowledgeContext = knowledgeBase.length > 0
      ? `BASE DE CONOCIMIENTO GENERAL:\n${knowledgeBase.map((e: { question: string; answer: string; category: string; collection?: string; entry_type?: string; url?: string; file_name?: string }) => {
          const prefix = `[${(e as { collection?: string }).collection || e.category}]`;
          switch ((e as { entry_type?: string }).entry_type) {
            case 'info': return `${prefix} INFO: ${e.question ? e.question + '\n' : ''}${e.answer}`;
            case 'url': return `${prefix} RECURSO: ${e.question}\nURL: ${(e as { url?: string }).url || ''}\n${e.answer || ''}`;
            case 'file': return `${prefix} DOCUMENTO: ${e.question}${(e as { file_name?: string }).file_name ? ' (' + (e as { file_name?: string }).file_name + ')' : ''}\n${e.answer}`;
            default: return `${prefix} P: ${e.question}\nR: ${e.answer}`;
          }
        }).join('\n\n')}`
      : '';

    const behaviorInstruction = aiSettings.behavior_prompt
      ? `\nCOMPORTAMIENTO DEL NEGOCIO:\n${aiSettings.behavior_prompt}`
      : '';

    // Compute current date/time using explicit UTC offsets — avoids Intl/ICU runtime bugs
    const _tz = aiSettings.timezone || 'America/Mexico_City';
    const _UTC_OFFSETS: Record<string, number> = {
      'America/Bogota':                   -5,
      'America/Lima':                     -5,
      'America/Guayaquil':                -5,
      'America/Panama':                   -5,
      'America/Mexico_City':              -6,
      'America/Guatemala':                -6,
      'America/El_Salvador':              -6,
      'America/Tegucigalpa':              -6,
      'America/Managua':                  -6,
      'America/Costa_Rica':               -6,
      'America/Argentina/Buenos_Aires':   -3,
      'America/Santiago':                 -4,
      'America/Caracas':                  -4,
      'America/Asuncion':                 -4,
      'America/La_Paz':                   -4,
      'America/New_York':                 -4,
      'Europe/Madrid':                     2,
    };
    const _offsetH = _UTC_OFFSETS[_tz] ?? -6;
    const _nowUTC = new Date();
    const _local = new Date(_nowUTC.getTime() + _offsetH * 3600000);
    const _days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const _months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const _h = _local.getUTCHours();
    const _m = _local.getUTCMinutes();
    const _ampm = _h >= 12 ? 'p.m.' : 'a.m.';
    const _h12 = _h % 12 || 12;
    const nowLocal = `${_days[_local.getUTCDay()]}, ${_local.getUTCDate()} de ${_months[_local.getUTCMonth()]} de ${_local.getUTCFullYear()}, ${_h12}:${String(_m).padStart(2,'0')} ${_ampm} (${_tz}, UTC${_offsetH >= 0 ? '+' : ''}${_offsetH})`;
    console.log(`[TIME_DEBUG] utc=${_nowUTC.toISOString()} tz=${_tz} offset=${_offsetH} local=${nowLocal}`);

    // Regional context block
    const regionInfo = REGION_CONTEXT[(aiSettings.region_code || 'MX').toUpperCase()] || REGION_CONTEXT.MX;
    const formalityInstr = FORMALITY_TEXT[aiSettings.formality || 'tu'] || FORMALITY_TEXT.tu;
    const languageInstr = LANGUAGE_TEXT[aiSettings.language || 'es'] || LANGUAGE_TEXT.es;
    const maxLen = aiSettings.max_message_length || 320;
    const regionalBlock = `\nCONTEXTO REGIONAL (OBLIGATORIO):
- PaÃ­s del cliente: ${regionInfo.country}
- Moneda local: ${regionInfo.currency}
- ${regionInfo.modismos}
- ${formalityInstr}
- ${languageInstr}
- LONGITUD MÃXIMA: cada mensaje debe tener mÃ¡ximo ${maxLen} caracteres. SÃ© breve, claro y directo.`;

    // Build dynamic handoff rules based on tenant settings
    const handoffRulesList: string[] = [];
    if (handoffTriggers.on_schedule_visit !== false) {
      handoffRulesList.push(
        '**VISITA SOLICITADA**: Si el cliente indica que quiere visitar una propiedad, agendar una cita o ver un inmueble:\n' +
        '   - Confirma la propiedad de interes.\n' +
        '   - Dile: "En breve un asesor se pondra en contacto contigo para coordinar tu visita."\n' +
        '   - Incluye [SEGUIMIENTO_HUMANO] al final.'
      );
    }
    handoffRulesList.push(
      '**INFORMACION DE CREDITO/FINANCIERA RECOPILADA**: Si el cliente ha compartido datos de su situacion crediticia (tipo de credito, presupuesto, enganche, ingresos) o necesita evaluacion personalizada:\n' +
      '   - Agradece la informacion.\n' +
      '   - Dile: "Con esta informacion, un asesor especializado se pondra en contacto contigo."\n' +
      '   - Incluye [SEGUIMIENTO_HUMANO] al final.'
    );
    if (handoffTriggers.on_price_negotiation) {
      handoffRulesList.push(
        '**NEGOCIACION DE PRECIO**: Si el cliente quiere negociar precio, descuentos o condiciones especiales:\n' +
        '   - Dile: "Ese tema lo maneja nuestro equipo comercial. Un asesor se pondra en contacto contigo en breve."\n' +
        '   - Incluye [SEGUIMIENTO_HUMANO] al final.'
      );
    }
    if (handoffTriggers.on_legal_question) {
      handoffRulesList.push(
        '**PREGUNTA LEGAL O FISCAL**: Si el cliente pregunta sobre escrituras, notario, impuestos, simulacion de credito o tramites legales:\n' +
        '   - Dile: "Esa consulta la atendera uno de nuestros especialistas. Un asesor se pondra en contacto contigo."\n' +
        '   - Incluye [SEGUIMIENTO_HUMANO] al final.'
      );
    }
    const handoffRulesBlock = handoffRulesList.length
      ? '\nREGLAS DE HANDOFF A ASESOR HUMANO:\nCuando se cumpla CUALQUIERA de estas condiciones, DEBES incluir el marcador [SEGUIMIENTO_HUMANO] al final de tu respuesta:\n\n' +
        handoffRulesList.map((r, i) => `${i + 1}. ${r}`).join('\n\n') +
        '\n\nIMPORTANTE: Los marcadores [SEGUIMIENTO_HUMANO], [FOTOS:...] y [PROPIEDAD_INTERES:...] NO deben ser visibles para el cliente. Solo incluyelos al final de tu mensaje como instrucciones internas.'
      : '';

    const systemPrompt = `Eres ${aiSettings.agent_name}, asistente de ${aiSettings.company_name || 'la empresa'}.
${regionalBlock}

FECHA Y HORA ACTUAL (dato en tiempo real — úsalo si el cliente pregunta la hora o fecha):
${nowLocal}

REGLA CRÃTICA: NUNCA inventes, supongas o alucines informaciÃ³n que no estÃ© EXACTAMENTE en los datos proporcionados abajo. Si un dato no aparece explÃ­citamente (como metros cuadrados, nÃºmero de recÃ¡maras, precio, amenidades), NO lo menciones. Solo comparte la informaciÃ³n que aparece textualmente en este prompt.

INSTRUCCIONES:
- ${toneInstructions[aiSettings.tone as keyof typeof toneInstructions] || toneInstructions.professional}
- ${emojiInstruction}
- ${nameInstruction}
- ${identityInstruction}
- Responde ÃšNICAMENTE con informaciÃ³n que aparezca textualmente en la BASE DE CONOCIMIENTO o en las PROPIEDADES DISPONIBLES de este prompt.
- Si el cliente pregunta por una propiedad, busca en PROPIEDADES DISPONIBLES. Si la propiedad tiene un campo "Instrucciones especiales" o "ai_prompt", usa ESA informaciÃ³n como la descripciÃ³n principal de la propiedad.
- NUNCA inventes caracterÃ­sticas, precios, medidas o amenidades que no estÃ©n en los datos.
- Si no encuentras la respuesta exacta en los datos proporcionados, responde con la frase exacta: "[ESCALAR]"
- FOTOS DE PROPIEDADES: Si el cliente pide fotos/imÃ¡genes de una propiedad y la propiedad tiene "Fotos disponibles: SÃ­", incluye el marcador [FOTOS:CÃ“DIGO_PROPIEDAD] en tu respuesta (ejemplo: [FOTOS:RVTMYA-EMX-0001]). Si NO tiene fotos, indica que por el momento no tienes fotos disponibles pero puedes agendar una visita. NUNCA incluyas el marcador [FOTOS:...] si la propiedad no tiene fotos.
- VIDEOS DE PROPIEDADES: Si el cliente pregunta por videos de una propiedad y la propiedad tiene un campo "Video" con un enlace de YouTube, DEBES compartir ese enlace al cliente. Ejemplo: "Â¡Claro! AquÃ­ tienes el video de la propiedad: [URL del video]". Si NO tiene video, indica que por el momento no cuentas con video pero ofrece enviar fotos (si las tiene) o agendar una visita.
- DETECCIÃ“N DE PROPIEDAD DE INTERÃ‰S (OBLIGATORIO): SIEMPRE que tu respuesta mencione, describa o proporcione informaciÃ³n sobre una propiedad especÃ­fica, DEBES incluir el marcador [PROPIEDAD_INTERES:CÃ“DIGO_PROPIEDAD] al final de tu mensaje. Esto es OBLIGATORIO sin excepciÃ³n. Ejemplos de cuÃ¡ndo incluirlo: el cliente pregunta por una propiedad, tÃº describes una propiedad, envÃ­as fotos de una propiedad, compartes precio/ubicaciÃ³n de una propiedad. Si mencionas varias propiedades, usa el cÃ³digo de la propiedad principal de la conversaciÃ³n.
- MantÃ©n las respuestas concisas y Ãºtiles.
${handoffRulesBlock}
${behaviorInstruction}

${knowledgeContext}
${propertiesContext}`;

    // Call Lovable AI with retry logic
    let generatedText = '';
    let aiCallSuccess = false;
    
    for (let attempt = 0; attempt <= CONFIG.AI_MAX_RETRIES; attempt++) {
      try {
        console.log(`ðŸ¤– AI API call attempt ${attempt + 1}...`);
        
        const aiResponse = await withTimeout(
          fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
                { role: 'user', content: inbound_message }
              ],
            }),
          }),
          CONFIG.AI_API_TIMEOUT_MS,
          'AI API request timed out'
        );

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`AI Gateway error (attempt ${attempt + 1}):`, aiResponse.status, errorText);
          
          if (aiResponse.status === 429) {
            // Rate limit - wait longer before retry
            if (attempt < CONFIG.AI_MAX_RETRIES) {
              await delay(CONFIG.AI_RETRY_DELAY_MS * 4);
              continue;
            }
            
            return new Response(JSON.stringify({ 
              action: 'error',
              error: 'rate_limit',
              message: 'LÃ­mite de solicitudes excedido' 
            }), {
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          
          throw new Error(`AI Gateway error: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        generatedText = aiData.choices?.[0]?.message?.content || '';
        aiCallSuccess = true;
        console.log('âœ… AI Response received:', generatedText.substring(0, 100) + '...');
        break;
        
      } catch (aiError) {
        console.warn(`âš ï¸ AI call attempt ${attempt + 1} failed:`, aiError);
        
        if (attempt < CONFIG.AI_MAX_RETRIES) {
          const backoff = CONFIG.AI_RETRY_DELAY_MS * Math.pow(2, attempt);
          console.log(`â³ Retrying AI call in ${backoff}ms...`);
          await delay(backoff);
        }
      }
    }

    // If AI call failed after retries
    if (!aiCallSuccess) {
      console.error('âŒ AI call failed after all retries');
      
      // Mark as error and needs_human
      await supabase
        .from('conversations')
        .update({
          ai_enabled: false,
          ai_state: 'paused',
          needs_human: true,
          ai_pause_reason: 'error',
          ai_paused_at: new Date().toISOString()
        })
        .eq('id', conversation_id);
      await triggerAssignment(supabase, conversation_id, 'ai_error');

      await supabase.from('ai_interaction_logs').insert({
        tenant_id,
        conversation_id,
        contact_id,
        inbound_message,
        was_escalated: true,
        escalation_reason: 'ai_api_error',
        wallet_debited: false,
      });

      return new Response(JSON.stringify({ 
        action: 'error',
        error: 'AI API failed after retries'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const responseTime = Date.now() - startTime;
    console.log(`AI processing completed in ${responseTime}ms`);

    // Check if AI indicated it couldn't find an answer
    if (generatedText.includes('[ESCALAR]') && aiSettings.escalate_on_no_answer) {
      console.log('AI could not find answer, escalating');
      
      // Update conversation state for handoff
      await supabase
        .from('conversations')
        .update({
          ai_enabled: false,
          ai_state: 'escalated',
          needs_human: true,
          ai_pause_reason: 'no_answer',
          ai_paused_at: new Date().toISOString()
        })
        .eq('id', conversation_id);
      await triggerAssignment(supabase, conversation_id, 'no_answer');

      await supabase.from('ai_interaction_logs').insert({
        tenant_id,
        conversation_id,
        contact_id,
        inbound_message,
        ai_response: generatedText,
        was_escalated: true,
        escalation_reason: 'no_knowledge_match',
        response_time_ms: responseTime,
      });

      // Return an escalation signal BUT with a user-facing message from settings
      const fallbackText = aiSettings.fallback_message || 'Enseguida te atiende un asesor.';
      const customerMessage = aiSettings.use_customer_name && contact_name
        ? `Hola ${contact_name}. ${fallbackText}`
        : fallbackText;

      return new Response(JSON.stringify({
        action: 'escalate',
        reason: 'no_answer',
        message: customerMessage,
        delay_seconds: aiSettings.response_delay_seconds,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for [SEGUIMIENTO_HUMANO] marker â€” AI determined handoff is needed
    const needsHandoff = generatedText.includes('[SEGUIMIENTO_HUMANO]');

    // Parse [FOTOS:CODE] markers and extract image URLs
    const fotosMatch = generatedText.match(/\[FOTOS:([^\]]+)\]/);
    let mediaUrls: string[] = [];
    let cleanResponse = generatedText;
    
    if (fotosMatch) {
      const propertyCode = fotosMatch[1];
      const matchedProperty = properties.find(p => p.property_code === propertyCode);
      if (matchedProperty) {
        const images = propertyImages
          .filter(img => img.property_id === matchedProperty.id)
          .filter((img, idx, arr) => arr.findIndex(i => i.file_url === img.file_url) === idx)
          .slice(0, 10);
        mediaUrls = images.map(img => img.file_url);
      }
      cleanResponse = cleanResponse.replace(/\[FOTOS:[^\]]+\]/g, '').trim();
    }

    // Parse [PROPIEDAD_INTERES:CODE] marker and auto-assign property to contact
    const propInteresMatch = generatedText.match(/\[PROPIEDAD_INTERES:([^\]]+)\]/);
    let propertyAssigned = false;
    if (propInteresMatch && contact_id) {
      const propertyCode = propInteresMatch[1].trim();
      const matchedProperty = properties.find(p => p.property_code === propertyCode);
      if (matchedProperty) {
        console.log(`ðŸ  Auto-assigning property ${propertyCode} (${matchedProperty.id}) to contact ${contact_id}`);
        await supabase
          .from('contacts')
          .update({ re_property_interest_id: matchedProperty.id })
          .eq('id', contact_id);
        propertyAssigned = true;
      }
      cleanResponse = cleanResponse.replace(/\[PROPIEDAD_INTERES:[^\]]+\]/g, '').trim();
    }

    // Fallback: if AI didn't include [PROPIEDAD_INTERES:...] marker, scan the response for known property codes
    if (!propertyAssigned && contact_id && properties.length > 0) {
      for (const prop of properties) {
        if (generatedText.includes(prop.property_code)) {
          console.log(`ðŸ  Fallback: detected property code ${prop.property_code} in AI response, assigning to contact ${contact_id}`);
          await supabase
            .from('contacts')
            .update({ re_property_interest_id: prop.id })
            .eq('id', contact_id);
          break;
        }
      }
    }

    // Remove internal markers from response
    cleanResponse = cleanResponse.replace(/\[SEGUIMIENTO_HUMANO\]/g, '').trim();

    // Enforce style settings post-LLM
    if (!aiSettings.use_emojis) {
      cleanResponse = stripEmojis(cleanResponse);
    }
    cleanResponse = enforceMaxLength(cleanResponse, aiSettings.max_message_length || 320);

    // If handoff is needed, send the AI's final message AND escalate
    if (needsHandoff) {
      console.log('ðŸ¤ AI triggered human handoff via [SEGUIMIENTO_HUMANO]');
      
      await supabase
        .from('conversations')
        .update({
          ai_enabled: false,
          ai_state: 'escalated',
          needs_human: true,
          ai_pause_reason: 'qualification_complete',
          ai_paused_at: new Date().toISOString()
        })
        .eq('id', conversation_id);
      await triggerAssignment(supabase, conversation_id, 'qualification_handoff');

      await supabase.from('ai_interaction_logs').insert({
        tenant_id,
        conversation_id,
        contact_id,
        inbound_message,
        ai_response: generatedText,
        was_escalated: true,
        escalation_reason: 'qualification_handoff',
        response_time_ms: responseTime,
      });

      // Return the AI's composed farewell message (not the fallback)
      return new Response(JSON.stringify({
        action: 'escalate',
        reason: 'qualification_handoff',
        message: cleanResponse,
        media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
        delay_seconds: aiSettings.response_delay_seconds,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log successful AI response
    await supabase.from('ai_interaction_logs').insert({
      tenant_id,
      conversation_id,
      contact_id,
      inbound_message,
      ai_response: generatedText,
      was_escalated: false,
      response_time_ms: responseTime,
    });

    return new Response(JSON.stringify({
      action: 'respond',
      response: cleanResponse,
      media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
      delay_seconds: aiSettings.response_delay_seconds,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`AI Chat Error after ${totalTime}ms:`, error);
    return new Response(JSON.stringify({ 
      action: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
