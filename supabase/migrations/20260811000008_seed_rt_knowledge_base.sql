-- ═════════════════════════════════════════════════════════════════════════════
-- Base de Conocimiento de Random Truffle (§6 del documento de setup)
--
-- El repo no tenía ni una sola entrada ni colección sembrada: cada tenant
-- arrancaba con la Base de Conocimiento vacía y la UI derivaba las colecciones
-- de las filas que existieran en la BD.
--
-- Esta migración:
--   · corrige el typo "Prisim" → "Prism" que el §0.3 señala (vive como dato en
--     la BD del tenant, no en el código, por eso solo se puede arreglar aquí),
--   · crea las 10 colecciones del §6 con icono y color,
--   · carga las entradas de §6.1 a §6.10 con su tipo (Info o Q&A).
--
-- Las respuestas son las del documento, que ya están reescritas para cumplir la
-- regla de no hablar con desdén de otras herramientas (§0.5): la entrada de la
-- DAM ya no dice que Drive sea "un cementerio de archivos".
--
-- Acotado a partner_id = 'randomtruffle'. Idempotente por (tenant, colección,
-- pregunta): re-aplicar actualiza el texto en lugar de duplicar, para que las
-- correcciones de redacción lleguen a lo ya cargado.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Typo "Prisim" → "Prism" (§0.3)
--    Si ya existiera una colección "Prism", se reapunta el contenido y se retira
--    la duplicada, en lugar de reventar contra el UNIQUE(tenant_id, name).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tenant uuid;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants WHERE partner_id = 'randomtruffle' LOOP
    UPDATE public.ai_knowledge_base
    SET collection = 'Prism'
    WHERE tenant_id = v_tenant AND collection = 'Prisim';

    IF EXISTS (SELECT 1 FROM public.kb_collections WHERE tenant_id = v_tenant AND name = 'Prism') THEN
      DELETE FROM public.kb_collections WHERE tenant_id = v_tenant AND name = 'Prisim';
    ELSE
      UPDATE public.kb_collections SET name = 'Prism'
      WHERE tenant_id = v_tenant AND name = 'Prisim';
    END IF;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Las 10 colecciones del §6
--    Los colores de los cuatro agentes son los que el §1 asigna a sus píldoras
--    en el widget, para que el sistema se lea igual en todos lados.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.kb_collections (tenant_id, name, description, icon, color, sort_order)
SELECT t.id, c.name, c.description, c.icon, c.color, c.ord
FROM public.tenants t
CROSS JOIN (VALUES
  ('Empresa',                    'Quiénes somos, historia, cobertura y fundadores',       '🏢', '#6366F1', 10),
  ('Plataforma',                 'RTDF, Brand Hub y cómo encajan los cuatro agentes',     '🧩', '#8B5CF6', 20),
  ('Nexus',                      'Analytics y medición',                                  '📊', '#14B8A6', 30),
  ('Aura',                       'Estrategia de audiencias',                              '🎯', '#8B5CF6', 40),
  ('Prism',                      'Estudio de contenido y DAM',                            '🎨', '#F97316', 50),
  ('Radian',                     'Operación de medios',                                   '📡', '#84CC16', 60),
  ('Servicios',                  'Implementación y Managed Service',                      '🛠️', '#6366F1', 70),
  ('GCP',                        'Servicios y consolas de Google Cloud',                  '☁️', '#4285F4', 80),
  ('Implementación y Seguridad', 'Dónde vive la data, integraciones y requisitos de IT',  '🔒', '#475569', 90),
  ('Comercial',                  'Precios, cotización, proceso y objeciones',             '💬', '#10B981', 100)
) AS c(name, description, icon, color, ord)
WHERE t.partner_id = 'randomtruffle'
ON CONFLICT (tenant_id, name) DO UPDATE
SET description = EXCLUDED.description,
    icon        = EXCLUDED.icon,
    color       = EXCLUDED.color,
    sort_order  = EXCLUDED.sort_order;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Entradas §6.1 – §6.10
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_kb (collection text, entry_type text, question text, answer text) ON COMMIT DROP;

INSERT INTO tmp_kb VALUES
-- ── §6.1 Empresa ────────────────────────────────────────────────────────────
('Empresa','info','Qué es Random Truffle',
$a$Random Truffle le da al enterprise un equipo autónomo de marketing: cuatro agentes de AI especializados — Nexus, Aura, Prism y Radian — que corren sobre tu propia data y el contexto completo de tu marca, para que un equipo pequeño investigue, planee, cree, opere y optimice todo el marketing: más rápido, medible hasta el último dólar y sin depender de terceros. Más en www.randomtruffle.com.$a$),

