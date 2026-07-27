import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type GlobalRole = 'super_admin' | 'user';
// Nuevos roles de tenant: administrador (acceso total), manager (operativo), asesor (solo propiedades asignadas)
export type TenantRole = 'administrador' | 'manager' | 'asesor';
// Legacy roles para compatibilidad (mapeo: owner->administrador, marketer->manager, readonly->asesor)
export type LegacyTenantRole = 'owner' | 'marketer' | 'readonly';

interface Profile {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  first_login_required: boolean;
  password_set_at: string | null;
  invited_at: string | null;
  invited_by: string | null;
  phone: string | null;
  phone_country_code: string | null;
  avatar_url: string | null;
  job_title: string | null;
  bio: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  global_role: GlobalRole;
  tenant_role: TenantRole | null;
  partner_scope: string | null;
  created_at: string;
  updated_at: string;
}

interface Tenant {
  id: string;
  name: string;
  plan: string;
  status: string;
  max_users: number;
  max_contacts: number;
  created_at: string;
  updated_at: string;
  partner_id?: string | null;
  settings?: Record<string, unknown> | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  userRole: UserRole | null;
  tenant: Tenant | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  tenantRole: TenantRole | null;
  partnerScope: string | null;
  /** Mensaje para el usuario cuando no se pudo cargar su perfil. */
  loadError: string | null;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (roles: TenantRole[]) => boolean;
  /** Reintenta cargar perfil/rol/tenant (botón "Reintentar" de la pantalla de error). */
  reloadUserData: () => void;
}

/** Sin esto, una petición que nunca responde deja la app en "Cargando…" para siempre. */
const CARGA_TIMEOUT_MS = 15_000;
const MAX_INTENTOS = 3;

