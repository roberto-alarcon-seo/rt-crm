import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PHONE_CODES, parsePhoneValue, normalizePhoneInput, clampPhoneDigits, phoneCodeInfo,
} from "@/lib/phone";
import { cn } from "@/lib/utils";

interface PhoneFieldProps {
  /** Valor completo tal como se guarda: "+525512345678". "" cuando no hay teléfono. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  /** Avisa cuando el número no tiene el largo del país. Default: true. */
  hint?: boolean;
  className?: string;
}

/**
 * Selector de país + campo de dígitos, con pegado tolerante.
 *
 * Acepta lo que sea que traiga el portapapeles ("55 1234 5678",
 * "+52 55 1234 5678", "0052…", "(55) 1234-5678") sin perder dígitos, y si el
 * número viene con código de país mueve el selector solo. El valor que emite
 * siempre es `${código}${dígitos}`, o "" cuando el campo queda vacío.
 */
export function PhoneField({
  value, onChange, id, disabled, hint = true, className,
}: PhoneFieldProps) {
  const parsed = parsePhoneValue(value ?? "");
  // Con el campo vacío no hay de dónde deducir el país: se recuerda el último
  // elegido para que borrar y reescribir no lo devuelva al default.
  const [lastCode, setLastCode] = useState<string | null>(null);
  const code = value ? parsed.code : (lastCode ?? parsed.code);
  const info = phoneCodeInfo(code);

  const emit = (nextCode: string, nextDigits: string) => {
    setLastCode(nextCode);
    onChange(nextDigits ? nextCode + nextDigits : "");
  };

  const incomplete = parsed.digits.length > 0 && parsed.digits.length !== info.digits;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex gap-2">
        <Select
          value={code}
          disabled={disabled}
          onValueChange={c => emit(c, clampPhoneDigits(parsed.digits, c))}
        >
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PHONE_CODES.map(pc => (
              <SelectItem key={pc.code} value={pc.code}>{pc.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          value={parsed.digits}
          disabled={disabled}
          placeholder={`${info.digits} dígitos`}
          inputMode="tel"
          className="flex-1"
          onChange={e => {
            // Sin maxLength: el pegado se limpia acá (separadores, +52,
            // prefijo 00) para no perder dígitos por el camino.
            const next = normalizePhoneInput(e.target.value, code);
            emit(next.code, next.digits);
          }}
        />
      </div>
      {hint && incomplete && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {info.country} usa {info.digits} dígitos — llevas {parsed.digits.length}.
        </p>
      )}
    </div>
  );
}