('Empresa','info','Historia y nombre: ¿por qué "Random Truffle"?',
$a$Random Truffle nace de la idea de que los mejores resultados a veces están escondidos — como una trufa enterrada. Encontrar trufas requiere una nariz excelente (intuición + datos); en marketing, encontrar las señales que de verdad importan requiere exactamente eso: inteligencia que detecta patrones ocultos en tu data. "Random" juega con lo impredecible del mercado y con que las oportunidades no siempre aparecen donde las buscas — el sistema las descubre por ti. En resumen: trufas escondidas, datos que revelan, resultados que parecen magia pero son ingeniería.$a$),

('Empresa','info','Quiénes somos: Marketing Engineering',
$a$En Random Truffle somos Marketing Engineers: una disciplina que une el oficio del marketing — creatividad, estrategia, medios, KPIs — con la columna técnica que lo hace funcionar a escala: AI, agentes, data, integraciones y seguridad. No somos una agencia que subcontrata la tecnología, ni ingenieros que no entienden marketing: somos las dos cosas en las mismas personas. Marketing — Engineered.$a$),

('Empresa','info','Presencia y cobertura',
$a$Oficinas en México y Estados Unidos, y capacidad de atender en casi cualquier país — ya lo hemos hecho: clientes en México, Colombia, Chile, Argentina, Perú, Estados Unidos y Centroamérica. El acompañamiento es LATAM-first, en español o inglés. Síguenos en LinkedIn: www.linkedin.com/company/random-truffle.$a$),

('Empresa','qa','¿En qué países operan?',
$a$Tenemos oficinas en México y Estados Unidos, y atendemos en casi cualquier país — ya lo hemos hecho antes, con clientes en varios mercados de LATAM y US. ¿Desde qué país nos escribes? Así te oriento mejor.$a$),

('Empresa','qa','¿Quiénes son los founders? / ¿Quién está detrás de Random Truffle?',
$a$Los fundadores son Lukas Canal (CEO), Ángel Hernández (COO) y Víctor Valle (CTO) — los tres con más de 20 años de experiencia y fundadores de Hexagon Data, que tuvo un exit al ser adquirida por Grupo VASS. Sus perfiles: linkedin.com/in/lukascanal, linkedin.com/in/jangelho y linkedin.com/in/victorhvalle. ¿Quieres conocerlos en una llamada?$a$),

('Empresa','qa','¿Ya han hecho esto antes? / ¿Cuál es su historial?',
$a$Sí — los fundadores crearon Hexagon Data, referente de data y martech en la región, adquirida por Grupo VASS hace tres años (vasscompany.com/es/about-us/newsroom/grupo-vass-adquiere-hexagon-data). Random Truffle es el siguiente capítulo: la misma experiencia en data y marketing, ahora con agentes autónomos.$a$),

('Empresa','qa','¿Están buscando funding / levantando inversión?',
$a$Por ahora estamos 100% bootstrapped — y no estamos peleados con la idea de conseguir inversión: la usaríamos bien. Si el tema te interesa en serio, te conecto directo con Lukas, nuestro CEO.$a$),

('Empresa','qa','¿Son partner de Google?',
$a$Sí — somos partner de Google Cloud. La plataforma corre sobre Google Cloud con los modelos de frontera de Google (Gemini para razonamiento, Nano Banana para imagen, Veo para video), y además abrimos y configuramos consolas de GCP para nuestros clientes.$a$),

('Empresa','qa','¿Van a reemplazar a mi equipo de marketing?',
$a$No — y es un principio de diseño. Los agentes hacen el trabajo pesado (datos, versiones, operación, reportes) para que tu equipo recupere la estrategia, el criterio de marca y la creatividad. Equipos chicos con resultados grandes: humanos y agentes trabajando de verdad en equipo.$a$),

('Empresa','qa','¿En qué etapa están? ¿La plataforma ya está probada?',
$a$Sí — Random Truffle está en producción general, con más de 10 clientes activos: empresas grandes de Telco, Retail y Consumo. ¿Quieres verla funcionando sobre un caso como el tuyo? Te agendo una demo.$a$),

