import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { usePartnerBranding } from '@/contexts/PartnerBrandingContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const loginSchema = z.object({
  email: z.string().trim().email({ message: "Email inválido" }),
  password: z.string().min(1, { message: "La contraseña es requerida" }),
});

const REMEMBERED_EMAIL_KEY = 'notyfive_remembered_email';

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { signIn, signOut, user, isSuperAdmin, isLoading: authLoading } = useAuth();
  const { partner } = usePartnerBranding();
  const { theme } = useTheme();
  // "partner" and "light" both render with the light html class
  const isLight = theme === 'light' || theme === 'partner';
  const loginLogoSrc = isLight
    ? (partner.logoExpandedLightUrl ?? partner.logoUrl)            // light: variante claro → icon fallback (visible en cualquier bg)
    : (partner.sidebarLogoExpandedUrl ?? partner.logoUrl);         // dark: expandido oscuro → icon fallback

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (savedEmail) setEmail(savedEmail);
  }, []);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err === 'sso_denied') {
      const reason = searchParams.get('reason') || '';
      const reasonMap: Record<string, string> = {
        invalid_token: 'El enlace de acceso es inválido.',
        missing_token: 'Falta el token de acceso.',
        invalid_claims: 'El token no contiene la información necesaria.',
        tenant_not_found: 'La cuenta no existe en este sistema.',
        user_not_found: 'No se encontró tu usuario en este tenant.',
        user_inactive: 'Tu usuario está inactivo. Contacta al administrador.',
        link_generation_failed: 'No se pudo generar la sesión. Intenta de nuevo.',
        server_misconfigured: 'El servidor SSO no está configurado correctamente.',
      };
      const detail = reasonMap[reason] ?? 'Acceso denegado o sesión expirada.';
      toast.error('Acceso denegado o sesión expirada', { description: detail });
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      next.delete('reason');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!authLoading && user) {
      if (isSuperAdmin) navigate('/admin', { replace: true });
    }
  }, [user, isSuperAdmin, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach(err => {
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

      const { data: { user: signedUser } } = await supabase.auth.getUser();
      if (signedUser) {
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('global_role')
          .eq('user_id', signedUser.id)
          .maybeSingle();

        if (roleRow?.global_role !== 'super_admin') {
          await signOut();
          toast.error('Acceso restringido a administradores globales', {
            description: 'Inicia sesión desde tu panel principal vía SSO.',
          });
          return;
        }
      }

      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      toast.success('Inicio de sesión exitoso');
      navigate('/admin/tenants');
    } catch {
      toast.error('Error al iniciar sesión. Intenta nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex">

      {/* ── LEFT: formulario ── */}
      <div className="flex flex-col justify-between w-full max-w-[520px] px-12 py-10 bg-white shrink-0">
        {/* Logo */}
        <div>
          <img
            src={loginLogoSrc}
            alt={`${partner.name} Logo`}
            className="h-9 w-auto object-contain max-w-[180px]"
          />
        </div>

        {/* Form area — centrado verticalmente */}
        <div className="w-full max-w-[360px] mx-auto animate-fade-in">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Bienvenido de vuelta
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            Ingresa a tu cuenta para continuar
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Correo electrónico
              </label>
              <Input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-lg border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-primary transition-all"
                disabled={isLoading}
                autoComplete="email"
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Contraseña
                </label>
                <Link
                  to="/auth/forgot-password"
                  className="text-xs font-medium text-primary hover:opacity-80 transition-opacity"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-11 rounded-lg border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-primary transition-all"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-11 rounded-lg font-semibold text-white text-sm border-0 transition-all active:scale-[0.99] bg-primary hover:opacity-90"
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Iniciando sesión...</>
              ) : (
                'Iniciar sesión'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} {partner.name}. Todos los derechos reservados.
        </p>
      </div>

      {/* ── RIGHT: imagen de propiedad ── */}
      <div className="relative flex-1 hidden lg:block">
        <img
          src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=85&auto=format&fit=crop"
          alt="Propiedad de lujo"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Overlay gradiente inferior para el quote */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

        {/* Testimonial */}
        <div className="absolute bottom-10 left-10 right-10">
          <blockquote className="text-white text-xl font-semibold leading-snug mb-3 max-w-lg">
            "La plataforma que necesitaba para escalar mi operación inmobiliaria."
          </blockquote>
          <p className="text-white/70 text-sm font-medium">
            — Mateo Benavides, Administrador · MLS LATAM
          </p>
        </div>

        {/* Badge top-right */}
        <div className="absolute top-8 right-8 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2.5">
          <p className="text-white text-xs font-semibold">CRM Inmobiliario Enterprise</p>
          <p className="text-white/60 text-xs mt-0.5">Impulsado por IA</p>
        </div>
      </div>

    </div>
  );
};

export default Auth;
