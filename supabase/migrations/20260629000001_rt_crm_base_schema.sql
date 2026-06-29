-- RT CRM Base Schema Migration
-- Adds B2B commercial entities: accounts, account_relationships,
-- opportunities, opportunity_lines, attribution, tasks, goals,
-- vendor_registration_processes
-- Also adapts contacts table for B2B context

-- ALTER TYPE ADD VALUE must run outside a transaction block
ALTER TYPE public.automation_trigger_type ADD VALUE IF NOT EXISTS 'opportunity_stage_changed';
ALTER TYPE public.automation_trigger_type ADD VALUE IF NOT EXISTS 'opportunity_stalled';
ALTER TYPE public.automation_trigger_type ADD VALUE IF NOT EXISTS 'task_overdue';
ALTER TYPE public.automation_trigger_type ADD VALUE IF NOT EXISTS 'vendor_registration_blocked';
ALTER TYPE public.automation_trigger_type ADD VALUE IF NOT EXISTS 'proposal_sent';
ALTER TYPE public.automation_trigger_type ADD VALUE IF NOT EXISTS 'contract_pending';

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.account_type AS ENUM (
  'lead',
  'prospect',
  'cliente',
  'partner',
  'partner_y_cliente'
);

CREATE TYPE public.opportunity_stage AS ENUM (
  'etapa_0_captacion',
  'etapa_1_calificacion',
  'etapa_2_nurturing',
  'etapa_3_demo',
  'etapa_4_oportunidad',
  'etapa_5_propuesta',
  'etapa_6_negociacion',
  'etapa_7_compras_legal',
  'etapa_8_alta_proveedor',
  'etapa_9_contrato',
  'cerrada_ganada',
  'cerrada_perdida'
);

CREATE TYPE public.opportunity_line_type AS ENUM (
  'licencia',
  'servicio',
  'gcp',
  'tercero'
);

CREATE TYPE public.task_status AS ENUM (
  'pending',
  'in_progress',
  'done',
  'cancelled'
);

CREATE TYPE public.task_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

CREATE TYPE public.goal_status AS ENUM (
  'active',
  'completed',
  'paused',
  'cancelled'
);

