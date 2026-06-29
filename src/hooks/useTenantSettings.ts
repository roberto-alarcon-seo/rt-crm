import { useAuth } from '@/contexts/AuthContext';

export interface CreditTypeOption {
  value: string;
  label: string;
}

export interface TenantSettings {
  timezone: string;
  currency: string;
  currency_symbol: string;
  locale: string;
  country_code: string;
  phone_prefix: string;
  credit_types: CreditTypeOption[];
}

const MEXICO_DEFAULTS: TenantSettings = {
  timezone: 'America/Mexico_City',
  currency: 'MXN',
  currency_symbol: '$',
  locale: 'es-MX',
  country_code: 'MX',
  phone_prefix: '+52',
  credit_types: [
    { value: 'INFONAVIT', label: 'Infonavit' },
    { value: 'COFINAVIT', label: 'Cofinavit' },
    { value: 'FOVISSSTE', label: 'Fovissste' },
    { value: 'ISFAM',     label: 'ISFAM' },
    { value: 'CFE',       label: 'CFE' },
    { value: 'BANK',      label: 'Bancario' },
    { value: 'CASH',      label: 'Contado' },
  ],
};

export function useTenantSettings(): TenantSettings {
  const { tenant } = useAuth();
  const raw = (tenant as any)?.settings as Partial<TenantSettings> | undefined;

  if (!raw || Object.keys(raw).length === 0) return MEXICO_DEFAULTS;

  return {
    timezone:        raw.timezone        ?? MEXICO_DEFAULTS.timezone,
    currency:        raw.currency        ?? MEXICO_DEFAULTS.currency,
    currency_symbol: raw.currency_symbol ?? MEXICO_DEFAULTS.currency_symbol,
    locale:          raw.locale          ?? MEXICO_DEFAULTS.locale,
    country_code:    raw.country_code    ?? MEXICO_DEFAULTS.country_code,
    phone_prefix:    raw.phone_prefix    ?? MEXICO_DEFAULTS.phone_prefix,
    credit_types:    Array.isArray(raw.credit_types) && raw.credit_types.length > 0
      ? raw.credit_types
      : MEXICO_DEFAULTS.credit_types,
  };
}

export function useCreditTypeLabel(): (value: string | null | undefined) => string {
  const { credit_types } = useTenantSettings();
  return (value) => {
    if (!value) return '—';
    return credit_types.find((c) => c.value === value)?.label ?? value;
  };
}
