import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { usePartnerBranding } from '@/contexts/PartnerBrandingContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Email inválido' }),
  password: z.string().min(1, { message: 'La contraseña es requerida' }),
});

const TenantLogin = () => {
  const navigate = useNavigate();
  const { signIn, signOut, user, isSuperAdmin, isLoading: authLoading } = useAuth();
  const { partner } = usePartnerBranding();
  const { theme } = useTheme();
  // "partner" and "light" both render with the light html class
  const isLight = theme === 'light' || theme === 'partner';
  const loginLogoSrc = isLight
    ? (partner.logoExpandedLightUrl ?? partner.logoUrl)            // light: variante claro → icon fallback
    : (partner.sidebarLogoExpandedUrl ?? partner.logoUrl);         // dark: expandido oscuro → icon fallback

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Redirect already-authenticated tenant users to the app
  useEffect(() => {
    if (authLoading) return;
    if (user && !isSuperAdmin) {
      navigate('/inbox', { replace: true });
    }
  }, [user, isSuperAdmin, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
        if (err.path[0] === 'password') fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await signIn(email, password);

      if (error) {
        toast.error('Credenciales inválidas. Verifica tu email y contraseña.');
        return;
      }

      // Super admins should not log in via this page — redirect them out.
      // AuthContext sets isSuperAdmin after fetchUserData, but at this point
      // we wait for the useEffect above to handle the redirect.
    } catch {
      toast.error('Error al iniciar sesión. Intenta nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh w-full flex flex-col items-center justify-start sm:justify-center bg-background relative overflow-x-hidden overflow-y-auto px-4 pt-[14vh] pb-10 sm:pt-0 sm:pb-0 sm:overflow-hidden">
      {/* Ambient glow — scaled down on mobile to avoid overflow */}
      <div
        className="pointer-events-none fixed -top-20 -left-20 h-[20rem] w-[20rem] sm:-top-32 sm:-left-32 sm:h-[40rem] sm:w-[40rem] rounded-full blur-[120px] opacity-20"
        style={{ backgroundColor: partner.primaryColorHex }}
      />
      <div
        className="pointer-events-none fixed -bottom-20 -right-20 h-[20rem] w-[20rem] sm:-bottom-32 sm:-right-32 sm:h-[40rem] sm:w-[40rem] rounded-full blur-[120px] opacity-10"
        style={{ backgroundColor: partner.accentColorHex ?? partner.primaryColorHex }}
      />

      <div className="relative w-full max-w-[440px] animate-fade-in">
        {/* Gradient border — desktop only */}
        <div
          className="hidden sm:block absolute -inset-0.5 rounded-[30px] blur-sm opacity-50"
          style={{
            background: `linear-gradient(135deg, ${partner.primaryColorHex}80, transparent, ${partner.accentColorHex ?? partner.primaryColorHex}40)`,
          }}
        />

        {/* Card: visible on desktop, transparent/flat on mobile */}
        <div className="relative sm:rounded-[28px] sm:bg-card/80 sm:backdrop-blur-2xl sm:border sm:border-border sm:px-10 sm:py-12 sm:shadow-2xl px-0 py-0">
          {/* Logo */}
          <div className="flex justify-center mb-8 sm:mb-7">
            <img
              src={loginLogoSrc}
              alt={`${partner.name} Logo`}
              className="h-14 sm:h-12 w-auto object-contain max-w-[200px]"
            />
          </div>

          {/* Title */}
          <h1 className="text-center text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Bienvenido de vuelta
          </h1>
          <p className="text-center text-sm text-muted-foreground mt-2 mb-8 sm:mb-9">
            Inicia sesión en {partner.name}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em] ml-0.5"
              >
                Email
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 pl-11 rounded-xl"
                  disabled={isLoading}
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-0.5">
                <label
                  htmlFor="password"
                  className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]"
                >
                  Contraseña
                </label>
                <Link
                  to="/auth/forgot-password"
                  className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 pl-11 pr-12 rounded-xl"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 mt-2 rounded-xl font-semibold text-base"
              style={{
                background: `linear-gradient(135deg, ${partner.primaryColorHex}, ${partner.accentColorHex ?? partner.primaryColorHex})`,
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                'Iniciar sesión'
              )}
            </Button>
          </form>
        </div>
      </div>

      <p className="mt-6 sm:absolute sm:bottom-6 text-xs text-muted-foreground text-center px-6">
        {partner.emailFooterText
          ? partner.emailFooterText
          : `© ${new Date().getFullYear()} ${partner.name}. Todos los derechos reservados.`}
      </p>
    </div>
  );
};

export default TenantLogin;
