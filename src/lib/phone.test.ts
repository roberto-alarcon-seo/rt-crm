import { describe, it, expect } from "vitest";
import {
  normalizePhoneInput, parsePhoneValue, clampPhoneDigits, formatPhoneForDisplay,
} from "@/lib/phone";

describe("normalizePhoneInput", () => {
  it("acepta un número con espacios sin perder dígitos", () => {
    // El bug reportado: el maxLength del input cortaba el pegado en 10
    // caracteres, así que "55 1234 5678" entraba como 8 dígitos.
    expect(normalizePhoneInput("55 1234 5678", "+52")).toEqual({ code: "+52", digits: "5512345678" });
  });

  it("acepta paréntesis y guiones", () => {
    expect(normalizePhoneInput("(55) 1234-5678", "+52")).toEqual({ code: "+52", digits: "5512345678" });
    expect(normalizePhoneInput("55.1234.5678", "+52")).toEqual({ code: "+52", digits: "5512345678" });
  });

  it("entiende el código de país pegado y ajusta el selector", () => {
    expect(normalizePhoneInput("+52 55 1234 5678", "+52")).toEqual({ code: "+52", digits: "5512345678" });
    expect(normalizePhoneInput("+57 300 123 4567", "+52")).toEqual({ code: "+57", digits: "3001234567" });
    expect(normalizePhoneInput("+51 987 654 321", "+52")).toEqual({ code: "+51", digits: "987654321" });
    expect(normalizePhoneInput("+1 (555) 123-4567", "+52")).toEqual({ code: "+1", digits: "5551234567" });
  });

  it("entiende el prefijo internacional 00", () => {
    expect(normalizePhoneInput("00 52 55 1234 5678", "+52")).toEqual({ code: "+52", digits: "5512345678" });
  });

  it("quita el 1 que WhatsApp mete en los números de México", () => {
    expect(normalizePhoneInput("+52 1 55 1234 5678", "+52")).toEqual({ code: "+52", digits: "5512345678" });
    expect(normalizePhoneInput("5215512345678", "+52")).toEqual({ code: "+52", digits: "5512345678" });
  });

  it("entiende el código sin + cuando el largo cuadra", () => {
    expect(normalizePhoneInput("52 55 1234 5678", "+52")).toEqual({ code: "+52", digits: "5512345678" });
    expect(normalizePhoneInput("573001234567", "+52")).toEqual({ code: "+57", digits: "3001234567" });
  });

  it("no confunde un celular nacional con un código de país", () => {
    // 5512345678 es un celular válido de CDMX: no debe leerse como +55 + 8 dígitos.
    expect(normalizePhoneInput("5512345678", "+52")).toEqual({ code: "+52", digits: "5512345678" });
    expect(normalizePhoneInput("5712345678", "+52")).toEqual({ code: "+52", digits: "5712345678" });
  });

  it("recorta al largo del país", () => {
    expect(normalizePhoneInput("551234567899999", "+52").digits).toBe("5512345678");
    expect(normalizePhoneInput("987654321000", "+51").digits).toBe("987654321");
  });

  it("tolera texto vacío o basura", () => {
    expect(normalizePhoneInput("", "+52")).toEqual({ code: "+52", digits: "" });
    expect(normalizePhoneInput("   ", "+57")).toEqual({ code: "+57", digits: "" });
    expect(normalizePhoneInput("no es un teléfono", "+52")).toEqual({ code: "+52", digits: "" });
  });

  it("respeta el país seleccionado mientras se escribe dígito a dígito", () => {
    expect(normalizePhoneInput("5", "+51")).toEqual({ code: "+51", digits: "5" });
    expect(normalizePhoneInput("98765", "+51")).toEqual({ code: "+51", digits: "98765" });
  });
});

describe("parsePhoneValue", () => {
  it("separa código y dígitos de un valor guardado", () => {
    expect(parsePhoneValue("+525512345678")).toEqual({ code: "+52", digits: "5512345678" });
    expect(parsePhoneValue("+51987654321")).toEqual({ code: "+51", digits: "987654321" });
    expect(parsePhoneValue("+15551234567")).toEqual({ code: "+1", digits: "5551234567" });
  });

  it("cae al default cuando no hay código conocido", () => {
    expect(parsePhoneValue("5512345678")).toEqual({ code: "+52", digits: "5512345678" });
    expect(parsePhoneValue("")).toEqual({ code: "+52", digits: "" });
  });
});

describe("formatPhoneForDisplay", () => {
  it("agrupa el número para leerlo", () => {
    expect(formatPhoneForDisplay("+525512345678")).toBe("+52 55 1234 5678");
    expect(formatPhoneForDisplay("+526561234567")).toBe("+52 656 123 4567"); // lada de 3
    expect(formatPhoneForDisplay("+573001234567")).toBe("+57 300 123 4567");
    expect(formatPhoneForDisplay("+51987654321")).toBe("+51 987 654 321");
    expect(formatPhoneForDisplay("+15551234567")).toBe("+1 555 123 4567");
  });

  it("lo que formatea se puede volver a pegar sin perder dígitos", () => {
    const guardado = "+525512345678";
    const mostrado = formatPhoneForDisplay(guardado);
    const vuelta = normalizePhoneInput(mostrado, "+52");
    expect(vuelta.code + vuelta.digits).toBe(guardado);
  });

  it("deja intacto lo que no cuadra, en vez de inventar grupos", () => {
    expect(formatPhoneForDisplay("01 800 123 4567")).toBe("01 800 123 4567");
    expect(formatPhoneForDisplay("+52 55 1234 5678 ext 12")).toBe("+52 55 1234 5678 ext 12");
    expect(formatPhoneForDisplay("")).toBe("");
    expect(formatPhoneForDisplay(null)).toBe("");
    expect(formatPhoneForDisplay(undefined)).toBe("");
  });
});

describe("clampPhoneDigits", () => {
  it("recorta al cambiar a un país con menos dígitos", () => {
    expect(clampPhoneDigits("5512345678", "+51")).toBe("551234567");
    expect(clampPhoneDigits("987654321", "+52")).toBe("987654321");
  });
});
