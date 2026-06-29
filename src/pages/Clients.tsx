import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Search, Loader2, Calendar, FileText, AlertCircle,
  ChevronRight, Building2, Handshake, ShoppingCart, Key, Home, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { differenceInDays, format, subDays, startOfMonth, startOfYear, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { useDeals, useMoveDealStage, DEAL_STAGES, RENTA_DEAL_STAGES, DEAL_CLOSED_STAGES, getDealStagesForType, Deal, DealStage, DealType } from "@/hooks/useDeals";
import { DealDetailPanel } from "@/components/clients/DealDetailPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTenantSettings } from "@/hooks/useTenantSettings";

type ViewType = 'compra' | 'renta' | 'captacion';

// ─── Date Range Picker (GA-style) ─────────────────────────────────────────────
const DATE_PRESETS = [
  { label: "Hoy",              value: "today",       range: (): DateRange => ({ from: new Date(), to: new Date() }) },
  { label: "Ayer",             value: "yesterday",   range: (): DateRange => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: "Últimos 7 días",   value: "7d",          range: (): DateRange => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "Últimos 30 días",  value: "30d",         range: (): DateRange => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: "Este mes",         value: "this_month",  range: (): DateRange => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: "Mes anterior",     value: "last_month",  range: (): DateRange => ({ from: startOfMonth(subMonths(new Date(), 1)), to: subDays(startOfMonth(new Date()), 1) }) },
  { label: "Este año",         value: "this_year",   range: (): DateRange => ({ from: startOfYear(new Date()), to: new Date() }) },
];

function ClientsDatePicker({
  range,
  onRangeChange,
}: {
  range: DateRange;
  onRangeChange: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState("today");
  const [tempRange, setTempRange] = useState<DateRange>(range);

  const handlePreset = useCallback((preset: typeof DATE_PRESETS[number]) => {
    const r = preset.range();
    setActivePreset(preset.value);
    setTempRange(r);
    onRangeChange(r);
    setOpen(false);
  }, [onRangeChange]);

  const handleCalendarSelect = useCallback((r: DateRange | undefined) => {
    if (r) {
      setTempRange(r);
      setActivePreset("custom");
    }
  }, []);

  const handleApply = useCallback(() => {
    if (tempRange?.from) {
      onRangeChange({ from: tempRange.from, to: tempRange.to ?? tempRange.from });
    }
    setOpen(false);
  }, [tempRange, onRangeChange]);

  const displayLabel = () => {
    const preset = DATE_PRESETS.find(p => p.value === activePreset);
    if (preset && activePreset !== "custom") return preset.label;
    if (range.from && range.to) {
      if (format(range.from, 'yyyy-MM-dd') === format(range.to, 'yyyy-MM-dd'))
        return format(range.from, "d MMM yyyy", { locale: es });
      return `${format(range.from, "d MMM", { locale: es })} – ${format(range.to, "d MMM yyyy", { locale: es })}`;
    }
    return "Seleccionar período";
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setTempRange(range); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal text-sm">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{displayLabel()}</span>
          {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          {/* Presets sidebar */}
          <div className="border-r border-border bg-muted/30 p-2 space-y-0.5 min-w-[130px]">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePreset(preset)}
                className={cn(
                  "w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors",
                  activePreset === preset.value
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="p-3">
            <CalendarPicker
              mode="range"
              defaultMonth={tempRange?.from ?? subDays(new Date(), 29)}
              selected={tempRange}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
              locale={es}
              disabled={(d) => d > new Date()}
            />
            <div className="flex items-center justify-between border-t border-border pt-2.5 mt-1">
              <p className="text-xs text-muted-foreground">
                {tempRange?.from && tempRange?.to
                  ? `${differenceInDays(tempRange.to, tempRange.from) + 1} día${differenceInDays(tempRange.to, tempRange.from) !== 0 ? 's' : ''}`
                  : tempRange?.from ? "Selecciona fecha fin" : "Selecciona un rango"}
              </p>
              <Button size="sm" className="h-7 text-xs" onClick={handleApply} disabled={!tempRange?.from}>
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Deal Card (desktop) ──────────────────────────────────────────────────────
function DealCard({ deal, onClick, onMoveStage }: {
  deal: Deal;
  onClick: () => void;
  onMoveStage: (stage: DealStage) => void;
}) {
  const { currency, locale } = useTenantSettings();
  const daysInStage = differenceInDays(new Date(), new Date(deal.updated_at));
  const hasPendingDocs = (deal.pending_docs_count ?? 0) > 0;
  const isStale = daysInStage > 7;
  const allStages = [...getDealStagesForType(deal.deal_type), ...DEAL_CLOSED_STAGES];

  return (
    <div
      className={cn(
        "group p-3 rounded-lg border bg-card cursor-pointer transition-all",
        "hover:shadow-md hover:border-primary/30",
        isStale && "border-l-2 border-l-amber-500/70",
      )}
      onClick={onClick}
    >
      <div className="mb-2">
        <p className="font-medium text-sm truncate">{deal.contact?.name ?? '—'}</p>
        {deal.property ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Building2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{deal.property.title}</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">{deal.title}</p>
        )}
      </div>
      {deal.offered_price_mxn && (
        <p className="text-xs font-medium text-primary mb-2">
          {deal.offered_price_mxn.toLocaleString(locale)} {currency}
        </p>
      )}
      <div className="space-y-1 text-xs text-muted-foreground">
        <div className={cn("flex items-center gap-1", isStale && "text-amber-400")}>
          <Calendar className="w-3 h-3" />
          <span>{daysInStage === 0 ? 'Hoy' : `${daysInStage}d en esta etapa`}</span>
        </div>
        {hasPendingDocs && (
          <div className="flex items-center gap-1 text-destructive">
            <AlertCircle className="w-3 h-3" />
            <span>{deal.pending_docs_count} doc{deal.pending_docs_count !== 1 ? 's' : ''} pendiente{deal.pending_docs_count !== 1 ? 's' : ''}</span>
          </div>
        )}
        {deal.expected_close_date && (
          <div className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            <span>Cierre: {new Date(deal.expected_close_date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
          </div>
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] text-muted-foreground shrink-0">Mover a:</span>
          <Select onValueChange={(v) => { onMoveStage(v as DealStage); }}>
            <SelectTrigger className="h-6 flex-1 text-[10px]" onClick={(e) => e.stopPropagation()}>
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent onClick={(e) => e.stopPropagation()}>
              {allStages.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ─── Deal Row (mobile) ────────────────────────────────────────────────────────
function DealRow({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const daysInStage = differenceInDays(new Date(), new Date(deal.updated_at));
  const hasPendingDocs = (deal.pending_docs_count ?? 0) > 0;
  const isStale = daysInStage > 7;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left",
        "border-b border-border/50 active:bg-muted/50 transition-colors",
        isStale && "border-l-2 border-l-amber-500/70",
      )}
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <span className="text-xs font-semibold text-primary">
          {(deal.contact?.name ?? '?').charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{deal.contact?.name ?? '—'}</p>
        <p className="text-xs text-muted-foreground truncate">
          {deal.property?.title ?? deal.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn("text-[11px]", isStale ? "text-amber-400" : "text-muted-foreground")}>
            {daysInStage === 0 ? 'Hoy' : `${daysInStage}d`}
          </span>
          {deal.offered_price_mxn && (
            <span className="text-[11px] text-primary font-medium">
              ${(deal.offered_price_mxn / 1_000_000).toFixed(1)}M
            </span>
          )}
          {hasPendingDocs && (
            <span className="text-[11px] text-destructive flex items-center gap-0.5">
              <AlertCircle className="w-3 h-3" />
              {deal.pending_docs_count}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

// ─── Mobile Stage Section ─────────────────────────────────────────────────────
function MobileStageSection({
  stage, deals, onDealClick,
}: {
  stage: { value: DealStage; label: string; color: string; bgColor: string };
  deals: Deal[];
  onDealClick: (deal: Deal) => void;
}) {
  const [open, setOpen] = useState(true);
  if (deals.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/50"
      >
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full shrink-0", stage.bgColor)} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {stage.label}
          </span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{deals.length}</Badge>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
      </button>
      {open && deals.map(deal => (
        <DealRow key={deal.id} deal={deal} onClick={() => onDealClick(deal)} />
      ))}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ deals, mobile }: { deals: Deal[]; mobile?: boolean }) {
  const { currency } = useTenantSettings();
  const active = deals.filter(d => d.status === 'active').length;
  const totalValue = deals.filter(d => d.status === 'active').reduce((sum, d) => sum + (d.offered_price_mxn ?? 0), 0);
  const pendingDocs = deals.reduce((sum, d) => sum + (d.pending_docs_count ?? 0), 0);

  if (mobile) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-muted/20">
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{active}</span> en proceso
        </span>
        {totalValue > 0 && (
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">${(totalValue / 1_000_000).toFixed(1)}M</span> {currency}
          </span>
        )}
        {pendingDocs > 0 && (
          <span className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            <span className="font-semibold">{pendingDocs} docs</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 text-sm">
      <div>
        <span className="text-muted-foreground">En proceso: </span>
        <span className="font-semibold">{active}</span>
      </div>
      {totalValue > 0 && (
        <div>
          <span className="text-muted-foreground">Valor total: </span>
          <span className="font-semibold">${(totalValue / 1_000_000).toFixed(1)}M {currency}</span>
        </div>
      )}
      {pendingDocs > 0 && (
        <div className="flex items-center gap-1 text-destructive">
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="font-semibold">{pendingDocs} docs pendientes</span>
        </div>
      )}
    </div>
  );
}

// ─── View Tabs ────────────────────────────────────────────────────────────────
const VIEW_TABS: { type: ViewType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'compra',    label: 'Compra',    icon: ShoppingCart },
  { type: 'renta',     label: 'Renta',     icon: Key },
  { type: 'captacion', label: 'Captación', icon: Home },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Clients() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { currency, locale } = useTenantSettings();
  const [search, setSearch]   = useState('');
  const [viewType, setViewType] = useState<ViewType>('compra');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ from: new Date(), to: new Date() });

  const dateFrom = dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined;
  const dateTo   = (dateRange.to ?? dateRange.from) ? format(dateRange.to ?? dateRange.from!, 'yyyy-MM-dd') : undefined;

  const { data: deals = [], isLoading } = useDeals({ dateFrom, dateTo });
  const moveDealStage = useMoveDealStage();

  const activeDeals = deals.filter(d => d.status === 'active');
  const viewDeals   = activeDeals.filter(d => d.deal_type === viewType);
  const filteredDeals = viewDeals.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.contact?.name?.toLowerCase().includes(q) ||
      d.title.toLowerCase().includes(q) ||
      d.property?.title?.toLowerCase().includes(q)
    );
  });

  const currentStages = viewType === 'renta' ? RENTA_DEAL_STAGES : DEAL_STAGES;

  const dealsByStage = currentStages.reduce<Record<string, Deal[]>>((acc, stage) => {
    acc[stage.value] = filteredDeals.filter(d => d.stage === stage.value);
    return acc;
  }, {} as Record<string, Deal[]>);

  const handleMoveStage = (dealId: string, stage: DealStage) => {
    moveDealStage.mutate({ dealId, stage });
    if (selectedDeal?.id === dealId) {
      setSelectedDeal(prev => prev ? { ...prev, stage } : null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Mobile layout ────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Handshake className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">Clientes</h1>
            <p className="text-xs text-muted-foreground">Expedientes activos</p>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-border shrink-0 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente o inmueble..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <ClientsDatePicker range={dateRange} onRangeChange={setDateRange} />
        </div>

        {/* Stats */}
        <StatsBar deals={deals} mobile />

        {/* View tabs */}
        <div className="flex border-b border-border shrink-0">
          {VIEW_TABS.map(({ type, label, icon: Icon }) => {
            const count = activeDeals.filter(d => d.deal_type === type).length;
            return (
              <button
                key={type}
                onClick={() => setViewType(type)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  viewType === type
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                {count > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1">{count}</Badge>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {activeDeals.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Sin clientes activos</p>
              <p className="text-sm text-muted-foreground mt-1">
                Convierte un lead en cliente desde el Pipeline.
              </p>
            </div>
          </div>
        ) : viewDeals.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 text-muted-foreground">
            <p className="text-sm">No hay expedientes de <strong>{VIEW_TABS.find(t => t.type === viewType)?.label}</strong> activos.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {currentStages.map(stage => (
              <MobileStageSection
                key={stage.value}
                stage={stage}
                deals={dealsByStage[stage.value] ?? []}
                onDealClick={setSelectedDeal}
              />
            ))}
          </div>
        )}

        {selectedDeal && (
          <DealDetailPanel
            deal={selectedDeal}
            open={!!selectedDeal}
            onClose={() => setSelectedDeal(null)}
            onMoveStage={(stage) => handleMoveStage(selectedDeal.id, stage)}
          />
        )}
      </div>
    );
  }

  // ── Desktop layout ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Handshake className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Clientes</h1>
            <p className="text-xs text-muted-foreground">Expedientes de negociación activos</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatsBar deals={deals} />

          <ClientsDatePicker range={dateRange} onRangeChange={setDateRange} />

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente o inmueble..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-56 h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 px-6 pt-3 pb-0 shrink-0 border-b border-border">
        {VIEW_TABS.map(({ type, label, icon: Icon }) => {
          const count = activeDeals.filter(d => d.deal_type === type).length;
          return (
            <button
              key={type}
              onClick={() => setViewType(type)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                viewType === type
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {count > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-0.5">{count}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {activeDeals.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Sin clientes activos</p>
            <p className="text-sm text-muted-foreground mt-1">
              Convierte un lead en cliente desde el Pipeline cuando entre en negociación.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate('/pipeline')}>
            Ir al Pipeline <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          {viewDeals.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <p className="text-sm">No hay expedientes de <strong>{VIEW_TABS.find(t => t.type === viewType)?.label}</strong> activos.</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/pipeline')}>
                Ir al Pipeline <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-4 h-full min-w-max">
              {currentStages.map((stage) => (
                <KanbanColumn
                  key={stage.value}
                  stage={stage}
                  deals={dealsByStage[stage.value] ?? []}
                  onDealClick={setSelectedDeal}
                  onMoveStage={handleMoveStage}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {selectedDeal && (
        <DealDetailPanel
          deal={selectedDeal}
          open={!!selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onMoveStage={(stage) => handleMoveStage(selectedDeal.id, stage)}
        />
      )}
    </div>
  );
}

// ─── Kanban Column (desktop only) ─────────────────────────────────────────────
function KanbanColumn({ stage, deals, onDealClick, onMoveStage }: {
  stage: { value: DealStage; label: string; color: string; bgColor: string };
  deals: Deal[];
  onDealClick: (deal: Deal) => void;
  onMoveStage: (dealId: string, stage: DealStage) => void;
}) {
  const { currency, locale } = useTenantSettings();
  const total = deals.reduce((sum, d) => sum + (d.offered_price_mxn ?? 0), 0);

  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg border border-border/50">
      <div className="p-3 border-b border-border/50">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", stage.bgColor)} />
            <h3 className="font-medium text-sm">{stage.label}</h3>
          </div>
          <Badge variant="secondary" className="text-xs">{deals.length}</Badge>
        </div>
        {total > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {total.toLocaleString(locale)} {currency} en proceso
          </p>
        )}
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {deals.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Sin expedientes</div>
          ) : (
            deals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                onClick={() => onDealClick(deal)}
                onMoveStage={(stage) => onMoveStage(deal.id, stage)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
