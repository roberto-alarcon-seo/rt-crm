import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";

interface Channel {
  channel: string;
  label: string;
  leads: number;
  opportunities: number;
  color: string;
}

interface ChannelAttributionCardProps {
  channels: Channel[];
  isLoading?: boolean;
}

export function ChannelAttributionCard({ channels, isLoading }: ChannelAttributionCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const maxLeads = Math.max(...channels.map(c => c.leads), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Atribución por Canal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sin datos de atribución aún
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 text-xs text-muted-foreground pb-1 border-b border-border/40">
              <span>Canal</span>
              <span className="text-center">Leads</span>
              <span className="text-center">Oportunidades</span>
            </div>
            {channels.map((ch) => (
              <div key={ch.channel} className="space-y-1">
                <div className="grid grid-cols-3 items-center text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: ch.color }}
                    />
                    <span className="text-xs truncate">{ch.label}</span>
                  </div>
                  <span className="text-center text-xs font-medium">{ch.leads}</span>
                  <span className="text-center text-xs text-muted-foreground">{ch.opportunities}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden ml-4">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(ch.leads / maxLeads) * 100}%`,
                      backgroundColor: ch.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
