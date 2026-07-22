import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Building2, User, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Opportunity } from "@/hooks/useOpportunities";

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return "";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency || ""}`.trim();
  }
}

interface OpportunityCardProps {
  opportunity: Opportunity;
  onClick: () => void;
}

export function OpportunityCard({ opportunity, onClick }: OpportunityCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: opportunity.id,
    data: { stageId: opportunity.stage_id },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative p-3 rounded-lg border border-border/50 bg-card transition-all",
        "hover:shadow-md hover:border-primary/30"
      )}
    >
      {/* Drag handle */}
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground"
        {...listeners}
        {...attributes}
        aria-label="Arrastrar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Clickable body */}
      <div className="cursor-pointer" onClick={onClick}>
        <h4 className="font-medium text-sm truncate pr-5">{opportunity.name}</h4>

        <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
          {opportunity.contact?.name && (
            <div className="flex items-center gap-1.5">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{opportunity.contact.name}</span>
            </div>
          )}
          {opportunity.account?.name && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{opportunity.account.name}</span>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          {opportunity.total_amount_usd != null ? (
            <span className="text-sm font-semibold text-foreground">
              {formatMoney(opportunity.total_amount_usd, opportunity.currency)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/60">Sin monto</span>
          )}
          {opportunity.close_probability != null && opportunity.close_probability > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 h-5 shrink-0">
              {opportunity.close_probability}%
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
