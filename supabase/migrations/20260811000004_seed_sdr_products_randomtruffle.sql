-- Catálogo de productos del Agente SDR para los tenants de Random Truffle.
--
-- Reemplaza el array literal que estaba hardcodeado en SettingsSDRAgent.tsx, que
-- además describía productos equivocados (§0.2 del documento de setup los marca
-- como error a corregir): decía que Nexus era "integración y orquestación de
-- datos", Prism "analítica y dashboards" y Radian "automatización de procesos".
-- Los textos correctos son los del §3.3.
--
-- Acotado a partner_id = 'randomtruffle': este CRM es white-label y hay partners
-- inmobiliarios vivos (Brokia24, MLS LATAM) que no deben recibir este catálogo.
--
-- Idempotente por (tenant_id, name): re-aplicar actualiza la descripción sin
-- duplicar filas, para que la corrección llegue aunque ya existiera el registro.

INSERT INTO public.sdr_products (tenant_id, name, description, entry_signal, url, sort_order)
SELECT t.id, p.name, p.description, p.entry_signal, p.url, p.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  (
    'Nexus',
    'Tu equipo de analytics y medición. De la pregunta a la respuesta lista para el board, en minutos. Anomalías, atribución y MMM. Incluye RTDF.',
    'No sé qué funciona / reportes lentos / probar el ROI al CFO',
    'https://www.randomtruffle.com/agents/nexus',
    10
  ),
  (
    'Aura',
    'Tu equipo de estrategia de audiencias. Del objetivo de negocio a la audiencia activada, en minutos. First-party, activación directa. Incluye RTDF.',
    'Audiencias lentas / dependo de terceros / cookies',
    'https://www.randomtruffle.com/agents/aura',
    20
  ),
  (
    'Prism',
    'Tu estudio de contenido. Una persona, todos los formatos, todos los canales, siempre on-brand. Incluye la DAM completa.',
    'Necesito más contenido / versiones / assets perdidos',
    'https://www.randomtruffle.com/agents/prism',
    30
  ),
  (
    'Radian',
    'Tu equipo de operación de medios. Planners y traffickers en cada campaña, 24/7. Auditoría continua y presupuesto optimizado. Incluye RTDF.',
    'Campañas sin optimizar / desperdicio de pauta / agencia lenta',
    'https://www.randomtruffle.com/agents/radian',
    40
  ),
  (
    'Plataforma completa',
    'Los cuatro agentes juntos. Se licencian por separado pero están diseñados para funcionar como un solo sistema: el hallazgo de Nexus se vuelve audiencia en Aura, contenido en Prism y optimización en Radian.',
    'Quiero todo el sistema / me tocan varios dolores a la vez',
    'https://www.randomtruffle.com/agents',
    50
  ),
  (
    'Servicios Random Truffle',
    'Implementación (en distintos tamaños según la complejidad de la operación) y Managed Service (acompañamiento, soporte y operación).',
    'Necesito quién lo ponga en marcha y lo opere conmigo',
    NULL,
    60
  ),
  (
    'Servicios de Google Cloud',
    'Data Foundation, Cloud Migration & Setup, AI Agent Implementation y Marketing Intelligence & Attribution. Incluyen Looker, Knowledge Catalog y Agentes de Gemini.',
    'Mi data está desordenada / quiero BigQuery / migrar a la nube',
    NULL,
    70
  ),
  (
    'Consolas GCP',
    'Apertura y configuración de consolas de Google Cloud. El consumo de infraestructura y AI se paga según la consola del cliente, con opción de centralizar los pagos con nosotros.',
    'Quiero la consola de Google Cloud abierta y bien configurada',
    NULL,
    80
  )
) AS p(name, description, entry_signal, url, sort_order)
WHERE t.partner_id = 'randomtruffle'
ON CONFLICT (tenant_id, name) DO UPDATE
SET description  = EXCLUDED.description,
    entry_signal = EXCLUDED.entry_signal,
    url          = EXCLUDED.url,
    sort_order   = EXCLUDED.sort_order,
    updated_at   = now();