function conTimeout<T>(consulta: PromiseLike<T>, etiqueta: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const temporizador = setTimeout(
      () => reject(new Error(`La consulta de ${etiqueta} tardó demasiado`)),
      CARGA_TIMEOUT_MS,
    );
    Promise.resolve(consulta).then(
      valor => { clearTimeout(temporizador); resolve(valor); },
      error => { clearTimeout(temporizador); reject(error); },
    );
  });
}

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    userRole: null,
    tenant: null,
    isLoading: true,
    isSuperAdmin: false,
    tenantRole: null,
    partnerScope: null,
    loadError: null,
  });
  // Prevents premature isLoading:false during token refresh:
  // onAuthStateChange can emit null session before getSession() resolves.
  const initialCheckDone = useRef(false);
  // Quién está cargado ahora mismo. Sirve para distinguir un cambio real de
  // usuario de un simple refresco de token (ver onAuthStateChange).
  const loadedUserId = useRef<string | null>(null);

  const fetchUserData = useCallback(async (userId: string) => {
    // Se reintenta ante fallos pasajeros (red, cold start). Lo que nunca hace
    // esta función es terminar sin resolver el estado: o carga el perfil o deja
    // un loadError. Si no, la app se queda en "Cargando…" para siempre.
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      try {
        const { data: profile, error: profileError } = await conTimeout(
          supabase.from('profiles').select('*').eq('id', userId).single(),
          'perfil',
        );
        if (profileError) throw profileError;

        const { data: userRole, error: roleError } = await conTimeout(
          supabase.from('user_roles').select('*').eq('user_id', userId).single(),
          'permisos',
        );
        if (roleError) throw roleError;

        // El tenant no es crítico para entrar: si falla, se sigue sin él.
        let tenant: Tenant | null = null;
        if (profile?.tenant_id) {
          try {
            const { data: tenantData, error: tenantError } = await conTimeout(
              supabase.from('tenants').select('*').eq('id', profile.tenant_id).single(),
              'empresa',
            );
            if (!tenantError && tenantData) tenant = tenantData as Tenant;
          } catch (error) {
            console.error('Error fetching tenant:', error);
          }
        }

        loadedUserId.current = userId;
        setState(prev => ({
          ...prev,
          profile: profile as Profile,
          userRole: userRole as UserRole,
          tenant,
          isSuperAdmin: userRole?.global_role === 'super_admin',
          tenantRole: userRole?.tenant_role as TenantRole | null,
          partnerScope: (userRole as any)?.partner_scope ?? null,
          isLoading: false,
          loadError: null,
        }));

        // Marca de último acceso: es telemetría, no debe demorar ni romper el login.
        void supabase
          .from('profiles')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', userId)
          .then(({ error }) => {
            if (error) console.error('Error updating last_login_at:', error);
          });
        return;
      } catch (error) {
        console.error(`Error in fetchUserData (intento ${intento}/${MAX_INTENTOS}):`, error);

        // PGRST116 = la consulta no devolvió filas. Reintentar no va a crearlas.
        const sinRegistro = (error as { code?: string })?.code === 'PGRST116';
        if (sinRegistro || intento === MAX_INTENTOS) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            loadError: sinRegistro
              ? 'Tu cuenta no tiene un perfil configurado. Pide a un administrador que la revise.'
              : 'No pudimos cargar tu sesión. Revisa tu conexión e inténtalo de nuevo.',
          }));
          return;
        }
        await esperar(intento * 500);
      }
    }
  }, []);

  const reloadUserData = useCallback(() => {
    const userId = state.user?.id;
    if (!userId) return;
    setState(prev => ({ ...prev, isLoading: true, loadError: null }));
    void fetchUserData(userId);
  }, [state.user?.id, fetchUserData]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // IMPORTANT: clear derived user data immediately to avoid rendering with stale profile/roles
        // (e.g. when a recovery link logs in a different user)
        if (session?.user) {
          // Supabase emite TOKEN_REFRESHED / SIGNED_IN también cuando NO cambió el
          // usuario: al refrescar el token solo (cada ~50 min) y al volver a la
          // pestaña después de un rato. Si en esos casos limpiáramos el perfil y
          // pusiéramos isLoading:true, ProtectedRoute mostraría el spinner y React
          // desmontaría la pantalla entera — que es como se pierde lo que alguien
          // está escribiendo en un formulario. Renovamos la sesión y nada más.
          if (loadedUserId.current === session.user.id) {
            setState(prev => ({ ...prev, session, user: session.user }));
            return;
          }

          setState(prev => ({
            ...prev,
            session,
            user: session.user,
            profile: null,
            userRole: null,
            tenant: null,
            isSuperAdmin: false,
            tenantRole: null,
            partnerScope: null,
            isLoading: true,
            loadError: null,
          }));

          // Defer Supabase calls with setTimeout to prevent deadlock
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          loadedUserId.current = null;
          setState(prev => ({
            ...prev,
            session,
            user: null,
            profile: null,
            userRole: null,
            tenant: null,
            isSuperAdmin: false,
            tenantRole: null,
            partnerScope: null,
            loadError: null,
            // Keep isLoading:true until getSession() confirms there's no session.
            // Without this guard, a transient null during token refresh causes
            // ProtectedRoute to render <Navigate> and enter an infinite loop.
            isLoading: initialCheckDone.current ? false : prev.isLoading,
          }));
        }
      }
    );

    // THEN check for existing session.
    // Mark initialCheckDone so onAuthStateChange can safely set isLoading:false afterward.
    supabase.auth.getSession().then(({ data: { session } }) => {
      initialCheckDone.current = true;
      if (session?.user) {
        // onAuthStateChange (INITIAL_SESSION) already fired with this session
        // and started fetchUserData. No extra setState needed here — avoid double fetch.
      } else {
        setState(prev => ({
          ...prev,
          session: null,
          user: null,
          isLoading: false,
        }));
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Handle case where session was already invalidated (e.g., after password reset)
      console.log('Sign out error (session may already be invalidated):', error);
    }
    // Always clear local state regardless of signOut result
    loadedUserId.current = null;
    setState({
      user: null,
      session: null,
      profile: null,
      userRole: null,
      tenant: null,
      isLoading: false,
      isSuperAdmin: false,
      tenantRole: null,
      partnerScope: null,
      loadError: null,
    });
  };

  const hasRole = (roles: TenantRole[]): boolean => {
    if (state.isSuperAdmin) return true;
    if (!state.tenantRole) return false;
    return roles.includes(state.tenantRole);
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signOut,
        hasRole,
        reloadUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
