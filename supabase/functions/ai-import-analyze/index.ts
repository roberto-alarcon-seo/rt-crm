import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Etapas B2B válidas de pipeline_stage (deben coincidir con el enum del CRM).
const PIPELINE_STAGES = [
  'etapa_0_captacion', 'etapa_1_calificacion', 'etapa_2_nurturing', 'etapa_3_demo',
  'etapa_4_oportunidad', 'etapa_5_propuesta', 'etapa_6_negociacion', 'etapa_7_compras_legal',
  'etapa_8_alta_proveedor', 'etapa_9_contrato', 'cerrada_ganada', 'cerrada_perdida',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { headers, sampleRows, distinctDomains, distinctLifecycleValues } = await req.json();

    if (!Array.isArray(headers) || headers.length === 0) {
      return new Response(JSON.stringify({ error: 'Faltan encabezados del archivo' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: 'Servicio de IA no configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `Eres un analista de datos que interpreta archivos CSV/Excel para importarlos a un CRM B2B.
Tu trabajo es DEVOLVER SOLO UN JSON (sin texto extra, sin markdown) con las reglas para interpretar el archivo.

Esquema del contacto en el CRM:
- first_name, last_name (nombre y apellido por separado)
- email, phone, external_id (id de origen)
- company (nombre de empresa; se relaciona/crea una "cuenta")
- lead_status (estado del lead, texto libre del origen)
- lifecycle: uno de "lead" | "client" | "past_client"
- pipeline_stage: uno de ${PIPELINE_STAGES.join(', ')}
- owner (nombre del propietario/responsable)

Devuelve EXACTAMENTE esta forma JSON:
{
  "columnMapping": {
    "first_name": <indice de columna|null>, "last_name": <indice|null>, "full_name": <indice|null>,
    "email": <indice|null>, "phone": <indice|null>, "company": <indice|null>,
    "lead_status": <indice|null>, "lifecycle": <indice|null>, "owner": <indice|null>, "external_id": <indice|null>
  },
  "lifecycleMap": { "<valor del csv>": { "lifecycle": "lead|client|past_client", "pipeline_stage": "<una etapa válida>" } },
  "domainCompany": { "<dominio>": "<Nombre propio de la empresa>|null" },
  "personalDomains": ["gmail.com","hotmail.com","outlook.com","yahoo.com", ...],
  "junkLocalParts": ["no-reply","noreply","donotreply","do_not_reply","notifications","notificaciones","facturacion","facturas","facturaelectronica","billing","invoice","recibos","statements","dse","signers","adobesign","calendar-notification","reminder","bounce","mailer-daemon","postmaster", ...],
  "junkDomains": ["docusign.net","adobesign.com","esignlive.com","luma-mail.com","brevosend.com","chilipiper.com","medallia.com", ...],
  "notes": "una línea con lo más relevante que notaste"
}

Reglas:
- Los índices de columna son base 0 según el orden de "headers".
- "full_name" solo si el nombre completo viene en UNA sola columna; si vienen separados usa first_name/last_name.
- En "domainCompany" incluye TODOS los dominios de "distinctDomains": pon el nombre propio y bien escrito de la empresa (ej. "tdsynnex.com" -> "TD Synnex", "gepp.com" -> "GEPP", "bbva.com" -> "BBVA", "aeromexico.com" -> "Aeroméxico"). Para dominios personales/genéricos (gmail, hotmail, etc.) pon null.
- "junkLocalParts" y "junkDomains": patrones que indican correos de sistema/facturación/notificaciones que NO son leads reales.
- Mapea CADA valor de "distinctLifecycleValues" en "lifecycleMap".`;

    const userPrompt = `headers (índice: nombre):
${headers.map((h: string, i: number) => `${i}: ${h}`).join('\n')}

distinctDomains:
${(distinctDomains || []).join(', ')}

distinctLifecycleValues:
${(distinctLifecycleValues || []).join(', ')}

sampleRows (primeras filas):
${(sampleRows || []).slice(0, 25).map((r: string[]) => JSON.stringify(r)).join('\n')}

Devuelve SOLO el JSON.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      const msg = response.status === 429 ? 'Límite de solicitudes alcanzado, intenta de nuevo'
        : response.status === 402 ? 'Créditos de IA agotados'
        : 'Error al procesar la solicitud de IA';
      return new Response(JSON.stringify({ error: msg }), {
        status: response.status === 429 || response.status === 402 ? response.status : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    let content: string = data.choices?.[0]?.message?.content?.trim() || '';
    // Quitar posibles fences ```json ... ```
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let plan: unknown;
    try {
      plan = JSON.parse(content);
    } catch (_e) {
      // Intento de rescate: extraer el primer bloque {...}
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        plan = JSON.parse(match[0]);
      } else {
        console.error('No se pudo parsear JSON de la IA:', content.slice(0, 500));
        return new Response(JSON.stringify({ error: 'La IA no devolvió un JSON válido' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ plan }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('ai-import-analyze error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message || 'Error inesperado' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
