import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Loader2, Save, User, Settings2, X, MessageSquare, Activity,
  FolderOpen, TrendingUp, Phone, Mail, MapPin, Building2, Briefcase,
  Linkedin, Star, Clock, Globe,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContacts, ContactFormData, CustomField, CustomFieldOption } from "@/hooks/useContacts";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ContactActivityTimeline } from "@/components/contacts/ContactActivityTimeline";
import ConsentBadge from "@/components/contacts/ConsentBadge";
import { useContactDeals } from "@/hooks/useDeals";
import { Handshake } from "lucide-react";
import { useAccounts } from "@/hooks/useAccounts";
import { cn } from "@/lib/utils";

// B2B pipeline stages
const B2B_STAGES = [
  { value: "etapa_0_captacion",     label: "Captación" },
  { value: "etapa_1_calificacion",  label: "Calificación" },
  { value: "etapa_2_nurturing",     label: "Nurturing" },
  { value: "etapa_3_demo",          label: "Demo / Discovery" },
  { value: "etapa_4_oportunidad",   label: "Oportunidad Calificada" },
  { value: "etapa_5_propuesta",     label: "Propuesta Enviada" },
  { value: "etapa_6_negociacion",   label: "Negociación" },
  { value: "etapa_7_compras_legal", label: "Compras / Legal" },
  { value: "etapa_8_alta_proveedor",label: "Alta de Proveedor" },
  { value: "etapa_9_contrato",      label: "Contrato / Firma" },
  { value: "cerrada_ganada",        label: "Cerrada Ganada" },
  { value: "cerrada_perdida",       label: "Cerrada Perdida" },
];

const LEAD_SOURCES = [
  { value: "whatsapp",   label: "WhatsApp" },
  { value: "linkedin",   label: "LinkedIn" },
  { value: "email",      label: "Email" },
  { value: "website",    label: "Sitio web" },
  { value: "referral",   label: "Referido" },
  { value: "gcp_ae",     label: "AE de Google Cloud" },
  { value: "partner",    label: "Partner" },
  { value: "event",      label: "Evento / Webinar" },
  { value: "paid",       label: "Pauta pagada" },
  { value: "direct",     label: "Directo" },
];

const PREFERRED_CHANNELS = [
  { value: "whatsapp",  label: "WhatsApp" },
  { value: "email",     label: "Email" },
  { value: "phone",     label: "Teléfono" },
  { value: "linkedin",  label: "LinkedIn" },
];

const PHONE_CODES = [
  { code: "+52", label: "🇲🇽 +52", country: "México",   digits: 10 },
  { code: "+57", label: "🇨🇴 +57", country: "Colombia", digits: 10 },
  { code: "+51", label: "🇵🇪 +51", country: "Perú",     digits: 9  },
  { code: "+1",  label: "🇺🇸 +1",  country: "EEUU",     digits: 10 },
] as const;

function parsePhoneValue(phone: string): { code: string; digits: string } {
  const stripped = phone.replace(/\s/g, "");
  for (const pc of PHONE_CODES) {
    if (stripped.startsWith(pc.code)) {
      return { code: pc.code, digits: stripped.slice(pc.code.length).replace(/\D/g, "") };
    }
  }
  return { code: "+52", digits: stripped.replace(/\D/g, "") };
}


const SECTIONS = [
  { id: "general",  label: "Información general",  shortLabel: "General",  icon: User },
  { id: "empresa",  label: "Empresa vinculada",    shortLabel: "Empresa",  icon: Building2 },
  { id: "lead",     label: "Pipeline B2B",          shortLabel: "Pipeline", icon: TrendingUp },
  { id: "custom",   label: "Campos personalizados", shortLabel: "Campos",   icon: Settings2 },
  { id: "activity", label: "Historial / Actividad", shortLabel: "Historial",icon: Activity },
];