CREATE TYPE public.vendor_reg_status AS ENUM (
  'pendiente',
  'en_proceso',
  'completado',
  'bloqueado'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCOUNTS (Empresas)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.accounts (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  account_type    public.account_type NOT NULL DEFAULT 'lead',
  industry        TEXT,
  website         TEXT,
  country         TEXT,                 -- ISO 3166-1 alpha-2: MX, CO, CL, AR, PE, US
  city            TEXT,
  employee_count  TEXT,                 -- '1-10' | '11-50' | '51-200' | '200+'
  gcp_ae_name     TEXT,                 -- Account Executive de Google Cloud asignado
  gcp_ae_email    TEXT,
  pnh_account_id  TEXT,                 -- ID en Partner Network Hub de GCP
  status          TEXT NOT NULL DEFAULT 'active',
  notes           TEXT,
  assigned_to     UUID REFERENCES public.profiles(id),
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_tenant_id    ON public.accounts(tenant_id);
CREATE INDEX idx_accounts_account_type ON public.accounts(account_type);
CREATE INDEX idx_accounts_country      ON public.accounts(country);
CREATE INDEX idx_accounts_status       ON public.accounts(status);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_tenant_isolation" ON public.accounts
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCOUNT RELATIONSHIPS (partner ↔ cliente final)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.account_relationships (
  id                  UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  client_account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  relationship_type   TEXT NOT NULL DEFAULT 'partner_contrata',
  -- 'partner_contrata' | 'partner_coventas' | 'canal_adquisicion'
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_relationship CHECK (partner_account_id <> client_account_id)
);

ALTER TABLE public.account_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_relationships_tenant_isolation" ON public.account_relationships
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- ADAPT CONTACTS TABLE — add B2B fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS account_id       UUID REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS job_title        TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url     TEXT,
  ADD COLUMN IF NOT EXISTS preferred_channel TEXT DEFAULT 'whatsapp';
  -- 'whatsapp' | 'email' | 'phone' | 'linkedin'

CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON public.contacts(account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- OPPORTUNITIES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.opportunities (
  id                      UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  account_id              UUID REFERENCES public.accounts(id),
  partner_account_id      UUID REFERENCES public.accounts(id),
  primary_contact_id      UUID REFERENCES public.contacts(id),

  stage                   public.opportunity_stage NOT NULL DEFAULT 'etapa_0_captacion',
  close_probability       INTEGER DEFAULT 0 CHECK (close_probability BETWEEN 0 AND 100),
  estimated_close_date    DATE,
  actual_close_date       DATE,

  total_amount_usd        DECIMAL(12,2),
  currency                TEXT DEFAULT 'USD',

  country                 TEXT,
  city                    TEXT,
  origin_channel          TEXT,
  -- 'inbound' | 'gcp_ae' | 'partner' | 'referido' | 'paid' | 'direct'

  pnh_opportunity_id      TEXT,         -- ID en Partner Network Hub de GCP
  lost_reason             TEXT,

  assigned_to             UUID REFERENCES public.profiles(id),
  created_by              UUID REFERENCES public.profiles(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opportunities_tenant_id  ON public.opportunities(tenant_id);
CREATE INDEX idx_opportunities_account_id ON public.opportunities(account_id);
CREATE INDEX idx_opportunities_stage      ON public.opportunities(stage);
CREATE INDEX idx_opportunities_assigned   ON public.opportunities(assigned_to);

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opportunities_tenant_isolation" ON public.opportunities
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- OPPORTUNITY LINES (líneas de ingreso tipadas)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.opportunity_lines (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  opportunity_id  UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL,

  line_type       public.opportunity_line_type NOT NULL,
  -- licencia:  Nexus | Aura | Prism | Radian
  -- servicio:  Managed Service | Implementación | Dev
  -- gcp:       Gemini | BigQuery | Cloud Run | Looker | Otros
  -- tercero:   LKMX | Otros
  subtype         TEXT NOT NULL,
  description     TEXT,

  quantity        DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price      DECIMAL(12,2),
  cost            DECIMAL(12,2),
  currency        TEXT NOT NULL DEFAULT 'USD',
  recurrence      TEXT NOT NULL DEFAULT 'one_time',
  -- 'one_time' | 'monthly' | 'annual'

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opp_lines_opportunity_id ON public.opportunity_lines(opportunity_id);

ALTER TABLE public.opportunity_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opportunity_lines_tenant_isolation" ON public.opportunity_lines
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- ATTRIBUTION (trazabilidad UTM punta a punta)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.attribution (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  contact_id      UUID REFERENCES public.contacts(id),
  account_id      UUID REFERENCES public.accounts(id),

  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_content     TEXT,
  utm_term        TEXT,

  gclid           TEXT,         -- Google Click ID
  fbclid          TEXT,         -- Facebook Click ID
  li_fat_id       TEXT,         -- LinkedIn Click ID

  landing_page    TEXT,
  referrer        TEXT,
  entry_channel   TEXT,
  -- 'web_form' | 'whatsapp' | 'email' | 'linkedin' | 'direct'
  country         TEXT,
  city            TEXT,

  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attribution_tenant_id  ON public.attribution(tenant_id);
CREATE INDEX idx_attribution_contact_id ON public.attribution(contact_id);

ALTER TABLE public.attribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attribution_tenant_isolation" ON public.attribution
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- TASKS (tareas con dueño y fecha — base de los loops)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.tasks (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  title                 TEXT NOT NULL,
  description           TEXT,

  related_type          TEXT,    -- 'contact' | 'account' | 'opportunity'
  related_id            UUID,

  owner_id              UUID REFERENCES public.profiles(id),
  assigned_by_agent     BOOLEAN NOT NULL DEFAULT FALSE,

  due_date              TIMESTAMPTZ,
  status                public.task_status NOT NULL DEFAULT 'pending',
  priority              public.task_priority NOT NULL DEFAULT 'normal',
  source                TEXT NOT NULL DEFAULT 'manual',
  -- 'manual' | 'agent' | 'automation' | 'meeting_notes'

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX idx_tasks_tenant_id ON public.tasks(tenant_id);
CREATE INDEX idx_tasks_owner_id  ON public.tasks(owner_id);
CREATE INDEX idx_tasks_status    ON public.tasks(status);
CREATE INDEX idx_tasks_due_date  ON public.tasks(due_date);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_tenant_isolation" ON public.tasks
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- GOALS (objetivos asignados a agentes)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.goals (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  title           TEXT NOT NULL,
  description     TEXT,

  agent_type      TEXT,
  -- 'sdr' | 'calendar' | 'opportunity' | 'procurement' | 'insight'
  assigned_to     UUID REFERENCES public.profiles(id),

  related_type    TEXT,
  related_id      UUID,

  status          public.goal_status NOT NULL DEFAULT 'active',
  target_date     DATE,
  progress_notes  TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goals_tenant_id  ON public.goals(tenant_id);
CREATE INDEX idx_goals_status     ON public.goals(status);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals_tenant_isolation" ON public.goals
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- VENDOR REGISTRATION PROCESSES (Alta de Proveedor — §8 del documento)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.vendor_registration_processes (
  id                  UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  opportunity_id      UUID REFERENCES public.opportunities(id),
  account_id          UUID REFERENCES public.accounts(id),
  country             TEXT NOT NULL,

  compras_status      public.vendor_reg_status NOT NULL DEFAULT 'pendiente',
  seguridad_status    public.vendor_reg_status NOT NULL DEFAULT 'pendiente',
  legal_status        public.vendor_reg_status NOT NULL DEFAULT 'pendiente',
  alta_status         public.vendor_reg_status NOT NULL DEFAULT 'pendiente',
  contrato_status     public.vendor_reg_status NOT NULL DEFAULT 'pendiente',

  notes               TEXT,
  assigned_to         UUID REFERENCES public.profiles(id),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendor_reg_tenant_id     ON public.vendor_registration_processes(tenant_id);
CREATE INDEX idx_vendor_reg_opportunity   ON public.vendor_registration_processes(opportunity_id);

ALTER TABLE public.vendor_registration_processes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_reg_tenant_isolation" ON public.vendor_registration_processes
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPANY PROFILES BY COUNTRY (datos fiscales de RT para alta de proveedores)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.company_profiles (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  country         TEXT NOT NULL,
  fiscal_name     TEXT NOT NULL,
  tax_id          TEXT,            -- RFC en MX, NIT en CO, RUT en CL/AR, etc.
  legal_address   TEXT,
  legal_rep_name  TEXT,
  legal_rep_email TEXT,
  bank_name       TEXT,
  bank_account    TEXT,
  bank_clabe      TEXT,            -- CLABE (MX) o equivalente
  bank_swift      TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, country)
);

ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_profiles_tenant_isolation" ON public.company_profiles
  FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER opportunities_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER vendor_reg_updated_at
  BEFORE UPDATE ON public.vendor_registration_processes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER company_profiles_updated_at
  BEFORE UPDATE ON public.company_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
