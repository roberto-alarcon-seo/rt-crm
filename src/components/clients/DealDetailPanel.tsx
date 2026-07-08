import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ExternalLink, Building2, Phone, Mail, FileText, Link, Pencil,
  Check, Activity, MessageSquare, CalendarClock, StickyNote, CheckCircle2, Lock,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ContactActivityTimeline } from "@/components/contacts/ContactActivityTimeline";
import { ScheduleFollowupModal } from "@/components/inbox/ScheduleFollowupModal";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Deal, DealStage, DealType, DealDocument,
  DEAL_CLOSED_STAGES, getDealStagesForType,
  useDealDocuments, useUpdateDealDocument, useUpdateDealNotes,
} from "@/hooks/useDeals";
import { useCreateFollowup } from "@/hooks/useFollowups";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Stage labels and order ───────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  contrato_compraventa:   'Contrato de compraventa',
  valuacion:              'Valuación',
  apertura_credito:       'Apertura de crédito',
  procesos_notariales:    'Procesos notariales',
  entrega_inmueble:       'Entrega del inmueble',
  revision_docs:          'Revisión de documentos',
  aprobacion_propietario: 'Aprobación propietario',
  firma_contrato:         'Firma de contrato',
  entrega_llaves:         'Entrega de llaves',
};

const COMPRA_STAGE_ORDER = ['contrato_compraventa', 'valuacion', 'apertura_credito', 'procesos_notariales', 'entrega_inmueble'];
const RENTA_STAGE_ORDER  = ['revision_docs', 'aprobacion_propietario', 'firma_contrato', 'entrega_llaves'];

function getStageOrder(dealType: DealType) {
  return dealType === 'renta' ? RENTA_STAGE_ORDER : COMPRA_STAGE_ORDER;
}

// ─── Document row ─────────────────────────────────────────────────────────────
type DocStatus = 'pending' | 'received' | 'validated' | 'expired';

function DocRow({ doc }: { doc: DealDocument }) {
  const [editLink, setEditLink] = useState(false);
  const [linkValue, setLinkValue] = useState(doc.reference_link ?? '');
  const updateDoc = useUpdateDealDocument();

  const saveLink = () => {
    updateDoc.mutate({ docId: doc.id, dealId: doc.deal_id, updates: { reference_link: linkValue || null } });
    setEditLink(false);
  };

  const party = doc.party ?? 'client';

  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-border/40 last:border-0">
      {/* Status selector */}
      <Select
        value={doc.status}
        onValueChange={(v) => updateDoc.mutate({ docId: doc.id, dealId: doc.deal_id, updates: { status: v as DocStatus } })}
        disabled={updateDoc.isPending}
      >
        <SelectTrigger className={cn(
          "h-6 w-[108px] shrink-0 text-[11px] font-medium border-0 px-2 rounded-full",
          doc.status === 'pending'   && "bg-muted text-muted-foreground",
          doc.status === 'received'  && "bg-blue-500/15 text-blue-400",
          doc.status === 'validated' && "bg-emerald-500/15 text-emerald-400",
          doc.status === 'expired'   && "bg-destructive/15 text-destructive",
        )}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending"   className="text-xs"><span className="text-muted-foreground">Pendiente</span></SelectItem>
          <SelectItem value="received"  className="text-xs"><span className="text-blue-400">Recibido</span></SelectItem>
          <SelectItem value="validated" className="text-xs"><span className="text-emerald-400">Validado</span></SelectItem>
          <SelectItem value="expired"   className="text-xs"><span className="text-destructive">Vencido</span></SelectItem>
        </SelectContent>
      </Select>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug", doc.status === 'validated' && "line-through text-muted-foreground")}>
          {doc.label}
        </p>
        {doc.received_at && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {format(new Date(doc.received_at), "d MMM yyyy", { locale: es })}
          </p>
        )}
        {editLink ? (
          <div className="flex items-center gap-1 mt-1">
            <Input
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              placeholder="https://..."
              className="h-6 text-xs"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && saveLink()}
            />
            <button onClick={saveLink} className="text-primary"><Check className="w-3.5 h-3.5" /></button>
          </div>
        ) : doc.reference_link ? (
          <a href={doc.reference_link} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5"
            onClick={(e) => e.stopPropagation()}>
            <Link className="w-3 h-3" /> Ver documento
          </a>
        ) : null}
      </div>

      {/* Party badge + edit link */}
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        <span className={cn(
          "text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
          party === 'client' ? "bg-blue-500/10 text-blue-400" : "bg-amber-500/10 text-amber-400"
        )}>
          {party === 'client' ? 'Cliente' : 'Inmueble'}
        </span>
        <button onClick={() => setEditLink(true)} className="text-muted-foreground hover:text-foreground transition-colors" title="Agregar link">
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Documents grouped by stage — progressive accordion ───────────────────────
const CLOSED_STAGES = ['cerrado_ganado', 'cerrado_perdido'];

