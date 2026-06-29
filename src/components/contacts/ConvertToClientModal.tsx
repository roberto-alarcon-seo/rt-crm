import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Handshake, CalendarIcon, FileText, ChevronDown, TrendingUp } from "lucide-react";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import { useCreateDeal, DealType, DOCUMENT_TEMPLATES } from "@/hooks/useDeals";
import { useTemplatesForDealType } from "@/hooks/useDocumentTemplates";
import { useNavigate } from "react-router-dom";

const QUICK_DATES = [
  { label: '30 días', days: 30 },
  { label: '45 días', days: 45 },
  { label: '60 días', days: 60 },
  { label: '90 días', days: 90 },
] as const;

const STAGE_LABELS: Record<string, string> = {
  contrato_compraventa:   'Contrato compraventa',
  valuacion:              'Valuación',
  apertura_credito:       'Apertura de crédito',
  procesos_notariales:    'Procesos notariales',
  entrega_inmueble:       'Entrega del inmueble',
  revision_docs:          'Revisión de documentos',
  aprobacion_propietario: 'Aprobación propietario',
  firma_contrato:         'Firma de contrato',
  entrega_llaves:         'Entrega de llaves',
};

interface ConvertToClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: { id: string; name: string; re_property_interest_id?: string | null };
  defaultDealType?: DealType;
}

