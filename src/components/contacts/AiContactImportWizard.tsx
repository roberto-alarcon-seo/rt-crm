import { useState, useCallback, useMemo } from "react";
import {
  Upload, X, FileText, AlertCircle, CheckCircle2, Loader2, AlertTriangle,
  Sparkles, Building2, UserPlus, RefreshCcw, Ban, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface AnalysisPlan {
  columnMapping: Partial<Record<
    'first_name' | 'last_name' | 'full_name' | 'email' | 'phone' | 'company' |
    'lead_status' | 'lifecycle' | 'owner' | 'external_id', number | null>>;
  lifecycleMap: Record<string, { lifecycle: string; pipeline_stage: string }>;
  domainCompany: Record<string, string | null>;
  personalDomains: string[];
  junkLocalParts: string[];
  junkDomains: string[];
}

type RowAction = 'create' | 'update' | 'skip';

interface RowDecision {
  rowIndex: number;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  phone: string | null;
  externalId: string | null;
  company: string | null;
  leadStatus: string | null;
  lifecycle: string;
  pipelineStage: string;
  ownerName: string | null;
  action: RowAction;
  skipReason?: string;
  existingId?: string;
}

interface ImportResult { created: number; updated: number; skipped: number; accountsCreated: number; failed: number; errors: { row: number; reason: string }[]; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

// ── Plan de respaldo (sin IA) ─────────────────────────────────────────────────
const PERSONAL_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'gmx.com', 'hotmail.es', 'yahoo.com.mx'];
const JUNK_LOCAL = ['no-reply', 'noreply', 'donotreply', 'do_not_reply', 'do-not-reply', 'notifications', 'notification', 'notificaciones', 'facturacion', 'facturaelectronica', 'facturas', 'billing', 'invoice', 'invoices', 'recibos', 'statements', 'cobranza', 'dse', 'dse_na2', 'signers', 'adobesign', 'calendar-notification', 'reminder', 'reminders', 'bounce', 'bounced', 'mailer-daemon', 'postmaster', 'news', 'newsletter', 'boletos', 'do-not-reply'];
const JUNK_DOMAINS = ['docusign.net', 'adobesign.com', 'esignlive.com', 'luma-mail.com', 'brevosend.com', 'chilipiper.com', 'medallia.com', 'express.medallia.com'];

const DEFAULT_LIFECYCLE: Record<string, { lifecycle: string; pipeline_stage: string }> = {
  'lead': { lifecycle: 'lead', pipeline_stage: 'etapa_0_captacion' },
  'lead calificado por ventas': { lifecycle: 'lead', pipeline_stage: 'etapa_1_calificacion' },
  'oportunidad': { lifecycle: 'lead', pipeline_stage: 'etapa_4_oportunidad' },
  'cliente': { lifecycle: 'client', pipeline_stage: 'cerrada_ganada' },
};

function buildDefaultPlan(headers: string[]): AnalysisPlan {
  const cm: AnalysisPlan['columnMapping'] = {};
  headers.forEach((h, i) => {
    const s = h.toLowerCase().trim();
    if (s === 'nombre' || s === 'first name' || s === 'nombres') cm.first_name = i;
    else if (s.startsWith('apellido')) cm.last_name = i;
    else if (s === 'nombre completo' || s === 'name' || s === 'full name') cm.full_name = i;
    else if (s === 'correo' || s === 'email' || s === 'correo electrónico' || s.includes('email')) cm.email = i;
    else if (s.includes('teléfono') || s.includes('telefono') || s === 'phone' || s.includes('phone') || s.includes('número de teléfono')) cm.phone = i;
    else if (s.includes('empresa') || s === 'company' || s.includes('company')) cm.company = i;
    else if (s.includes('estado del lead') || s.includes('lead status')) cm.lead_status = i;
    else if (s.includes('ciclo de vida') || s.includes('lifecycle')) cm.lifecycle = i;
    else if (s.includes('propietario') || s.includes('owner')) cm.owner = i;
    else if (s.includes('id de registro') || s === 'id' || s.includes('record id')) cm.external_id = i;
  });
  return { columnMapping: cm, lifecycleMap: DEFAULT_LIFECYCLE, domainCompany: {}, personalDomains: PERSONAL_DOMAINS, junkLocalParts: JUNK_LOCAL, junkDomains: JUNK_DOMAINS };
}

// ── Utilidades ────────────────────────────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const parseRow = (line: string): string[] => {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  return { headers: parseRow(lines[0]), rows: lines.slice(1).map(parseRow) };
}

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  let n = phone.replace(/[\s\-().]/g, '');
  if (!n) return null;
  if (!n.startsWith('+')) {
    if (n.length === 10) n = '+52' + n;
    else if (n.startsWith('52') && n.length >= 12) n = '+' + n;
    else n = '+' + n;
  }
  return /^\+\d{8,15}$/.test(n) ? n : null;
}

