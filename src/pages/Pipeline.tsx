import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, closestCorners,
} from "@dnd-kit/core";
import { Loader2, Plus, RefreshCw, Search, Settings2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePipelines, usePipelineStages } from "@/hooks/usePipelines";
import { useOpportunities, type Opportunity } from "@/hooks/useOpportunities";
import { useMoveOpportunityStage } from "@/hooks/useMoveOpportunityStage";
import { KanbanColumn } from "@/components/pipeline/KanbanColumn";
import { OpportunityCard, formatMoney } from "@/components/pipeline/OpportunityCard";
import { OpportunityDetailPanel } from "@/components/pipeline/OpportunityDetailPanel";

export default function Pipeline() {
  const navigate = useNavigate();
  const { tenantRole, isSuperAdmin } = useAuth();
  const canConfigure = isSuperAdmin || tenantRole === "administrador";

  const { data: pipelines = [], isLoading: loadingPipelines } = usePipelines();
  const [activePipelineId, setActivePipelineId] = useState<string>("");

  // Default to the tenant's default pipeline (or the first one)
  useEffect(() => {
    if (!activePipelineId && pipelines.length > 0) {
      const def = pipelines.find((p) => p.is_default) ?? pipelines[0];
      setActivePipelineId(def.id);
    }
  }, [pipelines, activePipelineId]);

  const { data: stages = [] } = usePipelineStages(activePipelineId || undefined);
  const [search, setSearch] = useState("");
  const { data: opportunities = [], isLoading: loadingOpps, refetch, isRefetching } =
    useOpportunities(activePipelineId || undefined);

  const move = useMoveOpportunityStage();

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const filteredOpps = useMemo(() => {
    if (!search.trim()) return opportunities;
    const q = search.toLowerCase();
    return opportunities.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.contact?.name?.toLowerCase().includes(q) ||
        o.account?.name?.toLowerCase().includes(q)
    );
  }, [opportunities, search]);

  const oppsByStage = useMemo(() => {
    const grouped: Record<string, Opportunity[]> = {};
    stages.forEach((s) => { grouped[s.id] = []; });
    filteredOpps.forEach((o) => {
      if (o.stage_id && grouped[o.stage_id]) grouped[o.stage_id].push(o);
    });
    Object.keys(grouped).forEach((k) =>
      grouped[k].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    );
    return grouped;
  }, [filteredOpps, stages]);

  const stats = useMemo(() => {
    const openOpps = filteredOpps.filter((o) => o.status === "open");
    const openValue = openOpps.reduce((s, o) => s + (o.total_amount_usd ?? 0), 0);
    const weighted = openOpps.reduce(
      (s, o) => s + (o.total_amount_usd ?? 0) * ((o.close_probability ?? 0) / 100), 0
    );
    return {
      openCount: openOpps.length,
      wonCount: filteredOpps.filter((o) => o.status === "won").length,
      lostCount: filteredOpps.filter((o) => o.status === "lost").length,
      openValue,
      weighted,
    };
  }, [filteredOpps]);

  const activeOpp = useMemo(
    () => opportunities.find((o) => o.id === activeDragId) ?? null,
    [opportunities, activeDragId]
  );

  const handleDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;

    const opp = opportunities.find((o) => o.id === active.id);
    if (!opp) return;

    // `over.id` is a stage id (columns are droppables keyed by stage id)
    const toStageId = String(over.id);
    if (!stages.some((s) => s.id === toStageId)) return;
    if (opp.stage_id === toStageId) return;

    const fromStage = stages.find((s) => s.id === opp.stage_id);
    const toStage = stages.find((s) => s.id === toStageId);
    const toPosition = (oppsByStage[toStageId]?.length ?? 0);

    move.mutate({
      opportunityId: opp.id,
      pipelineId: activePipelineId,
      toStageId,
      toPosition,
      contactId: opp.primary_contact_id,
      newLegacyKey: toStage?.legacy_stage_key ?? null,
      oldLegacyKey: fromStage?.legacy_stage_key ?? null,
    });
  };

  const openNew = () => { setEditingOpp(null); setPanelOpen(true); };
  const openEdit = (opp: Opportunity) => { setEditingOpp(opp); setPanelOpen(true); };

  const handleRefresh = async () => {
    await refetch();
    toast.success("Pipeline actualizado");
  };

  if (loadingPipelines) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <TrendingUp className="h-12 w-12 text-muted-foreground/40" />
        <div>
          <h2 className="text-lg font-semibold">Aún no tienes pipelines</h2>
          <p className="text-sm text-muted-foreground">Crea tu primer pipeline para empezar a gestionar oportunidades.</p>
        </div>
        {canConfigure && (
          <Button onClick={() => navigate("/settings/pipelines")}>
            <Settings2 className="h-4 w-4 mr-2" /> Configurar pipelines
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Oportunidades</h1>
              <p className="text-sm text-muted-foreground">Pipelines dinámicos — de captación a cierre</p>
            </div>
            <Select value={activePipelineId} onValueChange={setActivePipelineId}>
              <SelectTrigger className="w-56 ml-2">
                <SelectValue placeholder="Selecciona un pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.is_default ? " ·" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} /> Actualizar
            </Button>
            {canConfigure && (
              <Button variant="outline" size="sm" onClick={() => navigate("/settings/pipelines")}>
                <Settings2 className="h-4 w-4 mr-2" /> Configurar
              </Button>
            )}
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Nueva oportunidad
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 mb-4 flex-wrap text-sm">
          <span><strong>{stats.openCount}</strong> en proceso</span>
          <span className="text-green-500"><strong>{stats.wonCount}</strong> ganadas</span>
          <span className="text-destructive"><strong>{stats.lostCount}</strong> perdidas</span>
          <span className="text-muted-foreground">Valor abierto: <strong className="text-foreground">{formatMoney(stats.openValue, "USD")}</strong></span>
          <span className="text-muted-foreground">Forecast ponderado: <strong className="text-foreground">{formatMoney(stats.weighted, "USD")}</strong></span>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar oportunidad, contacto o empresa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Kanban board */}
      {loadingOpps ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-4 p-4 min-w-max h-full">
              {stages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  opportunities={oppsByStage[stage.id] ?? []}
                  onCardClick={openEdit}
                />
              ))}
            </div>
          </div>
          <DragOverlay>
            {activeOpp ? <OpportunityCard opportunity={activeOpp} onClick={() => {}} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {activePipelineId && (
        <OpportunityDetailPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          pipelineId={activePipelineId}
          opportunity={editingOpp}
        />
      )}
    </div>
  );
}
