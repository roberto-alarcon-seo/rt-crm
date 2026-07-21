import { describe, it, expect } from "vitest";
import { CHANGELOG, CHANGE_TYPE_LABELS, ChangeType } from "@/data/changelog";
import { APP_VERSION, APP_BUILD_DATE } from "@/version";

/**
 * El proceso dice que en CADA commit hay que subir APP_VERSION y agregar la
 * entrada correspondiente en el changelog. Un comentario no basta para que eso
 * se cumpla: estas pruebas hacen que se note cuando se olvida.
 */
describe("changelog", () => {
  it("la entrada más reciente coincide con APP_VERSION", () => {
    expect(CHANGELOG[0].version).toBe(APP_VERSION);
  });

  it("la fecha de la entrada más reciente coincide con APP_BUILD_DATE", () => {
    expect(CHANGELOG[0].date).toBe(APP_BUILD_DATE);
  });

  it("no hay versiones repetidas", () => {
    const versions = CHANGELOG.map(r => r.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("está ordenado del más reciente al más viejo", () => {
    const dates = CHANGELOG.map(r => r.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it("las versiones van en orden semver descendente", () => {
    const toParts = (v: string) => v.split(".").map(Number);
    for (let i = 0; i < CHANGELOG.length - 1; i++) {
      const [aMaj, aMin, aPat] = toParts(CHANGELOG[i].version);
      const [bMaj, bMin, bPat] = toParts(CHANGELOG[i + 1].version);
      const a = aMaj * 1e6 + aMin * 1e3 + aPat;
      const b = bMaj * 1e6 + bMin * 1e3 + bPat;
      expect(a, `${CHANGELOG[i].version} debe ser mayor que ${CHANGELOG[i + 1].version}`)
        .toBeGreaterThan(b);
    }
  });

  it("cada release tiene al menos un cambio", () => {
    for (const r of CHANGELOG) {
      expect(r.changes.length, `v${r.version} no tiene cambios`).toBeGreaterThan(0);
    }
  });

  it("las fechas están en formato YYYY-MM-DD y son válidas", () => {
    for (const r of CHANGELOG) {
      expect(r.date, `v${r.version}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(r.date).getTime()), `v${r.version}`).toBe(false);
    }
  });

  it("todos los tipos de cambio son conocidos y tienen etiqueta", () => {
    const known = Object.keys(CHANGE_TYPE_LABELS) as ChangeType[];
    for (const r of CHANGELOG) {
      for (const c of r.changes) {
        expect(known, `v${r.version}: tipo "${c.type}" desconocido`).toContain(c.type);
      }
    }
  });

  it("las descripciones no están vacías ni son un placeholder", () => {
    for (const r of CHANGELOG) {
      for (const c of r.changes) {
        expect(c.description.trim().length, `v${r.version}`).toBeGreaterThan(10);
        expect(c.description.toLowerCase()).not.toMatch(/^(tbd|todo|pendiente|wip)\b/);
      }
    }
  });
});
