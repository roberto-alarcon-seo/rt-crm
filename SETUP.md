# Guía de setup de nueva instancia

Sigue estos pasos para levantar una instancia completamente nueva (nuevo partner/cliente).
Cada instancia = 1 proyecto Supabase + 1 deploy del frontend.

---

## Prerequisitos

- Supabase CLI instalado y autenticado (`supabase login`)
- Acceso al Dashboard de Supabase (supabase.com)
- Git + acceso al repo: https://github.com/roberto-alarcon-seo/brokia24-mlslatam-app

---

## Paso 1 — Crear el proyecto Supabase

En el Dashboard de Supabase crea un nuevo proyecto:
- **Nombre:** `<nombre-del-partner>-prd` (ej. `mlslatam-prd`)
- **Región:** la más cercana al cliente
- **Password de DB:** guárdalo en un lugar seguro

Anota el **Project Ref** (ej. `kzhetgbegdytnoexbmev`) — lo necesitarás en todos los pasos.

---

## Paso 2 — Clonar el repo y vincular al nuevo proyecto

```bash
git clone https://github.com/roberto-alarcon-seo/brokia24-mlslatam-app.git <nombre-del-partner>
cd <nombre-del-partner>
supabase link --project-ref <PROJECT_REF>
```

---

## Paso 3 — Aplicar el schema completo

Aplica las 100+ migraciones en orden:

```bash
supabase db push
```

Esto crea todas las tablas, RLS, funciones, triggers, buckets de Storage y elimina
los partners seed de Lovable. La instancia queda limpia y con el constraint de 1 partner.

---

## Paso 4 — Desplegar las Edge Functions

```bash
supabase functions deploy --project-ref <PROJECT_REF>
```

Se despliegan las ~45 funciones automáticamente.

---

## Paso 5 — Crear el super_admin

Obtén el `anon key` del proyecto desde Supabase Dashboard → Settings → API.

```bash
# Crear el super_admin inicial
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/seed-super-admin" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

> **Nota:** `seed-super-admin` está hardcodeado para `roberto@responde.mx` / `P4dr1n0s`.
> Después del setup puedes crear otros super_admins y cambiar la contraseña.

---

## Paso 6 — Configurar el partner único de la instancia

```bash
TOKEN=$(curl -s -X POST "https://<PROJECT_REF>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"roberto@responde.mx","password":"P4dr1n0s"}' \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/setup-instance" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "<partner-slug>",
    "name": "<Nombre del Partner>",
    "primaryDomain": "<dominio-app>",
    "countryCode": "MX",
    "logoUrl": "<url-del-logo>",
    "primaryColorHex": "<#hexcolor>",
    "primaryColorHsl": "<H S% L%>",
    "emailSenderName": "<Nombre Remitente>",
    "emailSenderAddress": "<no-reply@dominio>",
    "initialCredits": 0,
    "dashboardUrl": "https://<dominio-app>",
    "logoutRedirectUrl": "https://<dominio-app>/auth"
  }'
```

La función devuelve `{"success":true}` si todo está bien.
Si la instancia ya tiene un partner configurado devuelve `409` (protección doble).

---

## Paso 7 — Configurar las variables de entorno del frontend

Crea `.env.local` (no se commitea):

```env
VITE_SUPABASE_PROJECT_ID="<PROJECT_REF>"
VITE_SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY>"
```

---

## Paso 8 — Configurar secrets de las Edge Functions

En Supabase Dashboard → Edge Functions → Secrets (o via CLI):

```bash
supabase secrets set --project-ref <PROJECT_REF> \
  OPENROUTER_API_KEY="<key>" \
  RESEND_API_KEY="<key>" \
  RESEND_FROM_EMAIL="no-reply@<dominio>" \
  TWILIO_ACCOUNT_SID="<sid>" \
  TWILIO_AUTH_TOKEN="<token>"
```

> **OpenRouter:** Obtén tu API key en https://openrouter.ai → Keys. Las funciones de IA usan
> el modelo `google/gemini-2.5-flash`. Asegúrate de tener créditos cargados en tu cuenta.

Secrets requeridos por función:

| Secret | Funciones que lo usan |
|---|---|
| `OPENROUTER_API_KEY` | ai-chat-response, ai-rewrite-text, ai-lead-scoring, ai-campaign-copilot, ai-suggest-pipeline-stage, ai-meta-campaign-builder, ai-sandbox-test |
| `RESEND_API_KEY` | send-email, admin-invite-super-admin, admin-invite-owner, invite-tenant-user |
| `RESEND_FROM_EMAIL` | send-email, admin-invite-super-admin |
| `TWILIO_ACCOUNT_SID` | manage-twilio-subaccount, validate-twilio-credentials |
| `TWILIO_AUTH_TOKEN` | twilio-inbound-webhook, manage-twilio-subaccount |
| `META_APP_ID` | meta-ads-insights, meta-capi-track, validate-meta-ads-credentials |
| `META_APP_SECRET` | meta-ads-insights, meta-capi-track |

---

## Paso 9 — Verificar que todo funciona

```bash
# El partner existe
curl -s "https://<PROJECT_REF>.supabase.co/rest/v1/partners?select=id,name" \
  -H "apikey: <ANON_KEY>" | cat

# Iniciar sesión en la app
# → debe redirigir al dashboard del partner sin errores
npm run dev
```

---

## Checklist final

- [ ] Proyecto Supabase creado
- [ ] `supabase db push` completado sin errores
- [ ] Edge Functions desplegadas (~45)
- [ ] Super admin creado (`seed-super-admin`)
- [ ] Partner configurado (`setup-instance`)
- [ ] `.env.local` con las credenciales del nuevo proyecto
- [ ] Secrets de Edge Functions configurados (`OPENROUTER_API_KEY`, `RESEND_API_KEY`, etc.)
- [ ] Login verificado en la app
- [ ] (Producción) Dominio y SSL configurados en Vercel

---

## Instancias activas

| Instancia | Project Ref | Partner | Estado |
|---|---|---|---|
| mlslatam-dev | kzhetgbegdytnoexbmev | MLS LATAM | Dev activo |
| mlslatam-prd | — | MLS LATAM | Pendiente |

---

## Notas de arquitectura

- **1 partner por instancia** — el constraint `one_partner_per_instance` en la DB lo hace imposible técnicamente.
- Para un cliente nuevo: clonar el repo, seguir esta guía. No crear un segundo partner en una instancia existente.
- El wallet de créditos fluye: super_admin → partner → tenants. Se asignan créditos iniciales en el Paso 6 (`initialCredits`).
- Los seeds de prueba (brokia, mls_latam, responde) se eliminan automáticamente en el `db push` si no tienen tenants.
