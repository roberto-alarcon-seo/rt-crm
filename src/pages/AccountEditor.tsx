import { useState, useEffect, useMemo, ReactNode } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Loader2, Save, Building2, Globe, MapPin, Users, Mail, FileText,
  Receipt, Briefcase, Paperclip, AlertTriangle, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useAccount, useCreateAccount, useUpdateAccount, useDuplicateTaxId, AccountFormData,
} from "@/hooks/useAccounts";
import { useUploadAccountDocuments, useAccountDocuments } from "@/hooks/useAccountDocuments";
import { useTeamUsers } from "@/hooks/useTeamUsers";
import { ProjectPartnersField } from "@/components/accounts/ProjectPartnersField";
import { AccountDocumentsSection } from "@/components/accounts/AccountDocumentsSection";
import { useAuth } from "@/contexts/AuthContext";
import {
  ACCOUNT_TYPES, INDUSTRIES, COUNTRIES, EMPLOYEE_RANGES_SELECTABLE,
  ACCOUNT_TIERS, LIFECYCLE_STAGES, LEAD_SOURCES, CURRENCIES, TAX_REGIMES,
} from "@/lib/accountConstants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EMPTY_FORM: AccountFormData = {
  name: "",
  account_type: "lead",
  industry: "",
  website: "",
  country: "",
  city: "",
  employee_count: "",
  notes: "",
  legal_name: "",
  tax_id: "",
  tax_regime: "",
  fiscal_street: "",
  fiscal_ext_number: "",
  fiscal_int_number: "",
  fiscal_neighborhood: "",
  fiscal_zip: "",
  fiscal_state: "",
  fiscal_country: "",
  incorporation_country: "",
  annual_revenue: null,
  revenue_currency: "",
  locations_count: null,
  parent_company: "",
  stock_ticker: "",
  founded_year: null,
  linkedin_url: "",
  account_tier: "",
  lifecycle_stage: "",
  lead_source: "",
  preferred_currency: "",
  assigned_to: null,
  main_phone: "",
  general_email: "",
  email_domains: [],
  timezone: "",
};

/**
 * Secciones de la pantalla, en el orden en que se leen y se llenan. Alimentan
 * a la vez el índice lateral, el scroll-spy y el contador de progreso, así que
 * agregar un campo nuevo solo requiere listarlo aquí para que cuente.
 *
 * EL ORDEN NO ES ARBITRARIO. Hay una frontera entre los campos que describen
 * hechos de la empresa (existen aunque nunca la contactemos) y los que
 * describen nuestra relación con ella (los definimos nosotros). Dentro de cada
 * grupo se va de lo que se sabe en el primer contacto a lo que solo se sabe al
 * cerrar: por eso ubicación va arriba y los datos fiscales y los documentos
 * —que son el resultado de la relación, no su punto de partida— van al final.
 *
 * Como efecto secundario, las dos secciones con UI pesada (selector de AEs y
 * zona de carga de archivos) quedan juntas al final y no rompen el ritmo de
 * escaneo de las rejillas de campos.
 *
 * `fields` vacío = la sección no se mide por campos del formulario sino por su
 * propio contenido (AEs asignados, documentos adjuntos).
 */
interface SectionDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  fields: (keyof AccountFormData)[];
}

const GROUP_COMPANY = "La empresa";
const GROUP_RELATION = "Relación comercial";

