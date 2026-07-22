/**
 * Historial de cambios de la aplicación.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  PROCESO — EN CADA COMMIT HAY QUE TOCAR DOS COSAS:
 *
 *  1. src/version.ts    → subir APP_VERSION y APP_BUILD_DATE
 *  2. este archivo      → agregar la entrada de esa versión ARRIBA del todo
 *
 *  Un commit sin su entrada aquí deja la página de novedades mintiendo, que es
 *  peor que no tenerla. La versión de la entrada más reciente debe coincidir
 *  siempre con APP_VERSION.
 *
 *  Tipos de cambio:
 *    feature      funcionalidad nueva
 *    improvement  mejora de algo que ya existía (UX, rendimiento, claridad)
 *    fix          corrección de un defecto
 *    security     permisos, aislamiento entre tenants, datos sensibles
 *    internal     refactor, tooling, esquema — sin efecto visible para el usuario
 *
 *  Redacta desde lo que el usuario ve, no desde el archivo que tocaste.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ChangeType = "feature" | "improvement" | "fix" | "security" | "internal";

export interface ChangeEntry {
  type: ChangeType;
  /** Módulo afectado: "Empresas", "Inbox", "Campañas"… */
  area?: string;
  /** Qué cambió, en una frase, desde el punto de vista de quien lo usa. */
  description: string;
}

export interface Release {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  /** Titular opcional para las versiones grandes. */
  headline?: string;
  changes: ChangeEntry[];
}