('Empresa','qa','¿En qué industrias funciona mejor?',
$a$Donde más fuertes somos: Telco, Retail, Consumo (CPG), Travel, Transportation, Fintech, Retail Banking, Insurance y Media & Entertainment. Si tu industria es otra, cuéntame tu caso y te digo qué tanto aplica.$a$),

-- ── §6.2 Plataforma ─────────────────────────────────────────────────────────
('Plataforma','info','La plataforma: RTDF + Brand Hub + 4 agentes',
$a$Tres capas, contadas de abajo hacia arriba. (1) RTDF — Random Truffle Data Foundations: unifica analytics, CRM, paid media, data lakes, eCommerce y WhatsApp en una sola fundación lista para decidir, en tu nube y bajo tu gobernanza. (2) Brand Hub: la capa de contexto — tus marcas, productos, categorías, regiones y guías — para que cada agente sepa exactamente para quién trabaja. (3) Los cuatro agentes que operan el ciclo completo: Nexus entiende, Aura decide, Prism crea, Radian optimiza. Por eso deciden mejor: tienen toda tu data Y conocen tu marca.$a$),

('Plataforma','qa','¿Necesito los 4 agentes o puedo comprar uno?',
$a$Cada agente se licencia por separado — puedes empezar por el dolor más urgente. Eso sí: están diseñados para funcionar juntos, y ahí está la magia: el hallazgo de Nexus se vuelve audiencia en Aura, contenido en Prism y optimización en Radian, sin fricción. Prism incluye la DAM completa; Nexus, Aura y Radian incluyen RTDF. ¿Te muestro por dónde entraría tu caso?$a$),

('Plataforma','qa','¿Esto reemplaza mi stack actual (GA, CRM, plataformas de ads)?',
$a$No — se sienta encima de él. Reconocemos que tu stack existe y muchas veces es bueno; Random Truffle es la nueva interfaz para operarlo todo desde una sola conversación. Nos conectamos a tu analytics, CRM, medios y data lake; tú no abandonas tus sistemas — los operamos por ti.$a$),

('Plataforma','qa','¿En qué se diferencia de usar ChatGPT o un copiloto genérico?',
$a$En dos cosas que un genérico no tiene: tu data (RTDF unifica y limpia todas tus fuentes) y tu contexto (el Brand Hub sabe quiénes son tus marcas, productos y regiones). Un genérico arranca cada tarea desde cero; nuestros agentes arrancan desde familiaridad total — por eso el output es on-brand y accionable, no un borrador más.$a$),

('Plataforma','qa','¿Qué modelos de AI usan?',
$a$Los modelos de frontera de Google: Gemini para razonamiento y análisis, Nano Banana para imagen y Veo para video, sobre infraestructura de Google Cloud. La elección es deliberada: enterprise-grade, en tu nube, con gobernanza.$a$),

('Plataforma','qa','¿En qué idiomas funciona?',
$a$La plataforma se opera en español o inglés (le hablas en lenguaje natural), y el contenido que produce puede adaptarse por mercado y región vía el Brand Hub.$a$),

('Plataforma','qa','¿Para qué tamaño de empresa es?',
$a$Está pensada para enterprise y para equipos de marketing que operan varias marcas, mercados o canales — donde el volumen de decisiones y contenido ya no se puede operar a mano. Si tu equipo es chico y tu ambición grande, es justo el perfil.$a$),

-- ── §6.3 Nexus ──────────────────────────────────────────────────────────────
('Nexus','info','Nexus — Tu equipo de analytics y medición',
$a$"De la pregunta a la respuesta lista para el board, en minutos." Pregúntale lo que sea — tráfico, leads, ventas, campañas, keywords — en español o inglés, sobre toda tu data en RTDF, y obtén respuestas explicables. Detección de anomalías antes de que quemen presupuesto, atribución y MMM con Google Meridian, y dashboards al instante sin backlog de BI. Incluye RTDF. Proof: 0.94 de confianza MMM en paid mix. Más en www.randomtruffle.com/agents/nexus.$a$),

('Nexus','qa','Mi equipo ya usa Google Analytics y dashboards en PowerBI, ¿Nexus los reemplaza?',
$a$No los tira a la basura — se conecta encima. Tu GA y tus dashboards siguen ahí; la diferencia es que dejas de esperar a que alguien modifique un reporte: le preguntas a Nexus en lenguaje natural sobre toda tu data unificada en RTDF y tienes la respuesta en minutos, con su explicación. Los reportes que hoy tardan semanas se vuelven una conversación.$a$),

