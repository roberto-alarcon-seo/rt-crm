# RT-CRM — Checklist de verificación del Setup de Contenido

**Versión de la app:** 1.10.1 · **Fecha:** 11 de agosto de 2026
**Referencia:** `RT-CRM_Setup_Contenido_v0.1_1.md` (Lukas Canal, CEO)

Este documento es para **revisar en pantalla** que lo que pedía el documento de setup quedó aplicado. Cada fila dice qué revisar, dónde, y qué deberías ver. Los `§` remiten a la sección del documento original.

## Antes de empezar

1. Entra al CRM y mira la **barra lateral, abajo**: debe decir **`v1.10.1 · 2026-08-11`**.
2. Si dice `v1.5.2`, la app es una PWA y tu navegador tiene guardada la versión anterior: haz **Ctrl+Shift+R** (o cierra y vuelve a abrir la pestaña).
3. Las rutas se escriben después del dominio. Ejemplo: `/settings/ai-config`.
4. Varias pantallas de configuración piden rol **Administrador**.

---

## 1. Agente IA General — `/settings/ai-config`

| ☐ | Qué revisar | Respuesta esperada |
|---|---|---|
| ☐ | Identidad del agente (pestaña **Identidad**) | Nombre **Ruffle**, empresa **Random Truffle** · §2.1 |
| ☐ | Interruptor "Nunca revelar que es IA" | **Apagado**. El agente se presenta como agente de AI: es argumento de venta · §0.1 |
| ☐ | Instrucciones (pestaña **Instrucciones**) | El bloque completo del §2.2, empezando por `IDENTIDAD / Eres Ruffle, el agente comercial de AI…` |
| ☐ | Estilo (pestaña **Estilo**) | Largo máximo **320** caracteres · Emojis **encendido, máximo 1** · Retraso **2 s** · Usar nombre del cliente **encendido** · §2.3 |
| ☐ | Mensaje de escalamiento | "Enseguida te conecto con alguien del equipo comercial." Sin la palabra "asesor" · §0.4 |
| ☐ | Plantillas de prompt para la región | Ya **no está vacía**: trae "Ruffle — Agente comercial B2B" |
| ☐ | Botón **Probar conversación** → escribe *"¿cuánto cuesta?"* | Se presenta como agente de AI, **no da cifras**, y ofrece agendar 30 minutos · §6.9 |
| ☐ | En la misma prueba → *"ya trabajo con una agencia, ¿esto cómo encaja?"* | Responde que la mayoría de clientes trabajan con agencias y siguen haciéndolo · §6.9 |
| ☐ | En la misma prueba → *"prefiero hablar con una persona"* | Escala de inmediato y marca la conversación para atención humana · §2.4 |

## 2. Agente SDR — `/settings/sdr-agent`

| ☐ | Qué revisar | Respuesta esperada |
|---|---|---|
| ☐ | La pantalla guarda | Cambia un valor, pulsa **Guardar configuración**, **recarga la página**: el cambio sigue ahí. Antes se perdía todo al recargar |
| ☐ | Criterios de Calificación con peso | 6 criterios con pesos **20 / 20 / 20 / 15 / 15 / 10** y la leyenda **100 / 100** en verde · §3.2 |
| ☐ | Aviso de suma incorrecta | Sube un peso a 25: la etiqueta cambia a **105 / 100** en ámbar |
| ☐ | Umbrales de score | Lead caliente **≥ 70**, nurturing **≥ 40**, proponer demo en **48 h** · §3.2 |
| ☐ | Productos y servicios | 8 fichas **editables**. Nexus = *"Tu equipo de analytics y medición…"*, Aura = *"…estrategia de audiencias…"*, Prism = *"Tu estudio de contenido…"*, Radian = *"…operación de medios…"* · §3.3 |
| ☐ | Instrucciones del Agente | El texto del §3.4, con el mapeo dolor → puerta de entrada |
| ☐ | Botón **Probar conversación** → *"mis reportes tardan semanas y no puedo probarle el ROI al CFO"* | Propone **Nexus** y hace **una sola** pregunta de calificación · §3.4 |

## 3. Agente de Oportunidades — `/settings/opportunity-agent`

