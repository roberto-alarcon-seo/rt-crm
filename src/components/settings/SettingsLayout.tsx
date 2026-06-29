import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  MessageSquare,
  Settings as SettingsIcon, ListPlus, Bot, BookOpen, Code2, ShieldCheck, BarChart3,
  MessagesSquare, Brain, UserSquare2, Sparkles, FileText, Users, RefreshCw, TrendingUp,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFeatureFlag, type FeatureName } from "@/hooks/useFeatureFlag";

interface MenuItem {
  id: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  group: string;
  /** Flags that unlock this item (ANY enabled). Empty = no gating. */
  unlockFlags?: FeatureName[];
  /** Roles allowed to see this item. Empty = all roles. */
  requireRoles?: string[];
}

const menuItems: MenuItem[] = [
  {
    id: "whatsapp",
    path: "/settings/whatsapp",
    icon: MessageSquare,
    title: "WhatsApp",
    description: "Estado de conexión",
    group: "Canales",
  },
  {
    id: "templates",
    path: "/settings/templates",
    icon: FileText,
    title: "Librería de Plantillas",
    description: "Mensajes predefinidos",
    group: "Canales",
    requireRoles: ["administrador"],
  },
  {
    id: "ai-config",
    path: "/settings/ai-config",
    icon: Bot,
    title: "Agente IA General",
    description: "Comportamiento base del agente",
    group: "Inteligencia",
  },
  {
    id: "sdr-agent",
    path: "/settings/sdr-agent",
    icon: Bot,
    title: "Agente SDR",
    description: "Calificación de leads B2B",
    group: "Inteligencia",
  },
  {
    id: "opportunity-agent",
    path: "/settings/opportunity-agent",
    icon: TrendingUp,
    title: "Agente de Oportunidades",
    description: "Seguimiento de pipeline",
    group: "Inteligencia",
  },
  {
    id: "followup-agent",
    path: "/settings/followup-agent",
    icon: RefreshCw,
    title: "Agente de Seguimiento",
    description: "Re-enganche automático",
    group: "Inteligencia",
  },
  {
    id: "knowledge-base",
    path: "/settings/knowledge-base",
    icon: BookOpen,
    title: "Base de Conocimiento",
    description: "Respuestas automáticas",
    group: "Inteligencia",
  },
  {
    id: "contact-fields",
    path: "/settings/contact-fields",
    icon: ListPlus,
    title: "Campos personalizados",
    description: "Campos de contactos",
    group: "Leads",
  },
  {
    id: "consent",
    path: "/settings/consent",
    icon: ShieldCheck,
    title: "Consentimiento",
    description: "Opt-out, DND y bloqueos",
    group: "Leads",
  },
  {
    id: "assignment-rules",
    path: "/settings/assignment-rules",
    icon: Users,
    title: "Asignación de leads",
    description: "Round Robin, Sticky y timeouts",
    group: "Leads",
  },
  {
    id: "team",
    path: "/settings/team",
    icon: Building2,
    title: "Equipo",
    description: "Usuarios y roles",
    group: "Organización",
    requireRoles: ["administrador"],
  },
  {
    id: "conversions",
    path: "/settings/conversions",
    icon: BarChart3,
    title: "Conversiones",
    description: "Meta Pixel y CAPI",
    group: "Avanzado",
    unlockFlags: ["campaigns"],
  },
  {
    id: "developer",
    path: "/settings/developer",
    icon: Code2,
    title: "Desarrollador",
    description: "API Webhooks y tokens",
    group: "Avanzado",
    unlockFlags: ["api_access"],
  },
];

const groupOrder = ["Canales", "Inteligencia", "Leads", "Organización", "Avanzado"] as const;
const groupIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Canales: MessagesSquare,
  Inteligencia: Brain,
  Leads: UserSquare2,
  Organización: Building2,
  Avanzado: Sparkles,
};

interface SettingsLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function SettingsLayout({ children, title, description, icon: Icon }: SettingsLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { tenantRole, isSuperAdmin } = useAuth();

  // Feature flag lookups for premium items (call hooks unconditionally)
  const campaigns = useFeatureFlag("campaigns");
  const automations = useFeatureFlag("automations_builder");
  const apiAccess = useFeatureFlag("api_access");
  const flagState: Record<FeatureName, boolean> = {
    campaigns: campaigns.enabled,
    segments: false,
    automations_builder: automations.enabled,
    templates_library: false,
    quick_automations: false,
    api_access: apiAccess.enabled,
    conversions_capi: false,
    custom_templates_management: false,
    inventory_management: false,
    meta_ads: false,
    automations: false,
    templates: false,
    brokia_ia_studio: false,
  };
  const isItemUnlocked = (item: MenuItem) =>
    !item.unlockFlags || item.unlockFlags.some((f) => flagState[f]);

  const isItemVisible = (item: MenuItem) =>
    !item.requireRoles ||
    isSuperAdmin ||
    item.requireRoles.includes(tenantRole ?? "");

  // Group menu items preserving canonical order
  const groupedItems = groupOrder
    .map((group) => [group, menuItems.filter((i) => i.group === group && isItemVisible(i))] as const)
    .filter(([, items]) => items.length > 0);

  const isActive = (path: string) => {
    return currentPath.startsWith(path);
  };

  return (
    <div className="h-full flex bg-background">
      {/* Sidebar Menu — mismo índigo que el sidebar principal */}
      <div className="w-64 border-r border-sidebar-border flex flex-col shrink-0 bg-sidebar">
        {/* Header */}
        <div className="px-5 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <SettingsIcon className="h-4 w-4 text-sidebar-foreground/40" />
            <h2 className="font-semibold text-sm text-white">Configuración</h2>
          </div>
        </div>

        {/* Menu Items */}
        <ScrollArea className="flex-1">
          <div className="px-3 py-3 space-y-5">
            {groupedItems.map(([group, items]) => {
              const GroupIcon = groupIcons[group];
              const isPremiumGroup = group === "Avanzado";
              const groupHasLocked =
                isPremiumGroup && items.some((i) => !isItemUnlocked(i));
              return (
              <div key={group}>
                <div className="px-3 mb-2 flex items-center gap-1.5">
                  {GroupIcon && <GroupIcon className="h-3 w-3 text-sidebar-foreground/70" />}
                  <p className="text-[11px] font-semibold text-sidebar-foreground/70 uppercase tracking-[0.05em] shrink-0">
                    {group}
                  </p>
                  <div className="flex-1 h-px bg-sidebar-foreground/15" />
                  {groupHasLocked && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-primary">
                      Pro
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const ItemIcon = item.icon;
                    const active = isActive(item.path);
                    const unlocked = isItemUnlocked(item);
                    const showProBadge = !!item.unlockFlags && !unlocked;
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(item.path)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm",
                          active
                            ? "bg-sidebar-accent text-sidebar-primary font-semibold"
                            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                        )}
                      >
                        <ItemIcon className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="truncate">{item.title}</span>
                        {showProBadge && (
                          <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                            Pro
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Content Header */}
        <div className="border-b border-border bg-card px-8 py-6">
          <div className="flex items-center gap-4">
            {Icon && (
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className="h-6 w-6 text-primary" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-foreground">{title}</h1>
              {description && (
                <p className="text-muted-foreground mt-0.5">{description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1">
          <div className="p-8 pr-12">
            {children}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
