import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, Users,
  Calendar, TrendingUp, AlertTriangle,
  Filter, Search, RefreshCw, X, ChevronDown,
  DollarSign, Tag, Thermometer, AlertCircle, Building2,
  UserCheck, Home, Handshake
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Contact } from "@/hooks/useContacts";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePipelineStageChange } from "@/hooks/usePipelineStageChange";
import { ConvertToClientModal } from "@/components/contacts/ConvertToClientModal";
import { useAuth } from "@/contexts/AuthContext";

// B2B Sales Pipeline stages (RT CRM — §6.2 del documento de visión)
const PIPELINE_STAGES = [
  { value: 'etapa_0_captacion',      label: 'Captación',        color: 'bg-slate-500' },
  { value: 'etapa_1_calificacion',   label: 'Calificación',     color: 'bg-blue-500' },
  { value: 'etapa_2_nurturing',      label: 'Nurturing',        color: 'bg-indigo-500' },
  { value: 'etapa_3_demo',           label: 'Demo Agendada',    color: 'bg-purple-500' },
  { value: 'etapa_4_oportunidad',    label: 'Oportunidad',      color: 'bg-violet-500' },
  { value: 'etapa_5_propuesta',      label: 'Propuesta',        color: 'bg-pink-500' },
  { value: 'etapa_6_negociacion',    label: 'Negociación',      color: 'bg-orange-500' },
  { value: 'etapa_7_compras_legal',  label: 'Compras/Legal',    color: 'bg-amber-500' },
  { value: 'etapa_8_alta_proveedor', label: 'Alta Proveedor',   color: 'bg-yellow-500' },
  { value: 'etapa_9_contrato',       label: 'Contrato/Firma',   color: 'bg-lime-500' },
  { value: 'cerrada_ganada',         label: 'Ganada ✓',         color: 'bg-green-500' },
  { value: 'cerrada_perdida',        label: 'Perdida',          color: 'bg-red-500' },
];

// Legacy RE stage mapping for contacts with old values
const LEGACY_STAGE_MAP: Record<string, string> = {
  new_lead:             'etapa_0_captacion',
  interest_confirmed:   'etapa_1_calificacion',
  financial_validation: 'etapa_2_nurturing',
  searching:            'etapa_3_demo',
  visit_scheduled:      'etapa_4_oportunidad',
  visit_done:           'etapa_5_propuesta',
  follow_up:            'etapa_6_negociacion',
  negotiation:          'etapa_7_compras_legal',
  closed_won:           'cerrada_ganada',
  closed_lost:          'cerrada_perdida',
};

