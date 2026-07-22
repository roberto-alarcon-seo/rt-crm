import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useContacts } from "@/hooks/useContacts";
import { useAccounts } from "@/hooks/useAccounts";
import { useTeamUsers } from "@/hooks/useTeamUsers";
import { usePipelineStages, type PipelineStage } from "@/hooks/usePipelines";
import {
  useCreateOpportunity, useUpdateOpportunity, useDeleteOpportunity,
  useOpportunityLines, useUpsertOpportunityLine, useDeleteOpportunityLine,
  type Opportunity, type OpportunityLine,
} from "@/hooks/useOpportunities";
import { formatMoney } from "./OpportunityCard";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  /** null → create mode; an Opportunity → edit mode */
  opportunity: Opportunity | null;
  /** prefills for create mode (e.g. from a contact) */
  prefill?: { primary_contact_id?: string | null; account_id?: string | null; name?: string };
}

const LINE_TYPES = ["licencia", "servicio", "gcp", "tercero"] as const;
const CURRENCIES = ["USD", "MXN"];

export function OpportunityDetailPanel({ open, onOpenChange, pipelineId, opportunity, prefill }: Props) {
  const isEdit = !!opportunity;
  const { contacts } = useContacts();
  const { accounts } = useAccounts();
  const { users } = useTeamUsers();
  const { data: stages = [] } = usePipelineStages(pipelineId);

  const createOpp = useCreateOpportunity();
  const updateOpp = useUpdateOpportunity();
  const deleteOpp = useDeleteOpportunity();

  const [form, setForm] = useState({
    name: "",
    primary_contact_id: "" as string,
    account_id: "" as string,
    stage_id: "" as string,
    total_amount_usd: "" as string,
    currency: "USD",
    close_probability: "" as string,
    estimated_close_date: "" as string,
    assigned_to: "" as string,
    lost_reason: "" as string,
  });

  useEffect(() => {
    if (!open) return;
    if (opportunity) {
      setForm({
        name: opportunity.name ?? "",
        primary_contact_id: opportunity.primary_contact_id ?? "",
        account_id: opportunity.account_id ?? "",
        stage_id: opportunity.stage_id ?? "",
        total_amount_usd: opportunity.total_amount_usd?.toString() ?? "",
        currency: opportunity.currency ?? "USD",
        close_probability: opportunity.close_probability?.toString() ?? "",
        estimated_close_date: opportunity.estimated_close_date ?? "",
        assigned_to: opportunity.assigned_to ?? "",
        lost_reason: opportunity.lost_reason ?? "",
      });
    } else {
      const firstOpen = stages.find((s) => s.stage_type === "open") ?? stages[0];
      setForm({
        name: prefill?.name ?? "",
        primary_contact_id: prefill?.primary_contact_id ?? "",
        account_id: prefill?.account_id ?? "",
        stage_id: firstOpen?.id ?? "",
        total_amount_usd: "",
        currency: "USD",
        close_probability: firstOpen ? String(firstOpen.probability_default) : "",
        estimated_close_date: "",
        assigned_to: "",
        lost_reason: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opportunity?.id]);

  const selectedStage: PipelineStage | undefined = useMemo(
    () => stages.find((s) => s.id === form.stage_id),
    [stages, form.stage_id]
  );

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      stage_id: form.stage_id || null,
      primary_contact_id: form.primary_contact_id || null,
      account_id: form.account_id || null,
      total_amount_usd: form.total_amount_usd ? Number(form.total_amount_usd) : null,
      currency: form.currency,
      close_probability: form.close_probability ? Number(form.close_probability) : null,
      estimated_close_date: form.estimated_close_date || null,
      assigned_to: form.assigned_to || null,
      lost_reason: selectedStage?.stage_type === "lost" ? form.lost_reason || null : null,
    };
    if (isEdit && opportunity) {
      await updateOpp.mutateAsync({ id: opportunity.id, updates: payload });
    } else {
      const { lost_reason, ...createPayload } = payload;
      void lost_reason;
      await createOpp.mutateAsync({ ...createPayload, pipeline_id: pipelineId });
    }
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!opportunity) return;
    await deleteOpp.mutateAsync(opportunity.id);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar oportunidad" : "Nueva oportunidad"}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej. ACME — Licencia Software" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Contacto</Label>
              <Select value={form.primary_contact_id || "__none__"} onValueChange={(v) => set("primary_contact_id", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sin contacto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin contacto</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={form.account_id || "__none__"} onValueChange={(v) => set("account_id", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sin empresa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin empresa</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Etapa</Label>
            <Select value={form.stage_id} onValueChange={(v) => set("stage_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona una etapa" /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Monto</Label>
              <Input type="number" value={form.total_amount_usd} onChange={(e) => set("total_amount_usd", e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Moneda</Label>
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Probabilidad (%)</Label>
              <Input type="number" min={0} max={100} value={form.close_probability} onChange={(e) => set("close_probability", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cierre estimado</Label>
              <Input type="date" value={form.estimated_close_date} onChange={(e) => set("estimated_close_date", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Responsable</Label>
            <Select value={form.assigned_to || "__none__"} onValueChange={(v) => set("assigned_to", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin asignar</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStage?.stage_type === "lost" && (
            <div className="space-y-2">
              <Label>Motivo de pérdida</Label>
              <Textarea value={form.lost_reason} onChange={(e) => set("lost_reason", e.target.value)} rows={2} />
            </div>
          )}

          {/* Revenue lines (only in edit mode; needs an existing opportunity id) */}
          {isEdit && opportunity && <OpportunityLinesEditor opportunityId={opportunity.id} />}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            {isEdit ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar oportunidad?</AlertDialogTitle>
                    <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : <span />}

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={!form.name.trim() || createOpp.isPending || updateOpp.isPending}>
                {isEdit ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Revenue lines editor ─────────────────────────────────────────────────────
function OpportunityLinesEditor({ opportunityId }: { opportunityId: string }) {
  const { data: lines = [] } = useOpportunityLines(opportunityId);
  const upsert = useUpsertOpportunityLine();
  const del = useDeleteOpportunityLine();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ line_type: "servicio", subtype: "", quantity: "1", unit_price: "" });

  const addLine = async () => {
    if (!draft.subtype.trim()) return;
    await upsert.mutateAsync({
      opportunity_id: opportunityId,
      line_type: draft.line_type as OpportunityLine["line_type"],
      subtype: draft.subtype.trim(),
      quantity: Number(draft.quantity) || 1,
      unit_price: draft.unit_price ? Number(draft.unit_price) : null,
    });
    setDraft({ line_type: "servicio", subtype: "", quantity: "1", unit_price: "" });
    setAdding(false);
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <Label>Líneas de ingreso</Label>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
          </Button>
        )}
      </div>

      {lines.map((l) => (
        <div key={l.id} className="flex items-center gap-2 text-sm rounded-md border border-border/50 px-3 py-2">
          <span className="text-[10px] uppercase text-muted-foreground w-16 shrink-0">{l.line_type}</span>
          <span className="flex-1 truncate">{l.subtype}</span>
          <span className="text-muted-foreground">×{l.quantity}</span>
          {l.unit_price != null && <span className="font-medium">{formatMoney(l.unit_price * l.quantity, l.currency)}</span>}
          <button className="text-muted-foreground hover:text-destructive" onClick={() => del.mutate({ id: l.id, opportunity_id: opportunityId })}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {adding && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={draft.line_type} onValueChange={(v) => setDraft((d) => ({ ...d, line_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LINE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Subtipo (ej. Gemini)" value={draft.subtype} onChange={(e) => setDraft((d) => ({ ...d, subtype: e.target.value }))} />
            <Input type="number" placeholder="Cantidad" value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))} />
            <Input type="number" placeholder="Precio unit." value={draft.unit_price} onChange={(e) => setDraft((d) => ({ ...d, unit_price: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancelar</Button>
            <Button size="sm" onClick={addLine} disabled={!draft.subtype.trim()}>Agregar</Button>
          </div>
        </div>
      )}

      {lines.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">Sin líneas. Agrega licencias, servicios o GCP.</p>
      )}
    </div>
  );
}