const SECTIONS: SectionDef[] = [
  { id: "general",    label: "Identificación", icon: Building2, group: GROUP_COMPANY,  fields: ["name", "legal_name", "account_type", "industry", "website", "linkedin_url"] },
  { id: "contact",    label: "Contacto",       icon: Globe,     group: GROUP_COMPANY,  fields: ["main_phone", "general_email", "email_domains"] },
  { id: "location",   label: "Ubicación",      icon: MapPin,    group: GROUP_COMPANY,  fields: ["country", "city", "timezone"] },
  { id: "size",       label: "Firmografía",    icon: Users,     group: GROUP_COMPANY,  fields: ["employee_count", "locations_count", "annual_revenue", "revenue_currency", "parent_company", "stock_ticker", "founded_year"] },
  { id: "commercial", label: "Clasificación",  icon: Briefcase, group: GROUP_RELATION, fields: ["account_tier", "lifecycle_stage", "lead_source", "assigned_to", "preferred_currency"] },
  { id: "fiscal",     label: "Fiscal",         icon: Receipt,   group: GROUP_RELATION, fields: ["tax_id", "tax_regime", "fiscal_street", "fiscal_ext_number", "fiscal_int_number", "fiscal_neighborhood", "fiscal_zip", "fiscal_state", "fiscal_country", "incorporation_country"] },
  { id: "executives", label: "Account Executives", icon: Mail,  group: GROUP_RELATION, fields: [] },
  { id: "documents",  label: "Documentos",     icon: Paperclip, group: GROUP_RELATION, fields: [] },
  { id: "notes",      label: "Notas",          icon: FileText,  group: GROUP_RELATION, fields: ["notes"] },
];

/** Grupos en orden de aparición, para el índice lateral. */
const SECTION_GROUPS = [GROUP_COMPANY, GROUP_RELATION];

