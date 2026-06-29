import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  format,
  startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, addDays, subDays,
  startOfMonth, endOfMonth, addMonths, subMonths,
  isSameDay, isToday, isSameMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Event } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────
interface EventAgendaViewProps {
  events: Event[];
  isLoading: boolean;
  onEventClick: (event: Event) => void;
}

type AgendaMode = "day" | "week" | "month";

// ─── Time grid constants ──────────────────────────────────────
const START_HOUR = 7;
const END_HOUR = 23;
const HOURS_COUNT = END_HOUR - START_HOUR; // 16
const HOUR_HEIGHT = 64; // px per hour
const MIN_HEIGHT = HOUR_HEIGHT / 60; // px per minute
const TOTAL_HEIGHT = HOURS_COUNT * HOUR_HEIGHT; // 1024px

const HOURS = Array.from({ length: HOURS_COUNT }, (_, i) => START_HOUR + i);

// ─── Status styles ────────────────────────────────────────────
const S: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  scheduled: { border: "border-l-blue-500",    bg: "bg-blue-500/[.08]",    text: "text-blue-700 dark:text-blue-300",     dot: "bg-blue-500"    },
  confirmed: { border: "border-l-emerald-500", bg: "bg-emerald-500/[.08]", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  canceled:  { border: "border-l-gray-400",    bg: "bg-gray-500/[.06]",    text: "text-muted-foreground",                dot: "bg-gray-400"    },
  completed: { border: "border-l-violet-500",  bg: "bg-violet-500/[.08]",  text: "text-violet-700 dark:text-violet-300",  dot: "bg-violet-500"  },
  no_show:   { border: "border-l-orange-500",  bg: "bg-orange-500/[.08]",  text: "text-orange-700 dark:text-orange-300",  dot: "bg-orange-500"  },
};

function st(status: string) {
  return S[status] ?? S.scheduled;
}

// ─── Helpers ─────────────────────────────────────────────────
function fmtHour(h: number) {
  if (h === 0 || h === 24) return "12 am";
  if (h < 12) return `${h} am`;
  if (h === 12) return "12 pm";
  return `${h - 12} pm`;
}

function getTop(ev: Event): number {
  const d = new Date(ev.start_at);
  return Math.max((d.getHours() - START_HOUR) * 60 + d.getMinutes(), 0) * MIN_HEIGHT;
}

function getHeight(ev: Event): number {
  const s = new Date(ev.start_at);
  const e = ev.end_at ? new Date(ev.end_at) : new Date(s.getTime() + 3_600_000);
  return Math.max((e.getTime() - s.getTime()) / 60_000, 15) * MIN_HEIGHT;
}

function nowTop(): number {
  const d = new Date();
  return ((d.getHours() - START_HOUR) * 60 + d.getMinutes()) * MIN_HEIGHT;
}

/** Greedy column-packing for overlap layout */
function layoutEvents(evs: Event[]): Map<string, { left: number; width: number }> {
  const layout = new Map<string, { left: number; width: number }>();
  const sorted = [...evs].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
  const cols: Array<{ ev: Event; end: number }[]> = [];

  for (const ev of sorted) {
    const start = new Date(ev.start_at).getTime();
    const end = ev.end_at ? new Date(ev.end_at).getTime() : start + 3_600_000;
    let placed = false;
    for (const col of cols) {
      if (start >= col[col.length - 1].end) {
        col.push({ ev, end });
        placed = true;
        break;
      }
    }
    if (!placed) cols.push([{ ev, end }]);
  }

  const total = cols.length || 1;
  cols.forEach((col, i) => {
    col.forEach(({ ev }) => {
      layout.set(ev.id, { left: (i / total) * 100, width: (1 / total) * 100 });
    });
  });
  return layout;
}