('Nexus','qa','¿Cómo sé que las respuestas de Nexus son confiables?',
$a$Toda respuesta es explicable y trazable: Nexus te dice de qué datos viene cada número. Zero black boxes es regla de la casa. Y en medición formal, el MMM con Google Meridian alcanzó 0.94 de confianza en paid mix.$a$),

-- ── §6.4 Aura ───────────────────────────────────────────────────────────────
('Aura','info','Aura — Tu equipo de estrategia de audiencias',
$a$"Del objetivo de negocio a la audiencia activada, en minutos." Plantea el objetivo y Aura arma el plan de audiencias con estrategia real de segmentación, construye segmentos sobre tu first-party data en BigQuery, y los activa directo en Google, Meta, TikTok y tu Martech — sin intermediarios. Lookalikes, exclusiones y audiencias de propensión con ML. Incluye RTDF. Proof: +11% de lift promedio en lookalikes. Más en www.randomtruffle.com/agents/aura.$a$),

('Aura','qa','¿Qué pasa con las cookies de terceros? ¿Esto depende de ellas?',
$a$No — Aura trabaja sobre tu first-party data: tus clientes reales, unificados en RTDF. Es justo la respuesta al mundo sin cookies: audiencias construidas sobre lo que es tuyo, activadas directo en los canales.$a$),

('Aura','qa','Hoy armar un segmento me toma semanas entre BI, agencia y ad ops. ¿Cómo lo hace Aura?',
$a$Con una conversación: planteas el objetivo de negocio, Aura propone el plan de audiencias, lo refinas hablando y lo activa directo en los canales. Lo que era un ciclo de semanas entre tres equipos se vuelve minutos. Un líder de telecomunicaciones en México activó 50+ audiencias estratégicas así.$a$),

-- ── §6.5 Prism ──────────────────────────────────────────────────────────────
('Prism','info','Prism — Tu estudio de contenido',
$a$"Una persona. Todos los formatos. Todos los canales. Siempre on-brand." GenAI avanzada para texto, imagen, audio y video: una persona genera todas las variaciones, para cada audiencia y canal, con las mejores prácticas de cada canal y los guardrails de tu marca integrados desde el Brand Hub. Incluye la DAM completa: aprobaciones, colecciones, búsqueda, metadatos inteligentes y asignación a campañas. Proof: 38× más contenido que con agencia. Más en www.randomtruffle.com/agents/prism.$a$),

('Prism','qa','Ya tenemos los assets en Google Drive / SharePoint, ¿para qué una DAM?',
$a$Drive y SharePoint son excelentes para archivos — pero el contenido de marketing necesita más: versiones, aprobaciones, metadatos, búsqueda por campaña y compartir seguro. La DAM de Prism organiza todos tus assets con metadatos generados por AI y flujos de aprobación, para que nada se pierda en cadenas de correo y nadie use la versión equivocada del logo.$a$),

('Prism','qa','¿El contenido generado va a sonar a mi marca o a AI genérica?',
$a$A tu marca — por construcción. Prism trabaja desde el Brand Hub: tus guías, logos, productos y tono. No arranca de cero como una herramienta genérica; arranca de familiaridad total. Velocidad de máquina con integridad de marca.$a$),

-- ── §6.6 Radian ─────────────────────────────────────────────────────────────
('Radian','info','Radian — Tu equipo de operación de medios',
$a$"Un equipo completo de planners y traffickers en cada campaña, 24/7." Auditoría continua de campañas — SEM, Google Ads, YouTube, Meta, Instagram y más — con toda la data de RTDF como contexto: encuentra mejoras en audiencias, creativos, arte y copy, no solo en bids. Análisis de brechas y reasignación de presupuesto con evidencia. Incluye RTDF. Proof: +40% de ROAS en 90 días. Más en www.randomtruffle.com/agents/radian.$a$),

('Radian','qa','Ya uso Performance Max y Advantage+, ¿qué me agrega Radian?',
$a$PMax y Advantage+ son excelentes optimizando dentro de su propia plataforma — pero no ven lo que pasa afuera: tu CRM, tus ventas reales, tus otros canales. Radian se sienta encima de esos algoritmos con toda tu data de RTDF: decide mejor la mezcla, detecta desperdicio entre plataformas y recomienda con evidencia. No compite con los algoritmos; los orquesta.$a$),

