import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveTenantId } from "@/hooks/useEffectiveTenantId";
import {
  subDays,
  startOfDay,
  endOfDay,
  format,
  eachDayOfInterval,
} from "date-fns";
import { DateRange } from "react-day-picker";

export const RT_PIPELINE_STAGES = [
  { key: 'etapa_0_captacion',       label: 'Captación',         color: 'hsl(var(--chart-1))' },
  { key: 'etapa_1_calificacion',    label: 'Calificación',      color: 'hsl(var(--chart-2))' },
  { key: 'etapa_2_nurturing',       label: 'Nurturing',         color: 'hsl(var(--chart-3))' },
  { key: 'etapa_3_demo',            label: 'Demo Agendada',     color: 'hsl(var(--chart-4))' },
  { key: 'etapa_4_oportunidad',     label: 'Oportunidad',       color: 'hsl(var(--chart-5))' },
  { key: 'etapa_5_propuesta',       label: 'Propuesta',         color: 'hsl(220 70% 50%)' },
  { key: 'etapa_6_negociacion',     label: 'Negociación',       color: 'hsl(var(--primary))' },
  { key: 'etapa_7_compras_legal',   label: 'Compras/Legal',     color: 'hsl(38 92% 50%)' },
  { key: 'etapa_8_alta_proveedor',  label: 'Alta Proveedor',    color: 'hsl(25 95% 53%)' },
  { key: 'etapa_9_contrato',        label: 'Contrato/Firma',    color: 'hsl(142 71% 45%)' },
  { key: 'cerrada_ganada',          label: 'Ganada ✓',          color: 'hsl(142 76% 36%)' },
  { key: 'cerrada_perdida',         label: 'Perdida',           color: 'hsl(var(--destructive))' },
];

export interface RTDashboardData {
  leads: {
    total: number;
    newThisPeriod: number;
    ghostingCount: number;
    byTemperature: { hot: number; warm: number; cold: number };
  };
  pipeline: {
    total: number;
    open: number;
    stalledOpportunities: number;
    byStage: { stage: string; label: string; count: number; color: string; percentage: number }[];
    closedWonThisPeriod: number;
    closedLostThisPeriod: number;
  };
  accounts: {
    total: number;
    inPipeline: number;
    newThisPeriod: number;
  };
  messaging: {
    totalSent: number;
    totalReceived: number;
    aiResponses: number;
    humanResponses: number;
    responseRate: number;
    creditsRemaining: number;
    creditsUsedThisPeriod: number;
  };
  followups: {
    overdueCount: number;
    dueTodayCount: number;
  };
  attribution: {
    byChannel: { channel: string; label: string; leads: number; opportunities: number; color: string }[];
  };
  dailyTrends: { date: string; label: string; newLeads: number; messages: number; conversions: number; visits: number }[];
  recentActivity: { id: string; type: 'ai_message' | 'inbound_message' | 'outbound_message'; description: string; contact?: string; timestamp: string }[];
}

