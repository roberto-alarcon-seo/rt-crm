import { useEffect, useMemo, useState } from 'react';
import { Bot, Sparkles, MessageSquare, Target, Users, PlayCircle, Plus, Trash2, AlertTriangle, Flame } from 'lucide-react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { AISandboxDialog } from '@/components/settings/AISandboxDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useSDRSettings, useUpdateSDRSettings,
  useSDRCriteria, useUpdateSDRCriterion,
  useSDRProducts, useUpsertSDRProduct, useDeleteSDRProduct,
  activeWeightTotal,
  type SDRTone, type SDRProduct,
} from '@/hooks/useSDRSettings';
import { useAISettings } from '@/hooks/useAISettings';
import { toast } from 'sonner';

/**
 * Compone el prompt que se le pasa al sandbox: las instrucciones del SDR más el
 * catálogo de productos y los criterios, que es justo el contexto que el agente
 * necesita para mapear un dolor a una puerta de entrada y para calificar.
 */
function composeSandboxPrompt(
  basePrompt: string,
  products: SDRProduct[],
  criteria: { label: string; guide_question: string; weight: number; is_active: boolean }[],
  hotThreshold: number,
): string {
  const catalog = products
    .filter((p) => p.is_active)
    .map((p) => `- ${p.name}: ${p.description}${p.entry_signal ? `\n  Señal de entrada: ${p.entry_signal}` : ''}`)
    .join('\n');

  const criteriaBlock = criteria
    .filter((c) => c.is_active)
    .map((c) => `- ${c.label} (peso ${c.weight}): ${c.guide_question}`)
    .join('\n');

  return [
    basePrompt.trim(),
    catalog && `\nPRODUCTOS Y SERVICIOS QUE PUEDES PRESENTAR\n${catalog}`,
    criteriaBlock && `\nCALIFICA CONVERSANDO (una pregunta por turno)\n${criteriaBlock}`,
    `\nCuando el score llegue a ${hotThreshold} o más, propone la demo con el equipo comercial.`,
  ]
    .filter(Boolean)
    .join('\n');
}

const emptyProduct = (): Partial<SDRProduct> & { name: string } => ({
  name: '', description: '', entry_signal: '', url: '', is_active: true, sort_order: 0,
});

