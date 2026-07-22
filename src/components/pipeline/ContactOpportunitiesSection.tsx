import { useEffect, useState } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePipelines } from "@/hooks/usePipelines";
import { useContactOpportunities, type Opportunity } from "@/hooks/useOpportunities";
import { OpportunityDetailPanel } from "./OpportunityDetailPanel";
import { formatMoney } from "./OpportunityCard";

interface Props {
  contactId: string;
  accountId: string | null;
  contactName: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "Abierta", className: "" },
  won: { label: "Ganada", className: "bg-green-500/15 text-green-500 border-green-500/30" },
  lost: { label: "Perdida", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

export function ContactOpportunitiesSection({ contactId, accountId, contactName }: Props) {
  const { data: opportunities = [], isLoading } = useContactOpportunities(contactId);
  const { data: pipelines = [] } = usePipelines();

  const [createPipelineId, setCreatePipelineId] = useState<string>("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);

  useEffect(() => {
    if (!createPipelineId && pipelines.length > 0) {
      setCreatePipelineId((pipelines.find((p) => p.is_default) ?? pipelines[0]).id);
    }
  }, [pipelines, createPipelineId]);

  const openNew = () => { setEditing(null); setPanelOpen(true); };
  const openEdit = (opp: Opportunity) => {
    setEditing(opp);
    setCreatePipelineId(opp.pipeline_id ?? createPipelineId);
    setPanelOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">Oportunidades</h2>
          <p className="text-sm text-muted-foreground">Negocios de este contacto en cualquier pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          {pipelines.length > 1 && (
            <Select value={createPipelineId} onValueChange={setCreatePipelineId}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={openNew} disabled={!createPipelineId}>
            <Plus className="h-4 w-4 mr-1.5" /> Nueva
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : opportunities.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-lg">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm text-muted-foreground">Este contacto no tiene oportunidades aún.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {opportunities.map((opp) => {
            const badge = STATUS_BADGE[opp.status] ?? STATUS_BADGE.open;
            return (
              <Card key={opp.id} className="p-3 cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => openEdit(opp)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{opp.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      {opp.pipeline?.name && <span>{opp.pipeline.name}</span>}
                      {opp.stage?.name && (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: opp.stage.color }} />
                          {opp.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {opp.total_amount_usd != null && (
                      <span className="text-sm font-semibold">{formatMoney(opp.total_amount_usd, opp.currency)}</span>
                    )}
                    <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {createPipelineId && (
        <OpportunityDetailPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          pipelineId={editing?.pipeline_id ?? createPipelineId}
          opportunity={editing}
          prefill={{ primary_contact_id: contactId, account_id: accountId, name: `${contactName} — ` }}
        />
      )}
    </div>
  );
}