('Radian','qa','¿Radian mueve mi presupuesto solo?',
$a$Radian recomienda con evidencia y tú decides — el nivel de autonomía se configura. Todo queda trazable: cada recomendación viene con su razón y su dato. Control total es parte del producto, no una promesa.$a$),

-- ── §6.7 Servicios ──────────────────────────────────────────────────────────
('Servicios','info','Servicios Random Truffle',
$a$Dos tipos: (1) Implementación — la puesta en marcha de Random Truffle, en distintos tamaños según la complejidad de tu operación (fuentes de datos, marcas, mercados). Los proyectos son mucho más cortos que en tecnología tradicional porque nos apoyamos en agentes de implementación y de data. (2) Managed Service — acompañamiento a la medida: operación, soporte y evolución del sistema con tu equipo. Hay 3 tipos, o se define uno custom según tu operación.$a$),

('Servicios','qa','¿Qué tan grande tiene que ser el proyecto de implementación?',
$a$Depende de tu complejidad: fuentes de datos, marcas y mercados. Hay implementaciones de distintos tamaños, y todas mucho más cortas que un proyecto de tecnología tradicional — nuestros agentes de implementación y de data hacen el trabajo pesado. Lo dimensionamos en una llamada de 30 minutos.$a$),

('Servicios','qa','¿Qué incluye el Managed Service?',
$a$Es acompañamiento a la medida: operación del sistema, soporte y evolución de casos de uso con tu equipo. Hay 3 tipos según el nivel de acompañamiento, o armamos uno custom. El detalle lo vemos en una llamada.$a$),

-- ── §6.8 GCP ────────────────────────────────────────────────────────────────
('GCP','info','Servicios de Google Cloud',
$a$Como partners de Google Cloud, ofrecemos servicios puros de GCP — con o sin licencias de Random Truffle:
1. Data Foundation — "Tus agentes son tan inteligentes como tu data." Setup de BigQuery y diseño de esquemas, integración de pipelines de CRM y plataformas de ads, modelo unificado de data de marketing y monitoreo de calidad con alertas.
2. Cloud Migration & Setup — "Mueve tu stack de marketing a Google Cloud como debe ser." Diseño de arquitectura y setup de proyectos, migración de data y herramientas, IAM y seguridad, optimización de costos.
3. AI Agent Implementation — "Cuatro agentes. Un equipo unificado. Cero overhead manual." Despliegue completo de Nexus, Aura, Prism y Radian, configuración por marca/mercado/campaña, integración con ads, CRM y nube, y 30 días de soporte post-lanzamiento.
4. Marketing Intelligence & Attribution — "Saber exactamente qué funciona — y por qué." Atribución full-funnel, MMM en Google Cloud, dashboards en Looker Studio y framework de KPIs alineado al negocio.
Incluyen tecnologías como Looker, Knowledge Catalog y Agentes de Gemini.$a$),

('GCP','info','Consolas GCP',
$a$Abrimos y configuramos consolas de Google Cloud para nuestros clientes. El consumo de infraestructura y de AI (Gemini, BigQuery, Cloud Run, Looker) se paga según lo que diga tu consola — transparencia total del costo, en tu propia cuenta. Y si te conviene, todos los pagos se pueden centralizar con nosotros.$a$),

('GCP','qa','¿Puedo contratar solo los servicios de Google Cloud, sin la plataforma?',
$a$Sí — muchos clientes empiezan así: una Data Foundation sólida o una migración bien hecha valen por sí solas, y de paso dejan todo listo si después quieres los agentes. Cotizamos servicios de GCP de forma independiente.$a$),

('GCP','qa','¿Cómo se paga el consumo de Google Cloud?',
$a$Según lo que diga tu consola de GCP — el consumo de infra y AI es tuyo, en tu cuenta, con visibilidad total. Si lo prefieres, también podemos centralizar todos los pagos con nosotros. Nosotros abrimos la consola, estimamos el consumo anual para tu presupuesto y te ayudamos a optimizarlo.$a$),

-- ── §6.9 Comercial ──────────────────────────────────────────────────────────
('Comercial','qa','¿Cuánto cuesta? / ¿Cuáles son sus precios?',
$a$El pricing depende de la mezcla: qué agentes licencias, qué servicios necesitas y tu consumo estimado de Google Cloud. Por eso no hay una lista pública — el equipo arma la cotización a tu medida en una llamada corta. ¿Te agendo 30 minutos esta semana?$a$),