export default function SettingsSDRAgent() {
  const { data: settings, isLoading } = useSDRSettings();
  const { data: aiSettings } = useAISettings();
  const { data: criteria = [] } = useSDRCriteria();
  const { data: products = [] } = useSDRProducts();

  const updateSettings = useUpdateSDRSettings();
  const updateCriterion = useUpdateSDRCriterion();
  const upsertProduct = useUpsertSDRProduct();
  const deleteProduct = useDeleteSDRProduct();

  const [enabled, setEnabled] = useState(false);
  const [tone, setTone] = useState<SDRTone>('professional');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [hotThreshold, setHotThreshold] = useState(70);
  const [nurtureThreshold, setNurtureThreshold] = useState(40);
  const [notifyOwnerOnHot, setNotifyOwnerOnHot] = useState(true);
  const [demoSlaHours, setDemoSlaHours] = useState(48);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<(Partial<SDRProduct> & { name: string }) | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setTone(settings.tone);
    setSystemPrompt(settings.system_prompt ?? '');
    setHotThreshold(settings.hot_threshold);
    setNurtureThreshold(settings.nurture_threshold);
    setNotifyOwnerOnHot(settings.notify_owner_on_hot);
    setDemoSlaHours(settings.demo_sla_hours);
  }, [settings]);

  const weightTotal = useMemo(() => activeWeightTotal(criteria), [criteria]);

  const handleSave = () => {
    if (hotThreshold <= nurtureThreshold) {
      toast.error('El umbral de lead caliente debe ser mayor que el de nurturing');
      return;
    }
    updateSettings.mutate({
      enabled,
      tone,
      system_prompt: systemPrompt.trim() || null,
      hot_threshold: hotThreshold,
      nurture_threshold: nurtureThreshold,
      notify_owner_on_hot: notifyOwnerOnHot,
      demo_sla_hours: demoSlaHours,
    });
  };

  const sandboxSettings = useMemo(() => ({
    ...(aiSettings ?? {}),
    tone,
    behavior_prompt: composeSandboxPrompt(systemPrompt, products, criteria, hotThreshold),
  }), [aiSettings, tone, systemPrompt, products, criteria, hotThreshold]);

  return (
    <SettingsLayout
      title="Agente SDR"
      description="Configura el agente de captación y calificación de leads B2B"
      icon={Bot}
    >
      <div className="space-y-6">

        {/* Estado del agente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Estado del Agente SDR
            </CardTitle>
            <CardDescription>
              El agente SDR responde leads entrantes por WhatsApp y web, califica y agenda demos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Agente activo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  El agente responderá automáticamente leads nuevos
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isLoading} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Tono de comunicación</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as SDRTone)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Profesional</SelectItem>
                  <SelectItem value="friendly">Amigable</SelectItem>
                  <SelectItem value="consultative">Consultivo</SelectItem>
                  <SelectItem value="adaptive">Adaptativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Criterios de calificación con peso */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Criterios de Calificación
            </CardTitle>
            <CardDescription>
              Cada criterio aporta como máximo su peso al score de 0 a 100. La suma de los criterios activos debería dar 100.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {criteria.map((criterion) => (
              <div
                key={criterion.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{criterion.label}</p>
                  <p className="text-xs text-muted-foreground">{criterion.guide_question}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label htmlFor={`weight-${criterion.id}`} className="text-xs text-muted-foreground">
                    Peso
                  </Label>
                  <Input
                    id={`weight-${criterion.id}`}
                    type="number"
                    min={0}
                    max={100}
                    value={criterion.weight}
                    className="w-20 h-8"
                    onChange={(e) => {
                      const weight = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      updateCriterion.mutate({ id: criterion.id, weight });
                    }}
                  />
                  <Switch
                    checked={criterion.is_active}
                    onCheckedChange={(is_active) => updateCriterion.mutate({ id: criterion.id, is_active })}
                    aria-label={`Activar ${criterion.label}`}
                  />
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">Suma de pesos activos</span>
              {weightTotal === 100 ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                  {weightTotal} / 100
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {weightTotal} / 100
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Umbrales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="w-4 h-4 text-primary" />
              Umbrales de score
            </CardTitle>
            <CardDescription>
              Qué hace el sistema según el score que el agente calcula
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Lead caliente a partir de</Label>
                <span className="text-sm font-mono">{hotThreshold}</span>
              </div>
              <Slider
                min={nurtureThreshold + 1}
                max={100}
                step={1}
                value={[hotThreshold]}
                onValueChange={([v]) => setHotThreshold(v)}
              />
              <p className="text-xs text-muted-foreground">
                Se avisa al comercial y se propone demo dentro de {demoSlaHours} h.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Nurturing a partir de</Label>
                <span className="text-sm font-mono">{nurtureThreshold}</span>
              </div>
              <Slider
                min={0}
                max={Math.max(0, hotThreshold - 1)}
                step={1}
                value={[nurtureThreshold]}
                onValueChange={([v]) => setNurtureThreshold(v)}
              />
              <p className="text-xs text-muted-foreground">
                Por debajo de {nurtureThreshold} el lead entra en nurturing de baja frecuencia.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Proponer demo dentro de</Label>
                <span className="text-sm font-mono">{demoSlaHours} h</span>
              </div>
              <Slider
                min={1}
                max={168}
                step={1}
                value={[demoSlaHours]}
                onValueChange={([v]) => setDemoSlaHours(v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Avisar al comercial cuando el lead se pone caliente</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Notificación en tiempo real con el resumen del contexto
                </p>
              </div>
              <Switch checked={notifyOwnerOnHot} onCheckedChange={setNotifyOwnerOnHot} />
            </div>
          </CardContent>
        </Card>

        {/* Catálogo de productos editable */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Productos y servicios
            </CardTitle>
            <CardDescription>
              El agente recomienda estos productos según el dolor que detecta en la conversación
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {products.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aún no hay productos. Agrega el primero para que el agente sepa qué ofrecer.
              </p>
            )}

            {products.map((product) => (
              <div key={product.id} className="p-3 rounded-lg border border-border/40 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={product.name}
                    className="h-8 font-semibold max-w-[220px]"
                    onChange={(e) => upsertProduct.mutate({ id: product.id, name: e.target.value })}
                    aria-label="Nombre del producto"
                  />
                  <Switch
                    checked={product.is_active}
                    onCheckedChange={(is_active) => upsertProduct.mutate({ id: product.id, name: product.name, is_active })}
                    aria-label={`Activar ${product.name}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    onClick={() => deleteProduct.mutate(product.id)}
                    aria-label={`Eliminar ${product.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <Textarea
                  value={product.description}
                  rows={2}
                  className="resize-none text-sm"
                  placeholder="Qué es, en una o dos frases"
                  onChange={(e) => upsertProduct.mutate({ id: product.id, name: product.name, description: e.target.value })}
                  aria-label={`Descripción de ${product.name}`}
                />
                <Input
                  value={product.entry_signal}
                  className="h-8 text-sm"
                  placeholder="Señal de entrada: qué dolor hace que este sea el producto correcto"
                  onChange={(e) => upsertProduct.mutate({ id: product.id, name: product.name, entry_signal: e.target.value })}
                  aria-label={`Señal de entrada de ${product.name}`}
                />
                <Input
                  value={product.url ?? ''}
                  type="url"
                  className="h-8 text-sm"
                  placeholder="URL (opcional)"
                  onChange={(e) => upsertProduct.mutate({ id: product.id, name: product.name, url: e.target.value || null })}
                  aria-label={`URL de ${product.name}`}
                />
              </div>
            ))}

            {newProduct ? (
              <div className="p-3 rounded-lg border border-primary/40 space-y-2">
                <Input
                  value={newProduct.name}
                  className="h-8 font-semibold"
                  placeholder="Nombre del producto"
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  aria-label="Nombre del producto nuevo"
                />
                <Textarea
                  value={newProduct.description ?? ''}
                  rows={2}
                  className="resize-none text-sm"
                  placeholder="Qué es, en una o dos frases"
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  aria-label="Descripción del producto nuevo"
                />
                <Input
                  value={newProduct.entry_signal ?? ''}
                  className="h-8 text-sm"
                  placeholder="Señal de entrada"
                  onChange={(e) => setNewProduct({ ...newProduct, entry_signal: e.target.value })}
                  aria-label="Señal de entrada del producto nuevo"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newProduct.name.trim()) {
                        toast.error('El producto necesita un nombre');
                        return;
                      }
                      upsertProduct.mutate({
                        ...newProduct,
                        sort_order: (products.at(-1)?.sort_order ?? 0) + 10,
                      });
                      setNewProduct(null);
                    }}
                  >
                    Guardar producto
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNewProduct(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setNewProduct(emptyProduct())}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar producto
              </Button>
            )}
          </CardContent>
        </Card>

        {/* System prompt */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Instrucciones del Agente
            </CardTitle>
            <CardDescription>
              Prompt de sistema que define el comportamiento y contexto del agente SDR
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={14}
              className="resize-none font-mono text-sm"
              placeholder="Define las instrucciones del agente..."
            />
            <p className="text-xs text-muted-foreground mt-2">
              Al probar la conversación se le añade automáticamente el catálogo de productos y los criterios de arriba.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-4 border-t sticky bottom-0 bg-background py-3">
          <Button variant="outline" onClick={() => setSandboxOpen(true)} size="lg" className="mr-2">
            <PlayCircle className="h-4 w-4 mr-2" />
            Probar conversación
          </Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending || isLoading} size="lg">
            {updateSettings.isPending ? 'Guardando...' : 'Guardar configuración'}
          </Button>
        </div>
      </div>

      <AISandboxDialog open={sandboxOpen} onOpenChange={setSandboxOpen} settings={sandboxSettings} />
    </SettingsLayout>
  );
}
