import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Trend = "up" | "down" | "neutral";

interface Props {
  label: string;
  value: string | number;
  trend?: Trend;
  trendText?: string;
  color?: "default" | "success" | "warning" | "danger";
  description?: string;
}

const colorMap = {
  default:  { bg: "bg-violet-500/10",  border: "border-violet-500/20",  text: "text-violet-400"  },
  success:  { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400" },
  warning:  { bg: "bg-amber-500/10",   border: "border-amber-500/20",   text: "text-amber-400"   },
  danger:   { bg: "bg-red-500/10",     border: "border-red-500/20",     text: "text-red-400"     },
};

const TrendIcon = ({ trend }: { trend: Trend }) => {
  if (trend === "up")      return <TrendingUp  className="w-3.5 h-3.5 text-emerald-400" />;
  if (trend === "down")    return <TrendingDown className="w-3.5 h-3.5 text-red-400"    />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
};

export function MessageInsight({
  label,
  value,
  trend = "neutral",
  trendText,
  color = "default",
  description,
}: Props) {
  const c = colorMap[color];

  return (
    <div className={cn("rounded-xl border p-4 flex flex-col gap-1.5", c.bg, c.border)}>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={cn("text-2xl font-bold", c.text)}>{value}</p>
      {(trend !== "neutral" || trendText) && (
        <div className="flex items-center gap-1.5">
          <TrendIcon trend={trend} />
          {trendText && (
            <span className="text-xs text-muted-foreground">{trendText}</span>
          )}
        </div>
      )}
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      )}
    </div>
  );
}