('Comercial','qa','¿Cómo es una cotización típica?',
$a$Tres componentes: licencias de Random Truffle (los agentes que necesites), servicios (implementación y/o Managed Service) y la estimación de consumo anual de Google Cloud — que se paga según tu consola, o centralizado con nosotros si lo prefieres. También puede ser solo servicios de GCP. El detalle, en una llamada.$a$),

('Comercial','qa','¿Cuánto tarda la implementación?',
$a$Mucho menos que un proyecto de tecnología tradicional: nos apoyamos en agentes de implementación y de data que hacen el trabajo pesado — conexión de fuentes, modelado y configuración. El tiempo exacto depende de tu complejidad; lo dimensionamos en una llamada.$a$),

('Comercial','qa','¿Cómo es el proceso para empezar?',
$a$Simple: (1) una demo de 30–45 min sobre tu caso, (2) dimensionamos alcance y cotización, (3) implementación corta apoyada en nuestros agentes, (4) arranque con acompañamiento. ¿Te agendo el primer paso?$a$),

('Comercial','qa','¿Tienen casos de éxito?',
$a$Sí — más de 10 clientes activos, empresas grandes de Telco, Retail y Consumo, y un caso de éxito público con un líder de telecomunicaciones (50+ audiencias estratégicas activadas). Vienen varios más. ¿Quieres verlo aplicado a tu industria? Te agendo una demo.$a$),

('Comercial','qa','Ya trabajo con una agencia, ¿esto cómo encaja?',
$a$Perfecto — la mayoría de nuestros clientes trabajan con agencias y siguen haciéndolo. Random Truffle potencia lo que logran en conjunto: el sistema hace el volumen y la operación diaria, y tu equipo y tu agencia se concentran en la estrategia y las ideas grandes. ¿Te muestro cómo se ve ese trabajo conjunto en una demo?$a$),

-- ── §6.10 Implementación y Seguridad ────────────────────────────────────────
('Implementación y Seguridad','qa','¿Dónde vive mi data? ¿Es segura?',
$a$En tu nube: RTDF se monta en tu BigQuery/VPC, bajo tu gobernanza, con SSO enterprise. Tu data nunca sale de tu control, cada decisión es trazable y no hay cajas negras. Para revisiones profundas de seguridad, te conectamos con nuestro equipo técnico y el paquete de documentación.$a$),

('Implementación y Seguridad','qa','¿Con qué se integra?',
$a$Analytics web y app, CRMs (Salesforce y otros), paid media (Google Ads, Meta, Amazon Ads, TikTok, X), data lakes y BI (BigQuery, Databricks, Snowflake, AWS, Azure), eCommerce y WhatsApp. La data se consulta en su origen o se centraliza en BigQuery — lo que convenga a tu arquitectura.$a$),

('Implementación y Seguridad','qa','¿Qué necesita mi equipo de IT para arrancar?',
$a$Poco: accesos a las fuentes que vamos a conectar y un sponsor técnico para las decisiones de arquitectura (consulta en origen vs. centralizar en BigQuery). Nuestro equipo de Marketing Engineers habla el idioma de IT — APIs, ETL, IAM, seguridad — y hace el trabajo pesado.$a$);


-- Carga (o actualiza) las entradas para cada tenant de Random Truffle.
INSERT INTO public.ai_knowledge_base
  (tenant_id, collection, entry_type, question, answer, category, is_active)
SELECT t.id, k.collection, k.entry_type, k.question, k.answer, 'general_info'::public.kb_category, true
FROM public.tenants t
CROSS JOIN tmp_kb k
WHERE t.partner_id = 'randomtruffle'
  AND NOT EXISTS (
    SELECT 1 FROM public.ai_knowledge_base e
    WHERE e.tenant_id = t.id AND e.collection = k.collection AND e.question = k.question
  );

-- Si la entrada ya existía, se actualiza el texto: así llegan las correcciones
-- de redacción del §0.5 a lo que ya estuviera cargado a mano.
UPDATE public.ai_knowledge_base e
SET answer = k.answer, entry_type = k.entry_type, updated_at = now()
FROM tmp_kb k, public.tenants t
WHERE e.tenant_id = t.id
  AND t.partner_id = 'randomtruffle'
  AND e.collection = k.collection
  AND e.question = k.question
  AND e.answer IS DISTINCT FROM k.answer;
