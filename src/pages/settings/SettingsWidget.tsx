import { useState } from 'react';
import { Globe, Copy, Check, RefreshCw, ToggleLeft, MessageSquare, Users, BarChart3, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useWidgetSettings } from '@/hooks/useWidgetSettings';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

export default function SettingsWidget() {
  const { settings, stats, isLoading, isSaving, save, regenerateToken } = useWidgetSettings();
  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsText, setSuggestionsText] = useState<string>('');

  // Local draft state
  const [draft, setDraft] = useState<{
    greeting_name: string;
    greeting_message: string;
    position: 'bottom-right' | 'bottom-left';
    capture_name: boolean;
    capture_email: boolean;
    capture_phone: boolean;
    initial_suggestions: string[];
  } | null>(null);

  // Initialize draft from settings once loaded
  if (settings && !draft) {
    setSuggestionsText((settings.initial_suggestions || []).join('\n'));
  }

  const effectiveDraft = draft || (settings ? {
    greeting_name: settings.greeting_name,
    greeting_message: settings.greeting_message,
    position: settings.position,
    capture_name: settings.capture_name,
    capture_email: settings.capture_email,
    capture_phone: settings.capture_phone,
    initial_suggestions: settings.initial_suggestions || [],
  } : null);

  function patch<K extends keyof NonNullable<typeof effectiveDraft>>(
    key: K,
    value: NonNullable<typeof effectiveDraft>[K],
  ) {
    if (!effectiveDraft) return;
    setDraft({ ...effectiveDraft, [key]: value });
  }

  async function handleSave() {
    if (!effectiveDraft) return;
    const chips = suggestionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    await save({ ...effectiveDraft, initial_suggestions: chips });
    setDraft(null);
  }

  function getEmbedCode() {
    if (!settings) return '';
    return `<script\n  src="${window.location.origin}/widget.js"\n  data-widget-token="${settings.widget_token}"\n  data-api-url="${SUPABASE_URL}/functions/v1"\n  async\n></script>`;
  }

  function copyCode() {
    navigator.clipboard.writeText(getEmbedCode()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyToken() {
    if (!settings) return;
    navigator.clipboard.writeText(settings.widget_token).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    });
  }

  if (isLoading) {
    return (
      <SettingsLayout title="Widget Web" description="Chat de captura de leads para tu sitio" icon={Globe}>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="Widget Web" description="Chat de captura de leads para tu sitio" icon={Globe}>
      <div className="space-y-6 max-w-2xl">

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-2xl font-bold">{stats.sessions_this_week}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sesiones esta semana</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-2xl font-bold text-primary">{stats.leads_captured}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Leads capturados total</p>
            </CardContent>
          </Card>
        </div>

        {/* Enable / Disable */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Estado del Widget</CardTitle>
                <CardDescription className="mt-0.5">
                  {settings?.enabled
                    ? 'El widget está activo en tu sitio web'
                    : 'El widget está desactivado — los visitantes no lo verán'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={settings?.enabled ? 'default' : 'secondary'}>
                  {settings?.enabled ? 'Activo' : 'Inactivo'}
                </Badge>
                <Switch
                  checked={!!settings?.enabled}
                  onCheckedChange={(val) => save({ enabled: val })}
                />
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Install code */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Código de instalación
            </CardTitle>
            <CardDescription>
              Pega este snippet antes de <code className="text-xs bg-muted px-1 rounded">&lt;/body&gt;</code> en tu sitio web
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <pre className="text-xs bg-muted rounded-lg p-4 overflow-x-auto whitespace-pre font-mono text-muted-foreground select-all">
                {getEmbedCode()}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2 h-7 gap-1.5"
                onClick={copyCode}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Label className="text-xs text-muted-foreground shrink-0">Widget Token</Label>
              <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono truncate flex-1 text-muted-foreground">
                {settings?.widget_token}
              </code>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={copyToken}>
                {copiedToken ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={() => {
                  if (confirm('¿Regenerar el token? Deberás actualizar el código en tu sitio web.')) {
                    regenerateToken();
                  }
                }}
              >
                <RefreshCw className="h-3 w-3" />
                Regenerar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Personalization */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Personalización
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nombre del asistente</Label>
                <Input
                  value={effectiveDraft?.greeting_name ?? ''}
                  onChange={(e) => patch('greeting_name', e.target.value)}
                  placeholder="Asistente"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Posición</Label>
                <Select
                  value={effectiveDraft?.position ?? 'bottom-right'}
                  onValueChange={(v) => patch('position', v as 'bottom-right' | 'bottom-left')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Inferior derecho</SelectItem>
                    <SelectItem value="bottom-left">Inferior izquierdo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Mensaje de bienvenida</Label>
              <Textarea
                value={effectiveDraft?.greeting_message ?? ''}
                onChange={(e) => patch('greeting_message', e.target.value)}
                placeholder="¡Hola! ¿En qué puedo ayudarte hoy?"
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Suggestions collapsible */}
            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setShowSuggestions(!showSuggestions)}
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Píldoras de sugerencias iniciales
                  <Badge variant="secondary" className="text-xs">{(settings?.initial_suggestions || []).length}</Badge>
                </span>
                {showSuggestions ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showSuggestions && (
                <div className="px-3 pb-3 pt-1 border-t bg-muted/20">
                  <p className="text-xs text-muted-foreground mb-2">
                    Una sugerencia por línea. Se muestran como botones clickeables al abrir el chat (máx. 6).
                  </p>
                  <Textarea
                    value={suggestionsText}
                    onChange={(e) => setSuggestionsText(e.target.value)}
                    placeholder={"¿Cuáles son sus precios?\n¿Cómo funciona?\nQuiero una demo\n¿Tienen soporte en español?"}
                    rows={5}
                    className="font-mono text-xs resize-none"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Capture fields */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Datos a capturar
            </CardTitle>
            <CardDescription>
              La IA pedirá estos datos de forma natural durante la conversación
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                { key: 'capture_name', label: 'Nombre', desc: 'Obligatorio para crear el lead' },
                { key: 'capture_email', label: 'Correo electrónico', desc: 'Para enviar seguimiento por email' },
                { key: 'capture_phone', label: 'Teléfono / WhatsApp', desc: 'Para continuar la conversación por WhatsApp' },
              ] as const
            ).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  checked={!!effectiveDraft?.[key]}
                  onCheckedChange={(val) => patch(key, val)}
                  disabled={key === 'capture_name'}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* UTM note */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="pt-4 pb-3">
            <div className="flex gap-3">
              <BarChart3 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">UTMs capturados automáticamente</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <code className="bg-muted px-1 rounded">utm_source</code>, <code className="bg-muted px-1 rounded">utm_medium</code>, <code className="bg-muted px-1 rounded">utm_campaign</code> y más se guardan en la tabla <code className="bg-muted px-1 rounded">attribution</code> al convertir el lead, sin configuración adicional.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="min-w-[120px]">
            {isSaving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </SettingsLayout>
  );
}