// Temperature badge styles
const getTemperatureBadge = (temp: string) => {
  if (temp === 'hot') return { label: '🔥', className: 'bg-red-500/20 text-red-400 border-red-500/30' };
  if (temp === 'warm') return { label: '🌡️', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
  return { label: '❄️', className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
};

type StageList = typeof PIPELINE_STAGES;

interface ContactCardProps {
  contact: Contact;
  stages: StageList;
  onMoveToStage: (contactId: string, newStage: string) => void;
  onClick: () => void;
  onConvert: (contact: Contact) => void;
}

function ContactCard({ contact, stages, onMoveToStage, onClick, onConvert }: ContactCardProps) {
  const tempBadge = getTemperatureBadge(contact.lead_temperature);
  const hasBlockReason = !!contact.re_block_reason;
  const isUnassigned = !contact.assigned_agent_id;
  
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div 
      className={cn(
        "group p-3 rounded-lg border border-border/50 bg-card hover:bg-muted/50 cursor-pointer transition-all",
        "hover:shadow-md hover:border-primary/30",
        hasBlockReason && "border-l-2 border-l-amber-500"
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/20 text-primary text-xs">
            {getInitials(contact.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{contact.name}</h4>
          <p className="text-xs text-muted-foreground truncate">
            {contact.phone || contact.email || 'Sin contacto'}
          </p>
        </div>
        <Badge variant="outline" className={cn("text-[10px] px-1.5 h-5", tempBadge.className)}>
          {tempBadge.label}
        </Badge>
      </div>

      {isUnassigned && (
        <Badge variant="outline" className="text-[10px] mb-2 border-amber-500/40 bg-amber-500/10 text-amber-400">
          Sin asignar
        </Badge>
      )}

      {/* Metadata */}
      <div className="space-y-1 text-xs text-muted-foreground">
        {contact.lead_score > 0 && (
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            <span>Score: {contact.lead_score}</span>
          </div>
        )}
        {contact.last_interaction_at && (
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>
              {formatDistanceToNow(new Date(contact.last_interaction_at), { addSuffix: true, locale: es })}
            </span>
          </div>
        )}
        {hasBlockReason && (
          <div className="flex items-center gap-1 text-amber-500">
            <AlertTriangle className="h-3 w-3" />
            <span className="truncate">Bloqueado</span>
          </div>
        )}
      </div>

      {/* Quick actions — visible on hover */}
      <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
        <div className="flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-muted-foreground">Mover a:</span>
          <Select onValueChange={(value) => onMoveToStage(contact.id, value)}>
            <SelectTrigger className="h-6 w-24 text-[10px]">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.value} value={stage.value} className="text-xs">
                  {stage.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {contact.lifecycle !== 'client' && (
          <button
            onClick={(e) => { e.stopPropagation(); onConvert(contact); }}
            className="w-full flex items-center justify-center gap-1.5 h-7 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            <Handshake className="h-3.5 w-3.5" />
            Convertir a cliente
          </button>
        )}
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  stage: typeof PIPELINE_STAGES[0];
  stages: StageList;
  contacts: Contact[];
  onMoveToStage: (contactId: string, newStage: string) => void;
  onContactClick: (contact: Contact) => void;
  onConvert: (contact: Contact) => void;
}

function KanbanColumn({ stage, stages, contacts, onMoveToStage, onContactClick, onConvert }: KanbanColumnProps) {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg border border-border/50">
      {/* Column Header */}
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", stage.color)} />
          <h3 className="font-medium text-sm">{stage.label}</h3>
        </div>
        <Badge variant="secondary" className="text-xs">
          {contacts.length}
        </Badge>
      </div>
      
      {/* Column Content */}
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {contacts.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Sin contactos
            </div>
          ) : (
            contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                stages={stages}
                onMoveToStage={onMoveToStage}
                onClick={() => onContactClick(contact)}
                onConvert={onConvert}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Filter state interface
interface FilterState {
  search: string;
  temperatures: string[];
  sources: string[];
  scoreRange: [number, number];
  engagementLevels: string[];
}

const defaultFilters: FilterState = {
  search: '',
  temperatures: [],
  sources: [],
  scoreRange: [0, 100],
  engagementLevels: [],
};

const _UNUSED: unknown[] = [];
void _UNUSED;

export default function Pipeline() {
  const navigate = useNavigate();
  const tenantId = useEffectiveTenantId();
  const queryClient = useQueryClient();
  const { handlePipelineStageChange } = usePipelineStageChange();
  const { user, tenantRole, isSuperAdmin } = useAuth();
  const isAsesor = tenantRole === 'asesor' && !isSuperAdmin;
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [convertingContact, setConvertingContact] = useState<Contact | null>(null);

  const activeStages = PIPELINE_STAGES;

  // Fetch contacts using react-query
  const { data: contacts = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['pipeline-contacts', tenantId, isAsesor ? user?.id : 'all'],
    queryFn: async () => {
      if (!tenantId) return [];
      
      let q = supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenantId)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (isAsesor && user?.id) {
        q = q.or(`assigned_agent_id.eq.${user.id},assigned_agent_id.is.null`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Contact[];
    },
    enabled: !!tenantId,
  });


  // Extract unique sources and tags from contacts
  const availableSources = useMemo(() => {
    const sources = new Set<string>();
    contacts.forEach(c => {
      if (c.source) sources.add(c.source);
    });
    return Array.from(sources).sort();
  }, [contacts]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.temperatures.length > 0) count++;
    if (filters.sources.length > 0) count++;
    if (filters.scoreRange[0] > 0 || filters.scoreRange[1] < 100) count++;
    if (filters.engagementLevels.length > 0) count++;
    return count;
  }, [filters]);

  // Filter contacts
  const filteredContacts = useMemo(() => {
    let result = contacts.filter(c => c.status === 'active');

    if (filters.search) {
      const query = filters.search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.phone?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query) ||
        c.tags?.some(t => t.toLowerCase().includes(query))
      );
    }

    if (filters.temperatures.length > 0) {
      result = result.filter(c => filters.temperatures.includes(c.lead_temperature));
    }

    if (filters.sources.length > 0) {
      result = result.filter(c => c.source && filters.sources.includes(c.source));
    }

    if (filters.scoreRange[0] > 0 || filters.scoreRange[1] < 100) {
      result = result.filter(c => {
        const score = c.lead_score || 0;
        return score >= filters.scoreRange[0] && score <= filters.scoreRange[1];
      });
    }

    if (filters.engagementLevels.length > 0) {
      result = result.filter(c => filters.engagementLevels.includes(c.engagement_level));
    }

    return result;
  }, [contacts, filters]);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleArrayFilter = (key: 'temperatures' | 'sources' | 'engagementLevels', value: string) => {
    setFilters(prev => {
      const current = prev[key];
      const updated = current.includes(value) 
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [key]: updated };
    });
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
  };

  // Group contacts by pipeline stage (mapping legacy RE stages to B2B stages)
  const contactsByStage = useMemo(() => {
    const grouped: Record<string, Contact[]> = {};
    activeStages.forEach(stage => { grouped[stage.value] = []; });

    filteredContacts.forEach(contact => {
      const raw = contact.pipeline_stage || 'etapa_0_captacion';
      const mapped = LEGACY_STAGE_MAP[raw] || raw;
      if (grouped[mapped]) {
        grouped[mapped].push(contact);
      } else {
        grouped['etapa_0_captacion'].push(contact);
      }
    });

    Object.keys(grouped).forEach(stage => {
      grouped[stage].sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0));
    });

    return grouped;
  }, [filteredContacts, activeStages]);

  const totalInPipeline = filteredContacts.filter(c => {
    const mapped = LEGACY_STAGE_MAP[c.pipeline_stage] || c.pipeline_stage;
    return mapped !== 'cerrada_ganada' && mapped !== 'cerrada_perdida';
  }).length;
  const totalClosed = filteredContacts.filter(c =>
    (LEGACY_STAGE_MAP[c.pipeline_stage] || c.pipeline_stage) === 'cerrada_ganada'
  ).length;
  const totalLost = filteredContacts.filter(c =>
    (LEGACY_STAGE_MAP[c.pipeline_stage] || c.pipeline_stage) === 'cerrada_perdida'
  ).length;

  const handleMoveToStage = async (contactId: string, newStage: string) => {
    try {
      // Get the current stage before update
      const contact = contacts.find(c => c.id === contactId);
      const oldStage = contact?.pipeline_stage || 'new_lead';
      
      const { error } = await supabase
        .from('contacts')
        .update({ pipeline_stage: newStage })
        .eq('id', contactId);

      if (error) throw error;
      
      // Trigger conversion tracking and Meta events
      await handlePipelineStageChange(contactId, oldStage, newStage);
      
      toast.success('Etapa actualizada');
      refetch();
    } catch (error) {
      console.error('Error moving contact:', error);
      toast.error('Error al mover contacto');
    }
  };

  const handleContactClick = (contact: Contact) => {
    navigate(`/contacts/${contact.id}`);
  };

  const handleConvertContact = (contact: Contact) => {
    setConvertingContact(contact);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    toast.success('Pipeline actualizado');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Oportunidades</h1>
            <p className="text-sm text-muted-foreground">Pipeline comercial B2B — de captación a cierre</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Pipeline type toggle */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => { setPipelineType('calificacion'); setFilters(defaultFilters); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
                  pipelineType === 'calificacion'
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <UserCheck className="h-3.5 w-3.5" />
                Compradores
              </button>
              <button
                onClick={() => { setPipelineType('captacion'); setFilters(defaultFilters); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors border-l border-border",
                  pipelineType === 'captacion'
                    ? "bg-emerald-600 text-white"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Home className="h-3.5 w-3.5" />
                Captación
              </button>
              <button
                onClick={() => { setPipelineType('rentas'); setFilters(defaultFilters); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors border-l border-border",
                  pipelineType === 'rentas'
                    ? "bg-violet-600 text-white"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Handshake className="h-3.5 w-3.5" />
                Rentas
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
              Actualizar
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-6 mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              <strong>{totalInPipeline}</strong> en proceso
            </span>
          </div>
          <div className="flex items-center gap-2 text-green-500">
            <span className="text-sm">
              <strong>{totalClosed}</strong> {pipelineType === 'captacion' ? 'vendidos' : 'cerrados'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-destructive">
            <span className="text-sm">
              <strong>{totalLost}</strong> perdidos
            </span>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar nombre, teléfono, email, tags..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filter Panel Trigger */}
          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Filtros
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Filtros avanzados</h4>
                  {activeFilterCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                      <X className="h-3 w-3 mr-1" />
                      Limpiar
                    </Button>
                  )}
                </div>
              </div>
              
              <ScrollArea className="h-[400px]">
                <div className="p-4 space-y-4">
                  {/* Temperature */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <Thermometer className="h-3 w-3" />
                      Temperatura
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 'hot', label: '🔥 Caliente' },
                        { value: 'warm', label: '🌡️ Tibio' },
                        { value: 'cold', label: '❄️ Frío' },
                      ].map((temp) => (
                        <Badge
                          key={temp.value}
                          variant={filters.temperatures.includes(temp.value) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleArrayFilter('temperatures', temp.value)}
                        >
                          {temp.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Lead Score */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <TrendingUp className="h-3 w-3" />
                      Lead Score: {filters.scoreRange[0]} - {filters.scoreRange[1]}
                    </Label>
                    <Slider
                      value={filters.scoreRange}
                      onValueChange={(value) => updateFilter('scoreRange', value as [number, number])}
                      min={0}
                      max={100}
                      step={5}
                      className="py-2"
                    />
                  </div>

                  {/* Engagement Level */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Nivel de engagement</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 'low', label: 'Bajo' },
                        { value: 'medium', label: 'Medio' },
                        { value: 'high', label: 'Alto' },
                      ].map((level) => (
                        <Badge
                          key={level.value}
                          variant={filters.engagementLevels.includes(level.value) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleArrayFilter('engagementLevels', level.value)}
                        >
                          {level.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Credit Type */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <DollarSign className="h-3 w-3" />
                      Tipo de crédito
                    </Label>
                    <div className="space-y-1">
                      {CREDIT_TYPES.map((type) => (
                        <div key={type.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`credit-${type.value}`}
                            checked={filters.creditTypes.includes(type.value)}
                            onCheckedChange={() => toggleArrayFilter('creditTypes', type.value)}
                          />
                          <label htmlFor={`credit-${type.value}`} className="text-sm cursor-pointer">
                            {type.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Credit Preapproved */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Crédito preaprobado</Label>
                    <div className="flex gap-2">
                      <Badge
                        variant={filters.creditPreapproved === true ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => updateFilter('creditPreapproved', filters.creditPreapproved === true ? null : true)}
                      >
                        ✓ Sí
                      </Badge>
                      <Badge
                        variant={filters.creditPreapproved === false ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => updateFilter('creditPreapproved', filters.creditPreapproved === false ? null : false)}
                      >
                        ✗ No
                      </Badge>
                    </div>
                  </div>

                  {/* Block Reason */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <AlertCircle className="h-3 w-3" />
                      Motivo de bloqueo
                    </Label>
                    <div className="flex gap-2 mb-2">
                      <Badge
                        variant={filters.hasBlockReason === true ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => updateFilter('hasBlockReason', filters.hasBlockReason === true ? null : true)}
                      >
                        Con bloqueo
                      </Badge>
                      <Badge
                        variant={filters.hasBlockReason === false ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => updateFilter('hasBlockReason', filters.hasBlockReason === false ? null : false)}
                      >
                        Sin bloqueo
                      </Badge>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {BLOCK_REASONS.map((reason) => (
                        <div key={reason.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`block-${reason.value}`}
                            checked={filters.blockReasons.includes(reason.value)}
                            onCheckedChange={() => toggleArrayFilter('blockReasons', reason.value)}
                          />
                          <label htmlFor={`block-${reason.value}`} className="text-xs cursor-pointer">
                            {reason.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Property */}
                  {properties.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium flex items-center gap-2">
                        <Building2 className="h-3 w-3" />
                        Propiedad de interés
                      </Label>
                      <Select
                        value={filters.propertyId || 'all'}
                        onValueChange={(v) => updateFilter('propertyId', v === 'all' ? null : v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Todas las propiedades" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">Todas las propiedades</SelectItem>
                          {properties.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.property_code} — {p.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Source */}
                  {availableSources.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium flex items-center gap-2">
                        <Tag className="h-3 w-3" />
                        Fuente
                      </Label>
                      <div className="flex flex-wrap gap-1">
                        {availableSources.map((source) => (
                          <Badge
                            key={source}
                            variant={filters.sources.includes(source) ? "default" : "outline"}
                            className="cursor-pointer text-xs"
                            onClick={() => toggleArrayFilter('sources', source)}
                          >
                            {source}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* Active filter badges */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {filters.temperatures.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  Temperatura: {filters.temperatures.length}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => updateFilter('temperatures', [])} 
                  />
                </Badge>
              )}
              {filters.creditTypes.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  Crédito: {filters.creditTypes.length}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => updateFilter('creditTypes', [])} 
                  />
                </Badge>
              )}
              {filters.hasBlockReason !== null && (
                <Badge variant="secondary" className="gap-1">
                  {filters.hasBlockReason ? 'Con bloqueo' : 'Sin bloqueo'}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => updateFilter('hasBlockReason', null)} 
                  />
                </Badge>
              )}
              {(filters.scoreRange[0] > 0 || filters.scoreRange[1] < 100) && (
                <Badge variant="secondary" className="gap-1">
                  Score: {filters.scoreRange[0]}-{filters.scoreRange[1]}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => updateFilter('scoreRange', [0, 100])} 
                  />
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-4 min-w-max h-full">
          {activeStages.map((stage) => (
            <KanbanColumn
              key={stage.value}
              stage={stage}
              stages={activeStages}
              contacts={contactsByStage[stage.value] || []}
              onMoveToStage={handleMoveToStage}
              onContactClick={handleContactClick}
              onConvert={handleConvertContact}
            />
          ))}
        </div>
      </div>

      {convertingContact && (
        <ConvertToClientModal
          open={!!convertingContact}
          onOpenChange={(open) => { if (!open) setConvertingContact(null); }}
          contact={{
            id: convertingContact.id,
            name: convertingContact.name,
            re_property_interest_id: convertingContact.re_property_interest_id,
          }}
          defaultDealType={
            pipelineType === 'rentas'    ? 'renta'
            : pipelineType === 'captacion' ? 'captacion'
            : 'compra'
          }
        />
      )}
    </div>
  );
}