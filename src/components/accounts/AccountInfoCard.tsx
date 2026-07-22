import { useEffect, useState } from "react";
import { Pencil, Save, X, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Account, useUpdateAccount, AccountFormData } from "@/hooks/useAccounts";
import { useAccountPartners, PARTNER_ROLES } from "@/hooks/useAccountPartners";
import {
  ACCOUNT_TYPES, INDUSTRIES, COUNTRIES, EMPLOYEE_RANGES, EMPLOYEE_RANGES_SELECTABLE,
  ACCOUNT_TIERS, LIFECYCLE_STAGES, LEAD_SOURCES, labelOf,
} from "@/lib/accountConstants";
import { cn } from "@/lib/utils";

interface AccountInfoCardProps {
  account: Account;
  canManage: boolean;
}

type EditForm = Pick<AccountFormData,
  "account_type" | "industry" | "website" | "country" | "city" | "employee_count" |
  "legal_name" | "tax_id" | "account_tier" | "lifecycle_stage" | "lead_source" |
  "main_phone" | "general_email" | "parent_company" | "notes">;

function seed(a: Account): EditForm {
  return {
    account_type: a.account_type,
    industry: a.industry || "",
    website: a.website || "",
    country: a.country || "",
    city: a.city || "",
    employee_count: a.employee_count || "",
    legal_name: a.legal_name || "",
    tax_id: a.tax_id || "",
    account_tier: a.account_tier || "",
    lifecycle_stage: a.lifecycle_stage || "",
    lead_source: a.lead_source || "",
    main_phone: a.main_phone || "",
    general_email: a.general_email || "",
    parent_company: a.parent_company || "",
    notes: a.notes || "",
  };
}

