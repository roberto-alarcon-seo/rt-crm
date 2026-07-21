import { useState, useEffect } from "react";
import { NavLink } from "@/components/NavLink";
import { APP_VERSION, APP_BUILD_DATE } from "@/version";
import {
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  Users,
  CalendarDays,
  CalendarClock,
  Send,
  Filter,
  Zap,
  Building2,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  MessagesSquare,
  Megaphone,
  Eye,
  Sparkles,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTotalUnreadCount } from "@/hooks/useTotalUnreadCount";
import { useFollowupBadgeCount } from "@/hooks/useFollowupBadgeCount";
import { useAtRiskBadgeCount } from "@/hooks/useAtRiskBadgeCount";
import { useAuth } from "@/contexts/AuthContext";
import { usePartnerBranding } from "@/contexts/PartnerBrandingContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useFeatureFlag, type FeatureName } from "@/hooks/useFeatureFlag";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type NavItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  feature?: FeatureName;
  badgeKey?: "inbox" | "followups" | "atRisk";
  tag?: "NEW" | "LIVE";
};

type NavGroup = {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const COLLAPSE_KEY = "rtcrm_sidebar_collapsed";

export function IconSidebar() {
  const totalUnread = useTotalUnreadCount();
  const followupBadge = useFollowupBadgeCount();
  const atRiskBadge = useAtRiskBadgeCount();
  const { tenantRole, isSuperAdmin } = useAuth();
  const { partner } = usePartnerBranding();
  const { theme } = useTheme();
  const isMobile = useIsMobile();

  const { enabled: campaignsEnabled } = useFeatureFlag("campaigns");
  const { enabled: segmentsEnabled } = useFeatureFlag("segments");
  const { enabled: automationsEnabled } = useFeatureFlag("automations_builder");
  const { enabled: iaStudioEnabled } = useFeatureFlag("brokia_ia_studio");

  const [collapsedPref, setCollapsedPref] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === "true";
  });

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, String(collapsedPref));
  }, [collapsedPref]);

  const collapsed = isMobile ? true : collapsedPref;

  const isAdministrador = tenantRole === "administrador" || isSuperAdmin;
  const isManagerOrAdmin = isAdministrador || tenantRole === "manager";
  const isAsesor = !isManagerOrAdmin;

  const featureEnabled: Partial<Record<FeatureName, boolean>> = {
    campaigns: campaignsEnabled,
    segments: segmentsEnabled,
    automations_builder: automationsEnabled,
    brokia_ia_studio: iaStudioEnabled,
  };

  const badgeCounts: Record<string, number> = {
    inbox: totalUnread,
    followups: followupBadge,
    atRisk: atRiskBadge,
  };

  const filterByFlag = (items: NavItem[]) =>
    items.filter((i) => !i.feature || featureEnabled[i.feature]);

  const groups: NavGroup[] = [];

  if (isManagerOrAdmin) {
    groups.push({
      key: "general",
      label: "General",
      icon: LayoutGrid,
      items: [{ icon: LayoutDashboard, label: "Dashboard", path: "/" }],
    });
  }

  groups.push({
    key: "comercial",
    label: "Comercial",
    icon: MessagesSquare,
    items: [
      { icon: MessageSquare, label: "Inbox", path: "/inbox", badgeKey: "inbox" },
      { icon: TrendingUp, label: "Oportunidades", path: "/pipeline" },
      { icon: Building2, label: "Empresas", path: "/accounts" },
      { icon: Users, label: "Contactos", path: "/contacts" },
      { icon: CalendarDays, label: "Reuniones", path: "/events" },
      { icon: CalendarClock, label: "Seguimientos", path: "/followups", badgeKey: "followups" },
    ],
  });

  if (isManagerOrAdmin) {
    const marketingItems = filterByFlag([
      { icon: Send, label: "Campañas", path: "/campaigns", feature: "campaigns" },
      { icon: Filter, label: "Segmentos", path: "/segments", feature: "segments" },
      { icon: Zap, label: "Automatizaciones", path: "/automations", feature: "automations_builder" },
    ]);
    if (marketingItems.length > 0) {
      groups.push({ key: "marketing", label: "Marketing", icon: Megaphone, items: marketingItems });
    }

    const supervisionItems = [
      { icon: ShieldCheck, label: "Supervisión", path: "/admin-leads", badgeKey: "atRisk" as const },
    ];
    groups.push({ key: "supervision", label: "Supervisión", icon: Eye, items: supervisionItems });
  }

  if (isAdministrador) {
    groups.push({
      key: "configuracion",
      label: "Configuración",
      icon: Settings,
      items: [{ icon: Settings, label: "Configuración", path: "/settings" }],
    });
  }

  void isAsesor;

  const renderItem = (item: NavItem) => {
    const count = item.badgeKey ? badgeCounts[item.badgeKey] ?? 0 : 0;
    const link = (
      <NavLink
        to={item.path}
        end={item.path === "/"}
        className={cn(
          "flex items-center rounded-xl text-sm font-normal transition-colors relative",
          "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent",
          collapsed ? "w-9 h-9 justify-center mx-auto" : "w-full px-3 py-2.5 gap-3"
        )}
        activeClassName="!bg-sidebar-accent !text-sidebar-primary font-semibold"
      >
        <item.icon className="w-4 h-4 shrink-0 opacity-70 transition-opacity" />
        {!collapsed && (
          <span className="text-sm truncate flex-1 transition-opacity duration-200">{item.label}</span>
        )}
        {!collapsed && item.tag && (
          <span
            className={cn(
              "text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded-full ml-auto shrink-0",
              item.tag === "NEW"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-rose-500/15 text-rose-400 border border-rose-500/30",
            )}
          >
            {item.tag}
          </span>
        )}
        {count > 0 && (
          <span
            className={cn(
              "min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center px-1",
              collapsed ? "absolute -top-0.5 -right-0.5" : "ml-auto"
            )}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </NavLink>
    );

    if (!collapsed) return <div key={item.path}>{link}</div>;

    return (
      <Tooltip key={item.path} delayDuration={0}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="bg-card border-border">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200 ease-linear",
        collapsed ? "w-14" : "w-[260px]"
      )}
    >
      {/* Logo + collapse toggle */}
      <div
        className={cn(
          "flex items-center h-16 border-b border-sidebar-border shrink-0",
          collapsed ? "justify-center px-0" : "justify-between gap-2 pl-5 pr-3 py-2"
        )}
      >
        {!collapsed && (() => {
          const isLight = theme === "light" || theme === "partner";
          const expandedSrc = isLight
            ? (partner.logoExpandedLightUrl ?? partner.sidebarLogoExpandedUrl ?? partner.logoUrl)
            : (partner.sidebarLogoExpandedUrl ?? partner.logoUrl);
          const hasExpanded = isLight
            ? !!(partner.logoExpandedLightUrl ?? partner.sidebarLogoExpandedUrl)
            : !!partner.sidebarLogoExpandedUrl;
          return (
            <img
              key={expandedSrc}
              src={expandedSrc}
              alt={`${partner.name} Logo`}
              className={cn(
                "object-contain transition-opacity duration-200 opacity-100 min-w-0",
                hasExpanded ? "max-h-9 w-auto max-w-[150px]" : "h-9 w-9"
              )}
            />
          );
        })()}
        {!isMobile && (
          <button
            type="button"
            onClick={() => setCollapsedPref((v) => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors relative z-10"
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col">
        {groups.map((group, idx) => (
          <div
            key={group.key}
            className={cn(
              "flex flex-col",
              collapsed ? "gap-1 px-2 mt-1" : "gap-0.5 px-3 mt-4"
            )}
          >
            {!collapsed && (
              <div className="px-3 mb-2 flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-sidebar-foreground/70 shrink-0">
                  {group.label}
                </p>
                <div className="flex-1 h-px bg-sidebar-foreground/15" />
              </div>
            )}
            {group.items.map(renderItem)}
            {collapsed && idx < groups.length - 1 && (
              <div className="h-1" />
            )}
          </div>
        ))}
      </nav>

      {/* AI Assistant — only when module is enabled for this tenant */}
      {iaStudioEnabled && (
        <div className="border-t border-sidebar-border py-2 px-2">
          {renderItem({
            icon: Sparkles,
            label: "RT IA Studio",
            path: "/ai",
            tag: "NEW",
          })}
        </div>
      )}

      {/* Version tag — se actualiza en cada commit. Lleva a las novedades. */}
      <div className="border-t border-sidebar-border px-2 py-1.5">
        <NavLink
          to="/changelog"
          className="block rounded px-1 py-0.5 text-[10px] text-sidebar-foreground/40 text-center truncate leading-tight transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground/80"
          activeClassName="bg-sidebar-accent text-sidebar-foreground/80"
          title={`RT CRM v${APP_VERSION} · build ${APP_BUILD_DATE} — ver novedades`}
        >
          {collapsed ? `v${APP_VERSION}` : `v${APP_VERSION} · ${APP_BUILD_DATE}`}
        </NavLink>
      </div>
    </aside>
  );
}