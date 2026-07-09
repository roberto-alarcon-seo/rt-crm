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
import { cn } from "@/lib/utils";

const ACCOUNT_TYPES = [
  { value: "lead", label: "Lead" },
  { value: "prospect", label: "Prospecto" },
  { value: "cliente", label: "Cliente" },
  { value: "partner", label: "Partner" },
  { value: "partner_y_cliente", label: "Partner y Cliente" },
];

const INDUSTRIES = [
  { value: "tecnologia", label: "Tecnología" },
  { value: "telecomunicaciones", label: "Telecomunicaciones" },
  { value: "retail", label: "Retail / Comercio" },
  { value: "consumo_masivo", label: "Consumo Masivo" },
  { value: "manufactura", label: "Manufactura" },
  { value: "servicios", label: "Servicios profesionales" },
  { value: "salud", label: "Salud" },
  { value: "educacion", label: "Educación" },
  { value: "finanzas", label: "Finanzas / Banca" },
  { value: "logistica", label: "Logística / Transporte" },
  { value: "gobierno", label: "Gobierno / Sector público" },
  { value: "media", label: "Media / Entretenimiento" },
  { value: "energia", label: "Energía" },
  { value: "construccion", label: "Construcción / Inmobiliario" },
  { value: "otro", label: "Otro" },
];

const EMPLOYEE_RANGES = [
  { value: "1-10", label: "1-10 empleados" },
  { value: "11-50", label: "11-50 empleados" },
  { value: "51-200", label: "51-200 empleados" },
  { value: "201-500", label: "201-500 empleados" },
  { value: "501-1000", label: "501-1000 empleados" },
  { value: "1000+", label: "1000+ empleados" },
];

const COUNTRIES = [
  { value: "MX", label: "🇲🇽 México" },
  { value: "CO", label: "🇨🇴 Colombia" },
  { value: "CL", label: "🇨🇱 Chile" },
  { value: "AR", label: "🇦🇷 Argentina" },
  { value: "PE", label: "🇵🇪 Perú" },
  { value: "US", label: "🇺🇸 Estados Unidos" },
];

const labelOf = (opts: { value: string; label: string }[], v?: string | null) =>
  opts.find(o => o.value === v)?.label ?? v ?? null;

interface AccountInfoCardProps {
  account: Account;
  canManage: boolean;
}

type EditForm = Pick<AccountFormData,
  "account_type" | "industry" | "website" | "country" | "city" | "employee_count" |
  "gcp_ae_name" | "gcp_ae_email" | "notes">;

function seed(a: Account): EditForm {
  return {
    account_type: a.account_type,
    industry: a.industry || "",
    website: a.website || "",
    country: a.country || "",
    city: a.city || "",
    employee_count: a.employee_count || "",
    gcp_ae_name: a.gcp_ae_name || "",
    gcp_ae_email: a.gcp_ae_email || "",
    notes: a.notes || "",
  };
}

export function AccountInfoCard({ account, canManage }: AccountInfoCardProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(seed(account));
  const updateAccount = useUpdateAccount();

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

  // Campos en modo lectura
  const rows: { label: string; value: string | null; href?: string | null }[] = [
    { label: "Tipo", value: labelOf(ACCOUNT_TYPES, account.account_type) },
    { label: "Industria", value: labelOf(INDUSTRIES, account.industry) },
    { label: "Sitio web", value: account.website || null, href: account.website || null },
    { label: "País", value: labelOf(COUNTRIES, account.country) },
    { label: "Ciudad", value: account.city || null },
    { label: "Tamaño", value: labelOf(EMPLOYEE_RANGES, account.employee_count) },
    { label: "AE Google Cloud", value: account.gcp_ae_name || null },
    { label: "Email AE", value: account.gcp_ae_email || null, href: account.gcp_ae_email ? `mailto:${account.gcp_ae_email}` : null },
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
                    {EMPLOYEE_RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="AE Google Cloud">
                <Input placeholder="Nombre del AE" value={form.gcp_ae_name || ""} onChange={e => set("gcp_ae_name", e.target.value)} />
              </Field>
              <Field label="Email AE">
                <Input type="email" placeholder="ae@google.com" value={form.gcp_ae_email || ""} onChange={e => set("gcp_ae_email", e.target.value)} />
              </Field>
            </div>
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
