# Random Truffle — Documento de Visión del Sistema Comercial

# Agéntico (RT-CRM)

**Versión 0.2 — Documento de visión** Autor: Lukas Canal (CEO) Fecha: Junio 2026
Audiencia: equipo de desarrollo de Random Truffle

## 1. Por qué existe este documento

Este es un documento de **visión** , no una especificación técnica. Su propósito es transmitir
con claridad **qué queremos construir y por qué** , para que el equipo de desarrollo
comparta la misma imagen del destino antes de discutir el cómo. Habrá detalle suficiente
para empezar a diseñar, pero el centro de gravedad es la visión del negocio y, sobre todo, el
**flujo completo de adquisición hasta el cierre**.
Random Truffle necesita un sistema que sea su columna vertebral comercial: el lugar donde
vive cada relación con clientes y partners, desde el primer toque de un lead hasta el cierre,
el alta como proveedor y la vida del cliente. No es un CRM tradicional. Es un **sistema
operativo comercial agéntico** : datos limpios de relaciones con **agentes de IA** trabajando
encima de ellos, conversando, calificando, dando seguimiento y operando el negocio codo a
codo con las personas.

## 2. La visión en una frase

Un sistema que entiende todo nuestro negocio de relaciones, que se opera
conversando (por Claude, Gemini Enterprise o Gemini vía un MCP server), donde
agentes con contexto y objetivos propios mueven cada lead hacia el cierre, y que
en cualquier momento me puede decir cómo vamos, qué va a cerrar y dónde
conviene invertir para crecer.
Tres ideas guían todo el diseño:
**A) Agentes que trabajan, no solo que responden.** Los agentes tienen contexto, persiguen
objetivos (Goals) y operan en ciclos (loops) de seguimiento: conversan con leads, califican,
agendan, dan seguimiento a propuestas y altas, y avisan cuando algo necesita a una
persona.
**B) El sistema se opera conversando.** Quiero gestionar todo desde un agente —Claude,
Gemini Enterprise o Gemini— a través de un **MCP server**. Subir la grabación de una
llamada, reenviar las notas de Gemini de un Meet, o simplemente preguntar y pedir cosas
en lenguaje natural, y que el sistema actúe.


**C) El sistema piensa con datos.** En cualquier momento debe poder decirme cuántos leads
traemos, el desglose de leads/oportunidades/cierres, la probabilidad de cierre por
oportunidad y del mes, y cuáles son nuestros mejores canales de adquisición.

## 3. Principios de diseño

1. **Agéntico por defecto, humano en el lazo.** Los agentes proponen y ejecutan; las
    personas aprueban lo que importa (precio, propuesta final, firma). Todo queda
    registrado, es atribuible y reversible.
2. **Conversación como interfaz principal.** Cualquier cosa que se haga en pantalla se
    puede hacer hablándole a un agente. La entrada puede ser texto, audio o correos
    reenviados.
3. **Trazabilidad total.** Desde la UTM y la landing hasta la conversación de WhatsApp y la
    firma, cada toque queda atribuido a su origen. Nada se pierde.
4. **Una sola fuente de verdad.** El RT-CRM es el sistema de registro; todo lo demás
    (Partner Network Hub de GCP, WhatsApp, email, calendario, facturación) sincroniza
    con él.
5. **Contexto siempre presente.** Los agentes nunca operan a ciegas: cada acción ocurre
    con la historia completa de la cuenta, el contacto, el partner y la oportunidad.
6. **Built on Google Cloud.** Como partner de GCP, el sistema es vitrina de lo que
    vendemos: Gemini para los agentes, BigQuery para datos, Cloud Run para servicios,
    Looker para reporting.
7. **LATAM-first, multi-país.** WhatsApp es el canal dominante; el diseño asume español,
    varios países y la realidad de compras/legal de empresas de la región.

## 4. A quién le vendemos y cómo nos contratan (modelo de relaciones)

Una pieza central de la visión: Random Truffle no siempre le vende directo a quien usa el
producto. El sistema debe modelar con naturalidad varios tipos de relación.
**4.1 Cliente directo**
Le vendemos y facturamos directamente a la empresa que usa Random Truffle. La relación
comercial y el cobro son con esa cuenta.
**4.2 Un partner nos contrata (el partner es el cliente que paga)**
A Random Truffle lo puede contratar un **partner** , que no es necesariamente el usuario final.
En ese caso:

- Damos de alta la cuenta como **Partner** (un tipo de cuenta, no un simple contacto).
- Registramos el **cliente final** como una cuenta relacionada, para tener contexto y
    trazabilidad de para quién es el trabajo.


- La **relación comercial y el cobro son con el partner** : le facturamos al partner. El
    cliente final existe en el sistema para entender el caso, dar seguimiento y reportar, pero
    no es quien paga.
**4.3 Vendemos a través de nuestros partners**
También podemos vender **a través de partners nuestros** —por ejemplo, empresas de
implementación y operación de Random Truffle—. Aquí el partner es un **canal de
adquisición y/o entrega** : nos trae o co-trabaja la cuenta. La oportunidad debe poder
vincular al partner involucrado además del cliente, para entender qué negocio nos llega y se
entrega vía partners.
    **Idea clave para el sistema:** una cuenta puede ser cliente, partner, o ambos; y una
    oportunidad puede tener un **partner asociado** (quien nos contrata o co-vende) y
    un **cliente final** relacionado. Esto permite ver el negocio por relación real, no solo
    por "quién firma".
**4.4 Geografía: somos mexicanos, vendemos en la región**
Hoy somos empresa mexicana, pero cerramos clientes en **México, Colombia, Chile,
Argentina, Perú, Estados Unidos y Centroamérica**. Por eso es importante saber **de qué
país y ciudad** es cada cliente, partner y oportunidad. La geografía no es un dato decorativo:
afecta moneda, impuestos, requisitos de alta de proveedor, husos horarios para agendar,
idioma/matices y cómo leemos el desempeño por mercado. El sistema debe capturar **país y
ciudad** desde el alta y permitir cortar todo (pipeline, cierres, canales) por geografía.

## 5. Qué vendemos (líneas de ingreso)

Una misma oportunidad puede combinar varias de estas líneas; el sistema las modela por
separado para reportar ingreso y margen por tipo.

- **Licencias de agentes Random Truffle:** Nexus, Aura, Prism, Radian (cada uno con su
    costo y esquema de licenciamiento).
- **Servicios:** Managed Service, Implementación, Desarrollo (Dev).
- **GCP (consumo en las consolas del cliente):** principalmente Gemini, BigQuery, Cloud
    Run, Looker y otros; siempre detallando el tipo de servicio consumido.
- **Servicios de terceros:** reventa/intermediación de un tercero (p. ej. LKMX),
    normalmente desarrollo asociado a Google Cloud, con su costo y margen.

## 6. El corazón de la visión: el flujo completo de adquisición → cierre

Esta es la parte más importante del documento. Describe cómo un desconocido se
convierte en cliente, y cómo los agentes y las personas colaboran en cada paso. El sistema
debe orquestar este recorrido de extremo a extremo, sin que nada se caiga por falta de
seguimiento.


**6.1 Los canales de adquisición
Canal A — Account Executives de Google Cloud (GCP).** Somos partner de GCP y un motor
de negocio es vender consumo de consolas de la mano de los **Account Executives (AE) de
Google Cloud**. El sistema debe saber con qué AE trabajamos en cada cuenta, registrar qué
vendimos nuestro y qué se vendió de GCP, y estar **sincronizado con el Partner Network
Hub** (partners.cloud.google.com), donde se registran las oportunidades del lado de Google,
para no llevar doble registro y tener visibilidad conjunta del estado.
**Canal B — Inbound moderno y relaciones directas (como debe hacerse en 2026).** El
grueso de la modernización. Fuentes: contenido en RRSS (sobre todo **LinkedIn** ), el **sitio
web** (formularios, chat, landing pages), **campañas pagadas** (Google Ads y otros), y
**directo/referidos**. La regla de oro es **trazabilidad sin cortes** :
Anuncio / Post / Contenido
│ (UTMs, click IDs)
▼
Landing Page ──► evento capturado (UTM, fuente, campaña, creativo, país)
│
▼
Conversación con agente IA ──► WhatsApp / Web chat / Email
│ (hereda de qué campaña/landing viene)
▼
Lead calificado ──► Oportunidad ──► ... ──► Cierre
En LATAM mucha conversación ocurre por **WhatsApp** , así que es clave enlazar el clic en el
anuncio/landing (con su UTM) con la conversación de WhatsApp que se origina, y **unificar
identidad** cuando el mismo lead toca web, LinkedIn y WhatsApp.
**Canal C — Partners.** Como se describió en §4.3, los partners de
implementación/operación también nos traen negocio. Ese origen se registra y se atribuye
igual que cualquier otro canal, para poder medir cuánto pipeline e ingreso llega vía
partners.
**6.2 El recorrido, etapa por etapa
Etapa 0 — Captación / primer toque.** Entra un lead por cualquier canal. El sistema
captura origen, UTMs, país/ciudad y contexto, crea o actualiza Contacto y Cuenta, y
deduplica contra lo que ya existe. _El agente_ saluda, abre conversación y registra el toque
con su atribución intacta. Desde el segundo cero existe un hilo: sabemos de dónde vino.
**Etapa 1 — Descubrimiento y calificación.** El agente conversa (web/WhatsApp/email),
entiende la necesidad y el interés, y **califica** : tamaño y tipo de empresa, rol del contacto,
caso de uso, posible mezcla de productos (licencias / servicios / GCP / terceros), país,
urgencia y si nos contrata directo, vía partner, o si nosotros vendemos vía partner.
Enriquecе el registro con lo que encuentra. _El agente_ propone el siguiente paso; _la persona_
valida los leads calientes. El resultado es un lead calificado, con un score y una razón.