export function ConvertToClientModal({ open, onOpenChange, contact, defaultDealType }: ConvertToClientModalProps) {
  const tenantId = useEffectiveTenantId();
  const createDeal = useCreateDeal();
  const navigate = useNavigate();
  const [previewOpen, setPreviewOpen] = useState(false);

  const [form, setForm] = useState({
    property_id: contact.re_property_interest_id ?? '',
    deal_type: (defaultDealType ?? 'compra') as DealType,
    template_id: '',
    offered_price: '',
    commission_pct: '',
    expected_close_date: '',
  });

  const { data: dealTemplates = [] } = useTemplatesForDealType(form.deal_type);

  // Auto-select default template when deal_type changes or templates load
  useEffect(() => {
    const def = dealTemplates.find((t) => t.is_default) ?? dealTemplates[0] ?? null;
    setForm((p) => ({ ...p, template_id: def?.id ?? '' }));
  }, [form.deal_type, dealTemplates]);

  const { data: properties = [] } = useQuery({
    queryKey: ['properties-active', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from('properties')
        .select('id, title, zone, price, currency')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('title');
      return data ?? [];
    },
    enabled: !!tenantId && open,
  });

  // Resolve which document items will be used (DB template items OR hardcoded fallback)
  const selectedTemplate = dealTemplates.find((t) => t.id === form.template_id);
  const previewItems = selectedTemplate?.items?.length
    ? selectedTemplate.items
    : (DOCUMENT_TEMPLATES[form.deal_type] ?? DOCUMENT_TEMPLATES.compra).map((d, i) => ({
        id: `fallback-${i}`,
        label: d.label,
        deal_stage: d.deal_stage,
        party: 'client' as const,
        sort_order: d.sort_order,
      }));

  // Group items by stage for preview
  const previewByStage: Record<string, typeof previewItems> = {};
  previewItems.forEach((item) => {
    if (!previewByStage[item.deal_stage]) previewByStage[item.deal_stage] = [];
    previewByStage[item.deal_stage].push(item);
  });
  const previewStages = Object.keys(previewByStage);

  const handleSubmit = async () => {
    const selectedProperty = properties.find((p: any) => p.id === form.property_id);
    const title = selectedProperty
      ? `${contact.name} — ${selectedProperty.title}`
      : contact.name;

    const deal = await createDeal.mutateAsync({
      contact_id: contact.id,
      property_id: form.property_id || null,
      title,
      deal_type: form.deal_type,
      credit_type: selectedTemplate?.credit_type ?? null,
      template_id: form.template_id || null,
      offered_price_mxn: form.offered_price ? parseFloat(form.offered_price) : null,
      commission_pct: form.commission_pct ? parseFloat(form.commission_pct) : null,
      expected_close_date: form.expected_close_date || null,
      origin: 'pipeline_conversion',
    });

    onOpenChange(false);
    navigate('/clients');
  };

  const initialStageLabel = form.deal_type === 'renta' ? 'Revisión de documentos'
    : form.deal_type === 'captacion' ? 'Contrato de exclusiva'
    : 'Contrato de compraventa';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Handshake className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <DialogTitle>Convertir a cliente</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">{contact.name}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Tipo de operación *</Label>
            <Select value={form.deal_type} onValueChange={(v) => setForm(p => ({ ...p, deal_type: v as DealType }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compra">Compra</SelectItem>
                <SelectItem value="renta">Renta</SelectItem>
                <SelectItem value="captacion">Captación</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Template selector — show whenever DB templates exist */}
          {dealTemplates.length >= 1 && (
            <div className="space-y-1.5">
              <Label>Flujo de expediente</Label>
              <Select
                value={form.template_id || '__none__'}
                onValueChange={(v) => setForm(p => ({ ...p, template_id: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar flujo..." />
                </SelectTrigger>
                <SelectContent>
                  {dealTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.is_default ? ' (predeterminado)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Document checklist preview */}
          {previewItems.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setPreviewOpen((p) => !p)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">
                    {previewItems.length} documentos en el checklist
                  </span>
                </div>
                <ChevronDown className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-transform",
                  previewOpen && "rotate-180"
                )} />
              </button>

              {previewOpen && (
                <div className="divide-y divide-border/50">
                  {previewStages.map((stage) => (
                    <div key={stage} className="px-3 pt-2.5 pb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                        {STAGE_LABELS[stage] ?? stage}
                      </p>
                      <ul className="space-y-1">
                        {previewByStage[stage].map((item) => (
                          <li key={item.id} className="flex items-center gap-1.5 text-xs text-foreground/80">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/60 shrink-0" />
                            {item.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {properties.length > 0 && (
            <div className="space-y-1.5">
              <Label>Inmueble</Label>
              <Select
                value={form.property_id || '__none__'}
                onValueChange={(v) => setForm(p => ({ ...p, property_id: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar inmueble..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin inmueble específico</SelectItem>
                  {properties.map((prop: any) => (
                    <SelectItem key={prop.id} value={prop.id}>
                      {prop.title} {prop.zone ? `· ${prop.zone}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="offered-price">Precio ofertado (MXN)</Label>
            <Input
              id="offered-price"
              type="number"
              placeholder="0"
              value={form.offered_price}
              onChange={(e) => setForm(p => ({ ...p, offered_price: e.target.value }))}
            />
          </div>

          {/* Commission % + estimated revenue */}
          <div className="space-y-1.5">
            <Label htmlFor="commission-pct">% de comisión en convenio</Label>
            <div className="flex items-center gap-2">
              <Input
                id="commission-pct"
                type="number"
                placeholder="3"
                min="0"
                max="100"
                step="0.1"
                value={form.commission_pct}
                onChange={(e) => setForm(p => ({ ...p, commission_pct: e.target.value }))}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            {form.offered_price && form.commission_pct && (
              <div className="flex items-center gap-2 mt-1 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <p className="text-xs">
                  <span className="text-muted-foreground">Ingreso estimado empresa: </span>
                  <span className="font-semibold text-emerald-400">
                    ${(parseFloat(form.offered_price) * parseFloat(form.commission_pct) / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Cierre estimado</Label>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_DATES.map(({ label, days }) => {
                const target = format(addDays(new Date(), days), 'yyyy-MM-dd');
                const active = form.expected_close_date === target;
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, expected_close_date: target }))}
                    className={cn(
                      "py-2.5 rounded-lg text-sm border transition-colors font-medium",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm border transition-colors",
                    form.expected_close_date && !QUICK_DATES.some(q => format(addDays(new Date(), q.days), 'yyyy-MM-dd') === form.expected_close_date)
                      ? "bg-primary text-primary-foreground border-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  <CalendarIcon className="w-4 h-4" />
                  {form.expected_close_date && !QUICK_DATES.some(q => format(addDays(new Date(), q.days), 'yyyy-MM-dd') === form.expected_close_date)
                    ? format(new Date(form.expected_close_date + 'T00:00:00'), "d 'de' MMMM yyyy", { locale: es })
                    : 'Personalizado'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={form.expected_close_date ? new Date(form.expected_close_date + 'T00:00:00') : undefined}
                  onSelect={(d) => setForm(p => ({ ...p, expected_close_date: d ? format(d, 'yyyy-MM-dd') : '' }))}
                  disabled={(d) => d < new Date()}
                  locale={es}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {form.expected_close_date && (
              <p className="text-xs text-muted-foreground text-center">
                Cierre: <span className="text-foreground font-medium">
                  {format(new Date(form.expected_close_date + 'T00:00:00'), "EEEE d 'de' MMMM yyyy", { locale: es })}
                </span>
              </p>
            )}
          </div>

          <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1">
            <p>✓ Se creará el expediente con checklist de documentos</p>
            <p>✓ El contacto pasará a la sección <strong>Clientes</strong></p>
            <p>✓ Etapa inicial: <strong>{initialStageLabel}</strong></p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={createDeal.isPending}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={createDeal.isPending}>
              {createDeal.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Crear expediente
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
