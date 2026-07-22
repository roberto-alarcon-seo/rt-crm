import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OpportunityCard, formatMoney } from "./OpportunityCard";
import type { Opportunity } from "@/hooks/useOpportunities";
import type { PipelineStage } from "@/hooks/usePipelines";

interface KanbanColumnProps {
  stage: PipelineStage;
  opportunities: Opportunity[];
  onCardClick: (opp: Opportunity) => void;
}

export function KanbanColumn({ stage, opportunities, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stageId: stage.id } });

  const total = opportunities.reduce((sum, o) => sum + (o.total_amount_usd ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg border transition-colors",
        isOver ? "border-primary/60 bg-primary/5" : "border-border/50"
      )}
    >
      {/* Column header */}
      <div className="p-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
            <h3 className="font-medium text-sm truncate">{stage.name}</h3>
            {stage.stage_type === "won" && <span className="text-xs">✓</span>}
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            {opportunities.length}
          </Badge>
        </div>
        {total > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">{formatMoney(total, "USD")}</p>
        )}
      </div>

      {/* Column content */}
      <ScrollArea className="flex-1 p-2 max-h-[calc(100vh-260px)]">
        <div className="space-y-2 min-h-[60px]">
          {opportunities.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Sin oportunidades</div>
          ) : (
            opportunities.map((opp) => (
              <OpportunityCard key={opp.id} opportunity={opp} onClick={() => onCardClick(opp)} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
