import { MessageInsight } from "./MessageInsight";
import { MessageTable } from "./MessageTable";
import { MessageText } from "./MessageText";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPI {
  label: string;
  value: string;
  trend?: "up" | "down" | "neutral";
  color?: "default" | "success" | "warning" | "danger";
}

interface Alert {
  label: string;
  description: string;
  severity: "danger" | "warning" | "normal";
}

interface Props {
  text?: string;
  data: {
    dateLabel: string;
    kpis: KPI[];
    alerts: Alert[];
    topDeals?: { columns: string[]; rows: Record<string, string>[] };
  };
}

const severityIcon = {
  danger:  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
  normal:  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
};

const severityBorder = {
  danger:  "border-red-500/20 bg-red-500/5",
  warning: "border-amber-500/20 bg-amber-500/5",
  normal:  "border-emerald-500/20 bg-emerald-500/5",
};

export function MessageDailySummary({ text, data }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {text && <MessageText text={text} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        {data.kpis.map((kpi, i) => (
          <MessageInsight key={i} {...kpi} />
        ))}
      </div>

      {/* Alertas */}
      {data.alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Puntos de atención
          </p>
          <div className="flex flex-col gap-1.5">
            {data.alerts.map((alert, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2",
                  severityBorder[alert.severity],
                )}
              >
                {severityIcon[alert.severity]}
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-tight">{alert.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{alert.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top deals */}
      {data.topDeals && data.topDeals.rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Deals prioritarios</p>
          <MessageTable
            columns={data.topDeals.columns}
            rows={data.topDeals.rows}
            pageSize={5}
          />
        </div>
      )}
    </div>
  );
}