// Sufijos públicos de dos niveles frecuentes (para extraer el dominio raíz real).
const TWO_LEVEL_TLDS = new Set([
  'com.mx', 'com.co', 'com.ar', 'com.br', 'com.pe', 'com.uy', 'com.ec', 'com.ve', 'com.gt',
  'gob.mx', 'org.mx', 'edu.mx', 'net.mx', 'co.uk', 'org.uk', 'ac.uk', 'co.jp', 'com.au',
]);

// Devuelve la etiqueta registrable del dominio, ignorando subdominios (email.anthropic.com -> anthropic).
function domainRootLabel(domain: string): string {
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  const lastTwo = parts.slice(-2).join('.');
  const sldIdx = (parts.length >= 3 && TWO_LEVEL_TLDS.has(lastTwo)) ? parts.length - 3 : parts.length - 2;
  return parts[Math.max(0, sldIdx)] || parts[0];
}

function titleCaseDomainRoot(domain: string): string {
  const root = domainRootLabel(domain).replace(/[-_]/g, ' ');
  return root.replace(/\b\w/g, c => c.toUpperCase());
}

// ¿El dominio (o un subdominio suyo) es un dominio de sistema/notificaciones?
function domainIsJunk(domain: string, junkDomains: string[]): boolean {
  return junkDomains.some(jd => domain === jd || domain.endsWith('.' + jd));
}

// Prefijos de local-part que indican correos automáticos (no leads).
const SYSTEM_LOCAL_PREFIXES = [
  'no-reply', 'noreply', 'no_reply', 'donotreply', 'do-not-reply', 'do_not_reply', 'mailer-daemon',
  'mailer', 'postmaster', 'bounce', 'bounced', 'notification', 'notifications', 'notificacion',
  'notificaciones', 'facturacion', 'facturaelectronica', 'facturas', 'factura', 'billing',
  'invoice', 'invoices', 'recibos', 'statements', 'newsletter', 'reservaciones', 'reservation',
];

function isSystemEmail(local: string, domain: string, junkLocalParts: string[], junkDomains: string[]): boolean {
  if (!local) return false;
  if (local.includes('+')) return true;
  if (domainIsJunk(domain, junkDomains)) return true;
  if (junkLocalParts.includes(local)) return true;
  if (SYSTEM_LOCAL_PREFIXES.some(p => local === p || local.startsWith(p))) return true;
  return false;
}

function cleanName(s: string): string {
  return (s || '').replace(/\s*—\s*/g, '').replace(/\s+/g, ' ').trim();
}

// Une nombre y apellido evitando duplicar cuando uno ya contiene al otro
// (datos de origen donde "Nombre" ya trae el nombre completo).
function composeName(first: string, last: string): string {
  const f = (first || '').trim(), l = (last || '').trim();
  if (!f) return l;
  if (!l) return f;
  const lf = f.toLowerCase(), ll = l.toLowerCase();
  if (lf.includes(ll)) return f;
  if (ll.includes(lf)) return l;
  return `${f} ${l}`;
}