// ─── Day column (time-grid) ───────────────────────────────────
function DayColumn({
  day,
  events,
  onEventClick,
  drawNowLine,
}: {
  day: Date;
  events: Event[];
  onEventClick: (ev: Event) => void;
  drawNowLine: boolean;
}) {
  const layout = useMemo(() => layoutEvents(events), [events]);
  const top = nowTop();
  const showLine = drawNowLine && isToday(day) && top >= 0 && top <= TOTAL_HEIGHT;

  return (
    <div className="relative flex-1 min-w-0 border-r border-border/20 last:border-r-0">
      {/* Hour grid lines */}
      {HOURS.map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-border/25"
          style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
        />
      ))}
      {/* Half-hour lines */}
      {HOURS.map((h) => (
        <div
          key={`h${h}`}
          className="absolute inset-x-0 border-t border-border/10"
          style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
        />
      ))}

      {/* Current time */}
      {showLine && (
        <div
          className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
          style={{ top }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 shrink-0 shadow" />
          <span className="flex-1 h-[2px] bg-red-500" />
        </div>
      )}

      {/* Events */}
      {events.map((ev) => {
        const pos = layout.get(ev.id) ?? { left: 0, width: 100 };
        const t = getTop(ev);
        const h = getHeight(ev);
        if (t >= TOTAL_HEIGHT || t + h < 0) return null;

        const sty = st(ev.status);
        const isTiny = h < 28;
        const isShort = h < 44;

        return (
          <button
            key={ev.id}
            onClick={() => onEventClick(ev)}
            title={ev.title}
            className={cn(
              "absolute rounded-[3px] border-l-[3px] overflow-hidden text-left",
              "transition-all duration-100 hover:brightness-95 hover:shadow-md hover:z-30",
              "px-1.5 py-0.5 ring-0 focus-visible:ring-2 focus-visible:ring-primary",
              sty.border, sty.bg
            )}
            style={{
              top: t,
              height: Math.min(h, TOTAL_HEIGHT - t),
              left: `calc(${pos.left}% + 2px)`,
              width: `calc(${pos.width}% - 4px)`,
              zIndex: 10,
            }}
          >
            {isTiny ? (
              <p className={cn("text-[9px] font-semibold leading-none truncate", sty.text)}>
                {format(new Date(ev.start_at), "HH:mm")} · {ev.title}
              </p>
            ) : isShort ? (
              <>
                <p className={cn("text-[10px] font-bold leading-tight", sty.text)}>
                  {format(new Date(ev.start_at), "HH:mm")}
                </p>
                <p className={cn("text-[10px] leading-tight truncate", sty.text)}>
                  {ev.title}
                </p>
              </>
            ) : (
              <>
                <p className={cn("text-[10px] font-bold leading-tight", sty.text)}>
                  {format(new Date(ev.start_at), "HH:mm")}
                  {ev.end_at && ` – ${format(new Date(ev.end_at), "HH:mm")}`}
                </p>
                <p className={cn("text-[11px] font-medium leading-snug mt-0.5 line-clamp-2", sty.text)}>
                  {ev.title}
                </p>
                {ev.contact?.name && h >= 60 && (
                  <p className={cn("text-[9px] leading-tight mt-1 opacity-75 truncate", sty.text)}>
                    {ev.contact.name}
                  </p>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Week / Day time grid ─────────────────────────────────────
function TimeGrid({
  days,
  eventsByDay,
  onEventClick,
  onDayClick,
}: {
  days: Date[];
  eventsByDay: Record<string, Event[]>;
  onEventClick: (ev: Event) => void;
  onDayClick: (day: Date) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const target = Math.max(nowTop() - HOUR_HEIGHT * 1.5, 0);
    scrollRef.current.scrollTop = target;
  }, []);

  return (
    <div className="flex flex-col flex-1 border border-border rounded-xl overflow-hidden bg-card shadow-sm">
      {/* Column headers */}
      <div className="flex shrink-0 border-b border-border bg-muted/20">
        {/* Gutter header */}
        <div className="w-14 shrink-0 border-r border-border/30" />
        {days.map((day) => {
          const today = isToday(day);
          return (
            <button
              key={format(day, "yyyy-MM-dd")}
              onClick={() => onDayClick(day)}
              className={cn(
                "flex-1 text-center py-2.5 border-r border-border/20 last:border-r-0",
                "hover:bg-muted/40 transition-colors"
              )}
            >
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {format(day, "EEE", { locale: es })}
              </p>
              <div
                className={cn(
                  "mx-auto mt-1 w-8 h-8 rounded-full flex items-center justify-center",
                  today && "bg-primary shadow-sm"
                )}
              >
                <span
                  className={cn(
                    "text-sm font-bold",
                    today ? "text-primary-foreground" : "text-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div ref={scrollRef} className="flex flex-1 overflow-y-auto overflow-x-hidden">
        {/* Time gutter */}
        <div
          className="w-14 shrink-0 relative border-r border-border/25 bg-muted/10"
          style={{ minHeight: TOTAL_HEIGHT }}
        >
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute right-2 flex items-center"
              style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 8 }}
            >
              <span className="text-[10px] text-muted-foreground/70 tabular-nums leading-none select-none">
                {fmtHour(h)}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div className="flex flex-1 min-w-0" style={{ minHeight: TOTAL_HEIGHT }}>
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            return (
              <DayColumn
                key={key}
                day={day}
                events={eventsByDay[key] ?? []}
                onEventClick={onEventClick}
                drawNowLine
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Month grid ───────────────────────────────────────────────
function MonthGrid({
  currentDate,
  eventsByDay,
  onEventClick,
  onDayClick,
}: {
  currentDate: Date;
  eventsByDay: Record<string, Event[]>;
  onEventClick: (ev: Event) => void;
  onDayClick: (day: Date) => void;
}) {
  const isMobile = useIsMobile();
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/20">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <div key={d} className="py-2.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            {isMobile ? d[0] : d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 divide-x divide-y divide-border/30">
        {allDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayEvs = eventsByDay[key] ?? [];
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const MAX_SHOWN = isMobile ? 1 : 3;

          return (
            <button
              key={key}
              onClick={() => onDayClick(day)}
              className={cn(
                "relative group text-left p-1 md:p-1.5 min-h-[72px] md:min-h-[100px]",
                "hover:bg-muted/30 transition-colors",
                !inMonth && "opacity-40 bg-muted/10"
              )}
            >
              {/* Day number */}
              <div className="flex justify-end mb-1">
                <span
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                    today
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground group-hover:bg-muted"
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {dayEvs.slice(0, MAX_SHOWN).map((ev) => {
                  const sty = st(ev.status);
                  return (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      className={cn(
                        "flex items-center gap-1 rounded-[3px] px-1 py-0.5 text-left border-l-2",
                        sty.border, sty.bg
                      )}
                    >
                      <span className={cn("text-[9px] md:text-[10px] font-medium leading-none truncate", sty.text)}>
                        {!isMobile && (
                          <span className="opacity-70 mr-0.5">{format(new Date(ev.start_at), "HH:mm")}</span>
                        )}
                        {ev.title}
                      </span>
                    </div>
                  );
                })}
                {dayEvs.length > MAX_SHOWN && (
                  <p className="text-[9px] md:text-[10px] text-muted-foreground pl-1">
                    +{dayEvs.length - MAX_SHOWN} más
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mobile day picker strip ──────────────────────────────────
function DayStrip({
  currentDate,
  events,
  onChange,
}: {
  currentDate: Date;
  events: Event[];
  onChange: (d: Date) => void;
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) });

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const count = events.filter((e) => isSameDay(new Date(e.start_at), day)).length;
        const selected = isSameDay(day, currentDate);
        const today = isToday(day);

        return (
          <button
            key={key}
            onClick={() => onChange(day)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-xl shrink-0 transition-all",
              selected
                ? "bg-primary shadow-sm"
                : today
                ? "bg-primary/10 border border-primary/30"
                : "bg-muted/40 hover:bg-muted"
            )}
          >
            <span className={cn("text-[9px] font-semibold uppercase", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {format(day, "EEE", { locale: es })}
            </span>
            <span className={cn("text-base font-bold leading-none", selected ? "text-primary-foreground" : today ? "text-primary" : "text-foreground")}>
              {format(day, "d")}
            </span>
            {count > 0 && (
              <span className={cn("w-1.5 h-1.5 rounded-full", selected ? "bg-primary-foreground/70" : "bg-primary")} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export function EventAgendaView({ events, isLoading, onEventClick }: EventAgendaViewProps) {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [mode, setMode] = useState<AgendaMode>(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "week"
  );

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // All relevant days for the current view
  const viewDays = useMemo(() => {
    if (mode === "day")   return [currentDate];
    if (mode === "week")  return weekDays;
    // month: include all days in the calendar grid
    const ms = startOfMonth(currentDate);
    const me = endOfMonth(currentDate);
    return eachDayOfInterval({
      start: startOfWeek(ms, { weekStartsOn: 1 }),
      end:   endOfWeek(me, { weekStartsOn: 1 }),
    });
  }, [mode, currentDate, weekDays]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, Event[]> = {};
    viewDays.forEach((day) => {
      const key = format(day, "yyyy-MM-dd");
      map[key] = events
        .filter((e) => isSameDay(new Date(e.start_at), day))
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    });
    return map;
  }, [events, viewDays]);

  const navigate = useCallback((dir: 1 | -1) => {
    setCurrentDate((d) => {
      if (mode === "day")   return dir > 0 ? addDays(d, 1) : subDays(d, 1);
      if (mode === "week")  return dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1);
      return dir > 0 ? addMonths(d, 1) : subMonths(d, 1);
    });
  }, [mode]);

  const handleDayClick = (day: Date) => {
    setCurrentDate(day);
    setMode("day");
  };

  // ── Header label
  const headerLabel = mode === "month"
    ? format(currentDate, "MMMM yyyy", { locale: es })
    : mode === "day"
    ? format(currentDate, "EEEE d 'de' MMMM yyyy", { locale: es })
    : `${format(weekStart, "d MMM", { locale: es })} – ${format(weekEnd, "d MMM yyyy", { locale: es })}`;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-[520px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* ── Toolbar ───────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Nav */}
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navigate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm ml-0.5"
            onClick={() => setCurrentDate(new Date())}
          >
            Hoy
          </Button>
          <h2 className="ml-2 text-sm md:text-base font-semibold capitalize hidden sm:block">
            {headerLabel}
          </h2>
        </div>

        {/* Mode tabs */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as AgendaMode)}>
          <TabsList className="h-9">
            <TabsTrigger value="day"   className="text-xs px-3 h-7">Día</TabsTrigger>
            <TabsTrigger value="week"  className="text-xs px-3 h-7">Semana</TabsTrigger>
            <TabsTrigger value="month" className="text-xs px-3 h-7">Mes</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Mobile header label */}
      <h2 className="text-sm font-semibold capitalize sm:hidden">
        {headerLabel}
      </h2>

      {/* ── Mobile day strip (day / week modes) ─ */}
      {isMobile && mode !== "month" && (
        <DayStrip
          currentDate={currentDate}
          events={events}
          onChange={(d) => { setCurrentDate(d); setMode("day"); }}
        />
      )}

      {/* ── Day / Week time grid ──────────────── */}
      {(mode === "day" || mode === "week") && (
        <TimeGrid
          days={mode === "day" ? [currentDate] : weekDays}
          eventsByDay={eventsByDay}
          onEventClick={onEventClick}
          onDayClick={handleDayClick}
        />
      )}

      {/* ── Month grid ───────────────────────── */}
      {mode === "month" && (
        <MonthGrid
          currentDate={currentDate}
          eventsByDay={eventsByDay}
          onEventClick={onEventClick}
          onDayClick={handleDayClick}
        />
      )}

      {/* ── Empty state ──────────────────────── */}
      {events.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
            <ChevronRight className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Sin eventos</p>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === "day" ? "No hay citas para este día" :
             mode === "week" ? "No hay citas esta semana" :
             "No hay citas este mes"}
          </p>
        </div>
      )}
    </div>
  );
}