export function useRTDashboard(dateRange?: DateRange) {
  const effectiveTenantId = useEffectiveTenantId();

  const from = dateRange?.from ? startOfDay(dateRange.from) : startOfDay(subDays(new Date(), 30));
  const to = dateRange?.to ? endOfDay(dateRange.to) : endOfDay(new Date());

  return useQuery<RTDashboardData>({
    queryKey: ["rt-dashboard", effectiveTenantId, from.toISOString(), to.toISOString()],
    enabled: !!effectiveTenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!effectiveTenantId) throw new Error("No tenant");

      const [
        contactsResult,
        messagesResult,
        followupsResult,
        recentActivityResult,
      ] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, lead_temperature, pipeline_stage, source, created_at, last_interaction_at")
          .eq("tenant_id", effectiveTenantId)
          .neq("operational_status", "ARCHIVED"),
        supabase
          .from("messages")
          .select("id, direction, created_at, ai_generated")
          .eq("tenant_id", effectiveTenantId)
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString()),
        supabase
          .from("contacts")
          .select("id, next_action_at")
          .eq("tenant_id", effectiveTenantId)
          .not("next_action_at", "is", null)
          .lt("next_action_at", new Date().toISOString()),
        supabase
          .from("messages")
          .select("id, direction, body, created_at, ai_generated, conversation_id")
          .eq("tenant_id", effectiveTenantId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const contacts = contactsResult.data || [];
      const messages = messagesResult.data || [];
      const followups = followupsResult.data || [];
      const recentMsgs = recentActivityResult.data || [];

      // Leads
      const newLeads = contacts.filter(c => new Date(c.created_at) >= from && new Date(c.created_at) <= to);
      const ghosting = contacts.filter(c => {
        if (!c.last_interaction_at) return false;
        const daysSince = (Date.now() - new Date(c.last_interaction_at).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 7;
      });

      // Pipeline: use pipeline_stage on contacts as proxy until opportunities table exists
      const openStages = RT_PIPELINE_STAGES
        .filter(s => !['cerrada_ganada', 'cerrada_perdida'].includes(s.key))
        .map(s => s.key);

      // Map legacy RE stages to B2B stages for existing data
      const stageMap: Record<string, string> = {
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

      const stageCount: Record<string, number> = {};
      contacts.forEach(c => {
        const raw = c.pipeline_stage || 'etapa_0_captacion';
        const mapped = stageMap[raw] || raw;
        stageCount[mapped] = (stageCount[mapped] || 0) + 1;
      });

      const totalPipeline = contacts.length;
      const byStage = RT_PIPELINE_STAGES.map(s => ({
        stage: s.key,
        label: s.label,
        count: stageCount[s.key] || 0,
        color: s.color,
        percentage: totalPipeline > 0 ? Math.round(((stageCount[s.key] || 0) / totalPipeline) * 100) : 0,
      }));

      const openCount = contacts.filter(c => {
        const raw = c.pipeline_stage || 'etapa_0_captacion';
        const mapped = stageMap[raw] || raw;
        return openStages.includes(mapped);
      }).length;

      const closedWon = contacts.filter(c => (stageMap[c.pipeline_stage] || c.pipeline_stage) === 'cerrada_ganada' &&
        new Date(c.created_at) >= from).length;
      const closedLost = contacts.filter(c => (stageMap[c.pipeline_stage] || c.pipeline_stage) === 'cerrada_perdida' &&
        new Date(c.created_at) >= from).length;

      // Stalled: open stage but no interaction in 14 days
      const stalledOpportunities = contacts.filter(c => {
        const raw = c.pipeline_stage || 'etapa_0_captacion';
        const mapped = stageMap[raw] || raw;
        if (!openStages.includes(mapped)) return false;
        if (!c.last_interaction_at) return true;
        const daysSince = (Date.now() - new Date(c.last_interaction_at).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 14;
      }).length;

      // Messaging
      const sent = messages.filter(m => m.direction === 'outbound');
      const received = messages.filter(m => m.direction === 'inbound');
      const aiResponses = sent.filter(m => m.ai_generated).length;
      const humanResponses = sent.filter(m => !m.ai_generated).length;
      const responseRate = received.length > 0 ? Math.round((sent.length / received.length) * 100) : 0;

      // Attribution by source
      const CHANNEL_LABELS: Record<string, string> = {
        whatsapp: 'WhatsApp',
        web: 'Web',
        linkedin: 'LinkedIn',
        referido: 'Referido',
        gcp_ae: 'GCP AE',
        partner: 'Partner',
        paid: 'Paid Media',
        direct: 'Directo',
      };
      const CHANNEL_COLORS: Record<string, string> = {
        whatsapp: '#25D366',
        web: '#3B82F6',
        linkedin: '#0A66C2',
        referido: '#8B5CF6',
        gcp_ae: '#EA4335',
        partner: '#F59E0B',
        paid: '#10B981',
        direct: '#6B7280',
      };
      const channelCount: Record<string, number> = {};
      contacts.forEach(c => {
        const src = c.source || 'direct';
        channelCount[src] = (channelCount[src] || 0) + 1;
      });
      const byChannel = Object.entries(channelCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([channel, leads]) => ({
          channel,
          label: CHANNEL_LABELS[channel] || channel,
          leads,
          opportunities: Math.round(leads * 0.4),
          color: CHANNEL_COLORS[channel] || '#6B7280',
        }));

      // Daily trends
      const days = eachDayOfInterval({ start: from, end: to });
      const dailyTrends = days.slice(-30).map(day => {
        const dayStr = format(day, "yyyy-MM-dd");
        const dayLeads = newLeads.filter(c => format(new Date(c.created_at), "yyyy-MM-dd") === dayStr).length;
        const dayMessages = messages.filter(m => format(new Date(m.created_at), "yyyy-MM-dd") === dayStr).length;
        return {
          date: dayStr,
          label: format(day, "dd/MM"),
          newLeads: dayLeads,
          messages: dayMessages,
          conversions: 0,
          visits: 0,
        };
      });

      // Recent activity
      const recentActivity = recentMsgs.map(m => ({
        id: m.id,
        type: (m.ai_generated ? 'ai_message' : m.direction === 'inbound' ? 'inbound_message' : 'outbound_message') as 'ai_message' | 'inbound_message' | 'outbound_message',
        description: m.body ? (m.body.length > 60 ? m.body.slice(0, 60) + '…' : m.body) : 'Mensaje',
        timestamp: m.created_at,
      }));

      return {
        leads: {
          total: contacts.length,
          newThisPeriod: newLeads.length,
          ghostingCount: ghosting.length,
          byTemperature: {
            hot: contacts.filter(c => c.lead_temperature === 'hot').length,
            warm: contacts.filter(c => c.lead_temperature === 'warm').length,
            cold: contacts.filter(c => c.lead_temperature === 'cold').length,
          },
        },
        pipeline: {
          total: totalPipeline,
          open: openCount,
          stalledOpportunities,
          byStage,
          closedWonThisPeriod: closedWon,
          closedLostThisPeriod: closedLost,
        },
        accounts: {
          total: 0,
          inPipeline: 0,
          newThisPeriod: 0,
        },
        messaging: {
          totalSent: sent.length,
          totalReceived: received.length,
          aiResponses,
          humanResponses,
          responseRate,
          creditsRemaining: 0,
          creditsUsedThisPeriod: 0,
        },
        followups: {
          overdueCount: followups.length,
          dueTodayCount: 0,
        },
        attribution: { byChannel },
        dailyTrends,
        recentActivity,
      };
    },
  });
}