/** Releases del más reciente al más viejo. La primera debe ser APP_VERSION. */
export const CHANGELOG: Release[] = [
  {
    version: "1.3.0",
    date: "2026-07-21",
    headline: "Pipelines dinámicos",
    changes: [
      {
        type: "feature",
        area: "Oportunidades",
        description:
          "El módulo de Oportunidades ahora usa pipelines dinámicos: cada tarjeta es una oportunidad con monto, probabilidad, contacto y empresa, y se arrastra entre etapas (drag & drop). Un mismo contacto puede tener varias oportunidades en distintos pipelines a la vez (Software, Nube de Google, Marketing, etc.).",
      },
      {
        type: "feature",
        area: "Configuración",
        description:
          "Nueva sección Configuración › Pipelines (solo administradores): crea y edita pipelines y sus etapas —nombre, color, tipo (en proceso/ganada/perdida) y probabilidad— y reordena las etapas arrastrándolas.",
      },
      {
        type: "feature",
        area: "Contactos",
        description:
          "La ficha de contacto tiene una nueva pestaña Oportunidades donde ves y creas los negocios de ese contacto en cualquier pipeline.",
      },
      {
        type: "internal",
        area: "Oportunidades",
        description:
          "Nuevas tablas pipelines y pipeline_stages por tenant; la tabla opportunities pasa a etapa dinámica. Los eventos de Meta Pixel/CAPI y las conversiones siguen funcionando vía el espejo de etapa en el contacto.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-07-21",
    headline: "Página de novedades",
    changes: [
      {
        type: "feature",
        area: "General",
        description:
          "Nueva página de novedades: al hacer clic en el número de versión de la barra lateral se abre el historial completo de cambios, del más reciente al más antiguo.",
      },
      {
        type: "feature",
        area: "General",
        description:
          "Los cambios se pueden filtrar por tipo: nuevo, mejoras, correcciones, seguridad e interno.",
      },
      {
        type: "internal",
        description:
          "Pruebas automáticas que fallan si un commit sube la versión sin registrar sus cambios, o si el historial queda desordenado.",
      },
      {
        type: "fix",
        description:
          "Faltaba src/test/setup.ts aunque vite.config.ts lo referenciaba: la suite de pruebas no podía arrancar.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-07-21",
    headline: "Módulo de empresas a nivel enterprise",
    changes: [
      {
        type: "feature",
        area: "Empresas",
        description:
          "Razón social y datos fiscales completos (RFC, régimen y dirección fiscal) para contratos y facturación.",
      },
      {
        type: "feature",
        area: "Empresas",
        description:
          "Documentos adjuntos por empresa sin límite de cantidad: PDF, imágenes, Office y ZIP de hasta 50 MB, con ver, descargar y eliminar.",
      },
      {
        type: "feature",
        area: "Empresas",
        description:
          "Account Executives en dos pasos — primero la organización (Google Cloud, AWS, Oracle, Salesforce…) y luego sus ejecutivos. Una empresa puede tener AEs de varias organizaciones a la vez, con uno marcado como principal.",
      },
      {
        type: "feature",
        area: "Empresas",
        description:
          "Campos firmográficos y comerciales nuevos: facturación anual, número de sedes, grupo corporativo, ticker, año de fundación, tier de cuenta, etapa del ciclo de vida, fuente de origen y owner interno.",
      },
      {
        type: "improvement",
        area: "Empresas",
        description:
          "Rangos de empleados ampliados hasta 100,000+ para poder clasificar corporativos grandes. Los rangos anteriores se siguen mostrando en empresas que ya los tenían.",
      },
      {
        type: "improvement",
        area: "Empresas",
        description:
          "Formulario rediseñado: índice lateral que sigue el scroll, barra de guardado siempre visible con avance de captura, y campos en dos y tres columnas en vez de una sola tira vertical.",
      },
      {
        type: "improvement",
        area: "Empresas",
        description:
          "Secciones reordenadas para que se lean en el orden en que se llenan: primero los hechos de la empresa, después nuestra relación con ella.",
      },
      {
        type: "improvement",
        area: "Empresas",
        description:
          "Aviso al capturar un RFC que ya existe en otra empresa, con enlace directo a ella. No bloquea el guardado.",
      },
      {
        type: "fix",
        area: "Empresas",
        description:
          "Al eliminar una empresa sus documentos quedaban ocupando espacio en almacenamiento para siempre. Ahora se borran junto con ella.",
      },
      {
        type: "security",
        area: "Empresas",
        description:
          "Los documentos viven en un bucket privado y se sirven con enlaces firmados temporales, aislados por tenant.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-08",
    headline: "Primera versión numerada del CRM",
    changes: [
      {
        type: "feature",
        area: "General",
        description: "Sello de versión visible en la barra lateral.",
      },
      {
        type: "feature",
        area: "Empresas",
        description:
          "Importación de contactos asistida por IA, con campos de nombre y apellido y vista de empresas maestro-detalle.",
      },
      {
        type: "feature",
        area: "Empresas",
        description: "Eliminación de empresas con borrado en cascada de todo lo relacionado.",
      },
      {
        type: "fix",
        area: "Empresas",
        description:
          "El emparejamiento de empresas al importar ahora ignora acentos, espacios y puntuación.",
      },
      {
        type: "fix",
        area: "Base de conocimiento",
        description: "Industrias de empresa y mejoras de uso en colecciones y contenido.",
      },
      {
        type: "fix",
        area: "Dashboard",
        description:
          "Pantalla en blanco en Dashboard y Pipeline por un fallo de render, y métricas que mostraban datos incorrectos.",
      },
      {
        type: "fix",
        area: "Empresas",
        description: "Ya se pueden crear empresas y contactos en el CRM B2B.",
      },
      {
        type: "internal",
        description: "Script npm run typecheck y corrección de todos los errores de tipos.",
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-07-02",
    headline: "Widget web, base de conocimiento y marca",
    changes: [
      {
        type: "feature",
        area: "Widget",
        description:
          "Widget de chat web con IA para capturar leads desde sitios externos, con configuración avanzada.",
      },
      {
        type: "feature",
        area: "Base de conocimiento",
        description: "Colecciones y tipos de contenido enriquecido.",
      },
      {
        type: "feature",
        area: "General",
        description: "Iconos de PWA e imagen para compartir en redes.",
      },
      {
        type: "fix",
        area: "General",
        description:
          "Parpadeo de tema al cargar y modo claro roto; logo en la pantalla de acceso.",
      },
      {
        type: "improvement",
        area: "Cuenta",
        description: "Pantalla de activación de cuenta más clara.",
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-06-29",
    headline: "Migración de inmobiliario a CRM B2B",
    changes: [
      {
        type: "feature",
        area: "General",
        description:
          "El producto pasa de CRM inmobiliario a CRM B2B: RT CRM para Random Truffle.",
      },
      {
        type: "internal",
        description:
          "Limpieza profunda de todas las referencias al modelo inmobiliario en los flujos activos.",
      },
    ],
  },
];

/** Release más reciente — el que debe coincidir con APP_VERSION. */
export const LATEST_RELEASE = CHANGELOG[0];

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  feature: "Nuevo",
  improvement: "Mejora",
  fix: "Corrección",
  security: "Seguridad",
  internal: "Interno",
};