// Clave normalizada para emparejar nombres de empresa: ignora acentos,
// mayúsculas y espacios extra (así "Televisa Univisión" == "Televisa Univision").
function companyKey(name: string): string {
  return (name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // acentos/diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');                 // espacios, puntuación, etc.
}

// ── Componente ────────────────────────────────────────────────────────────────
export function AiContactImportWizard({ open, onOpenChange, onImportComplete }: Props) {
  const tenantId = useEffectiveTenantId();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [decisions, setDecisions] = useState<RowDecision[]>([]);
  const [newCompanies, setNewCompanies] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [reviewTab, setReviewTab] = useState('import');

  const reset = () => {
    setStep(1); setFileName(''); setAnalyzing(false); setAiUsed(false);
    setDecisions([]); setNewCompanies([]); setImporting(false); setProgress(0);
    setResult(null); setReviewTab('import');
  };
  const handleClose = () => { reset(); onOpenChange(false); };

  const emailParts = (email: string | null) => {
    if (!email) return { local: '', domain: '' };
    const [local, domain] = email.toLowerCase().split('@');
    return { local: local || '', domain: domain || '' };
  };

  // Aplica el plan a todas las filas → decisiones
  const buildDecisions = useCallback((
    plan: AnalysisPlan, rows: string[][],
    existing: { id: string; external_id: string | null; email: string | null; phone: string | null }[],
  ): { decisions: RowDecision[]; companies: string[] } => {
    const cm = plan.columnMapping;
    const personal = new Set((plan.personalDomains || []).map(d => d.toLowerCase()));
    const junkLocal = new Set((plan.junkLocalParts || []).map(d => d.toLowerCase()));
    const junkDomain = new Set((plan.junkDomains || []).map(d => d.toLowerCase()));
    const lifecycleMap = plan.lifecycleMap || {};

    const byExternal = new Map(existing.filter(e => e.external_id).map(e => [e.external_id!.toLowerCase(), e.id]));
    const byEmail = new Map(existing.filter(e => e.email).map(e => [e.email!.toLowerCase(), e.id]));
    const byPhone = new Map(existing.filter(e => e.phone).map(e => [e.phone!, e.id]));

    const get = (row: string[], idx?: number | null) => (idx === undefined || idx === null) ? '' : (row[idx] || '').trim();
    const companies = new Set<string>();

    const decisions = rows.map((row, i): RowDecision => {
      let firstName = cleanName(get(row, cm.first_name));
      let lastName = cleanName(get(row, cm.last_name));
      const full = cleanName(get(row, cm.full_name));
      if (!firstName && !lastName && full) {
        const parts = full.split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ');
      }
      const email = (get(row, cm.email) || '').toLowerCase() || null;
      const phone = normalizePhone(get(row, cm.phone));
      const externalId = get(row, cm.external_id) || null;
      const leadStatus = get(row, cm.lead_status) || null;
      const ownerName = get(row, cm.owner) || null;
      const rawLifecycle = get(row, cm.lifecycle).toLowerCase();
      const lc = lifecycleMap[get(row, cm.lifecycle)] || lifecycleMap[rawLifecycle] || DEFAULT_LIFECYCLE[rawLifecycle] || { lifecycle: 'lead', pipeline_stage: 'etapa_0_captacion' };

      let name = composeName(firstName, lastName);
      const { local, domain } = emailParts(email);

      // Empresa: columna primero, luego dominio del correo
      const junkDomainList = [...junkDomain];
      let company = get(row, cm.company) || null;
      if (!company && domain && !personal.has(domain) && !domainIsJunk(domain, junkDomainList)) {
        const override = plan.domainCompany?.[domain];
        company = (override !== undefined && override !== null) ? override : titleCaseDomainRoot(domain);
      }
      if (company) company = company.trim();

      const dec: RowDecision = {
        rowIndex: i + 2, firstName, lastName, name: name || (email ?? ''), email, phone,
        externalId, company: company || null, leadStatus, lifecycle: lc.lifecycle,
        pipelineStage: lc.pipeline_stage, ownerName, action: 'create',
      };

      // Basura / no-lead
      const isSample = /sample contact/i.test(full) || /sample contact/i.test(lastName) || /sample contact/i.test(firstName);
      if (!email && !phone) { dec.action = 'skip'; dec.skipReason = 'Sin correo ni teléfono'; return dec; }
      if (isSample) { dec.action = 'skip'; dec.skipReason = 'Contacto de ejemplo'; return dec; }
      if (email && isSystemEmail(local, domain, [...junkLocal], junkDomainList)) {
        dec.action = 'skip'; dec.skipReason = 'Correo de sistema/notificaciones'; return dec;
      }
      if (!name) dec.name = email ?? '';

      // Dedup
      const existingId =
        (externalId && byExternal.get(externalId.toLowerCase())) ||
        (email && byEmail.get(email)) ||
        (phone && byPhone.get(phone)) || undefined;
      if (existingId) { dec.action = 'update'; dec.existingId = existingId; }

      if (dec.action !== 'skip' && company) companies.add(company);
      return dec;
    });

    return { decisions, companies: [...companies].sort((a, b) => a.localeCompare(b)) };
  }, []);

  const analyzeFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Por ahora solo se aceptan archivos CSV');
      return;
    }
    setFileName(file.name);
    setAnalyzing(true);
    setStep(2);
    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);
      if (!headers.length || !rows.length) { toast.error('El archivo está vacío'); setStep(1); setAnalyzing(false); return; }

      // Dominios y valores distintos para la IA
      const defaultPlan = buildDefaultPlan(headers);
      const emailIdx = defaultPlan.columnMapping.email;
      const lifecycleIdx = defaultPlan.columnMapping.lifecycle;
      const distinctDomains = [...new Set(rows.map(r => (emailIdx != null ? (r[emailIdx] || '') : '').toLowerCase().split('@')[1]).filter(Boolean))];
      const distinctLifecycleValues = [...new Set(rows.map(r => (lifecycleIdx != null ? (r[lifecycleIdx] || '').trim() : '')).filter(Boolean))];

      // 1) IA analiza (con respaldo determinista)
      let plan: AnalysisPlan = defaultPlan;
      try {
        const { data, error } = await supabase.functions.invoke('ai-import-analyze', {
          body: { headers, sampleRows: rows.slice(0, 25), distinctDomains, distinctLifecycleValues },
        });
        if (error) throw error;
        if (data?.plan?.columnMapping) {
          const p = data.plan as AnalysisPlan;
          // Merge defensivo con el respaldo
          plan = {
            columnMapping: { ...defaultPlan.columnMapping, ...p.columnMapping },
            lifecycleMap: { ...DEFAULT_LIFECYCLE, ...(p.lifecycleMap || {}) },
            domainCompany: p.domainCompany || {},
            personalDomains: p.personalDomains?.length ? p.personalDomains : PERSONAL_DOMAINS,
            junkLocalParts: [...new Set([...(p.junkLocalParts || []), ...JUNK_LOCAL])],
            junkDomains: [...new Set([...(p.junkDomains || []), ...JUNK_DOMAINS])],
          };
          setAiUsed(true);
        }
      } catch (err) {
        console.warn('ai-import-analyze no disponible, usando motor determinista:', err);
        setAiUsed(false);
      }

      // 2) Contactos existentes para dedup
      const { data: existing } = await (supabase as any)
        .from('contacts')
        .select('id, external_id, email, phone')
        .eq('tenant_id', tenantId)
        .neq('status', 'deleted');

      const { decisions, companies } = buildDecisions(plan, rows, existing || []);

      // 3) Empresas nuevas (que no existan ya como cuenta)
      let newCompanyNames: string[] = [];
      if (companies.length) {
        const { data: accts } = await (supabase as any)
          .from('accounts')
          .select('name')
          .eq('tenant_id', tenantId);
        const existingNames = new Set((accts || []).map((a: any) => companyKey(a.name)));
        newCompanyNames = companies.filter(c => !existingNames.has(companyKey(c)));
      }

      setDecisions(decisions);
      setNewCompanies(newCompanyNames);
      setStep(3);
    } catch (err) {
      toast.error('Error al analizar el archivo', { description: (err as Error).message });
      setStep(1);
    } finally {
      setAnalyzing(false);
    }
  }, [tenantId, buildDecisions]);

  const stats = useMemo(() => ({
    create: decisions.filter(d => d.action === 'create').length,
    update: decisions.filter(d => d.action === 'update').length,
    skip: decisions.filter(d => d.action === 'skip').length,
  }), [decisions]);

  const runImport = async () => {
    if (!tenantId) return;
    setImporting(true);
    setProgress(0);
    const res: ImportResult = { created: 0, updated: 0, skipped: stats.skip, accountsCreated: 0, failed: 0, errors: [] };

    try {
      // 1) Asegurar empresas → mapa nombre(lower) → id
      const wanted = [...new Set(decisions.filter(d => d.action !== 'skip' && d.company).map(d => d.company!.trim()))];
      const accountIdByName = new Map<string, string>();
      if (wanted.length) {
        const { data: accts } = await (supabase as any).from('accounts').select('id, name').eq('tenant_id', tenantId);
        (accts || []).forEach((a: any) => accountIdByName.set(companyKey(a.name), a.id));
        for (const name of wanted) {
          if (accountIdByName.has(companyKey(name))) continue;
          const { data: created, error } = await (supabase as any)
            .from('accounts')
            .insert({ tenant_id: tenantId, name, account_type: 'lead', status: 'active' })
            .select('id').single();
          if (!error && created) { accountIdByName.set(companyKey(name), created.id); res.accountsCreated++; }
        }
      }

      // 2) Propietarios → mapa nombre(lower) → profile id
      const ownerIdByName = new Map<string, string>();
      const { data: profiles } = await (supabase as any).from('profiles').select('id, name, email').eq('tenant_id', tenantId);
      (profiles || []).forEach((p: any) => { if (p.name) ownerIdByName.set(p.name.toLowerCase().trim(), p.id); });

      // 3) Insertar/actualizar contactos
      const toProcess = decisions.filter(d => d.action !== 'skip');
      for (let i = 0; i < toProcess.length; i++) {
        const d = toProcess[i];
        const accountId = d.company ? accountIdByName.get(companyKey(d.company)) ?? null : null;
        let ownerId: string | null = null;
        if (d.ownerName) {
          const on = d.ownerName.toLowerCase().trim();
          ownerId = ownerIdByName.get(on)
            ?? [...ownerIdByName.entries()].find(([n]) => n.startsWith(on) || on.startsWith(n))?.[1]
            ?? null;
        }
        const payload: Record<string, unknown> = {
          name: d.name, first_name: d.firstName || null, last_name: d.lastName || null,
          email: d.email, phone: d.phone, external_id: d.externalId,
          account_id: accountId, lead_status: d.leadStatus,
          lifecycle: d.lifecycle, pipeline_stage: d.pipelineStage,
        };
        if (ownerId) payload.assigned_agent_id = ownerId;
        try {
          if (d.action === 'update' && d.existingId) {
            const { error } = await (supabase as any).from('contacts')
              .update({ ...payload, updated_at: new Date().toISOString() })
              .eq('id', d.existingId).eq('tenant_id', tenantId);
            if (error) throw error;
            res.updated++;
          } else {
            const { error } = await (supabase as any).from('contacts')
              .insert({ ...payload, tenant_id: tenantId, status: 'active' });
            if (error) throw error;
            res.created++;
          }
        } catch (err) {
          res.failed++;
          res.errors.push({ row: d.rowIndex, reason: (err as Error).message });
        }
        if (i % 5 === 0 || i === toProcess.length - 1) setProgress(Math.round(((i + 1) / toProcess.length) * 100));
      }

      setResult(res);
      if (res.created > 0 || res.updated > 0) onImportComplete();
    } catch (err) {
      toast.error('Error durante la importación', { description: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  const skipped = decisions.filter(d => d.action === 'skip');
  const toImport = decisions.filter(d => d.action !== 'skip');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Importar contactos con IA
          </DialogTitle>
          <DialogDescription>
            Sube tu archivo y la IA interpreta los datos, detecta empresas y omite lo que no es un lead.
          </DialogDescription>
        </DialogHeader>

        {/* Paso 1: subir */}
        {step === 1 && (
          <div className="flex-1 space-y-4 py-2">
            <div
              className={cn("border-2 border-dashed rounded-lg p-10 text-center transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-border")}
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files?.[0]; if (f) analyzeFile(f); }}
            >
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">Arrastra tu archivo CSV aquí</p>
              <p className="text-sm text-muted-foreground mb-4">o haz clic para seleccionar</p>
              <Input type="file" accept=".csv" className="max-w-xs mx-auto cursor-pointer"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeFile(f); }} />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>• La IA separa nombre y apellido, normaliza teléfonos y detecta la empresa (incluso por el dominio del correo).</p>
              <p>• Crea las empresas que no existan y las relaciona con el contacto.</p>
              <p>• Marca y omite correos de sistema/facturación/notificaciones para que los revises.</p>
              <p>• Detecta duplicados por correo, teléfono o ID de origen.</p>
            </div>
          </div>
        )}

        {/* Paso 2: analizando */}
        {step === 2 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-lg font-medium">Analizando {fileName}…</p>
            <p className="text-sm text-muted-foreground">La IA está interpretando las columnas, empresas y etapas.</p>
          </div>
        )}

        {/* Paso 3: revisión */}
        {step === 3 && !result && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-medium">{fileName}</span>
              <Badge variant={aiUsed ? 'default' : 'secondary'} className="gap-1">
                <Sparkles className="h-3 w-3" />{aiUsed ? 'Analizado con IA' : 'Análisis automático'}
              </Badge>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-4 gap-2">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                <p className="text-2xl font-bold text-green-500">{stats.create}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><UserPlus className="h-3 w-3" />Nuevos</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center">
                <p className="text-2xl font-bold text-blue-500">{stats.update}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><RefreshCcw className="h-3 w-3" />Actualizar</p>
              </div>
              <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/30 text-center">
                <p className="text-2xl font-bold text-violet-500">{newCompanies.length}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Building2 className="h-3 w-3" />Empresas nuevas</p>
              </div>
              <div className="p-3 rounded-lg bg-muted border border-border text-center">
                <p className="text-2xl font-bold text-muted-foreground">{stats.skip}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Ban className="h-3 w-3" />Omitidos</p>
              </div>
            </div>

            {newCompanies.length > 0 && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/20 text-sm">
                <Building2 className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
                <p className="text-muted-foreground">
                  <span className="text-foreground font-medium">Se crearán {newCompanies.length} empresas:</span>{' '}
                  {newCompanies.slice(0, 12).join(', ')}{newCompanies.length > 12 ? '…' : ''}
                </p>
              </div>
            )}

            <Tabs value={reviewTab} onValueChange={setReviewTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-fit">
                <TabsTrigger value="import">A importar ({toImport.length})</TabsTrigger>
                <TabsTrigger value="skipped">Omitidos ({skipped.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="import" className="flex-1 overflow-hidden mt-2">
                <div className="border rounded-lg overflow-hidden h-full">
                  <ScrollArea className="h-[280px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Correo</TableHead>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Etapa</TableHead>
                          <TableHead className="w-24">Acción</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {toImport.slice(0, 200).map((d) => (
                          <TableRow key={d.rowIndex}>
                            <TableCell className="font-medium">{d.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{d.email || d.phone || '-'}</TableCell>
                            <TableCell className="text-xs">{d.company || <span className="text-muted-foreground">-</span>}</TableCell>
                            <TableCell className="text-xs">{d.pipelineStage.replace(/etapa_\d+_/, '').replace(/_/g, ' ')}</TableCell>
                            <TableCell>
                              {d.action === 'create'
                                ? <Badge variant="outline" className="text-green-500 border-green-500/40 text-[10px]">Nuevo</Badge>
                                : <Badge variant="outline" className="text-blue-500 border-blue-500/40 text-[10px]">Actualizar</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="skipped" className="flex-1 overflow-hidden mt-2">
                <div className="border rounded-lg overflow-hidden h-full">
                  <ScrollArea className="h-[280px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre / Correo</TableHead>
                          <TableHead className="w-56">Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {skipped.slice(0, 200).map((d) => (
                          <TableRow key={d.rowIndex}>
                            <TableCell className="text-xs">{d.name || d.email || '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{d.skipReason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between pt-1">
              <Button variant="outline" onClick={reset} disabled={importing}>
                <X className="h-4 w-4 mr-1" />Cambiar archivo
              </Button>
              <Button onClick={runImport} disabled={importing || toImport.length === 0}>
                {importing
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando… {progress}%</>
                  : <>Importar {toImport.length} contactos<ChevronRight className="h-4 w-4 ml-1" /></>}
              </Button>
            </div>
            {importing && <Progress value={progress} />}
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className="flex-1 space-y-5 py-4">
            <div className="text-center py-6">
              {result.failed === 0
                ? <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-3" />
                : <AlertTriangle className="h-14 w-14 text-yellow-500 mx-auto mb-3" />}
              <h3 className="text-xl font-semibold">Importación completada</h3>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { n: result.created, l: 'Creados', c: 'text-green-500' },
                { n: result.updated, l: 'Actualizados', c: 'text-blue-500' },
                { n: result.accountsCreated, l: 'Empresas', c: 'text-violet-500' },
                { n: result.skipped, l: 'Omitidos', c: 'text-muted-foreground' },
              ].map(s => (
                <div key={s.l} className="p-4 rounded-lg bg-muted/40 border text-center">
                  <p className={cn("text-2xl font-bold", s.c)}>{s.n}</p>
                  <p className="text-xs text-muted-foreground">{s.l}</p>
                </div>
              ))}
            </div>
            {result.failed > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">{result.failed} fallidos</p>
                  {result.errors.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-xs text-muted-foreground">Fila {e.row}: {e.reason}</p>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={reset}>Importar otro</Button>
              <Button onClick={handleClose}>Finalizar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
