import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useRef } from "react";

/**
 * Regresión: al refrescar el token (cada ~50 min, y al volver a la pestaña
 * después de un rato) Supabase emite TOKEN_REFRESHED / SIGNED_IN aunque el
 * usuario sea el mismo. Si AuthContext limpiara el perfil y volviera a
 * isLoading:true en ese caso, ProtectedRoute mostraría el spinner y React
 * desmontaría la pantalla: quien estuviera llenando un formulario perdería
 * todo lo escrito.
 */

type AuthHandler = (event: string, session: unknown) => void;
const handlers: AuthHandler[] = [];

const SESSION = { user: { id: "user-1" }, access_token: "t1" };

const single = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthHandler) => {
        handlers.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () => Promise.resolve({ data: { session: SESSION } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => single(table),
        }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

// Se importa después del mock para que el provider tome el cliente falso.
const { AuthProvider, useAuth } = await import("@/contexts/AuthContext");

/** Cuenta cuántas veces se montó: si el árbol se desmonta, el contador sube. */
let montajesTotales = 0;

function Pantalla() {
  const { profile, isLoading } = useAuth();
  const montajes = useRef(0);
  if (montajes.current === 0) montajes.current = ++montajesTotales;
  return (
    <div>
      <span data-testid="estado">{isLoading ? "cargando" : "listo"}</span>
      <span data-testid="perfil">{profile ? (profile as { name?: string }).name : "sin perfil"}</span>
    </div>
  );
}

function App() {
  const { isLoading, user, profile, loadError, reloadUserData } = useAuth();
  // Réplica de lo que hace ProtectedRoute: mientras carga muestra el spinner, sin
  // sesión manda al login, y si terminó sin perfil muestra el error con su botón
  // de reintentar (en vez de dejar el spinner girando para siempre).
  if (isLoading) return <span data-testid="spinner">Cargando…</span>;
  if (!user) return <span data-testid="login">Ir al login</span>;
  if (!profile) {
    return (
      <div>
        <span data-testid="error">{loadError ?? "sin mensaje"}</span>
        <button data-testid="reintentar" onClick={reloadUserData}>Reintentar</button>
      </div>
    );
  }
  return <Pantalla />;
}

const emitir = async (event: string, session: unknown) => {
  await act(async () => {
    handlers.forEach(h => h(event, session));
    await Promise.resolve();
  });
};

describe("AuthContext ante un refresco de token", () => {
  beforeEach(() => {
    handlers.length = 0;
    montajesTotales = 0;
    single.mockClear();
    single.mockImplementation((table: string) => {
      if (table === "profiles") {
        return Promise.resolve({ data: { id: "user-1", name: "Ana", tenant_id: "t-1" }, error: null });
      }
      if (table === "user_roles") {
        return Promise.resolve({ data: { user_id: "user-1", tenant_role: "administrador" }, error: null });
      }
      return Promise.resolve({ data: { id: "t-1", name: "Tenant" }, error: null });
    });
  });

  it("no desmonta la pantalla cuando el token se refresca para el mismo usuario", async () => {
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await emitir("INITIAL_SESSION", SESSION);
    await waitFor(() => expect(screen.getByTestId("perfil")).toHaveTextContent("Ana"));
    const montajesTrasLogin = montajesTotales;

    // El token se renueva: misma persona, sesión nueva.
    await emitir("TOKEN_REFRESHED", { ...SESSION, access_token: "t2" });
    await emitir("SIGNED_IN", { ...SESSION, access_token: "t3" });

    expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    expect(screen.getByTestId("estado")).toHaveTextContent("listo");
    expect(montajesTotales).toBe(montajesTrasLogin);
  });

  it("sí recarga el perfil cuando entra un usuario distinto", async () => {
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await emitir("INITIAL_SESSION", SESSION);
    await waitFor(() => expect(screen.getByTestId("perfil")).toHaveTextContent("Ana"));

    single.mockImplementation((table: string) => {
      if (table === "profiles") {
        return Promise.resolve({ data: { id: "user-2", name: "Luis", tenant_id: "t-1" }, error: null });
      }
      if (table === "user_roles") {
        return Promise.resolve({ data: { user_id: "user-2", tenant_role: "asesor" }, error: null });
      }
      return Promise.resolve({ data: { id: "t-1", name: "Tenant" }, error: null });
    });

    await emitir("SIGNED_IN", { user: { id: "user-2" }, access_token: "otro" });
    await waitFor(() => expect(screen.getByTestId("perfil")).toHaveTextContent("Luis"));
  });

  it("al cerrar sesión limpia el perfil", async () => {
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await emitir("INITIAL_SESSION", SESSION);
    await waitFor(() => expect(screen.getByTestId("perfil")).toHaveTextContent("Ana"));

    await emitir("SIGNED_OUT", null);
    await waitFor(() => expect(screen.getByTestId("login")).toBeInTheDocument());
  });
});

describe("AuthContext cuando la carga del perfil falla", () => {
  beforeEach(() => {
    handlers.length = 0;
    montajesTotales = 0;
    single.mockClear();
  });

  const perfilOk = (table: string) => {
    if (table === "profiles") {
      return Promise.resolve({ data: { id: "user-1", name: "Ana", tenant_id: "t-1" }, error: null });
    }
    if (table === "user_roles") {
      return Promise.resolve({ data: { user_id: "user-1", tenant_role: "administrador" }, error: null });
    }
    return Promise.resolve({ data: { id: "t-1", name: "Tenant" }, error: null });
  };

  it("no se queda cargando para siempre: deja un mensaje accionable", async () => {
    single.mockImplementation(() => Promise.reject(new Error("Failed to fetch")));

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );
    await emitir("INITIAL_SESSION", SESSION);

    await waitFor(
      () => expect(screen.getByTestId("error")).toHaveTextContent(/Revisa tu conexión/),
      { timeout: 5000 },
    );
    expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
  });

  it("reintenta solo ante un fallo pasajero", async () => {
    let llamadas = 0;
    single.mockImplementation((table: string) => {
      llamadas++;
      if (llamadas === 1) return Promise.reject(new Error("Failed to fetch"));
      return perfilOk(table);
    });

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );
    await emitir("INITIAL_SESSION", SESSION);

    await waitFor(() => expect(screen.getByTestId("perfil")).toHaveTextContent("Ana"), { timeout: 5000 });
  });

  it("no reintenta si la cuenta no tiene perfil, y lo dice", async () => {
    single.mockImplementation(() => Promise.reject(Object.assign(new Error("no rows"), { code: "PGRST116" })));

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );
    await emitir("INITIAL_SESSION", SESSION);

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent(/no tiene un perfil configurado/));
    expect(single).toHaveBeenCalledTimes(1);
  });

  it("corta una consulta que nunca responde en vez de girar sin fin", async () => {
    // El caso clásico del spinner eterno: la petición se queda colgada y nunca
    // resuelve ni rechaza, así que sin timeout no habría nada que despierte a la app.
    vi.useFakeTimers();
    try {
      single.mockImplementation(() => new Promise(() => {}));

      render(
        <AuthProvider>
          <App />
        </AuthProvider>,
      );
      await act(async () => {
        handlers.forEach(h => h("INITIAL_SESSION", SESSION));
      });

      // Tiempo de sobra para los 3 intentos (15 s cada uno) y sus esperas.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
      expect(screen.getByTestId("error")).toHaveTextContent(/Revisa tu conexión/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("el botón de reintentar recupera la sesión", async () => {
    single.mockImplementation(() => Promise.reject(new Error("Failed to fetch")));

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );
    await emitir("INITIAL_SESSION", SESSION);
    await waitFor(() => expect(screen.getByTestId("error")).toBeInTheDocument(), { timeout: 5000 });

    single.mockImplementation(perfilOk);
    await act(async () => {
      screen.getByTestId("reintentar").click();
    });

    await waitFor(() => expect(screen.getByTestId("perfil")).toHaveTextContent("Ana"), { timeout: 5000 });
  });
});