export function AccountInfoCard({ account, canManage }: AccountInfoCardProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(seed(account));
  const updateAccount = useUpdateAccount();
  const { data: partners = [] } = useAccountPartners(account.id);

  // Re-sembrar si cambia la empresa o se cancela.
  useEffect(() => { setForm(seed(account)); setEditing(false); }, [account.id]);

  const set = <K extends keyof EditForm>(k: K, v: EditForm[K]) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    await updateAccount.mutateAsync({
      id: account.id,
      name: account.name,
      ...form,
    });
    setEditing(false);
  };

  // Resumen de empresas a cargo: "Google Cloud (Proveedor): Ana, Luis ·
  // Tercero X (Referidor): María". Cae a la columna legacy si no hay ninguna.
  const roleLabel = (r: string) => PARTNER_ROLES.find(x => x.value === r)?.label ?? r;
  const aeSummary = partners.length
    ? partners
        .map(p => {
          const names = p.contacts.map(c => c.name).join(", ");
          return `${p.partner_name} (${roleLabel(p.role)})${names ? `: ${names}` : ""}`;
        })
        .join(" · ")
    : account.gcp_ae_name || null;

  const rows: { label: string; value: string | null; href?: string | null }[] = [
    { label: "Razón social", value: account.legal_name || null },
    { label: "Tipo", value: labelOf(ACCOUNT_TYPES, account.account_type) },
    { label: "Industria", value: labelOf(INDUSTRIES, account.industry) },
    { label: "Tier", value: labelOf(ACCOUNT_TIERS, account.account_tier) },
    { label: "Etapa", value: labelOf(LIFECYCLE_STAGES, account.lifecycle_stage) },
    { label: "Fuente", value: labelOf(LEAD_SOURCES, account.lead_source) },
    { label: "RFC / Tax ID", value: account.tax_id || null },
    { label: "Grupo corporativo", value: account.parent_company || null },
    { label: "Sitio web", value: account.website || null, href: account.website || null },
    { label: "País", value: labelOf(COUNTRIES, account.country) },
    { label: "Ciudad", value: account.city || null },
    { label: "Tamaño", value: labelOf(EMPLOYEE_RANGES, account.employee_count) },
    { label: "Teléfono", value: account.main_phone || null, href: account.main_phone ? `tel:${account.main_phone}` : null },
    { label: "Email general", value: account.general_email || null, href: account.general_email ? `mailto:${account.general_email}` : null },
    { label: "Account Executives", value: aeSummary },
  ];

  const filledCount = rows.filter(r => r.value).length + (account.notes ? 1 : 0);
  const totalCount = rows.length + 1;

  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-sm font-semibold">Información de la empresa</CardTitle>
          {!editing && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {filledCount}/{totalCount} campos completados
            </p>
          )}
        </div>
        {canManage && !editing && (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Editar
          </Button>
        )}
        {editing && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setForm(seed(account)); setEditing(false); }} disabled={updateAccount.isPending}>
              <X className="h-4 w-4 mr-1" />Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateAccount.isPending}>
              {updateAccount.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Guardar
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {!editing ? (
          <div className="divide-y divide-border/60">
            {rows.map(row => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-muted-foreground shrink-0">{row.label}</span>
                {row.value ? (
                  row.href ? (
                    <a href={row.href} target={row.href.startsWith("http") ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline truncate flex items-center gap-1">
                      {row.value.replace(/^https?:\/\//, "")}
                      {row.href.startsWith("http") && <ExternalLink className="h-3 w-3 shrink-0" />}
                    </a>
                  ) : (
                    <span className="font-medium text-right truncate">{row.value}</span>
                  )
                ) : (
                  <span className="text-muted-foreground/50 italic">Sin especificar</span>
                )}
              </div>
            ))}
            {/* Notas */}
            <div className="py-2.5 text-sm">
              <span className="text-muted-foreground block mb-1">Notas</span>
              {account.notes
                ? <p className="whitespace-pre-wrap">{account.notes}</p>
                : <span className="text-muted-foreground/50 italic">Sin notas</span>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tipo de cuenta">
                <Select value={form.account_type} onValueChange={v => set("account_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Industria">
                <Select value={form.industry || ""} onValueChange={v => set("industry", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sitio web" full>
                <Input placeholder="https://ejemplo.com" value={form.website || ""} onChange={e => set("website", e.target.value)} />
              </Field>
              <Field label="País">
                <Select value={form.country || ""} onValueChange={v => set("country", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Ciudad">
                <Input placeholder="Ciudad" value={form.city || ""} onChange={e => set("city", e.target.value)} />
              </Field>
              <Field label="Tamaño">
                <Select value={form.employee_count || ""} onValueChange={v => set("employee_count", v)}>
                  <SelectTrigger><SelectValue placeholder="Rango…" /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_RANGES_SELECTABLE.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Razón social" full>
                <Input placeholder="Ej. Grupo Bimbo, S.A.B. de C.V." value={form.legal_name || ""} onChange={e => set("legal_name", e.target.value)} />
              </Field>
              <Field label="RFC / Tax ID">
                <Input placeholder="BIM940101ABC" value={form.tax_id || ""} onChange={e => set("tax_id", e.target.value.toUpperCase())} />
              </Field>
              <Field label="Grupo corporativo">
                <Input placeholder="Empresa matriz" value={form.parent_company || ""} onChange={e => set("parent_company", e.target.value)} />
              </Field>
              <Field label="Tier">
                <Select value={form.account_tier || ""} onValueChange={v => set("account_tier", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TIERS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Etapa del ciclo">
                <Select value={form.lifecycle_stage || ""} onValueChange={v => set("lifecycle_stage", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {LIFECYCLE_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fuente de origen">
                <Select value={form.lead_source || ""} onValueChange={v => set("lead_source", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Teléfono principal">
                <Input placeholder="+52 55 1234 5678" value={form.main_phone || ""} onChange={e => set("main_phone", e.target.value)} />
              </Field>
              <Field label="Email general">
                <Input type="email" placeholder="contacto@empresa.com" value={form.general_email || ""} onChange={e => set("general_email", e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Los Account Executives y los documentos se gestionan desde la pantalla de edición completa.
            </p>
            <Field label="Notas">
              <Textarea rows={3} placeholder="Contexto relevante sobre esta empresa…"
                value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
            </Field>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("space-y-1.5", full && "sm:col-span-2")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
