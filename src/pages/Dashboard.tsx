import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Building2, TrendingUp, Users, MessageSquare, Target, Zap, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { ExportReportButton } from "@/components/dashboard/ExportReportButton";
import { subDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { DateRange } from "react-day-picker";

import { KPICard } from "@/components/dashboard/KPICard";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { AIPerformanceCard } from "@/components/dashboard/AIPerformanceCard";
import { RecentActivityCard } from "@/components/dashboard/RecentActivityCard";
import { CriticalAlertsCard } from "@/components/dashboard/CriticalAlertsCard";
import { PipelineFunnelCard } from "@/components/dashboard/PipelineFunnelCard";
import { ChannelAttributionCard } from "@/components/dashboard/ChannelAttributionCard";
import { useRTDashboard } from "@/hooks/useRTDashboard";

export default function Dashboard() {
  const navigate = useNavigate();
  const dashboardRef = useRef<HTMLDivElement>(null);

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date()
  });

  const { data, isLoading } = useRTDashboard(dateRange);

  const periodLabel = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, "dd MMM", { locale: es })} - ${format(dateRange.to, "dd MMM yyyy", { locale: es })}`
    : "Últimos 30 días";

  return (
    <div className="h-full overflow-auto bg-background">
      <div ref={dashboardRef} className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Pipeline comercial · {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
            <ExportReportButton
              dateRange={dateRange}
              dashboardRef={dashboardRef}
              analyticsData={{
                totalConversations: data?.pipeline.total || 0,
                totalMessages: (data?.messaging.totalSent || 0) + (data?.messaging.totalReceived || 0),
                inboundMessages: data?.messaging.totalReceived || 0,
                outboundMessages: data?.messaging.totalSent || 0,
                responseRate: data?.messaging.responseRate || 0,
                avgResponseTime: "N/A",
                campaignsSent: 0,
                campaignDeliveryRate: 0,
                newContacts: data?.leads.newThisPeriod || 0,
                totalContacts: data?.leads.total || 0,
                walletBalance: data?.messaging.creditsRemaining || 0,
                walletSpent: data?.messaging.creditsUsedThisPeriod || 0,
                approvedTemplates: 0,
                pendingTemplates: 0,
                dailyMetrics: data?.dailyTrends.map(d => ({
                  date: d.date,
                  label: d.label,
                  conversations: d.newLeads,
                  messagesSent: d.messages,
                  responses: d.conversions,
                  delivered: d.messages,
                })) || [],
              }}
            />
            <Button variant="outline" size="sm" onClick={() => navigate("/pipeline")}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Ver Oportunidades
            </Button>
            <Button size="sm" onClick={() => navigate("/campaigns/new")}>
              <Zap className="w-4 h-4 mr-2" />
              Nueva campaña
            </Button>
          </div>
        </div>

        {/* KPI Cards — métricas B2B */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Leads activos"
            value={data?.leads.total || 0}
            icon={<Users className="w-5 h-5" />}
            loading={isLoading}
          />
          <KPICard
            title="Oportunidades abiertas"
            value={data?.pipeline.open || 0}
            icon={<TrendingUp className="w-5 h-5" />}
            loading={isLoading}
          />
          <KPICard
            title="Empresas en pipeline"
            value={data?.accounts.inPipeline || 0}
            icon={<Building2 className="w-5 h-5" />}
            loading={isLoading}
          />
          <KPICard
            title="Respuestas IA (periodo)"
            value={data?.messaging.aiResponses || 0}
            icon={<MessageSquare className="w-5 h-5" />}
            loading={isLoading}
          />
        </div>

        {/* Alertas críticas */}
        <CriticalAlertsCard
          overdueFollowups={data?.followups.overdueCount || 0}
          ghostingLeads={data?.leads.ghostingCount || 0}
          stalledOpportunities={data?.pipeline.stalledOpportunities || 0}
          isLoading={isLoading}
        />

        {/* Funnel de pipeline + Atribución por canal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PipelineFunnelCard
            stages={data?.pipeline.byStage || []}
            total={data?.pipeline.total || 0}
            isLoading={isLoading}
          />
          <ChannelAttributionCard
            channels={data?.attribution.byChannel || []}
            isLoading={isLoading}
          />
        </div>

        {/* Actividad diaria + Rendimiento IA */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActivityChart
            dailyTrends={data?.dailyTrends || []}
            isLoading={isLoading}
          />
          <AIPerformanceCard
            totalMessages={(data?.messaging.totalSent || 0) + (data?.messaging.totalReceived || 0)}
            aiMessages={data?.messaging.aiResponses || 0}
            humanMessages={data?.messaging.humanResponses || 0}
            responseRate={data?.messaging.responseRate || 0}
            isLoading={isLoading}
          />
        </div>

        {/* Actividad reciente */}
        <RecentActivityCard
          activities={data?.recentActivity || []}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