| ☐ | Qué revisar | Respuesta esperada |
|---|---|---|
| ☐ | La pantalla guarda | Cambia un valor, guarda, recarga: se conserva. Antes no escribía nada |
| ☐ | Umbrales de tiempo | Sin actividad **7** días · Sin avance **14** días · Recordatorio de propuesta cada **3** días · §4.1 |
| ☐ | Los 4 loops | Los cuatro **encendidos**, incluido **"Loop de recordatorio de propuesta"**, que el documento pedía activar · §4.1 |
| ☐ | Los interruptores son reales | Apaga uno, guarda, recarga: sigue apagado |
| ☐ | Interruptor **Agente activo** | **Apagado** por ahora. Enciéndelo cuando quieran que empiece a trabajar sobre el pipeline real |

## 4. Agente de Seguimiento — `/settings/followup-agent`

| ☐ | Qué revisar | Respuesta esperada |
|---|---|---|
| ☐ | La pantalla abre | Abre su propia pantalla. Antes el menú te mandaba al Agente de Oportunidades y esta configuración era inalcanzable |
| ☐ | Cadencia en días (pestaña **Calendario**) | Existen opciones de **2, 3, 5, 7, 12 y 30 días**, no solo horas · §4.2 |
| ☐ | Aviso de plantilla obligatoria | Elige **2 días** en un recordatorio: aparece un selector de **Plantilla de WhatsApp** y, si está vacío, un aviso en rojo de que no se enviará |
| ☐ | Franja de envío | **Desde 9 h — Hasta 19 h**, con la nota de que se usa la hora local del contacto · §4.2 |

> **Por qué la plantilla es obligatoria:** pasadas 24 horas desde el último mensaje del cliente, WhatsApp solo permite enviar plantillas aprobadas por Meta. Un recordatorio a los 2 días sin plantilla sería rechazado, así que el sistema lo avisa en lugar de fallar en silencio.

## 5. Base de Conocimiento — `/settings/knowledge-base`

| ☐ | Qué revisar | Respuesta esperada |
|---|---|---|
| ☐ | Colecciones | **10**: Empresa, Plataforma, Nexus, Aura, Prism, Radian, Servicios, GCP, Implementación y Seguridad, Comercial · §6 |
| ☐ | Nombre corregido | Dice **Prism**, no "Prisim" · §0.3 |
| ☐ | Contenido cargado | **49 entradas activas**: las 47 del documento más 2 que el equipo ya había escrito (ver *Decisiones pendientes*) |
| ☐ | Tono de la entrada de la DAM | En **Prism**, la respuesta activa sobre Google Drive / SharePoint dice que *"son excelentes para archivos"*. La versión anterior, que llamaba a Drive "un cementerio de archivos", quedó **desactivada** · §0.5 |
| ☐ | Tono de la entrada de Radian | La respuesta activa sobre PMax / Advantage+ dice que *"no ven lo que pasa afuera"*. La anterior, que afirmaba que *"Meta va a querer que gastes todo en Meta"*, quedó **desactivada** · §0.5 |
| ☐ | Tipos de entrada | Se distinguen **Info** y **Q&A** · §6 |

## 6. Widget Web — `/settings/widget`

| ☐ | Qué revisar | Respuesta esperada |
|---|---|---|
| ☐ | Personalización | Nombre **Ruffle** · Subtítulo **"Tu equipo autónomo de marketing"** · Pie **Random Truffle** · Posición inferior derecha · §1 |
| ☐ | Mensaje de bienvenida | *"¡Hola! Soy Ruffle, el agente de AI del equipo de Random Truffle. Cuéntame qué te trae por aquí — ¿medición, audiencias, contenido o medios? Yo te oriento."* · §1 |
| ☐ | Píldoras de sugerencias | **6**, empezando por "¿Qué es Random Truffle?". **No** debe aparecer "¿Cuáles son sus precios?" · §1 |
| ☐ | Píldoras de producto | **4**: Aura (morado), Nexus (teal), Prism (naranja), Radian (verde lima), cada una con su liga a `randomtruffle.com/agents/…` · §1 |
| ☐ | Botones de acción | **2**: "Agendar demo" y "Conoce a los agentes" · §1 |
| ☐ | La configuración guarda | Cambia algo, guarda, recarga: se conserva. Antes esta pantalla no podía guardar |
| ☐ | El widget captura leads | En el sitio web, conversa y deja tus datos: **el contacto aparece** en `/contacts`. Antes la conversación funcionaba pero el lead nunca se guardaba |
| ☐ | Aviso de datos en el chat | Al pie del chat aparece el texto de consentimiento y la liga al aviso de privacidad · §7.3 |