**Etapa 2 — Educación y contenido de valor.** Antes y durante la calificación, el agente
**envía contenido relevante** según el interés detectado: casos, one-pagers, demos grabadas.
El objetivo es nutrir y avanzar la conversación, no solo responder. Los leads que aún no
están listos entran en **nurturing** automático con seguimiento periódico.
**Etapa 3 — Agenda de demo o reunión.** Cuando hay interés real, el agente **agenda** una
demo o llamada directamente en el calendario del comercial adecuado: ofrece horarios
reales, respeta el huso horario del país del cliente, crea el evento con Meet, invita y manda
recordatorios; reagenda si hace falta. _La persona_ da la demo.
**Etapa 4 — Oportunidad abierta y seguimiento.** Se crea la **Oportunidad** con sus líneas
(la mezcla de productos), su partner asociado y/o cliente final si aplica, su país/ciudad y su
origen. A partir de aquí el agente mantiene la oportunidad **viva** : registra notas de llamadas
(incluyendo grabaciones y notas de Gemini de Meet reenviadas), actualiza la etapa, agenda
los siguientes pasos y alerta si el deal se enfría. _La persona_ dirige la relación; el agente se
asegura de que nada se olvide.
**Etapa 5 — Propuesta.** Se arma y envía la propuesta (licencias + servicios + estimación de
consumo GCP + terceros), en la moneda y formato del país. El agente prepara el borrador a
partir del contexto de la oportunidad y de plantillas; _la persona_ ajusta y **aprueba precio y
términos**. El agente da seguimiento al envío y a la respuesta, y registra objeciones.
**Etapa 6 — Negociación y cierre comercial.** El agente mantiene el pulso del deal, recuerda
pendientes a ambas partes, prepara material y avisa de estancamientos. _La persona_ negocia
y cierra. El sistema mantiene actualizada la **probabilidad de cierre** de la oportunidad
conforme avanza.
**Etapa 7 — Procesos del cliente: compras, seguridad y legal.** El cierre real suele ser
largo: involucra a **compras, seguridad y legal** del cliente, y siempre hay temas
contractuales. El agente da seguimiento sistemático a cada área, **responde cuestionarios
de seguridad** recurrentes desde una base de conocimiento, mantiene un checklist vivo y
recuerda los pendientes a ambos lados. _Legal/la persona_ decide sobre cláusulas y términos.
**Etapa 8 — Alta como proveedor (paso crítico).** El **alta como proveedor** es donde
muchos cierres se atoran y donde más valor agrega la automatización. Implica formularios,
documentos de la empresa (constancias fiscales, datos bancarios, etc.), validaciones y
plazos del cliente, y varía por país. El agente arma el paquete de alta, **llena formularios**
con un perfil de empresa reusable (por país), da seguimiento al estatus y avisa de cada
bloqueo. Es una de las automatizaciones de mayor ROI.
**Etapa 9 — Contrato y firma.** Generación, revisión y firma del contrato (idealmente
e-signature), vinculado a legal. El agente prepara, rutea para firma y da seguimiento;
_legal/la persona_ revisa y firma. Aquí se marca el **cierre ganado**.
**Etapa 10 — Cliente activo y crecimiento.** Onboarding, provisión de licencias, arranque de
servicios, seguimiento de consumo de GCP, renovaciones y expansión. El agente monitorea
uso y consumo, alerta renovaciones y detecta oportunidades de expansión. La relación no
termina en el cierre: empieza otro ciclo.


