import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone, MapPin, Phone, Users, Loader2, ArrowRight, ArrowLeft,
  AlertTriangle, Search, X, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import { useCreateDeal } from "@/hooks/useDeals";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { PIPELINE_STAGES } from "@/components/contacts/LeadPriorityCard";

// ─── Types ────────────────────────────────────────────────────────────────────

type OriginKey = 'digital' | 'phone' | 'referral' | 'site_visit';
type VisitOutcome = 'very_interested' | 'interested' | 'low_interest' | 'not_qualified';
type Step = 'origin' | 'capture' | 'duplicate';

const PHONE_CODES = [
  { code: '+52', label: '🇲🇽 +52', country: 'México',   digits: 10 },
  { code: '+57', label: '🇨🇴 +57', country: 'Colombia', digits: 10 },
  { code: '+51', label: '🇵🇪 +51', country: 'Perú',     digits: 9  },
] as const;

const ORIGINS = [
  {
    key: 'digital' as OriginKey,
    label: 'Lead digital',
    description: 'Llegó por anuncio en redes, WhatsApp bot o formulario web',
    icon: Smartphone,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    key: 'phone' as OriginKey,
    label: 'Llamada / flyer',
    description: 'Llamó o escribió directo al asesor por publicidad física',
    icon: Phone,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    key: 'referral' as OriginKey,
    label: 'Referido',
    description: 'Lo refirió un cliente anterior, conocido o aliado comercial',
    icon: Users,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  {
    key: 'site_visit' as OriginKey,
    label: 'Visita en sitio',
    description: 'Llegó en persona al desarrollo o sala de ventas',
    icon: MapPin,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
] as const;

const DIGITAL_PLATFORMS = [
  'Google Ads', 'Facebook Ads', 'Instagram', 'TikTok',
  'Formulario web', 'Portal inmobiliario', 'Otro',
];

const PIPELINE_TYPES = [
  { value: 'calificacion', label: 'Compradores (Calificación)' },
  { value: 'captacion',    label: 'Captación de inmuebles' },
  { value: 'rentas',       label: 'Rentas' },
] as const;

const CAPTACION_STAGES = [
  { value: 'captacion_new',       label: 'Nuevo propietario' },
  { value: 'captacion_valuation', label: 'Valuación' },
  { value: 'captacion_signed',    label: 'Exclusiva firmada' },
  { value: 'captacion_listed',    label: 'Publicado' },
  { value: 'captacion_offers',    label: 'Ofertas recibidas' },
  { value: 'captacion_sold',      label: 'Vendido' },
  { value: 'captacion_lost',      label: 'Perdido' },
];

const RENTAS_STAGES = [
  { value: 'renta_nuevo',      label: 'Nuevo lead renta' },
  { value: 'renta_calificacion', label: 'Calificación' },
  { value: 'renta_busqueda',   label: 'En búsqueda' },
  { value: 'renta_visita',     label: 'Visita agendada' },
  { value: 'renta_solicitud',  label: 'Solicitud de renta' },
  { value: 'renta_cerrado',    label: 'Cerrado' },
  { value: 'renta_perdido',    label: 'Perdido' },
];

const DEFAULT_STAGE: Record<string, string> = {
  calificacion: 'new_lead',
  captacion: 'captacion_new',
  rentas: 'renta_nuevo',
};

function stagesFor(type: string) {
  if (type === 'captacion') return CAPTACION_STAGES;
  if (type === 'rentas') return RENTAS_STAGES;
  return PIPELINE_STAGES;
}

const VISIT_OUTCOMES: { value: VisitOutcome; label: string; description: string }[] = [
  { value: 'very_interested', label: 'Muy interesado',  description: 'Revisará la propuesta y avisará' },
  { value: 'interested',      label: 'Interesado',      description: 'Necesita pensarlo un poco más' },
  { value: 'low_interest',    label: 'Poco interesado', description: 'No convenció del todo' },
  { value: 'not_qualified',   label: 'No califica',     description: 'Presupuesto o perfil no coincide' },
];

const pipelineStageByOutcome: Record<VisitOutcome, string> = {
  very_interested: 'negotiation',
  interested:      'follow_up',
  low_interest:    'follow_up',
  not_qualified:   'closed_lost',
};

// ─── Initial form state ───────────────────────────────────────────────────────

const INITIAL_FORM = {
  name: '',
  phoneCode: '+52' as string,
  phone: '',
  email: '',
  // Contextual
  platform: '',          // digital: which platform
  platformOther: '',     // digital: free text if "Otro"
  flyerNote: '',         // phone/flyer: description
  referrerId: '',        // referral: contact UUID
  referrerName: '',      // referral: display name
  referrerSearch: '',    // referral: search query
  // Property
  propertyId: '',
  propertyName: '',
  propertySearch: '',
  // Pipeline (for digital/phone/referral)
  pipelineType: 'calificacion',
  pipelineStage: 'new_lead',
  // Site visit extras
  outcome: '' as VisitOutcome | '',
  visitNotes: '',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ContactOriginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (contactId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContactOriginModal({ open, onOpenChange, onCreated }: ContactOriginModalProps) {
  const [step, setStep] = useState<Step>('origin');
  const [selectedOrigin, setSelectedOrigin] = useState<OriginKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateContact, setDuplicateContact] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  const tenantId = useEffectiveTenantId();
  const { user } = useAuth();
  const createDeal = useCreateDeal();

  // Properties query
  const { data: properties = [] } = useQuery({
    queryKey: ['properties-active', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from('properties')
        .select('id, title, zone')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('title');
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  // Referrer search query
  const { data: referrerResults = [] } = useQuery({
    queryKey: ['referrer-search', form.referrerSearch, tenantId],
    queryFn: async () => {
      if (!tenantId || form.referrerSearch.trim().length < 2) return [];
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('tenant_id', tenantId)
        .neq('status', 'deleted')
        .ilike('name', `%${form.referrerSearch.trim()}%`)
        .limit(6);
      return data ?? [];
    },
    enabled: selectedOrigin === 'referral' && form.referrerSearch.trim().length >= 2,
  });

  // ── Reset ────────────────────────────────────────────────────────────────────
  const handleClose = () => {
    setStep('origin');
    setSelectedOrigin(null);
    setDuplicateContact(null);
    setForm(INITIAL_FORM);
    onOpenChange(false);
  };

  // ── Origin select ─────────────────────────────────────────────────────────────
  const handleOriginSelect = (key: OriginKey) => {
    setSelectedOrigin(key);
    setStep('capture');
  };

  // ── Validation helpers ────────────────────────────────────────────────────────
  const phoneDigits = form.phone.replace(/\D/g, '');
  const expectedDigits = PHONE_CODES.find(p => p.code === form.phoneCode)?.digits ?? 10;
  const countryName = PHONE_CODES.find(p => p.code === form.phoneCode)?.country;
  const fullPhone = `${form.phoneCode}${phoneDigits}`;

  const validate = (): string | null => {
    if (!form.name.trim()) return 'El nombre es requerido';
    if (!phoneDigits) return 'El teléfono es requerido';
    if (phoneDigits.length !== expectedDigits)
      return `El teléfono debe tener ${expectedDigits} dígitos para ${countryName}`;
    if (selectedOrigin === 'site_visit' && !form.outcome)
      return 'Selecciona el resultado de la visita';
    return null;
  };

  // ── Duplicate check ────────────────────────────────────────────────────────────
  const checkDuplicate = async (): Promise<{ id: string; name: string } | null> => {
    if (!tenantId) return null;

    // Phone: match by trailing digits to handle +52/+521 format variations
    // e.g. "+525521075047" and "+5215521075047" both end in "5521075047"
    const { data: phoneMatches } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .like('phone', `%${phoneDigits}`)
      .neq('status', 'deleted')
      .limit(1);
    if (phoneMatches?.length) return phoneMatches[0] as { id: string; name: string };

    // Then email
    if (form.email.trim()) {
      const { data: byEmail } = await supabase
        .from('contacts')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('email', form.email.trim())
        .neq('status', 'deleted')
        .maybeSingle();
      if (byEmail) return byEmail as { id: string; name: string };
    }
    return null;
  };

  // ── Build source context ───────────────────────────────────────────────────────
  const buildSourceContext = (): string => {
    if (selectedOrigin === 'digital') {
      return form.platform === 'Otro' ? form.platformOther : form.platform;
    }
    if (selectedOrigin === 'phone') return form.flyerNote;
    if (selectedOrigin === 'referral') return form.referrerName;
    return '';
  };

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (!tenantId) return;

    setIsSaving(true);
    try {
      // Check duplicates
      const dup = await checkDuplicate();
      if (dup) {
        setDuplicateContact(dup);
        setStep('duplicate');
        setIsSaving(false);
        return;
      }

      await createContact();
    } finally {
      setIsSaving(false);
    }
  };

  const createContact = async () => {
    if (!tenantId) return;

    const isSiteVisit = selectedOrigin === 'site_visit';
    const outcome = form.outcome as VisitOutcome;

    // source: "origin_key: context_detail" — stored in existing `source` column
    const sourceContext = buildSourceContext();
    const sourceValue = sourceContext
      ? `${selectedOrigin}: ${sourceContext}`
      : (selectedOrigin ?? null);

    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      name: form.name.trim(),
      phone: fullPhone,
      email: form.email.trim() || null,
      source: sourceValue,
      re_property_interest_id: form.propertyId || null,
      assigned_agent_id: user?.id ?? null,
      status: 'active',
      pipeline_stage: isSiteVisit
        ? pipelineStageByOutcome[outcome]
        : form.pipelineStage,
      operational_status: isSiteVisit && outcome === 'not_qualified' ? 'CLOSED' : 'ACTIVE',
      re_visit_outcome: isSiteVisit ? outcome : null,
    };

    const { data: contact, error } = await supabase
      .from('contacts')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    // Site visit: optionally create deal + note
    if (isSiteVisit) {
      if (outcome === 'very_interested' && form.propertyId) {
        const prop = (properties as any[]).find(p => p.id === form.propertyId);
        await createDeal.mutateAsync({
          contact_id: contact.id,
          property_id: form.propertyId,
          title: prop ? `${form.name} — ${prop.title}` : form.name,
          deal_type: 'compra',
          origin: 'site_visit',
          notes: form.visitNotes || null,
        });
      } else if (form.visitNotes.trim()) {
        const { data: authData } = await supabase.auth.getUser();
        await supabase.from('contact_notes').insert({
          tenant_id: tenantId,
          contact_id: contact.id,
          content: `Visita en sitio: ${form.visitNotes}`,
          note_type: 'general',
          author_id: authData.user?.id,
        });
      }
    }

    toast.success('Contacto creado', { description: `${form.name} agregado al CRM` });
    handleClose();
    onCreated(contact.id);
  };

  // ── Update existing duplicate ──────────────────────────────────────────────────
  const handleUpdateDuplicate = async () => {
    if (!duplicateContact || !tenantId) return;
    setIsSaving(true);
    try {
      const sc = buildSourceContext();
      const updatePayload: Record<string, unknown> = {
        assigned_agent_id: user?.id ?? null,
        pipeline_stage: selectedOrigin === 'site_visit'
          ? pipelineStageByOutcome[form.outcome as VisitOutcome]
          : form.pipelineStage,
        source: sc ? `${selectedOrigin}: ${sc}` : (selectedOrigin ?? null),
      };
      const { error } = await supabase
        .from('contacts')
        .update(updatePayload)
        .eq('id', duplicateContact.id);
      if (error) throw error;
      toast.success('Contacto actualizado', { description: 'Pipeline y asignación actualizados' });
      handleClose();
      onCreated(duplicateContact.id);
    } catch (err: any) {
      toast.error('Error al actualizar', { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────────

  const origin = ORIGINS.find(o => o.key === selectedOrigin);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">

        {/* ── STEP: origin ── */}
        {step === 'origin' && (
          <>
            <DialogHeader>
              <DialogTitle>¿Cómo llegó este contacto?</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-2.5 mt-2">
              {ORIGINS.map(({ key, label, description, icon: Icon, color, bg }) => (
                <button
                  key={key}
                  onClick={() => handleOriginSelect(key)}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-xl border border-border",
                    "hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                  )}
                >
                  <div className={cn("mt-0.5 w-10 h-10 rounded-lg flex items-center justify-center shrink-0", bg)}>
                    <Icon className={cn("w-5 h-5", color)} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── STEP: capture ── */}
        {step === 'capture' && origin && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", origin.bg)}>
                  <origin.icon className={cn("w-4 h-4", origin.color)} />
                </div>
                <DialogTitle>{origin.label}</DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4 mt-1 min-w-0 overflow-hidden">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Nombre completo *</Label>
                <Input
                  id="c-name"
                  placeholder="Nombre completo"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Teléfono *</Label>
                <div className="flex gap-2">
                  <Select
                    value={form.phoneCode}
                    onValueChange={v => setForm(p => ({ ...p, phoneCode: v, phone: '' }))}
                  >
                    <SelectTrigger className="w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PHONE_CODES.map(pc => (
                        <SelectItem key={pc.code} value={pc.code}>{pc.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="c-phone"
                    placeholder={`${expectedDigits} dígitos`}
                    value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '') }))}
                    maxLength={expectedDigits}
                    inputMode="numeric"
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  WhatsApp — {expectedDigits} dígitos para {countryName}
                </p>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input
                  id="c-email"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                />
              </div>

              {/* ── Contextual field ── */}
              {selectedOrigin === 'digital' && (
                <div className="space-y-2">
                  <Label>Plataforma de origen</Label>
                  <Select value={form.platform} onValueChange={v => setForm(p => ({ ...p, platform: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="¿Dónde llegó el lead?" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIGITAL_PLATFORMS.map(pl => (
                        <SelectItem key={pl} value={pl}>{pl}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.platform === 'Otro' && (
                    <Input
                      placeholder="Especifica la plataforma..."
                      value={form.platformOther}
                      onChange={e => setForm(p => ({ ...p, platformOther: e.target.value }))}
                    />
                  )}
                </div>
              )}

              {selectedOrigin === 'phone' && (
                <div className="space-y-1.5">
                  <Label htmlFor="c-flyer">¿Cómo llegó? <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                  <Input
                    id="c-flyer"
                    placeholder="Ej: Volante colonia Roma, Pancarta Av. Insurgentes..."
                    value={form.flyerNote}
                    onChange={e => setForm(p => ({ ...p, flyerNote: e.target.value }))}
                  />
                </div>
              )}

              {selectedOrigin === 'referral' && (
                <div className="space-y-2">
                  <Label>¿Quién lo refirió?</Label>
                  {form.referrerId ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30 w-full min-w-0 overflow-hidden">
                      <Users className="w-4 h-4 text-violet-400 shrink-0" />
                      <span className="text-sm font-medium flex-1 min-w-0 truncate">{form.referrerName}</span>
                      <button
                        onClick={() => setForm(p => ({ ...p, referrerId: '', referrerName: '', referrerSearch: '' }))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="Buscar cliente o contacto..."
                          value={form.referrerSearch}
                          onChange={e => setForm(p => ({ ...p, referrerSearch: e.target.value }))}
                        />
                      </div>
                      {referrerResults.length > 0 && (
                        <div className="border border-border rounded-lg overflow-hidden w-full">
                          {(referrerResults as any[]).map(r => (
                            <button
                              key={r.id}
                              className="w-full min-w-0 flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border last:border-0 overflow-hidden"
                              onClick={() => setForm(p => ({
                                ...p,
                                referrerId: r.id,
                                referrerName: r.name,
                                referrerSearch: '',
                              }))}
                            >
                              <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-medium text-violet-400">
                                  {r.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <p className="text-sm font-medium truncate">{r.name}</p>
                                {r.phone && <p className="text-xs text-muted-foreground truncate">{r.phone}</p>}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Site visit: outcome */}
              {selectedOrigin === 'site_visit' && (
                <div className="space-y-2">
                  <Label>Resultado de la visita *</Label>
                  <RadioGroup
                    value={form.outcome}
                    onValueChange={v => setForm(p => ({ ...p, outcome: v as VisitOutcome }))}
                    className="space-y-2"
                  >
                    {VISIT_OUTCOMES.map(o => (
                      <div
                        key={o.value}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          form.outcome === o.value
                            ? "border-primary/50 bg-primary/5"
                            : "border-border hover:border-border/80"
                        )}
                        onClick={() => setForm(p => ({ ...p, outcome: o.value }))}
                      >
                        <RadioGroupItem value={o.value} id={`outcome-${o.value}`} className="mt-0.5" />
                        <div>
                          <label htmlFor={`outcome-${o.value}`} className="text-sm font-medium cursor-pointer">{o.label}</label>
                          <p className="text-xs text-muted-foreground">{o.description}</p>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-visitnotes">Nota de la visita <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                    <Textarea
                      id="c-visitnotes"
                      placeholder="Observaciones..."
                      rows={2}
                      value={form.visitNotes}
                      onChange={e => setForm(p => ({ ...p, visitNotes: e.target.value }))}
                    />
                  </div>
                  {form.outcome === 'very_interested' && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                      Se creará un expediente de negociación automáticamente.
                    </div>
                  )}
                </div>
              )}

              {/* Property interest — searchable */}
              {properties.length > 0 && (() => {
                const propResults = form.propertySearch.trim().length > 0
                  ? (properties as any[]).filter(p =>
                      p.title.toLowerCase().includes(form.propertySearch.toLowerCase()) ||
                      (p.zone ?? '').toLowerCase().includes(form.propertySearch.toLowerCase())
                    ).slice(0, 8)
                  : [];

                return (
                  <div className="space-y-1.5">
                    <Label>Inmueble de interés <span className="text-muted-foreground text-xs">(opcional)</span></Label>

                    {form.propertyId ? (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30 w-full min-w-0 overflow-hidden">
                        <Building2 className="w-4 h-4 text-primary/70 shrink-0" />
                        <span className="text-sm font-medium flex-1 min-w-0 truncate">{form.propertyName}</span>
                        <button
                          onClick={() => setForm(p => ({ ...p, propertyId: '', propertyName: '', propertySearch: '' }))}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            className="pl-9"
                            placeholder="Buscar por nombre o zona..."
                            value={form.propertySearch}
                            onChange={e => setForm(p => ({ ...p, propertySearch: e.target.value }))}
                          />
                        </div>
                        {propResults.length > 0 && (
                          <div className="border border-border rounded-lg overflow-hidden w-full">
                            {propResults.map((prop: any) => (
                              <button
                                key={prop.id}
                                className="w-full min-w-0 flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border last:border-0 overflow-hidden"
                                onClick={() => setForm(p => ({
                                  ...p,
                                  propertyId: prop.id,
                                  propertyName: `${prop.title}${prop.zone ? ` · ${prop.zone}` : ''}`,
                                  propertySearch: '',
                                }))}
                              >
                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <Building2 className="w-3.5 h-3.5 text-primary/70" />
                                </div>
                                <div className="min-w-0 flex-1 overflow-hidden">
                                  <p className="text-sm font-medium truncate">{prop.title}</p>
                                  {prop.zone && <p className="text-xs text-muted-foreground truncate">{prop.zone}</p>}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {form.propertySearch.trim().length > 0 && propResults.length === 0 && (
                          <p className="text-xs text-muted-foreground px-1">Sin resultados para "{form.propertySearch}"</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Pipeline — only for non-site_visit */}
              {selectedOrigin !== 'site_visit' && (
                <div className="space-y-3 pt-1 border-t border-border">
                  <Label className="text-sm font-medium">Etapa en el pipeline</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5 min-w-0">
                      <span className="text-xs text-muted-foreground">Tipo</span>
                      <Select
                        value={form.pipelineType}
                        onValueChange={v => setForm(p => ({
                          ...p,
                          pipelineType: v,
                          pipelineStage: DEFAULT_STAGE[v] ?? 'new_lead',
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PIPELINE_TYPES.map(pt => (
                            <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <span className="text-xs text-muted-foreground">Etapa</span>
                      <Select
                        value={form.pipelineStage}
                        onValueChange={v => setForm(p => ({ ...p, pipelineStage: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stagesFor(form.pipelineType).map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setStep('origin')} disabled={isSaving}>
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Atrás
                </Button>
                <Button className="flex-1" onClick={handleSave} disabled={isSaving || !form.name.trim() || !phoneDigits}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Guardar contacto
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── STEP: duplicate ── */}
        {step === 'duplicate' && duplicateContact && (
          <>
            <DialogHeader>
              <DialogTitle>Contacto ya existe</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-400">
                    Ya existe un contacto con este teléfono o email
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    <span className="font-semibold text-foreground">{duplicateContact.name}</span> ya está registrado en el CRM.
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                ¿Deseas actualizar el pipeline y asignación de este contacto a los datos que acabas de ingresar?
              </p>

              <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pipeline:</span>
                  <Badge variant="outline" className="text-xs">
                    {PIPELINE_TYPES.find(t => t.value === form.pipelineType)?.label}
                    {' › '}
                    {stagesFor(form.pipelineType).find(s => s.value === form.pipelineStage)?.label}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Asesor asignado:</span>
                  <span className="font-medium">Tú</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('capture')} disabled={isSaving}>
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Volver
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => { handleClose(); onCreated(duplicateContact.id); }}
                  disabled={isSaving}
                >
                  Ver contacto existente
                </Button>
                <Button className="flex-1" onClick={handleUpdateDuplicate} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Sí, actualizar
                </Button>
              </div>
            </div>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