## 7. Librería de Plantillas — `/settings/templates`

| ☐ | Qué revisar | Respuesta esperada |
|---|---|---|
| ☐ | Plantillas cargadas | **7**, en estado **Borrador** · §5 |
| ☐ | Agrupadas correctamente | Bajo **🏠 Bienvenida (1)**, **📅 Citas (2)** y **🔁 Seguimiento (4)**. Ninguna en "Sin grupo" |
| ☐ | Variables detectadas | Cada plantilla muestra sus variables, p. ej. `{{nombre}}`, `{{origen}}`, `{{comercial}}`, `{{liga}}` |
| ☐ | Etiquetas al crear una nueva | El formulario ofrece Bienvenida, Seguimiento, Citas, Documentación y Post-venta — las mismas con las que agrupa la lista |
| ☐ | **Acción pendiente** | Enviarlas a **aprobación de Meta**. Hasta que estén aprobadas no se pueden usar en campañas ni en la cadencia de días · §9.8 |

## 8. Leads y pipeline

| ☐ | Qué revisar | Ruta | Respuesta esperada |
|---|---|---|---|
| ☐ | Campos personalizados | `/settings/contact-fields` | **10** campos: País, Ciudad, Tipo de relación, Partner asociado, AE de Google Cloud, Canal de origen, Interés principal, Tamaño de empresa, Presupuesto, Urgencia · §7.1 |
| ☐ | Listas con sus valores | `/settings/contact-fields` | "Interés principal" ofrece Nexus, Aura, Prism, Radian, Plataforma completa, Servicios RT, Servicios GCP y Consolas GCP · §7.1 |
| ☐ | Etapas del pipeline | `/settings/pipelines` | **11 etapas** del proceso: Nuevo lead, En calificación, Calificado, Demo agendada, Demo realizada, Oportunidad abierta, Propuesta enviada, Negociación, Compras / Legal / Alta de proveedor, Ganado — Firma, Cliente activo · §7.2 |
| ☐ | Estados laterales | `/settings/pipelines` | **Nurturing** y **Perdido** al final del listado, después de las 11 · §7.2 |
| ☐ | La pantalla no se cuelga | `/settings/pipelines` | Abre y responde con normalidad. Antes entraba en un ciclo infinito y se congelaba |
| ☐ | Tablero | `/pipeline` | Las 13 columnas en orden, y las oportunidades existentes en su etapa correcta |
| ☐ | Asignación de leads | `/settings/assignment-rules` | Round Robin y Sticky Agent, timeout **30 min** → notificar al manager, tope de **25** leads activos por comercial · §7.4 |
| ☐ | Sin lenguaje inmobiliario | `/settings/assignment-rules` | Dice **comercial**, nunca "asesor" ni "inmueble". El orden de evaluación es *Sticky Agent → Round Robin → Fallback* · §0.4 |

## 9. Calificación de leads

| ☐ | Qué revisar | Ruta | Respuesta esperada |
|---|---|---|---|
| ☐ | Score con su razón | `/contacts` → abre un contacto | En la sección de calificación hay un bloque **"Razón del score"** con el motivo y quién lo calculó · §3.2 |
| ☐ | Recalificar | Ficha del contacto → **Recalificar con IA** | Actualiza score y temperatura, y escribe la razón. Un lead con empresa grande, presupuesto y urgencia debe salir alto |
| ☐ | Aviso de lead caliente | `/followups` | Al superar 70, aparece un seguimiento para el comercial con el score y el motivo, y con fecha a 48 h · §3.2 |

## 10. Consentimiento — `/settings/consent`

| ☐ | Qué revisar | Respuesta esperada |
|---|---|---|
| ☐ | Las reglas guardan | Pestaña **Reglas automáticas**: cambia algo, guarda, recarga: se conserva. Antes decía "guardado" sin escribir nada |
| ☐ | Palabras de baja | Incluye **baja**, stop, cancelar, no molestar · §7.3 |
| ☐ | Probador de mensajes | Escribe **"BAJA"** → avisa que daría de baja. Escribe **"podemos bajarle al presupuesto?"** → avisa que **no** daría de baja |
| ☐ | Texto de consentimiento | El texto del §7.3, con `www.randomtruffle.com/privacy` y `privacy@randomtruffle.com` |
| ☐ | **Acción pendiente** | Confirmar que esa liga y ese correo existen antes de publicarlos, como pide el documento · §7.3 |

