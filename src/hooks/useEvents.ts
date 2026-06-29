import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantSettings } from "@/hooks/useTenantSettings";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

export interface Event {
  id: string;
  tenant_id: string;
  contact_id: string;
  event_type: string;
  title: string;
  start_at: string;
  end_at: string | null;
  timezone: string;
  status: 'scheduled' | 'confirmed' | 'canceled' | 'completed' | 'no_show';
  source: 'manual' | 'api' | 'import' | 'ai';
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contact?: {
    id: string;
    name: string;
    phone: string | null;
  };
}

export interface EventFilters {
  search?: string;
  status?: string;
  event_type?: string;
  from_date?: string;
  to_date?: string;
  agent_id?: string;
}

export interface CreateEventInput {
  contact_id: string;
  event_type: string;
  title: string;
  start_at: string;
  end_at?: string | null;
  timezone?: string;
  status?: Event['status'];
  source?: Event['source'];
  notes?: string | null;
  metadata?: Record<string, string>;
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  id: string;
}

async function emitSystemEvent(
  tenantId: string,
  eventName: string,
  entityId: string,
  payload: Json
) {
  await supabase.from('system_event_bus').insert({
    tenant_id: tenantId,
    event_name: eventName,
    entity_type: 'event',
    entity_id: entityId,
    payload,
  });
}

async function createAuditLog(
  tenantId: string,
  eventId: string,
  actorUserId: string | null,
  action: string,
  diff: Json = {}
) {
  await supabase.from('event_audit_logs').insert({
    tenant_id: tenantId,
    event_id: eventId,
    actor_user_id: actorUserId,
    action,
    diff,
  });
}

export function useEvents(filters: EventFilters = {}) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['events', profile?.tenant_id, filters],
    queryFn: async () => {
      if (!profile?.tenant_id) return [];

      let query = supabase
        .from('events')
        .select(`
          *,
          contact:contacts(id, name, phone)
        `)
        .eq('tenant_id', profile.tenant_id)
        .order('start_at', { ascending: true });

      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,contact.name.ilike.%${filters.search}%`);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.event_type) {
        query = query.eq('event_type', filters.event_type);
      }
      if (filters.from_date) {
        query = query.gte('start_at', filters.from_date);
      }
      if (filters.to_date) {
        query = query.lte('start_at', filters.to_date);
      }
      if (filters.agent_id) {
        query = query.eq('created_by', filters.agent_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Event[];
    },
    enabled: !!profile?.tenant_id,
  });
}

export function useEvent(id: string | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      if (!id || !profile?.tenant_id) return null;

      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          contact:contacts(id, name, phone)
        `)
        .eq('id', id)
        .eq('tenant_id', profile.tenant_id)
        .single();

      if (error) throw error;
      return data as Event;
    },
    enabled: !!id && !!profile?.tenant_id,
  });
}

