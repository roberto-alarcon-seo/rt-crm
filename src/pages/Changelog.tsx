import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Sparkles, Wrench, TrendingUp, ShieldCheck, Code2, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  CHANGELOG, CHANGE_TYPE_LABELS, ChangeType, Release,
} from "@/data/changelog";
import { APP_VERSION } from "@/version";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const TYPE_STYLES: Record<ChangeType, { icon: typeof Sparkles; badge: string; dot: string }> = {
  feature: {
    icon: Sparkles,
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  improvement: {
    icon: TrendingUp,
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    dot: "bg-blue-500",
  },
  fix: {
    icon: Wrench,
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    dot: "bg-amber-500",
  },
  security: {
    icon: ShieldCheck,
    badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30",
    dot: "bg-violet-500",
  },
  internal: {
    icon: Code2,
    badge: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/50",
  },
};

const FILTERS: { value: ChangeType | "all"; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "feature", label: "Nuevo" },
  { value: "improvement", label: "Mejoras" },
  { value: "fix", label: "Correcciones" },
  { value: "security", label: "Seguridad" },
  { value: "internal", label: "Interno" },
];

export default function Changelog() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ChangeType | "all">("all");

  /** Releases con el filtro aplicado; las que se quedan sin cambios se ocultan. */
  const releases = useMemo<Release[]>(() => {
    if (filter === "all") return CHANGELOG;
    return CHANGELOG
      .map(r => ({ ...r, changes: r.changes.filter(c => c.type === filter) }))
      .filter(r => r.changes.length > 0);
  }, [filter]);

  const totalChanges = CHANGELOG.reduce((n, r) => n + r.changes.length, 0);

  const formatDate = (iso: string) => {
    try {
      return format(parseISO(iso), "d 'de' MMMM 'de' yyyy", { locale: es });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-full">
      {/* Barra superior */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate(-1)}
            aria-label="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold leading-tight flex items-center gap-2">
              <History className="h-4 w-4" />
              Novedades
            </h1>
            <p className="text-xs text-muted-foreground">
              {CHANGELOG.length} versiones · {totalChanges} cambios
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 font-mono text-xs">
            v{APP_VERSION}
          </Badge>
        </div>

        {/* Filtros por tipo */}
        <div className="max-w-4xl mx-auto px-6 pb-3 flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors border",
                filter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 pb-24">
        {releases.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sin cambios de este tipo todavía</p>
          </div>
        ) : (
          <div className="space-y-8">
            {releases.map((release, i) => {
              const isCurrent = release.version === APP_VERSION;
              return (
                <section key={release.version}>
                  {/* Encabezado de versión */}
                  <div className="flex items-baseline gap-3 flex-wrap mb-3">
                    <h2 className="text-lg font-bold font-mono">v{release.version}</h2>
                    {isCurrent && (
                      <Badge className="h-5 text-[10px]">Versión actual</Badge>
                    )}
                    {i === 0 && !isCurrent && (
                      <Badge variant="destructive" className="h-5 text-[10px]">
                        No coincide con APP_VERSION
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(release.date)}
                    </span>
                  </div>

                  {release.headline && (
                    <p className="text-sm text-muted-foreground mb-3 -mt-1">
                      {release.headline}
                    </p>
                  )}

                  <Card>
                    <CardContent className="p-0 divide-y divide-border/60">
                      {release.changes.map((change, j) => {
                        const style = TYPE_STYLES[change.type];
                        const Icon = style.icon;
                        return (
                          <div key={j} className="flex items-start gap-3 p-3.5">
                            <span
                              className={cn(
                                "mt-0.5 flex h-6 w-6 items-center justify-center rounded-md shrink-0 border",
                                style.badge
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className={cn(
                                  "text-[10px] font-semibold uppercase tracking-wider",
                                  change.type === "internal"
                                    ? "text-muted-foreground/70"
                                    : "text-foreground/70"
                                )}>
                                  {CHANGE_TYPE_LABELS[change.type]}
                                </span>
                                {change.area && (
                                  <>
                                    <span className="text-muted-foreground/40 text-[10px]">·</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {change.area}
                                    </span>
                                  </>
                                )}
                              </div>
                              <p className="text-sm leading-relaxed">{change.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
