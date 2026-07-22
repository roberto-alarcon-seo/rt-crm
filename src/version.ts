// Versión de la app — sirve para llevar orden de los cambios.
// PROCESO: actualizar en CADA commit. Bump de patch por cambio normal,
// minor por una funcionalidad nueva, major por un cambio grande/ruptura.
// Mantener APP_BUILD_DATE en formato YYYY-MM-DD.
//
// OJO: junto con este archivo hay que agregar la entrada de la versión en
// src/data/changelog.ts. `npm test` falla si ambos no coinciden.
export const APP_VERSION = "1.4.0";
export const APP_BUILD_DATE = "2026-07-22";