export function useEventAuditLogs(eventId: string | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['event-audit-logs', eventId],
    queryFn: async () => {
      if (!eventId || !profile?.tenant_id) return [];

      const { data, error } = await supabase
        .from('event_audit_logs')
        .select('*')
        .eq('event_id', eventId)
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!eventId && !!profile?.tenant_id,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const { timezone: tenantTimezone } = useTenantSettings();

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      if (!profile?.tenant_id) throw new Error('No tenant');

      const insertData = {
        contact_id: input.contact_id,
        event_type: input.event_type,
        title: input.title,
        start_at: input.start_at,
        end_at: input.end_at ?? null,
        timezone: input.timezone ?? tenantTimezone,
        status: input.status ?? 'scheduled',
        source: input.source ?? 'manual',
        notes: input.notes ?? null,
        metadata: (input.metadata ?? {}) as Json,
        tenant_id: profile.tenant_id,
        created_by: user?.id ?? null,
      };

      const { data: event, error } = await supabase
        .from('events')
        .insert(insertData)
        .select(`*, contact:contacts(id, name, phone)`)
        .single();

      if (error) throw error;

      // Create audit log
      await createAuditLog(profile.tenant_id, event.id, user?.id ?? null, 'created');

      // Emit system event
      const payload: Json = {
        event: {
          id: event.id,
          event_type: event.event_type,
          title: event.title,
          start_at: event.start_at,
          status: event.status,
          source: event.source,
          metadata: event.metadata,
        },
        contact: event.contact ? {
          id: event.contact.id,
          name: event.contact.name,
          phone: event.contact.phone,
        } : null,
      };
      await emitSystemEvent(profile.tenant_id, 'event.created', event.id, payload);

      return event as Event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Evento creado exitosamente');
    },
    onError: (error) => {
      toast.error(`Error al crear evento: ${error.message}`);
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateEventInput) => {
      if (!profile?.tenant_id) throw new Error('No tenant');

      // Get previous state
      const { data: previousEvent } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      const updateData: Record<string, unknown> = {};
      if (input.contact_id !== undefined) updateData.contact_id = input.contact_id;
      if (input.event_type !== undefined) updateData.event_type = input.event_type;
      if (input.title !== undefined) updateData.title = input.title;
      if (input.start_at !== undefined) updateData.start_at = input.start_at;
      if (input.end_at !== undefined) updateData.end_at = input.end_at;
      if (input.timezone !== undefined) updateData.timezone = input.timezone;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.source !== undefined) updateData.source = input.source;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.metadata !== undefined) updateData.metadata = input.metadata as Json;

      const { data: event, error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', profile.tenant_id)
        .select(`*, contact:contacts(id, name, phone)`)
        .single();

      if (error) throw error;

      // Determine event type
      let eventName = 'event.updated';
      const diff: Record<string, unknown> = {};

      if (previousEvent) {
        if (input.status && input.status !== previousEvent.status) {
          eventName = 'event.status_changed';
          diff.previous_status = previousEvent.status;
          diff.new_status = input.status;
        }
        if (input.start_at && input.start_at !== previousEvent.start_at) {
          eventName = 'event.rescheduled';
          diff.previous_start_at = previousEvent.start_at;
          diff.new_start_at = input.start_at;
        }
      }

      // Create audit log
      await createAuditLog(profile.tenant_id, event.id, user?.id ?? null, eventName.replace('event.', ''), diff as Json);

      // Emit system event
      const payload: Json = {
        event: {
          id: event.id,
          event_type: event.event_type,
          title: event.title,
          start_at: event.start_at,
          status: event.status,
          source: event.source,
          metadata: event.metadata,
        },
        contact: event.contact ? {
          id: event.contact.id,
          name: event.contact.name,
          phone: event.contact.phone,
        } : null,
        diff: diff as Json,
      };
      await emitSystemEvent(profile.tenant_id, eventName, event.id, payload);

      return event as Event;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['event-audit-logs', variables.id] });
      toast.success('Evento actualizado');
    },
    onError: (error) => {
      toast.error(`Error al actualizar: ${error.message}`);
    },
  });
}

export function useCancelEvent() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      if (!profile?.tenant_id) throw new Error('No tenant');

      const { data: event, error } = await supabase
        .from('events')
        .update({ status: 'canceled' })
        .eq('id', id)
        .eq('tenant_id', profile.tenant_id)
        .select(`*, contact:contacts(id, name, phone)`)
        .single();

      if (error) throw error;

      // Create audit log
      await createAuditLog(profile.tenant_id, event.id, user?.id ?? null, 'canceled', { reason } as Json);

      // Emit system event
      const payload: Json = {
        event: {
          id: event.id,
          event_type: event.event_type,
          title: event.title,
          start_at: event.start_at,
          status: event.status,
        },
        contact: event.contact ? {
          id: event.contact.id,
          name: event.contact.name,
          phone: event.contact.phone,
        } : null,
        reason,
      };
      await emitSystemEvent(profile.tenant_id, 'event.canceled', event.id, payload);

      // Log visit_canceled activity in conversation_activity
      try {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', event.contact_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conv) {
          await supabase.from('conversation_activity').insert({
            tenant_id: profile.tenant_id,
            conversation_id: conv.id,
            contact_id: event.contact_id,
            actor_user_id: user?.id ?? null,
            actor_type: 'user',
            event_type: 'visit_canceled',
            payload: {
              event_id: event.id,
              title: event.title,
              start_at: event.start_at,
              reason: reason || null,
            } as Json,
          });
        }
      } catch (e) {
        console.warn('Failed to log visit_canceled activity:', e);
      }

      return event as Event;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['conversation-activity'] });
      queryClient.invalidateQueries({ queryKey: ['contact-activity'] });
      toast.success('Evento cancelado');
    },
    onError: (error) => {
      toast.error(`Error al cancelar: ${error.message}`);
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.tenant_id) throw new Error('No tenant');

      // Clear orphaned pending_event_id references before deleting
      await supabase
        .from('conversations')
        .update({ pending_event_id: null } as any)
        .eq('pending_event_id', id)
        .eq('tenant_id', profile.tenant_id);

      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id)
        .eq('tenant_id', profile.tenant_id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Cita eliminada');
    },
    onError: (error) => {
      toast.error(`Error al eliminar: ${error.message}`);
    },
  });
}