const isFilled = (value: unknown): boolean => {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

export default function AccountEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const { hasRole } = useAuth();

  const { account, isLoading: loadingAccount } = useAccount(id);
  const { documents } = useAccountDocuments(id);
  const { users: teamUsers } = useTeamUsers();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const uploadDocs = useUploadAccountDocuments();

  const [formData, setFormData] = useState<AccountFormData>(EMPTY_FORM);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [domainsText, setDomainsText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);

  const canManage = hasRole(["administrador", "manager"]);
  const duplicate = useDuplicateTaxId(formData.tax_id, id);

  useEffect(() => {
    if (!isEditing || !account) return;

    // Se copia campo por campo desde EMPTY_FORM: así una columna que venga
    // NULL de la base cae al vacío controlado del formulario (""/null) en vez
    // de volver el input no-controlado a media edición.
    const seeded = { ...EMPTY_FORM };
    for (const key of Object.keys(EMPTY_FORM) as (keyof AccountFormData)[]) {
      const value = account[key];
      if (value !== null && value !== undefined) {
        seeded[key] = value as never;
      }
    }
    setFormData(seeded);
    setDomainsText((account.email_domains ?? []).join(", "));
  }, [id, account, isEditing]);

  const docsCount = documents.length + stagedFiles.length;

  /** Campos llenos por sección, para el índice lateral y la barra de avance. */
  const counts = useMemo(() => {
    const perSection: Record<string, { filled: number; total: number }> = {};
    for (const section of SECTIONS) {
      if (section.id === "executives") {
        perSection[section.id] = { filled: 0, total: 0 };
      } else if (section.id === "documents") {
        perSection[section.id] = { filled: docsCount, total: 0 };
      } else {
        perSection[section.id] = {
          filled: section.fields.filter(f => isFilled(formData[f])).length,
          total: section.fields.length,
        };
      }
    }
    const filled = Object.values(perSection).reduce((a, s) => a + (s.total ? s.filled : 0), 0);
    const total = Object.values(perSection).reduce((a, s) => a + s.total, 0);
    return { perSection, filled, total };
  }, [formData, docsCount]);

  /* ── Scroll-spy: resalta en el índice la sección visible ── */
  useEffect(() => {
    const nodes = SECTIONS
      .map(s => document.getElementById(`section-${s.id}`))
      .filter((n): n is HTMLElement => !!n);
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      entries => {
        // La sección activa es la más alta de las que están visibles; sin este
        // desempate, dos secciones cortas en pantalla se pelean el resaltado.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) {
          setActiveSection(visible[0].target.id.replace("section-", ""));
        }
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: 0 }
    );

    nodes.forEach(n => observer.observe(n));
    return () => observer.disconnect();
  }, [loadingAccount]);

  const goToSection = (sectionId: string) => {
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const set = (field: keyof AccountFormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDomainsBlur = () => {
    const domains = domainsText
      .split(/[,\s]+/)
      .map(d => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    set("email_domains", domains);
    setDomainsText(domains.join(", "));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("El nombre de la empresa es requerido");
      goToSection("general");
      return;
    }
    setIsSaving(true);
    try {
      const accountId = isEditing
        ? id!
        : (await createAccount.mutateAsync(formData)).id;

      if (isEditing) {
        await updateAccount.mutateAsync({ id: accountId, ...formData });
      }

      // Las empresas a cargo se guardan en vivo desde su propia sección (requieren
      // una cuenta ya creada), así que aquí no hay que persistir nada extra.

      // Los archivos en espera solo existen en el alta: la empresa ya se creó,
      // así que un fallo aquí no debe tumbar el guardado — se avisa y se
      // conservan en la lista para reintentar desde la pantalla de edición.
      if (stagedFiles.length) {
        const { failed } = await uploadDocs.mutateAsync({
          accountId,
          files: stagedFiles,
          category: "otro",
        });
        setStagedFiles(stagedFiles.filter(f => failed.some(x => x.name === f.name)));
      }

      navigate(`/accounts/${accountId}`);
    } catch {
      // los hooks de mutación ya muestran el toast de error
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing && loadingAccount) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const progressPct = counts.total ? Math.round((counts.filled / counts.total) * 100) : 0;

  return (
    <div className="min-h-full">
      {/* ── Barra superior pegajosa ── */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate(isEditing ? `/accounts/${id}` : "/accounts")}
            aria-label="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold leading-tight truncate">
              {isEditing ? account?.name ?? "Editar empresa" : "Nueva empresa"}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {isEditing ? "Editando ficha de empresa" : "Agrega una empresa al CRM"}
            </p>
          </div>

          {/* Avance de captura */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <div className="w-32">
              <Progress value={progressPct} className="h-1.5" />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {counts.filled}/{counts.total} campos
            </span>
          </div>

          <Button onClick={handleSave} disabled={isSaving || !canManage} className="shrink-0">
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar
          </Button>
        </div>
      </div>

      {/* ── Índice + contenido ── */}
      <div className="max-w-7xl mx-auto px-6 pb-24 pt-6 flex gap-8">
        {/* Índice lateral (se oculta en pantallas angostas: el contenido ya
            está en orden, así que el índice es una ayuda, no un requisito) */}
        <nav className="hidden lg:block w-52 shrink-0" aria-label="Secciones del formulario">
          <div className="sticky top-24 space-y-4">
            {SECTION_GROUPS.map(group => (
              <div key={group} className="space-y-0.5">
                <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group}
                </p>
                {SECTIONS.filter(s => s.group === group).map(section => {
                  const { filled, total } = counts.perSection[section.id];
                  const active = activeSection === section.id;
                  const complete = total > 0 ? filled === total : filled > 0;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => goToSection(section.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors text-left",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <section.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{section.label}</span>
                      {complete ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      ) : filled > 0 ? (
                        <span className="text-[10px] tabular-nums shrink-0 opacity-70">
                          {total > 0 ? `${filled}/${total}` : filled}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        {/* Contenido */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* ── General ── */}
          <Section id="general" icon={Building2} title="Identificación de la empresa">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre comercial *</Label>
                <Input
                  id="name"
                  placeholder="Ej. Grupo Bimbo"
                  value={formData.name}
                  onChange={e => set("name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="legal_name">Razón social</Label>
                <Input
                  id="legal_name"
                  placeholder="Ej. Grupo Bimbo, S.A.B. de C.V."
                  value={formData.legal_name || ""}
                  onChange={e => set("legal_name", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  El nombre legal para contratos y facturación.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Tipo de cuenta</Label>
                <Select value={formData.account_type} onValueChange={v => set("account_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Industria</Label>
                <Select value={formData.industry || ""} onValueChange={v => set("industry", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map(i => (
                      <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Sitio web</Label>
                <Input
                  id="website"
                  placeholder="https://ejemplo.com"
                  value={formData.website || ""}
                  onChange={e => set("website", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin_url">LinkedIn</Label>
              <Input
                id="linkedin_url"
                placeholder="https://linkedin.com/company/…"
                value={formData.linkedin_url || ""}
                onChange={e => set("linkedin_url", e.target.value)}
              />
            </div>
          </Section>

          {/* ── Contacto ── */}
          <Section id="contact" icon={Globe} title="Contacto corporativo">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="main_phone">Teléfono principal</Label>
                <Input
                  id="main_phone"
                  placeholder="+52 55 1234 5678"
                  value={formData.main_phone || ""}
                  onChange={e => set("main_phone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="general_email">Email general</Label>
                <Input
                  id="general_email"
                  type="email"
                  placeholder="contacto@empresa.com"
                  value={formData.general_email || ""}
                  onChange={e => set("general_email", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_domains">Dominios de correo</Label>
              <Input
                id="email_domains"
                placeholder="empresa.com, empresa.mx"
                value={domainsText}
                onChange={e => setDomainsText(e.target.value)}
                onBlur={handleDomainsBlur}
              />
              <p className="text-xs text-muted-foreground">
                Separados por comas. Sirven para vincular automáticamente los contactos nuevos a esta empresa.
              </p>
            </div>
          </Section>

          {/* ── Ubicación ── */}
          <Section id="location" icon={MapPin} title="Ubicación">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>País</Label>
                <Select value={formData.country || ""} onValueChange={v => set("country", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ciudad</Label>
                <Input
                  id="city"
                  placeholder="Ciudad de México"
                  value={formData.city || ""}
                  onChange={e => set("city", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Zona horaria</Label>
                <Input
                  id="timezone"
                  placeholder="America/Mexico_City"
                  value={formData.timezone || ""}
                  onChange={e => set("timezone", e.target.value)}
                />
              </div>
            </div>
          </Section>

          {/* ── Tamaño y firmografía ── */}
          <Section id="size" icon={Users} title="Tamaño y firmografía">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Número de empleados</Label>
                <Select value={formData.employee_count || ""} onValueChange={v => set("employee_count", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar rango…" /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_RANGES_SELECTABLE.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="locations_count">Número de sedes</Label>
                <Input
                  id="locations_count"
                  type="number"
                  min={0}
                  placeholder="Ej. 42"
                  value={formData.locations_count ?? ""}
                  onChange={e => set("locations_count", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="founded_year">Año de fundación</Label>
                <Input
                  id="founded_year"
                  type="number"
                  min={1800}
                  max={new Date().getFullYear()}
                  placeholder="Ej. 1945"
                  value={formData.founded_year ?? ""}
                  onChange={e => set("founded_year", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="annual_revenue">Facturación anual estimada</Label>
                <Input
                  id="annual_revenue"
                  type="number"
                  min={0}
                  placeholder="Ej. 350000000"
                  value={formData.annual_revenue ?? ""}
                  onChange={e => set("annual_revenue", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Moneda de la facturación</Label>
                <Select value={formData.revenue_currency || ""} onValueChange={v => set("revenue_currency", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock_ticker">Ticker bursátil</Label>
                <Input
                  id="stock_ticker"
                  placeholder="Ej. BIMBOA.MX"
                  value={formData.stock_ticker || ""}
                  onChange={e => set("stock_ticker", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <Label htmlFor="parent_company">Grupo corporativo / matriz</Label>
                <Input
                  id="parent_company"
                  placeholder="Ej. Grupo Bimbo"
                  value={formData.parent_company || ""}
                  onChange={e => set("parent_company", e.target.value)}
                />
              </div>
            </div>
          </Section>

          {/* ── Clasificación comercial ── */}
          <Section id="commercial" icon={Briefcase} title="Clasificación comercial">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Tier de cuenta</Label>
                <Select value={formData.account_tier || ""} onValueChange={v => set("account_tier", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TIERS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Etapa del ciclo de vida</Label>
                <Select value={formData.lifecycle_stage || ""} onValueChange={v => set("lifecycle_stage", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {LIFECYCLE_STAGES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fuente de origen</Label>
                <Select value={formData.lead_source || ""} onValueChange={v => set("lead_source", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Owner interno</Label>
                <Select
                  value={formData.assigned_to || ""}
                  onValueChange={v => set("assigned_to", v || null)}
                >
                  <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    {teamUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Moneda preferida</Label>
                <Select value={formData.preferred_currency || ""} onValueChange={v => set("preferred_currency", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          {/* ── Datos fiscales ── */}
          <Section id="fiscal" icon={Receipt} title="Datos fiscales">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tax_id">RFC / Tax ID</Label>
                <Input
                  id="tax_id"
                  placeholder="Ej. BIM940101ABC"
                  value={formData.tax_id || ""}
                  onChange={e => set("tax_id", e.target.value.toUpperCase())}
                />
                {duplicate && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    <span>
                      Ya existe una empresa con este RFC:{" "}
                      <Link to={`/accounts/${duplicate.id}`} className="underline font-medium">
                        {duplicate.name}
                      </Link>
                    </span>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Régimen fiscal</Label>
                <Select value={formData.tax_regime || ""} onValueChange={v => set("tax_regime", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {TAX_REGIMES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <div className="space-y-2 sm:col-span-4">
                <Label htmlFor="fiscal_street">Calle</Label>
                <Input
                  id="fiscal_street"
                  value={formData.fiscal_street || ""}
                  onChange={e => set("fiscal_street", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscal_ext_number">Nº ext.</Label>
                <Input
                  id="fiscal_ext_number"
                  value={formData.fiscal_ext_number || ""}
                  onChange={e => set("fiscal_ext_number", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscal_int_number">Nº int.</Label>
                <Input
                  id="fiscal_int_number"
                  value={formData.fiscal_int_number || ""}
                  onChange={e => set("fiscal_int_number", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fiscal_neighborhood">Colonia</Label>
                <Input
                  id="fiscal_neighborhood"
                  value={formData.fiscal_neighborhood || ""}
                  onChange={e => set("fiscal_neighborhood", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscal_zip">Código postal</Label>
                <Input
                  id="fiscal_zip"
                  value={formData.fiscal_zip || ""}
                  onChange={e => set("fiscal_zip", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscal_state">Estado</Label>
                <Input
                  id="fiscal_state"
                  value={formData.fiscal_state || ""}
                  onChange={e => set("fiscal_state", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>País fiscal</Label>
                <Select value={formData.fiscal_country || ""} onValueChange={v => set("fiscal_country", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>País de constitución</Label>
                <Select value={formData.incorporation_country || ""} onValueChange={v => set("incorporation_country", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          {/* ── Account Executives (empresas a cargo del proyecto) ── */}
          <Section
            id="executives"
            icon={Mail}
            title="Account Executives"
          >
            {isEditing && id ? (
              <ProjectPartnersField accountId={id} disabled={!canManage} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Guarda la empresa primero para asignar las empresas a cargo (proveedor, referidor…) y sus ejecutivos.
              </p>
            )}
            {account?.gcp_ae_name && (
              <p className="text-xs text-muted-foreground mt-2">
                Registro anterior: <span className="font-medium">{account.gcp_ae_name}</span>
                {account.gcp_ae_email && ` · ${account.gcp_ae_email}`}
              </p>
            )}
          </Section>

          {/* ── Documentos ── */}
          <Section
            id="documents"
            icon={Paperclip}
            title="Documentos"
            hint={docsCount > 0 ? `${docsCount} archivo${docsCount > 1 ? "s" : ""}` : undefined}
          >
            <AccountDocumentsSection
              accountId={id ?? null}
              canManage={canManage}
              stagedFiles={stagedFiles}
              onStagedFilesChange={setStagedFiles}
            />
          </Section>

          {/* ── Notas ── */}
          <Section id="notes" icon={FileText} title="Notas">
            <Textarea
              placeholder="Contexto relevante sobre esta empresa…"
              value={formData.notes || ""}
              onChange={e => set("notes", e.target.value)}
              rows={5}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

/**
 * Bloque de formulario. `scroll-mt-24` compensa la barra pegajosa para que al
 * saltar desde el índice el título no quede escondido debajo de ella.
 */
function Section({
  id, icon: Icon, title, hint, children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card id={`section-${id}`} className="scroll-mt-24">
      <CardHeader className="pb-4 border-b border-border/50">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1">{title}</span>
          {hint && (
            <span className="text-xs font-normal text-muted-foreground">{hint}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">{children}</CardContent>
    </Card>
  );
}