```
En todo el recorrido conviven dos verdades: las personas llevan la relación y
deciden lo importante; los agentes hacen que el proceso no se caiga, que el
contexto esté siempre completo y que el seguimiento sea impecable.
```
## 7. Agentes con contexto, objetivos (Goals) y ciclos (loops)

La visión no es un chatbot que responde: son agentes que **persiguen resultados**.
**Contexto.** Cada agente opera con la historia completa: la cuenta, su país/ciudad, si es
cliente o partner, el cliente final relacionado, las conversaciones previas por todos los
canales, las oportunidades abiertas y su estado. Nunca arranca de cero.
**Goals (objetivos).** A un agente se le puede asignar un objetivo y dejar que trabaje hacia él.
Por ejemplo: "lleva este lead a demo agendada", "consigue completar el alta de proveedor
con esta cuenta", "reactiva los leads de Colombia que se enfriaron este trimestre". El agente
planea, actúa y reporta avance contra el Goal.
**Loops (ciclos).** Los agentes trabajan en ciclos continuos de seguimiento: revisan el estado,
deciden la siguiente acción (mandar un mensaje, recordar, escalar a una persona), la
ejecutan dentro de sus permisos, y vuelven a evaluar. Un lead sin respuesta dispara un loop
de re-contacto; una oportunidad estancada dispara un loop de alerta; un alta de proveedor
pendiente dispara un loop de seguimiento hasta cerrarse.
**Especialización coordinada.** Conviene pensar en agentes especializados que colaboran,
no en uno monolítico: Inbound/SDR, Calendario, Oportunidad, Propuestas,
Procurement/Legal/Alta, Insight/Reporting, y un Orquestador que enruta la intención
hacia el agente correcto.
**Guardrails.** Los agentes actúan mediante un conjunto acotado y auditable de acciones. Lo
sensible (precio, envío de propuesta, firma) siempre pasa por aprobación humana. Todo
queda registrado y es reversible.

## 8. Operar todo conversando: el MCP server (Claude / Gemini Enterprise /

## Gemini)

Quiero poder **gestionar todo el sistema a través de un MCP server** , desde el agente que
prefiera en el momento —Claude, Gemini Enterprise o Gemini—. El MCP server expone las
capacidades del RT-CRM como herramientas que cualquiera de estos asistentes puede usar,
de modo que el sistema no esté atado a una sola app ni a un solo proveedor de modelo.
Casos de uso ancla de esta operación conversacional:

- "Sube esta grabación de la llamada con [cliente]" → transcribe, resume, extrae
    acuerdos y próximos pasos, **actualiza la oportunidad** y crea tareas.
- "Te reenvío el correo con las notas de Gemini del Meet" → identifica la
    cuenta/oportunidad, actualiza estado y registra próximos pasos.


- "Da de alta a [partner] como partner y relaciona a [cliente final]" → crea las cuentas
    con su tipo, país y ciudad, y las vincula.
- "Agéndame una demo con [prospecto] la próxima semana" → propone horarios,
    agenda, invita y confirma.
- "¿Cómo vamos este mes?" → responde con el estado del pipeline y los cierres (ver §9).
La idea es que operar Random Truffle se sienta como hablar con un colega que tiene todo el
contexto y puede ejecutar.

## 9. La inteligencia del sistema: lo que debo poder preguntar

El sistema debe responder, en lenguaje natural y al instante, preguntas como estas:

- **"¿Cuántos leads traemos?"** — conteo de leads por periodo, con tendencia.
- **"Dame el desglose de leads, oportunidades y cierres."** — el embudo completo con
    números en cada etapa, y comparado contra el periodo anterior.
- **"¿Qué probabilidad de cierre tiene esta oportunidad?"** — un % por oportunidad,
    basado en etapa, antigüedad, señales de la conversación y comportamiento histórico.
- **"¿Cómo viene el cierre del mes?"** — una **probabilidad de cierre general del mes** y
    un forecast (escenarios), con qué deals lo sostienen y cuáles están en riesgo.