function DocumentChecklist({
  dealId,
  dealType,
  currentStage,
}: {
  dealId: string;
  dealType: DealType;
  currentStage: string;
}) {
  const { data: docs = [], isLoading } = useDealDocuments(dealId);
  const stageOrder = getStageOrder(dealType);

  if (isLoading) return <p className="text-sm text-muted-foreground py-4 text-center">Cargando documentos...</p>;
  if (docs.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">Sin documentos registrados</p>;

  // Group docs by stage
  const byStage: Record<string, DealDocument[]> = {};
  docs.forEach((doc) => {
    if (!byStage[doc.deal_stage]) byStage[doc.deal_stage] = [];
    byStage[doc.deal_stage].push(doc);
  });

  // Determine which stages are visible (past + current, not future)
  const isClosed = CLOSED_STAGES.includes(currentStage);
  const currentIdx = stageOrder.indexOf(currentStage);
  // If deal is closed or stage not in list, show all stages; otherwise show up to current
  const visibleCount = isClosed || currentIdx < 0 ? stageOrder.length : currentIdx + 1;
  const visibleStages = [
    ...stageOrder.slice(0, visibleCount).filter((s) => byStage[s]?.length),
    // Any docs in stages outside stageOrder (edge case)
    ...Object.keys(byStage).filter((s) => !stageOrder.includes(s)),
  ];

  // Upcoming stages (future, no docs yet) — shown as locked hints
  const upcomingStages = stageOrder.slice(visibleCount).filter((s) => !byStage[s]?.length);

  // Overall progress
  const totalDocs      = docs.length;
  const validatedCount = docs.filter((d) => d.status === 'validated').length;
  const progressPct    = totalDocs > 0 ? Math.round((validatedCount / totalDocs) * 100) : 0;

  // Default open: only the current active stage (or all if closed)
  const defaultOpen = isClosed ? [] : currentStage ? [currentStage] : visibleStages.slice(-1);

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{validatedCount} de {totalDocs} validados</span>
          <span className="font-medium text-emerald-400">{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Accordion — past stages collapsed, current open */}
      <Accordion type="multiple" defaultValue={defaultOpen} className="space-y-2">
        {visibleStages.map((stage) => {
          const stageDocs      = byStage[stage] ?? [];
          const stageValidated = stageDocs.filter((d) => d.status === 'validated').length;
          const stageReceived  = stageDocs.filter((d) => d.status === 'received').length;
          const allDone        = stageValidated === stageDocs.length;
          const isCurrent      = stage === currentStage;

          return (
            <AccordionItem
              key={stage}
              value={stage}
              className={cn(
                "rounded-lg border overflow-hidden",
                allDone ? "border-emerald-500/30" : isCurrent ? "border-primary/40" : "border-border/60",
              )}
            >
              <AccordionTrigger
                className={cn(
                  "px-3 py-2.5 hover:no-underline hover:bg-muted/30 transition-colors [&>svg]:shrink-0",
                  allDone ? "bg-emerald-500/10" : isCurrent ? "bg-primary/5" : "bg-muted/30",
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {allDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      isCurrent ? "bg-primary" : "bg-muted-foreground/40"
                    )} />
                  )}
                  <span className={cn(
                    "text-xs font-semibold truncate",
                    allDone ? "text-emerald-400" : isCurrent ? "text-primary" : "text-muted-foreground"
                  )}>
                    {STAGE_LABELS[stage] ?? stage}
                  </span>
                  <span className="ml-auto mr-2 text-[10px] text-muted-foreground shrink-0">
                    {stageValidated}/{stageDocs.length}
                    {stageReceived > 0 && !allDone && (
                      <span className="text-blue-400 ml-1">· {stageReceived} recib.</span>
                    )}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-1 pt-0">
                {stageDocs.map((doc) => <DocRow key={doc.id} doc={doc} />)}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Upcoming stages — shown as subtle locked hints */}
      {upcomingStages.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-semibold px-1">
            Próximas etapas
          </p>
          {upcomingStages.map((stage) => (
            <div
              key={stage}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border/40 text-muted-foreground/50"
            >
              <Lock className="w-3 h-3 shrink-0" />
              <span className="text-xs">{STAGE_LABELS[stage] ?? stage}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Notes + Seguimiento tab ──────────────────────────────────────────────────
function NotesAndFollowUp({ deal }: { deal: Deal }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const updateNotes = useUpdateDealNotes();
  const createFollowup = useCreateFollowup();

  const [notes, setNotes] = useState(deal.notes ?? '');
  const [followupOpen, setFollowupOpen] = useState(false);

  const handleSaveNotes = () => {
    updateNotes.mutate({ dealId: deal.id, notes });
  };

  const handleScheduleFollowup = async (data: { due_at: string; note: string }) => {
    // Find the latest conversation for this contact
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', deal.contact_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv) {
      // No conversation yet — just navigate to inbox so they can start one
      setFollowupOpen(false);
      navigate(`/inbox?contact_id=${deal.contact_id}`);
      return;
    }

    createFollowup.mutate(
      {
        conversation_id: conv.id,
        contact_id: deal.contact_id,
        assigned_user_id: user?.id ?? null,
        due_at: data.due_at,
        note: data.note || null,
      },
      { onSuccess: () => setFollowupOpen(false) }
    );
  };

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-10"
          onClick={() => navigate(`/inbox?contact_id=${deal.contact_id}`)}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Abrir chat
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-10"
          onClick={() => setFollowupOpen(true)}
        >
          <CalendarClock className="w-3.5 h-3.5" />
          Programar seguimiento
        </Button>
      </div>

      {/* Notes */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Notas del expediente</span>
        </div>
        <Textarea
          placeholder="Observaciones, acuerdos verbales, detalles del proceso..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          className="text-sm resize-none"
        />
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={updateNotes.isPending || notes === (deal.notes ?? '')}
          onClick={handleSaveNotes}
        >
          {updateNotes.isPending ? 'Guardando...' : 'Guardar notas'}
        </Button>
      </div>

      <ScheduleFollowupModal
        open={followupOpen}
        onOpenChange={setFollowupOpen}
        onSchedule={handleScheduleFollowup}
        isLoading={createFollowup.isPending}
      />
    </div>
  );
}

// ─── Deal Detail Panel ────────────────────────────────────────────────────────
interface DealDetailPanelProps {
  deal: Deal;
  open: boolean;
  onClose: () => void;
  onMoveStage: (stage: DealStage) => void;
}

export function DealDetailPanel({ deal, open, onClose, onMoveStage }: DealDetailPanelProps) {
  const navigate = useNavigate();
  const allStages = [...getDealStagesForType(deal.deal_type), ...DEAL_CLOSED_STAGES];
  const currentStageLabel = allStages.find(s => s.value === deal.stage)?.label ?? deal.stage;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:w-[600px] sm:max-w-[600px] flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b border-border shrink-0">
          <SheetTitle className="text-base">{deal.contact?.name ?? deal.title}</SheetTitle>
          {deal.property && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="w-3.5 h-3.5" />
              <span>{deal.property.title}</span>
              {deal.property.zone && <span>· {deal.property.zone}</span>}
            </div>
          )}
        </SheetHeader>

        {/* Quick info */}
        <div className="px-5 py-3 border-b border-border shrink-0 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Etapa actual</p>
            <Select value={deal.stage} onValueChange={(v) => onMoveStage(v as DealStage)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue>{currentStageLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allStages.map(s => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Tipo</p>
            <p className="text-sm capitalize">{deal.deal_type}</p>
          </div>
          {deal.offered_price_mxn && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Precio ofertado</p>
              <p className="text-sm font-medium">${deal.offered_price_mxn.toLocaleString('es-MX')} MXN</p>
            </div>
          )}
          {deal.expected_close_date && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Cierre estimado</p>
              <p className="text-sm">{format(new Date(deal.expected_close_date), "d MMM yyyy", { locale: es })}</p>
            </div>
          )}
        </div>

        {/* Contact quick links */}
        <div className="px-5 py-2.5 border-b border-border shrink-0 flex items-center gap-3">
          {deal.contact?.phone && (
            <a href={`https://wa.me/${deal.contact.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Phone className="w-3.5 h-3.5" />
              {deal.contact.phone}
            </a>
          )}
          {deal.contact?.email && (
            <a href={`mailto:${deal.contact.email}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Mail className="w-3.5 h-3.5" />
              {deal.contact.email}
            </a>
          )}
          <button
            onClick={() => navigate(`/contacts/${deal.contact_id}`)}
            className="flex items-center gap-1 text-xs text-primary hover:underline ml-auto"
          >
            Ver contacto <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="documents" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-5 mt-3 shrink-0 grid grid-cols-3">
            <TabsTrigger value="documents" className="flex items-center gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" />
              Documentos
              {(deal.pending_docs_count ?? 0) > 0 && (
                <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                  {deal.pending_docs_count}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="followup" className="flex items-center gap-1.5 text-xs">
              <CalendarClock className="w-3.5 h-3.5" />
              Seguimiento
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-1.5 text-xs">
              <Activity className="w-3.5 h-3.5" />
              Actividad
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="flex-1 overflow-y-auto px-5 py-3 mt-0">
            <DocumentChecklist dealId={deal.id} dealType={deal.deal_type} currentStage={deal.stage} />
          </TabsContent>

          <TabsContent value="followup" className="flex-1 overflow-y-auto px-5 py-3 mt-0">
            <NotesAndFollowUp deal={deal} />
          </TabsContent>

          <TabsContent value="activity" className="flex-1 overflow-y-auto px-5 py-3 mt-0">
            <ContactActivityTimeline contactId={deal.contact_id} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
