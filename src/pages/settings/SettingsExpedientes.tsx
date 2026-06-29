import { useState } from 'react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FolderOpen, Plus, Trash2, Loader2, UserCircle, Building2, Pencil, Sparkles, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDocumentTemplates,
  useCreateDocumentTemplate,
  useUpdateDocumentTemplate,
  useDeleteDocumentTemplate,
  useAddTemplateItem,
  useDeleteTemplateItem,
  useSeedDefaultTemplates,
  CREDIT_TYPE_LABELS,
  type DocumentTemplate,
  type CreditType,
  type DocParty,
} from '@/hooks/useDocumentTemplates';
import { getDealStagesForType, type DealType, type DealStage } from '@/hooks/useDeals';

const DEAL_TYPE_LABELS: Record<DealType, string> = {
  compra:    'Compra',
  renta:     'Renta',
  captacion: 'Captación',
};

const PARTY_CONFIG: Record<DocParty, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  client:   { label: 'Cliente',   icon: UserCircle, color: 'text-blue-400 bg-blue-500/10' },
  property: { label: 'Inmueble',  icon: Building2,  color: 'text-amber-400 bg-amber-500/10' },
};

// ─── Template editor (Sheet) ──────────────────────────────────────────────────

function TemplateEditor({ template, onClose }: { template: DocumentTemplate; onClose: () => void }) {
  const addItem    = useAddTemplateItem();
  const deleteItem = useDeleteTemplateItem();

  const stagesForTemplate = getDealStagesForType(template.deal_type);

  const [newDoc, setNewDoc] = useState<Record<string, { label: string; party: DocParty }>>(() =>
    Object.fromEntries(stagesForTemplate.map((s) => [s.value, { label: '', party: 'client' as DocParty }]))
  );

  const itemsByStage = (stage: DealStage) =>
    (template.items ?? []).filter((i) => i.deal_stage === stage);

  const handleAdd = async (stage: DealStage) => {
    const doc = newDoc[stage];
    if (!doc.label.trim()) return;
    const stageItems = itemsByStage(stage);
    await addItem.mutateAsync({
      template_id: template.id,
      label: doc.label.trim(),
      deal_stage: stage,
      party: doc.party,
      sort_order: stageItems.length + 1,
    });
    setNewDoc((prev) => ({ ...prev, [stage]: { label: '', party: 'client' } }));
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-5 border-b border-border">
          <SheetTitle className="text-base">{template.name}</SheetTitle>
          <SheetDescription className="text-xs">
            {DEAL_TYPE_LABELS[template.deal_type]}
            {template.credit_type ? ` · ${CREDIT_TYPE_LABELS[template.credit_type]}` : ' · General'}
            {template.is_default && <span className="ml-2 text-primary">• Predeterminada</span>}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            <Accordion type="multiple" defaultValue={stagesForTemplate.map((s) => s.value)} className="space-y-2">
              {stagesForTemplate.map((stage) => {
                const items = itemsByStage(stage.value);
                return (
                  <AccordionItem
                    key={stage.value}
                    value={stage.value}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 [&>svg]:shrink-0">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={cn('w-2 h-2 rounded-full shrink-0', stage.bgColor)} />
                        <span className="text-sm font-medium truncate">{stage.label}</span>
                        <Badge variant="secondary" className="ml-auto mr-2 text-[10px] shrink-0">
                          {items.length} doc{items.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent className="pb-0">
                      <div className="border-t border-border divide-y divide-border">
                        {items.map((item) => {
                          const party = PARTY_CONFIG[item.party as DocParty];
                          const PartyIcon = party.icon;
                          return (
                            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0', party.color)}>
                                <PartyIcon className="w-3 h-3" />
                                {party.label}
                              </div>
                              <span className="flex-1 text-sm text-muted-foreground">{item.label}</span>
                              <button
                                onClick={() => deleteItem.mutate(item.id)}
                                disabled={deleteItem.isPending}
                                className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}

                        {/* Add row */}
                        <div className="flex items-center gap-2 px-4 py-3 bg-muted/20">
                          <Select
                            value={newDoc[stage.value].party}
                            onValueChange={(v) =>
                              setNewDoc((prev) => ({ ...prev, [stage.value]: { ...prev[stage.value], party: v as DocParty } }))
                            }
                          >
                            <SelectTrigger className="w-28 h-8 text-xs shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="client">Cliente</SelectItem>
                              <SelectItem value="property">Inmueble</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Nombre del documento..."
                            value={newDoc[stage.value].label}
                            onChange={(e) =>
                              setNewDoc((prev) => ({ ...prev, [stage.value]: { ...prev[stage.value], label: e.target.value } }))
                            }
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(stage.value); }}
                            className="flex-1 h-8 text-sm"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 shrink-0"
                            onClick={() => handleAdd(stage.value)}
                            disabled={!newDoc[stage.value].label.trim() || addItem.isPending}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── New template dialog ───────────────────────────────────────────────────────

function NewTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createTemplate = useCreateDocumentTemplate();
  const [form, setForm] = useState({
    name: '',
    deal_type: 'compra' as DealType,
    credit_type: '' as CreditType | '',
    is_default: false,
  });

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await createTemplate.mutateAsync({
      name: form.name.trim(),
      deal_type: form.deal_type,
      credit_type: (form.credit_type || null) as CreditType | null,
      is_default: form.is_default,
    });
    onOpenChange(false);
    setForm({ name: '', deal_type: 'compra', credit_type: '', is_default: false });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva plantilla</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              placeholder="ej. Compra - FOVISSSTE"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de operación</Label>
            <Select
              value={form.deal_type}
              onValueChange={(v) => setForm((p) => ({ ...p, deal_type: v as DealType }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compra">Compra</SelectItem>
                <SelectItem value="renta">Renta</SelectItem>
                <SelectItem value="captacion">Captación</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.deal_type === 'compra' && (
            <div className="space-y-1.5">
              <Label>Tipo de financiamiento <span className="text-muted-foreground">(opcional)</span></Label>
              <Select
                value={form.credit_type || '__none__'}
                onValueChange={(v) => setForm((p) => ({ ...p, credit_type: v === '__none__' ? '' : v as CreditType }))}
              >
                <SelectTrigger><SelectValue placeholder="General (aplica a todos)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">General (aplica a todos)</SelectItem>
                  {(Object.entries(CREDIT_TYPE_LABELS) as [CreditType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="is-default" className="cursor-pointer">Plantilla predeterminada</Label>
            <Switch
              id="is-default"
              checked={form.is_default}
              onCheckedChange={(v) => setForm((p) => ({ ...p, is_default: v }))}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!form.name.trim() || createTemplate.isPending}>
            {createTemplate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsExpedientes() {
  const { data: templates = [], isLoading } = useDocumentTemplates();
  const deleteTemplate = useDeleteDocumentTemplate();
  const updateTemplate = useUpdateDocumentTemplate();
  const seedDefaults  = useSeedDefaultTemplates();

  const [selected, setSelected]     = useState<DocumentTemplate | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const grouped = (['compra', 'renta', 'captacion'] as DealType[]).map((type) => ({
    type,
    label: DEAL_TYPE_LABELS[type],
    items: templates.filter((t) => t.deal_type === type),
  }));

  return (
    <SettingsLayout
      title="Flujos de expediente"
      description="Define qué documentos se solicitan en cada etapa del cierre, por tipo de operación y financiamiento."
      icon={FolderOpen}
    >
      {/* Header actions */}
      <div className="flex items-center justify-between mb-6">
        <div />
        <div className="flex gap-2">
          {templates.length === 0 && (
            <Button
              variant="outline"
              onClick={() => seedDefaults.mutate()}
              disabled={seedDefaults.isPending}
            >
              {seedDefaults.isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Sparkles className="w-4 h-4 mr-2" />}
              Cargar plantillas predeterminadas
            </Button>
          )}
          <Button onClick={() => setNewDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva plantilla
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {!isLoading && templates.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No hay plantillas configuradas</p>
          <p className="text-xs mt-1">Carga las predeterminadas o crea una desde cero.</p>
        </div>
      )}

      {/* Template groups */}
      <div className="space-y-8">
        {grouped.map(({ type, label, items }) => {
          if (items.length === 0) return null;
          return (
            <div key={type}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {label}
              </h3>
              <div className="space-y-2">
                {items.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-border/80 transition-colors"
                  >
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{tmpl.name}</span>
                        {tmpl.is_default && (
                          <Badge variant="secondary" className="text-[10px]">Predeterminada</Badge>
                        )}
                        {tmpl.credit_type && (
                          <Badge variant="outline" className="text-[10px]">
                            {CREDIT_TYPE_LABELS[tmpl.credit_type]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(tmpl.items ?? []).length} documentos
                        {' · '}
                        {(tmpl.items ?? []).filter((i) => i.party === 'client').length} del cliente
                        {' · '}
                        {(tmpl.items ?? []).filter((i) => i.party === 'property').length} del inmueble
                      </p>
                    </div>

                    {/* Default toggle */}
                    <Switch
                      checked={tmpl.is_default}
                      onCheckedChange={(v) => updateTemplate.mutate({ id: tmpl.id, is_default: v })}
                    />

                    {/* Edit */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground"
                      onClick={() => setSelected(tmpl)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>

                    {/* Delete */}
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar "${tmpl.name}"?`)) deleteTemplate.mutate(tmpl.id);
                      }}
                      className="text-muted-foreground/40 hover:text-destructive transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dialogs */}
      <NewTemplateDialog open={newDialogOpen} onOpenChange={setNewDialogOpen} />
      {selected && (() => {
        // Always derive from fresh query so the editor reflects mutations immediately
        const fresh = templates.find((t) => t.id === selected.id) ?? selected;
        return (
          <TemplateEditor
            key={fresh.id}
            template={fresh}
            onClose={() => setSelected(null)}
          />
        );
      })()}
    </SettingsLayout>
  );
}
