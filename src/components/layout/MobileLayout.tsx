import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { UserMenu } from "@/components/layout/UserMenu";
import { CreditsBadge } from "@/components/layout/CreditsBadge";
import { SupportModeBanner } from "./SupportModeBanner";
import {
  MessageSquare,
  CalendarClock,
  CalendarDays,
  Users,
  Handshake,
} from "lucide-react";
import { useTotalUnreadCount } from "@/hooks/useTotalUnreadCount";
import { usePartnerBranding } from "@/contexts/PartnerBrandingContext";
import { cn } from "@/lib/utils";

const bottomNavItems = [
  { icon: MessageSquare, label: "Inbox",        path: "/inbox",     showBadge: true },
  { icon: CalendarClock, label: "Seguimientos", path: "/followups"               },
  { icon: CalendarDays,  label: "Agenda",       path: "/events"                  },
  { icon: Users,         label: "Contactos",    path: "/contacts"                },
  { icon: Handshake,     label: "Clientes",     path: "/clients"                 },
];

interface MobileLayoutProps {
  children: ReactNode;
}

export function MobileLayout({ children }: MobileLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const totalUnread = useTotalUnreadCount();
  const { partner } = usePartnerBranding();

  const handleNavClick = (path: string) => {
    if (path === "/inbox" && location.pathname === "/inbox") {
      navigate("/inbox", { state: { resetKey: Date.now() } });
    } else {
      navigate(path);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      <SupportModeBanner />

      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <img
          src={partner.logoUrl}
          alt={partner.name}
          className="h-8 w-8 object-contain"
        />
        <div className="flex items-center gap-3">
          <CreditsBadge />
          <UserMenu />
        </div>
      </header>

      {/* Main content — padded so bottom nav doesn't cover content */}
      <main className="flex-1 overflow-auto pb-16">
        {children}
      </main>

      {/* Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 h-16 bg-card border-t border-border flex items-center overflow-visible"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {bottomNavItems.map((item, index) => {
          const isCenterAction = index === 2; // Agenda — acción principal
          const isActive =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.path);

          if (isCenterAction) {
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className="flex-1 flex flex-col items-center justify-center -translate-y-4 relative transition-colors"
              >
                <div
                  className={cn(
                    "w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg transition-transform active:scale-95",
                    isActive && "shadow-primary/50"
                  )}
                >
                  <item.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-none mt-1.5",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => handleNavClick(item.path)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 relative transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-primary" />
              )}

              <div className="relative">
                <item.icon className="w-5 h-5" />
                {item.showBadge && totalUnread > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center px-1 leading-none">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
              </div>

              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