## 11. Marca y vocabulario

| ☐ | Qué revisar | Ruta | Respuesta esperada |
|---|---|---|---|
| ☐ | Pantalla de acceso | cerrar sesión | Ya **no** dice "CRM Inmobiliario Enterprise" ni muestra un testimonial de MLS LATAM · §0.4 |
| ☐ | Nombre del rol | `/settings/team` | El rol se llama **Comercial**, no "Asesor" · §0.4 |
| ☐ | Columnas y filtros | `/contacts` y `/events` | La columna dice **Comercial** · §0.4 |
| ☐ | Novedades | `/changelog` | Las versiones 1.5.3 a 1.10.1 con el detalle de todo lo aplicado |

---

## Lo que todavía no se puede verificar

| Tema | Por qué | Qué falta |
|---|---|---|
| Baja por WhatsApp ("BAJA") | No hay número de WhatsApp conectado en producción | Conectar el número en `/settings/whatsapp`. La lógica está probada y cubierta con pruebas automáticas |
| Cadencia de 2 / 5 / 12 días enviando de verdad | Requiere las plantillas **aprobadas por Meta** | Enviar las 7 plantillas a aprobación y configurar la cadencia |
| Atribución de campañas por WhatsApp | Requiere el número conectado | El generador de enlaces está en `/settings/whatsapp` y funciona; falta el canal |

## Decisiones pendientes del equipo

1. **Entradas duplicadas en la Base de Conocimiento.** El equipo ya había escrito su propia versión de 4 preguntas el 8 de julio, y ahora conviven con las del documento.

   - **Ya resueltas por el §0.5:** las de **Prism** y **Radian** quedaron **desactivadas** porque su tono era justo el que el documento manda corregir — una llamaba a Google Drive *"un cementerio de archivos"* (la frase que el §0.5 cita textualmente) y la otra afirmaba que *"Meta va a querer que gastes todo en Meta, y Google en Google"*, que atribuye intenciones a empresas con nombre y el §2.2 prohíbe. **No se borraron:** el texto original sigue guardado y se puede reactivar desde la pantalla si el equipo no está de acuerdo.
   - **Pendientes de decidir:** las de **Nexus** (Google Analytics / PowerBI) y **Aura** (estrategia de audiencias) siguen **activas**. Su tono es correcto; son simplemente otra redacción de lo mismo. Conviene quedarse con una de cada par para que el agente no tenga dos respuestas para la misma pregunta, pero elegir cuál es una decisión de contenido del equipo.
   - **Detalle menor:** las 4 empiezan su respuesta con `A: `, un resto de haberse copiado de un documento de preguntas y respuestas. Conviene quitarlo para que el agente no lo repita en el chat.

2. **Cuándo encender los agentes.** El Agente IA General y el widget están **activos**. El **Agente SDR** y el **Agente de Oportunidades** están **apagados** a propósito: en cuanto se encienda el de Oportunidades empezará a crear recordatorios y a recalcular probabilidades sobre las oportunidades reales.

3. **Dominio del CRM.** La configuración apunta a `crm.randomtruffle.com`, que hoy no existe en DNS. No rompe nada porque el sistema recae en la marca de Random Truffle por defecto, pero conviene registrar el dominio real.

## Cómo se verificó

- **Base de datos y funciones de servidor:** 44 comprobaciones automáticas contra producción (43 correctas; la restante fue el conteo de entradas de la Base de Conocimiento, que salió más alto de lo esperado por el contenido previo del equipo — de ahí salió el hallazgo del §0.5).
- **Comportamiento real en producción:** calificación de un lead de prueba, una pasada controlada del Agente de Oportunidades, el bloqueo por consentimiento, y una conversación real contra el widget público. Todos los datos de prueba se borraron: producción quedó con sus 227 contactos y 224 oportunidades originales.
- **Pantallas:** verificadas en el ambiente de desarrollo con el mismo código que ahora está en producción. Este checklist sirve para confirmarlas en producción.
- **Automatizado:** 53 pruebas unitarias, revisión de tipos y compilación de producción, todo en verde.
- Se dejó un respaldo previo al despliegue en el esquema `backup_setup_20260811`; se puede borrar cuando el equipo esté conforme.