- **"¿Cuáles son nuestros mejores canales de adquisición?"** — análisis de atribución:
    qué canal y campaña traen más leads, mejor conversión a oportunidad y a cierre, y
    mejor retorno; cortable por país y por tipo de relación (directo / partner).
- **"¿Cómo vamos en Colombia vs. México?"** — los mismos cortes por geografía.
Detrás de esto: un modelo de datos limpio y bien atribuido (canal, campaña, país, partner,
etapa) y una capa analítica (BigQuery/Looker) que los agentes consultan para responder y,
sobre todo, para **recomendar dónde invertir** para crecer.

## 10. Informe diario y briefings de cuenta

Al dar de alta a un cliente (o partner), quiero poder activar un **informe diario** que me diga,
cada mañana:

- **Cómo vamos:** estado del pipeline, qué se movió, qué está por cerrar y qué está en
    riesgo.
- **Qué necesita mi atención hoy:** deals estancados, altas de proveedor pendientes,
    seguimientos vencidos.
- **Noticias de las empresas con las que tenemos relación:** novedades relevantes de
    nuestras cuentas —sean partners, leads o clientes— para llegar a cada conversación
    con contexto fresco.
Más allá del informe diario global, debe poder generarse un **briefing por cuenta** bajo
demanda ("prepárame para la reunión con [cliente]"): resumen de la relación, estado de la


oportunidad, últimas interacciones y noticias recientes de esa empresa. El informe diario es
un agente que corre solo, con un Goal claro: que yo empiece el día sabiendo exactamente
cómo estamos y qué mover.

## 11. Gestión de calendario

Capacidad de primer nivel, integrada con Google Calendar: el agente ofrece horarios reales,
respeta el huso horario del país del cliente, agenda demos/llamadas con enlace de Meet,
invita y recuerda, reagenda conversacionalmente ("muévelo al jueves"), y vincula cada
evento a la cuenta/oportunidad, registrando el resultado de la reunión con apoyo de las
notas de Gemini o la grabación.

## 12. Modelo de datos conceptual (mapa, no esquema final)

Para alinear el diseño, las entidades principales que el sistema maneja:

- **Cuenta:** empresa cliente y/o partner. Tipo (cliente / partner / ambos), datos
    firmográficos, **país y ciudad** , estatus de relación, AE de GCP asociado si aplica.
- **Relación entre cuentas:** vínculo partner ↔ cliente final (quién contrata a quién, quién
    es el usuario final).
- **Contacto:** persona dentro de una cuenta; rol, canal preferido (WhatsApp/email),
    identidades unificadas.
- **Lead:** entrada sin calificar; conserva origen, UTMs y país; al calificar se
    asocia/convierte a Cuenta + Contacto + Oportunidad.
- **Oportunidad:** el negocio; etapa, monto, **probabilidad de cierre** , fecha estimada,
    país/ciudad, origen/canal, partner asociado, cliente final relacionado, ID del Partner
    Network Hub.
- **Línea de oportunidad:** tipada como Licencia (Nexus/Aura/Prism/Radian) · Servicio
    (Managed/Implementación/Dev) · GCP (Gemini/BigQuery/Cloud Run/Looker/Otros) ·
    Tercero (p. ej. LKMX); con cantidad, precio, costo, margen, recurrencia.
- **Partner:** cuenta de tipo partner; su rol en cada deal (nos contrata y paga / co-vende /
    canal).
- **Actividad:** toda interacción (WhatsApp, email, llamada con transcripción/resumen,
    reunión, acción de agente), atribuible a su autor humano o agente.
- **Tarea / seguimiento:** pendientes con responsable (persona o agente), fecha y estado;
    base de los loops.
- **Goal:** objetivo asignado a un agente, con su estado y progreso.
- **Atribución:** UTMs, fuente, medio, campaña, creativo, landing, click ID, país; ligada
    desde el primer toque.
- **Conversación:** hilo por canal, ligado a contacto/oportunidad.
- **Documento:** propuestas, contratos, paquetes de alta de proveedor, cuestionarios de
    seguridad; con versión y estado.


- **Proceso de alta/cierre:** checklist con sub-estados (compras, seguridad, legal, alta,
    contrato) y responsables.
- **Perfil de empresa reusable:** datos fiscales, bancarios y legales de Random Truffle por
    país, para llenar altas de proveedor automáticamente.

