import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePartnerBranding } from "@/contexts/PartnerBrandingContext";
import { applyPartnerTheme } from "@/lib/partnerTheme";

export type Theme = "dark" | "light" | "partner";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "brokia-theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "partner";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "dark" || raw === "light" || raw === "partner") return raw;
  // No stored preference or legacy value → use partner branding
  return "partner";
}

function setHtmlClass(cls: "dark" | "light") {
  if (typeof document === "undefined") return;
  // Only set class on <html> — setting it on <body> too causes CSS custom
  // property inheritance to override inline brand tokens set by applyPartnerTheme.
  document.documentElement.classList.remove("dark", "light", "blue");
  document.documentElement.classList.add(cls);
  document.body.classList.remove("dark", "light", "blue");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { partner } = usePartnerBranding();

  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Track whether we've already reconciled with DB for this user session.
  const reconciledForUserRef = useRef<string | null>(null);

  // Apply the active theme whenever it changes OR the partner branding
  // hydrates (so brand tokens follow the partner, but surface tokens
  // respect the user's choice).
  useEffect(() => {
    if (theme === "dark") {
      setHtmlClass("dark");
      applyPartnerTheme(partner.darkTheme);
    } else {
      // "light" and "partner" both use the brand's light theme.
      // Always write surface tokens inline so each brand's app_bg wins
      // (otherwise the CSS .light class would apply Brokia's lavender to all brands).
      setHtmlClass("light");
      applyPartnerTheme(partner.lightTheme);
    }
  }, [theme, partner.lightTheme, partner.darkTheme]);

  // Reconcile with the user's saved preference in DB after auth resolves.
  useEffect(() => {
    if (!user?.id) {
      reconciledForUserRef.current = null;
      return;
    }
    if (reconciledForUserRef.current === user.id) return;
    reconciledForUserRef.current = user.id;

    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("theme_preference")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const dbTheme = (data as { theme_preference?: string | null })
          .theme_preference;
        if (
          dbTheme === "dark" ||
          dbTheme === "light" ||
          dbTheme === "partner"
        ) {
          setThemeState((current) => (current === dbTheme ? current : dbTheme));
          window.localStorage.setItem(STORAGE_KEY, dbTheme);
        }
      } catch (e) {
        console.warn("[ThemeProvider] failed to load preference", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      if (user?.id) {
        void supabase
          .from("profiles")
          .update({ theme_preference: next } as never)
          .eq("id", user.id)
          .then(({ error }) => {
            if (error) {
              console.warn("[ThemeProvider] failed to persist theme", error);
            }
          });
      }
    },
    [user?.id],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}