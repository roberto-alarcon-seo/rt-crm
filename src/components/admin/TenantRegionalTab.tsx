import { useEffect, useState } from 'react';
import { Globe, Clock, DollarSign, Phone, Plus, Trash2, Save, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CreditType {
  value: string;
  label: string;
}

interface RegionalSettings {
  timezone: string;
  currency: string;
  currency_symbol: string;
  locale: string;
  country_code: string;
  phone_prefix: string;
  credit_types: CreditType[];
}

const TIMEZONES = [
  { value: 'America/Mexico_City', label: 'Ciudad de México (UTC-6)' },
  { value: 'America/Bogota',      label: 'Bogotá (UTC-5)' },
  { value: 'America/Lima',        label: 'Lima (UTC-5)' },
  { value: 'America/Santiago',    label: 'Santiago (UTC-4/-3)' },
  { value: 'America/Buenos_Aires',label: 'Buenos Aires (UTC-3)' },
  { value: 'America/Sao_Paulo',   label: 'São Paulo (UTC-3)' },
  { value: 'America/Monterrey',   label: 'Monterrey (UTC-6)' },
  { value: 'America/Cancun',      label: 'Cancún (UTC-5)' },
  { value: 'America/New_York',    label: 'Nueva York (UTC-5/-4)' },
  { value: 'America/Los_Angeles', label: 'Los Ángeles (UTC-8/-7)' },
  { value: 'Europe/Madrid',       label: 'Madrid (UTC+1/+2)' },
];

const LOCALES = [
  { value: 'es-MX', label: 'Español México (es-MX)' },
  { value: 'es-CO', label: 'Español Colombia (es-CO)' },
  { value: 'es-AR', label: 'Español Argentina (es-AR)' },
  { value: 'es-PE', label: 'Español Perú (es-PE)' },
  { value: 'es-CL', label: 'Español Chile (es-CL)' },
  { value: 'es-ES', label: 'Español España (es-ES)' },
  { value: 'pt-BR', label: 'Português Brasil (pt-BR)' },
  { value: 'en-US', label: 'English US (en-US)' },
];

const REGIONAL_PRESETS: Record<string, { flag: string; label: string; settings: RegionalSettings }> = {
  MX: {
    flag: '🇲🇽',
    label: 'México',
    settings: {
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
    },
  },
  CO: {
    flag: '🇨🇴',
    label: 'Colombia',
    settings: {
      timezone: 'America/Bogota',
      currency: 'COP',
      currency_symbol: '$',
      locale: 'es-CO',
      country_code: 'CO',
      phone_prefix: '+57',
      credit_types: [
        { value: 'VIS',      label: 'Subsidio VIS' },
        { value: 'VIP',      label: 'Subsidio VIP' },
        { value: 'LEASING',  label: 'Leasing Habitacional' },
        { value: 'BANK',     label: 'Crédito Bancario' },
        { value: 'FONDO',    label: 'Fondo Nacional del Ahorro' },
        { value: 'CASH',     label: 'Contado' },
      ],
    },
  },
  AR: {
    flag: '🇦🇷',
    label: 'Argentina',
    settings: {
      timezone: 'America/Buenos_Aires',
      currency: 'ARS',
      currency_symbol: '$',
      locale: 'es-AR',
      country_code: 'AR',
      phone_prefix: '+54',
      credit_types: [
        { value: 'HIPOTECARIO', label: 'Crédito Hipotecario' },
        { value: 'PRO_CRE_AR', label: 'ProCreAr' },
        { value: 'BANK',       label: 'Bancario' },
        { value: 'CASH',       label: 'Contado' },
      ],
    },
  },
  CL: {
    flag: '🇨🇱',
    label: 'Chile',
    settings: {
      timezone: 'America/Santiago',
      currency: 'CLP',
      currency_symbol: '$',
      locale: 'es-CL',
      country_code: 'CL',
      phone_prefix: '+56',
      credit_types: [
        { value: 'DS19',  label: 'Subsidio DS19' },
        { value: 'DS49',  label: 'Subsidio DS49' },
        { value: 'BANK',  label: 'Crédito Hipotecario' },
        { value: 'CASH',  label: 'Contado' },
      ],
    },
  },
  PE: {
    flag: '🇵🇪',
    label: 'Perú',
    settings: {
      timezone: 'America/Lima',
      currency: 'PEN',
      currency_symbol: 'S/',
      locale: 'es-PE',
      country_code: 'PE',
      phone_prefix: '+51',
      credit_types: [
        { value: 'MIVIVIENDA', label: 'Mi Vivienda' },
        { value: 'TECHO',      label: 'Techo Propio' },
        { value: 'BANK',       label: 'Bancario' },
        { value: 'CASH',       label: 'Contado' },
      ],
    },
  },
  US: {
    flag: '🇺🇸',
    label: 'Estados Unidos',
    settings: {
      timezone: 'America/New_York',
      currency: 'USD',
      currency_symbol: '$',
      locale: 'en-US',
      country_code: 'US',
      phone_prefix: '+1',
      credit_types: [
        { value: 'CONVENTIONAL', label: 'Conventional' },
        { value: 'FHA',          label: 'FHA' },
        { value: 'VA',           label: 'VA Loan' },
        { value: 'CASH',         label: 'Cash' },
      ],
    },
  },
};

const MEXICO_DEFAULTS: RegionalSettings = REGIONAL_PRESETS.MX.settings;

interface TenantRegionalTabProps {
  tenantId: string;
  onUpdate?: () => void;
}

export function TenantRegionalTab({ tenantId, onUpdate }: TenantRegionalTabProps) {
  const [settings, setSettings] = useState<RegionalSettings>(MEXICO_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCreditValue, setNewCreditValue] = useState('');
  const [newCreditLabel, setNewCreditLabel] = useState('');

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();

      if (data?.settings && typeof data.settings === 'object') {
        const s = data.settings as Partial<RegionalSettings>;
        setSettings({
          ...MEXICO_DEFAULTS,
          ...s,
          credit_types: Array.isArray(s.credit_types) && s.credit_types.length > 0
            ? s.credit_types
            : MEXICO_DEFAULTS.credit_types,
        });
      }
      setLoading(false);
    }
    load();
  }, [tenantId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('tenants')
      .update({ settings })
      .eq('id', tenantId);

    if (error) {
      console.error('Error guardando settings:', error);
      toast.error(`Error: ${error.message}`);
    } else {
      toast.success('Configuración regional guardada');
      onUpdate?.();
    }
    setSaving(false);
  };

  const updateField = <K extends keyof RegionalSettings>(key: K, value: RegionalSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const addCreditType = () => {
    const val = newCreditValue.trim().toUpperCase();
    const lbl = newCreditLabel.trim();
    if (!val || !lbl) return;
    if (settings.credit_types.some(c => c.value === val)) {
      toast.error('Ya existe un tipo con ese código');
      return;
    }
    updateField('credit_types', [...settings.credit_types, { value: val, label: lbl }]);
    setNewCreditValue('');
    setNewCreditLabel('');
  };

  const removeCreditType = (value: string) => {
    updateField('credit_types', settings.credit_types.filter(c => c.value !== value));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Presets por país */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Cargar preset por país
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Precarga zona horaria, moneda y tipos de crédito típicos del país. Puedes ajustar después.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(REGIONAL_PRESETS).map(([code, preset]) => (
              <Button
                key={code}
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => {
                  setSettings(preset.settings);
                  toast.success(`Preset ${preset.label} cargado — guarda para aplicar`);
                }}
              >
                <span>{preset.flag}</span>
                {preset.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Zona horaria y localización */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Localización
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Zona horaria
              </Label>
              <Select value={settings.timezone} onValueChange={(v) => updateField('timezone', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Locale (formato de fechas y números)</Label>
              <Select value={settings.locale} onValueChange={(v) => updateField('locale', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Código de país (ISO 2)</Label>
              <Input
                value={settings.country_code}
                onChange={e => updateField('country_code', e.target.value.toUpperCase().slice(0, 2))}
                placeholder="MX"
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                Prefijo telefónico
              </Label>
              <Input
                value={settings.phone_prefix}
                onChange={e => updateField('phone_prefix', e.target.value)}
                placeholder="+52"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Moneda */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Moneda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Código de moneda (ISO 4217)</Label>
              <Input
                value={settings.currency}
                onChange={e => updateField('currency', e.target.value.toUpperCase().slice(0, 3))}
                placeholder="MXN"
                maxLength={3}
              />
              <p className="text-xs text-muted-foreground">Ej: MXN, COP, USD, EUR</p>
            </div>
            <div className="space-y-2">
              <Label>Símbolo</Label>
              <Input
                value={settings.currency_symbol}
                onChange={e => updateField('currency_symbol', e.target.value.slice(0, 3))}
                placeholder="$"
                maxLength={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tipos de crédito */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tipos de crédito inmobiliario</CardTitle>
          <p className="text-xs text-muted-foreground">
            Aparecerán en citas, fichas de contacto y expedientes.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {settings.credit_types.map(ct => (
              <div key={ct.value} className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30">
                <span className="font-mono text-xs bg-background border rounded px-1.5 py-0.5 shrink-0">
                  {ct.value}
                </span>
                <span className="text-sm flex-1">{ct.label}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => removeCreditType(ct.value)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Add new */}
          <div className="flex items-end gap-2 pt-2 border-t border-border/50">
            <div className="space-y-1 w-28">
              <Label className="text-xs">Código</Label>
              <Input
                value={newCreditValue}
                onChange={e => setNewCreditValue(e.target.value.toUpperCase())}
                placeholder="BANK"
                className="h-8 text-xs font-mono"
                maxLength={20}
                onKeyDown={e => e.key === 'Enter' && addCreditType()}
              />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={newCreditLabel}
                onChange={e => setNewCreditLabel(e.target.value)}
                placeholder="Bancario"
                className="h-8 text-xs"
                onKeyDown={e => e.key === 'Enter' && addCreditType()}
              />
            </div>
            <Button variant="outline" size="sm" onClick={addCreditType} className="h-8">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar configuración
        </Button>
      </div>
    </div>
  );
}