// Tipos de evento por defecto en español
export const DEFAULT_EVENT_TYPES = [
  { value: 'visita_inmueble', label: 'Visita Inmueble' },
  { value: 'llamada_revision_credito', label: 'Llamada Revisión de Crédito' },
];

// Alias legacy para datos creados antes de la estandarización de event_type
const EVENT_TYPE_ALIASES: Record<string, string> = {
  visita: 'Visita Inmueble',
  visit: 'Visita Inmueble',
  appointment: 'Cita',
};

export function getEventTypeLabel(value: string): string {
  const found = DEFAULT_EVENT_TYPES.find(t => t.value === value);
  if (found) return found.label;
  if (EVENT_TYPE_ALIASES[value]) return EVENT_TYPE_ALIASES[value];
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Opciones de estado centralizadas — importar desde aquí en lugar de definir localmente
export const EVENT_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Programado' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'canceled',  label: 'Cancelado' },
  { value: 'completed', label: 'Completado' },
  { value: 'no_show',   label: 'No asistió' },
] as const;

// Kept for static fallback imports; prefer useCreditTypeOptions() hook in components
export const CREDIT_TYPE_OPTIONS = [
  { value: 'INFONAVIT',  label: 'Infonavit' },
  { value: 'COFINAVIT',  label: 'Cofinavit' },
  { value: 'FOVISSSTE',  label: 'Fovissste' },
  { value: 'ISFAM',      label: 'ISFAM' },
  { value: 'CFE',        label: 'CFE' },
  { value: 'BANK',       label: 'Bancario' },
  { value: 'CASH',       label: 'Contado' },
];

export function useCreditTypeOptions() {
  const { credit_types } = useTenantSettings();
  return credit_types;
}

export function useCheckConflicts() {
  const { profile, user } = useAuth();

  return async (startISO: string, endISO: string, excludeId?: string): Promise<Event[]> => {
    if (!profile?.tenant_id || !user?.id) return [];

    let q = supabase
      .from('events')
      .select('id, title, start_at, end_at, status')
      .eq('tenant_id', profile.tenant_id)
      .eq('created_by', user.id)
      .in('status', ['scheduled', 'confirmed'])
      .gte('start_at', startISO)
      .lt('start_at', endISO);

    if (excludeId) {
      q = q.neq('id', excludeId);
    }

    const { data } = await q;
    return (data || []) as unknown as Event[];
  };
}

export function useEventTypes() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['event-types', profile?.tenant_id],
    queryFn: async () => {
      if (!profile?.tenant_id) return [];

      const { data, error } = await supabase
        .from('events')
        .select('event_type')
        .eq('tenant_id', profile.tenant_id);

      if (error) throw error;
      
      // Get unique types from DB
      const dbTypes = [...new Set(data.map(e => e.event_type))];
      
      // Merge with default types (prioritize defaults)
      const defaultValues = DEFAULT_EVENT_TYPES.map(t => t.value);
      const customTypes = dbTypes.filter(t => !defaultValues.includes(t));
      
      return [...defaultValues, ...customTypes];
    },
    enabled: !!profile?.tenant_id,
  });
}