## 13. Integraciones (mapa)

Integración Propósito
Partner Network Hub (GCP) Sincronizar oportunidades de GCP, AE y
estado (partners.cloud.google.com)
WhatsApp Business Canal conversacional central en LATAM;
preservar atribución click-to-WhatsApp
Email (Gmail/Workspace) Conversación y reenvío de notas/correos al
copiloto
Google Calendar Agenda de demos/llamadas con Meet y
recordatorios
Web / Landing / Formularios Captura de leads, UTMs y país
Google Ads / Analytics Atribución de Paid Media (gclid, campañas,
costo por canal)
LinkedIn Inbound de contenido / social selling
E-signature Firma de contratos
GCP Billing Seguimiento de consumo en consolas del
cliente, por servicio
Facturación / ERP Cierre a cobro, por país y moneda
Fuentes de noticias Novedades de cuentas para el informe
diario y briefings
Gemini / Claude (MCP) Operación conversacional del sistema y
cerebro de los agentes

## 14. Métricas que el sistema debe sostener

Pipeline por etapa, monto y probabilidad, con forecast del mes. Ingreso y margen por tipo
de línea (licencias / servicios / GCP / terceros). Atribución por canal y campaña: leads,
conversión a oportunidad y a cierre, y retorno. Todo cortable por **país/ciudad** y por **tipo
de relación** (directo / partner que paga / vía partner). Velocidad del ciclo y cuellos de
botella (sobre todo seguridad/compras/legal/alta). Productividad agéntica: cuánto
resolvieron los agentes vs. las personas. Estado de altas de proveedor y contratos en curso.
Renovaciones y expansión.


## 15. Fases sugeridas (roadmap conceptual)

**Fase 0 — Cimientos.** Modelo de datos núcleo con cuentas (cliente/partner), país/ciudad,
oportunidades, líneas y actividades; capa de servicios/API sobre la que operan los agentes.
Sobre Google Cloud (BigQuery + Cloud Run).
**Fase 1 — Operación conversacional (MCP).** El MCP server y el copiloto interno:
actualizar oportunidades desde lenguaje natural, grabaciones y correos; agendar; y
responder las preguntas de inteligencia (leads, desglose, probabilidad, mejores canales). El
valor inmediato más alto.
**Fase 2 — Inbound agéntico y trazabilidad.** Captura de UTMs/landing/país, unificación
de identidad, agente conversacional en web + WhatsApp + email con calificación, contenido
y nurturing; atribución de punta a punta. Agentes con Goals y loops.
**Fase 3 — Partners y geografía.** Modelo completo de partners (partner que paga + cliente
final relacionado, venta vía partners) y cortes por país; sincronización con el Partner
Network Hub.
**Fase 4 — Cierre, compras/seguridad/legal y alta de proveedor.** Checklists agénticos,
base de conocimiento de cuestionarios de seguridad, automatización del alta de proveedor
por país, e-signature.
**Fase 5 — Informe diario, briefings y crecimiento.** Informe diario, briefings de cuenta
con noticias, monitoreo de consumo, renovaciones y expansión.
Recomendación: priorizar **Fase 1 (operación conversacional/MCP)** y **Fase 2
(inbound agéntico)** sobre los cimientos, porque entregan valor visible rápido y
validan la arquitectura agéntica.

## 16. Preguntas abiertas para el equipo

- Partner Network Hub: ¿hay API/conector para nuestro tier, o arrancamos con un
    puente asistido por agente?
- WhatsApp: ¿proveedor de la API (Meta directo vs. BSP)? Impacta atribución y costos.
- Framework de calificación: ¿BANT, MEDDIC u uno propio de Random Truffle?
- ¿Núcleo desde cero sobre GCP, o un CRM base extensible con la capa agéntica encima?
- Modelo de probabilidad de cierre: ¿reglas por etapa al inicio, evolucionando a un
    modelo aprendido con histórico?
- Multi-país: moneda, impuestos y requisitos de alta por país — ¿cuáles priorizamos
    primero?
- Fuentes de noticias para el informe diario: ¿qué fuentes y con qué profundidad?
- Política de aprobación humana: ¿qué acciones agénticas requieren visto bueno y de
    quién?


_Documento vivo. Siguiente paso: convertir esta visión en un plan de Fase 0–1 y un primer
diseño del MCP server._