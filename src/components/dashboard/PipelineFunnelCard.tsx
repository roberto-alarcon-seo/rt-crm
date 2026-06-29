import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stage {
  stage: string;
  label: string;
  count: number;
  color: string;
  percentage: number;
}

interface PipelineFunnelCardProps {
  stages: Stage[];
  total: number;
  isLoading?: boolean;
}

export function PipelineFunnelCard({ stages, total, isLoading }: PipelineFunnelCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const activeStages = stages.filter(s => s.count > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Pipeline de Oportunidades
          </CardTitle>
          <span className="text-xs text-muted-foreground">{total} total</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {activeStages.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sin datos de pipeline aún
          </p>
        ) : (
          activeStages.map((stage) => (
            <div key={stage.stage} className="flex items-center gap-3">
              <div className="w-28 shrink-0">
                <span className="text-xs text-muted-foreground truncate block">{stage.label}</span>
              </div>
              <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(stage.percentage, 2)}%`,
                    backgroundColor: stage.color,
                  }}
                />
              </div>
              <span className="text-xs font-medium w-6 text-right shrink-0">{stage.count}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