function CustomFieldInput({
  field, value, options, onChange,
}: {
  field: CustomField;
  value: string;
  options: CustomFieldOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={field.key}>
        {field.name}
        {field.is_required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {field.data_type === "long_text" ? (
        <Textarea id={field.key} value={value} onChange={e => onChange(e.target.value)} rows={3} />
      ) : field.data_type === "boolean" ? (
        <div className="flex items-center gap-2 h-10">
          <Checkbox
            id={field.key}
            checked={value === "true"}
            onCheckedChange={checked => onChange(checked ? "true" : "false")}
          />
          <Label htmlFor={field.key} className="text-sm font-normal">Sí</Label>
        </div>
      ) : field.data_type === "select" ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona una opción" />
          </SelectTrigger>
          <SelectContent>
            {options.map(option => (
              <SelectItem key={option.id} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={field.key}
          type={
            field.data_type === "number" || field.data_type === "decimal" ? "number" :
            field.data_type === "date" ? "date" :
            field.data_type === "datetime" ? "datetime-local" :
            field.data_type === "url" ? "url" : "text"
          }
          step={field.data_type === "decimal" ? "0.01" : undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export default function ContactEditor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromConversationId = searchParams.get("from_conversation");
  const accountIdParam = searchParams.get("account_id");
  const isMobile = useIsMobile();
  const { hasRole } = useAuth();
  const { contacts, customFields, customFieldOptions, loading, createContact, updateContact } = useContacts();
  const { accounts } = useAccounts();

  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("general");
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    phone: "",
    country: "",
    tags: [],
    notes: "",
    custom_fields: {},
    lead_score: 0,
    lead_temperature: "cold",
    engagement_level: "low",
    source: "",
    opt_in_status: "unknown",
    next_action_at: "",
    pipeline_stage: "etapa_0_captacion",
    operational_status: "ACTIVE",
    // B2B fields
    account_id: accountIdParam || null,
    job_title: null,
    linkedin_url: null,
    preferred_channel: "whatsapp",
  });
  const [tagInput, setTagInput] = useState("");

  const isEditing = !!id;
  const canManageContacts = hasRole(["administrador", "manager", "asesor"]);
  const parsedPhone = useMemo(() => parsePhoneValue(formData.phone ?? ""), [formData.phone]);

  const fieldsByCategory = useMemo(() => {
    const grouped: Record<string, typeof customFields> = {};
    const uncategorized: typeof customFields = [];
    customFields.forEach(field => {
      if (field.category) {
        if (!grouped[field.category]) grouped[field.category] = [];
        grouped[field.category].push(field);
      } else {
        uncategorized.push(field);
      }
    });
    return { grouped, uncategorized };
  }, [customFields]);

  const categoryNames = Object.keys(fieldsByCategory.grouped).sort();

  const handleBack = () => {
    if (fromConversationId) {
      navigate(`/inbox?conversation=${fromConversationId}`);
    } else {
      navigate("/contacts");
    }
  };

  useEffect(() => {
    if (isEditing && contacts.length > 0) {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        const formatDateTime = (dt: string | null) => dt ? new Date(dt).toISOString().slice(0, 16) : "";
        const c = contact as any;

        // Map legacy RE stage values to B2B stages
        const LEGACY_STAGE_MAP: Record<string, string> = {
          new_lead: "etapa_0_captacion",
          first_contact: "etapa_1_calificacion",
          qualified: "etapa_4_oportunidad",
          visit_done: "etapa_3_demo",
          proposal_sent: "etapa_5_propuesta",
          negotiation: "etapa_6_negociacion",
          closed_won: "cerrada_ganada",
          closed_lost: "cerrada_perdida",
        };
        const rawStage = contact.pipeline_stage ?? "etapa_0_captacion";
        const mappedStage = LEGACY_STAGE_MAP[rawStage] ?? rawStage;

        setFormData({
          name: contact.name,
          email: contact.email || "",
          phone: contact.phone || "",
          country: contact.country || "",
          tags: contact.tags || [],
          notes: contact.notes || "",
          custom_fields: contact.custom_fields || {},
          lead_score: contact.lead_score ?? 0,
          lead_temperature: contact.lead_temperature ?? "cold",
          engagement_level: contact.engagement_level ?? "low",
          source: contact.source || "",
          opt_in_status: contact.opt_in_status ?? "unknown",
          next_action_at: formatDateTime(contact.next_action_at),
          pipeline_stage: mappedStage,
          operational_status: contact.operational_status ?? "ACTIVE",
          account_id: c.account_id ?? null,
          job_title: c.job_title ?? null,
          linkedin_url: c.linkedin_url ?? null,
          preferred_channel: c.preferred_channel ?? "whatsapp",
        });
      } else {
        toast.error("Contacto no encontrado");
        navigate("/contacts");
      }
    }
  }, [id, contacts, isEditing, navigate]);

  const currentContact = isEditing ? contacts.find(c => c.id === id) : null;
  const lastInteractionAt = currentContact?.last_interaction_at || null;
  const originalPipelineStage = currentContact?.pipeline_stage || "etapa_0_captacion";
  const isClient = (currentContact as any)?.lifecycle === "client";
  const { data: contactDeals = [] } = useContactDeals(isClient ? id : undefined);

  const addTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...(formData.tags || []), tagInput.trim()] });
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags?.filter(t => t !== tag) || [] });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("El nombre es requerido");
      setActiveSection("general");
      return;
    }
    if (parsedPhone.digits) {
      const expectedDigits = PHONE_CODES.find(p => p.code === parsedPhone.code)?.digits ?? 10;
      if (parsedPhone.digits.length !== expectedDigits) {
        const countryName = PHONE_CODES.find(p => p.code === parsedPhone.code)?.country;
        toast.error(`El teléfono debe tener ${expectedDigits} dígitos para ${countryName}`);
        setActiveSection("general");
        return;
      }
    }
    for (const field of customFields) {
      if (field.is_required && !formData.custom_fields?.[field.key]) {
        toast.error(`El campo "${field.name}" es requerido`);
        setActiveSection("custom");
        return;
      }
    }

    setIsSaving(true);
    try {
      if (isEditing) {
        await updateContact(id!, formData as ContactFormData, originalPipelineStage);
      } else {
        const success = await createContact(formData as ContactFormData);
        if (success) handleBack();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const getTemperatureBadge = () => {
    const temp = formData.lead_temperature;
    if (temp === "hot")  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">🔥 Caliente</Badge>;
    if (temp === "warm") return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">🌡️ Tibio</Badge>;
    return <Badge variant="secondary">❄️ Frío</Badge>;
  };

  const selectedAccount = accounts.find(a => a.id === formData.account_id);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canManageContacts) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">No tienes permisos para gestionar contactos</p>
      </div>
    );
  }

  const availableSections = isEditing ? SECTIONS : SECTIONS.filter(s => s.id !== "activity");

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 md:h-10 md:w-10" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              <div className="h-9 w-9 md:h-12 md:w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm md:text-lg font-semibold text-primary">
                  {formData.name ? formData.name.charAt(0).toUpperCase() : "?"}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                  <h1 className="text-base md:text-xl font-bold text-foreground truncate">
                    {formData.name || (isEditing ? "Sin nombre" : "Nuevo contacto")}
                  </h1>
                  {getTemperatureBadge()}
                  {formData.lead_score > 0 && (
                    <Badge variant="outline" className="text-xs">Score: {formData.lead_score}</Badge>
                  )}
                </div>
                <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground mt-0.5">
                  {formData.job_title && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3" /> {formData.job_title}
                    </span>
                  )}
                  {selectedAccount && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {selectedAccount.name}
                    </span>
                  )}
                  {formData.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {formData.email}
                    </span>
                  )}
                  {formData.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {formData.phone}
                    </span>
                  )}
                </div>
                {isMobile && formData.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Phone className="h-3 w-3" /> {formData.phone}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {isEditing && id && formData.phone && !isMobile && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/inbox?contact_id=${id}`)}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Conversación
              </Button>
            )}
            {fromConversationId && !isMobile && (
              <Button variant="outline" size="sm" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver al chat
              </Button>
            )}
            {isEditing && id && !isMobile && <ConsentBadge contactId={id} />}
            <Button
              size={isMobile ? "sm" : "default"}
              onClick={handleSave}
              disabled={isSaving || !formData.name.trim()}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {!isMobile && <span className="ml-2">Guardar</span>}
            </Button>
          </div>
        </div>
      </div>

      {/* Client lifecycle banner */}
      {isEditing && isClient && (
        <div className="shrink-0 px-4 md:px-6 py-2 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <Handshake className="w-4 h-4 shrink-0" />
            <span className="font-medium">Cliente activo</span>
            {contactDeals.length > 0 && (
              <span className="text-emerald-400/70">· {contactDeals[0].title}</span>
            )}
          </div>
          <button
            onClick={() => navigate("/clients")}
            className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline transition-colors whitespace-nowrap"
          >
            Ver expediente →
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Mobile tab bar */}
        {isMobile && (
          <div className="shrink-0 border-b border-border bg-muted/30">
            <nav className="flex">
              {availableSections.map(section => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-0.5 py-2.5 relative transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {isActive && <span className="absolute top-0 left-0 right-0 h-0.5 rounded-full bg-primary" />}
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-[9px] font-medium leading-none">{section.shortLabel}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        {/* Desktop sidebar */}
        <div className="hidden md:block w-56 shrink-0 border-r border-border bg-muted/30">
          <ScrollArea className="h-full">
            <nav className="p-3 space-y-1">
              {availableSections.map(section => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </ScrollArea>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 max-w-2xl mx-auto">

            {/* GENERAL */}
            {activeSection === "general" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Información general</h2>
                  <p className="text-sm text-muted-foreground">Datos personales y de contacto</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre *</Label>
                    <Input
                      id="name"
                      placeholder="Nombre completo"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="job_title">
                      <Briefcase className="w-3.5 h-3.5 inline mr-1.5" />
                      Cargo / Puesto
                    </Label>
                    <Input
                      id="job_title"
                      placeholder="ej. Director de Tecnología"
                      value={formData.job_title || ""}
                      onChange={e => setFormData({ ...formData, job_title: e.target.value || null } as ContactFormData)}
                    />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">
                        <Mail className="w-3.5 h-3.5 inline mr-1.5" />
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="correo@empresa.com"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">
                        <Phone className="w-3.5 h-3.5 inline mr-1.5" />
                        Teléfono
                      </Label>
                      <div className="flex gap-2">
                        <Select
                          value={parsedPhone.code}
                          onValueChange={code => setFormData({ ...formData, phone: code + parsedPhone.digits })}
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
                          id="phone"
                          placeholder={
                            PHONE_CODES.find(p => p.code === parsedPhone.code)?.digits === 9
                              ? "9 dígitos"
                              : "10 dígitos"
                          }
                          value={parsedPhone.digits}
                          onChange={e =>
                            setFormData({ ...formData, phone: parsedPhone.code + e.target.value.replace(/\D/g, "") })
                          }
                          maxLength={PHONE_CODES.find(p => p.code === parsedPhone.code)?.digits ?? 10}
                          inputMode="numeric"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="linkedin_url">
                        <Linkedin className="w-3.5 h-3.5 inline mr-1.5" />
                        LinkedIn
                      </Label>
                      <Input
                        id="linkedin_url"
                        type="url"
                        placeholder="linkedin.com/in/nombre"
                        value={formData.linkedin_url || ""}
                        onChange={e => setFormData({ ...formData, linkedin_url: e.target.value || null } as ContactFormData)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="preferred_channel">Canal preferido</Label>
                      <Select
                        value={formData.preferred_channel || "whatsapp"}
                        onValueChange={v => setFormData({ ...formData, preferred_channel: v } as ContactFormData)}
                      >
                        <SelectTrigger id="preferred_channel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PREFERRED_CHANNELS.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country">
                      <MapPin className="w-3.5 h-3.5 inline mr-1.5" />
                      País
                    </Label>
                    <Input
                      id="country"
                      placeholder="México"
                      value={formData.country}
                      onChange={e => setFormData({ ...formData, country: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Etiquetas</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nueva etiqueta"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
                      />
                      <Button type="button" variant="secondary" onClick={addTag}>Añadir</Button>
                    </div>
                    {formData.tags && formData.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="px-2 py-1 flex items-center gap-1">
                            {tag}
                            <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notas</Label>
                    <Textarea
                      id="notes"
                      placeholder="Notas sobre este contacto..."
                      value={formData.notes}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                      rows={4}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* EMPRESA */}
            {activeSection === "empresa" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Empresa vinculada</h2>
                  <p className="text-sm text-muted-foreground">Asocia este contacto a una empresa de tu CRM</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Empresa</Label>
                    <Select
                      value={formData.account_id || "__none__"}
                      onValueChange={v =>
                        setFormData({
                          ...formData,
                          account_id: v === "__none__" ? null : v,
                        } as ContactFormData)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin empresa asignada" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin empresa</SelectItem>
                        {accounts.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                            {a.industry ? ` · ${a.industry}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Si la empresa no existe aún,{" "}
                      <button
                        type="button"
                        onClick={() => navigate("/accounts/new")}
                        className="text-primary hover:underline"
                      >
                        créala primero
                      </button>
                    </p>
                  </div>

                  {selectedAccount && (
                    <Card>
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => navigate(`/accounts/${selectedAccount.id}`)}
                      >
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-primary">
                            {selectedAccount.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{selectedAccount.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            {selectedAccount.industry && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="w-3 h-3" /> {selectedAccount.industry}
                              </span>
                            )}
                            {selectedAccount.country && (
                              <span className="flex items-center gap-1">
                                <Globe className="w-3 h-3" /> {selectedAccount.country}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs capitalize shrink-0">
                          {selectedAccount.account_type}
                        </Badge>
                      </div>
                    </Card>
                  )}

                  {accounts.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                      <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No hay empresas en el CRM aún</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => navigate("/accounts/new")}
                      >
                        Crear empresa
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PIPELINE B2B */}
            {activeSection === "lead" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Pipeline B2B</h2>
                  <p className="text-sm text-muted-foreground">Etapa, score y seguimiento comercial</p>
                </div>

                <div className="space-y-4">
                  {/* Pipeline stage */}
                  <div className="space-y-2">
                    <Label>
                      <TrendingUp className="w-3.5 h-3.5 inline mr-1.5" />
                      Etapa del pipeline
                    </Label>
                    <Select
                      value={formData.pipeline_stage ?? "etapa_0_captacion"}
                      onValueChange={v => setFormData({ ...formData, pipeline_stage: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {B2B_STAGES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Source */}
                  <div className="space-y-2">
                    <Label>Canal de origen</Label>
                    <Select
                      value={formData.source || "__none__"}
                      onValueChange={v => setFormData({ ...formData, source: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar canal..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin especificar</SelectItem>
                        {LEAD_SOURCES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Score + Temperature */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="lead_score">
                        <Star className="w-3.5 h-3.5 inline mr-1.5" />
                        Score de calificación (0–100)
                      </Label>
                      <Input
                        id="lead_score"
                        type="number"
                        min={0}
                        max={100}
                        value={formData.lead_score ?? 0}
                        onChange={e => setFormData({ ...formData, lead_score: Math.min(100, Math.max(0, Number(e.target.value))) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Temperatura</Label>
                      <Select
                        value={formData.lead_temperature ?? "cold"}
                        onValueChange={v => setFormData({ ...formData, lead_temperature: v as 'hot' | 'warm' | 'cold' })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hot">🔥 Caliente</SelectItem>
                          <SelectItem value="warm">🌡️ Tibio</SelectItem>
                          <SelectItem value="cold">❄️ Frío</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Next action + Status */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="next_action_at">
                        <Clock className="w-3.5 h-3.5 inline mr-1.5" />
                        Próxima acción
                      </Label>
                      <Input
                        id="next_action_at"
                        type="datetime-local"
                        value={formData.next_action_at ?? ""}
                        onChange={e => setFormData({ ...formData, next_action_at: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Estado operativo</Label>
                      <Select
                        value={formData.operational_status ?? "ACTIVE"}
                        onValueChange={v => setFormData({ ...formData, operational_status: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Activo</SelectItem>
                          <SelectItem value="PAUSED">Pausado</SelectItem>
                          <SelectItem value="ARCHIVED">Archivado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Opt-in */}
                  <div className="space-y-2">
                    <Label>Consentimiento de comunicación</Label>
                    <Select
                      value={formData.opt_in_status ?? "unknown"}
                      onValueChange={v => setFormData({ ...formData, opt_in_status: v as 'unknown' | 'opt_in' | 'opt_out' })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opt_in">Aceptó recibir mensajes</SelectItem>
                        <SelectItem value="opt_out">No desea recibir mensajes</SelectItem>
                        <SelectItem value="unknown">Sin confirmación</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* CUSTOM FIELDS */}
            {activeSection === "custom" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Campos personalizados</h2>
                  <p className="text-sm text-muted-foreground">Información adicional definida por tu equipo</p>
                </div>

                {customFields.length === 0 ? (
                  <Card>
                    <CardContent className="py-12">
                      <div className="text-center text-muted-foreground">
                        <Settings2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="font-medium">No hay campos personalizados</p>
                        <p className="text-sm mt-1">Puedes crearlos desde Configuración</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => navigate("/settings/contact-fields")}
                        >
                          Crear campo
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : categoryNames.length === 0 ? (
                  <div className="space-y-4">
                    {customFields.map(field => (
                      <CustomFieldInput
                        key={field.id}
                        field={field}
                        value={formData.custom_fields?.[field.key] || ""}
                        options={customFieldOptions[field.id] || []}
                        onChange={val =>
                          setFormData({ ...formData, custom_fields: { ...formData.custom_fields, [field.key]: val } })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <Tabs defaultValue={categoryNames[0] || "general"} className="w-full">
                    <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                      {categoryNames.map(cat => (
                        <TabsTrigger key={cat} value={cat} className="flex items-center gap-1 text-xs">
                          <FolderOpen className="h-3 w-3" />
                          {cat}
                          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                            {fieldsByCategory.grouped[cat].length}
                          </Badge>
                        </TabsTrigger>
                      ))}
                      {fieldsByCategory.uncategorized.length > 0 && (
                        <TabsTrigger value="general" className="flex items-center gap-1 text-xs">
                          General
                          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                            {fieldsByCategory.uncategorized.length}
                          </Badge>
                        </TabsTrigger>
                      )}
                    </TabsList>

                    {categoryNames.map(cat => (
                      <TabsContent key={cat} value={cat} className="mt-0 space-y-4">
                        {fieldsByCategory.grouped[cat].map(field => (
                          <CustomFieldInput
                            key={field.id}
                            field={field}
                            value={formData.custom_fields?.[field.key] || ""}
                            options={customFieldOptions[field.id] || []}
                            onChange={val =>
                              setFormData({ ...formData, custom_fields: { ...formData.custom_fields, [field.key]: val } })
                            }
                          />
                        ))}
                      </TabsContent>
                    ))}

                    {fieldsByCategory.uncategorized.length > 0 && (
                      <TabsContent value="general" className="mt-0 space-y-4">
                        {fieldsByCategory.uncategorized.map(field => (
                          <CustomFieldInput
                            key={field.id}
                            field={field}
                            value={formData.custom_fields?.[field.key] || ""}
                            options={customFieldOptions[field.id] || []}
                            onChange={val =>
                              setFormData({ ...formData, custom_fields: { ...formData.custom_fields, [field.key]: val } })
                            }
                          />
                        ))}
                      </TabsContent>
                    )}
                  </Tabs>
                )}
              </div>
            )}

            {/* ACTIVITY */}
            {activeSection === "activity" && isEditing && id && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Historial / Actividad</h2>
                  <p className="text-sm text-muted-foreground">Interacciones y eventos relacionados con este contacto</p>
                </div>
                <ContactActivityTimeline contactId={id} />
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
