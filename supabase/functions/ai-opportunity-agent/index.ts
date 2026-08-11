// Agente de Oportunidades: corre los loops que mantienen vivo el pipeline.
//
// La pantalla de configuración existía como maqueta y los 4 loops eran switches
// decorativos: nada se ejecutaba. Esta función es lo que faltaba del otro lado.
//
// Loops (cada uno se puede apagar desde /settings/opportunity-agent):
//  1. Seguimiento activo      — oportunidad sin actividad N días → tarea al AE
//  2. Alerta de estancamiento — sin cambiar de etapa N días → aviso al manager
//  3. Recordatorio de propuesta — cada N días desde que se envió, hasta que
//     responda o se marque Perdida. El §4.1 del documento pide encenderlo.
//  4. Actualización de probabilidad — recalcula el cierre probable según la
//     etapa y la antigüedad, para que el forecast no mienta.
//
// Se dispara por pg_cron cada hora. Es idempotente por diseño: cada loop marca
// su propio timestamp (stall_alerted_at, last_proposal_reminder_at) para no
// repetir el mismo aviso en la siguiente corrida.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAY_MS = 24 * 60 * 60 * 1000;

interface OpportunitySettings {
  tenant_id: string;
  enabled: boolean;
  stale_after_days: number;
  alert_after_days: number;
  loop_followup_enabled: boolean;
  loop_stall_alert_enabled: boolean;
  loop_proposal_reminder_enabled: boolean;
  loop_probability_update_enabled: boolean;
  proposal_reminder_days: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const summary: Record<string, unknown>[] = [];

  try {
    const { data: allSettings, error: settingsError } = await supabase
      .from("tenant_opportunity_settings")
      .select("*")
      .eq("enabled", true);

    if (settingsError) throw settingsError;

    for (const raw of allSettings ?? []) {
      const settings = raw as unknown as OpportunitySettings;
      const tenantId = settings.tenant_id;

      // Etapas abiertas del tenant: los loops nunca tocan oportunidades cerradas.
      const { data: stages } = await supabase
        .from("pipeline_stages")
        .select("id, name, stage_type, probability_default, legacy_stage_key")
        .eq("tenant_id", tenantId);

      const openStageIds = (stages ?? [])
        .filter((s) => s.stage_type === "open")
        .map((s) => s.id);

      if (openStageIds.length === 0) continue;

      const stageById = new Map((stages ?? []).map((s) => [s.id, s]));

      const { data: opportunities } = await supabase
        .from("opportunities")
        .select(
          "id, name, tenant_id, stage_id, assigned_to, primary_contact_id, close_probability, updated_at, last_stage_change_at, proposal_sent_at, last_proposal_reminder_at, proposal_reminder_count, stall_alerted_at, created_at",
        )
        .eq("tenant_id", tenantId)
        .in("stage_id", openStageIds);

      if (!opportunities || opportunities.length === 0) continue;

      // `sin_canal` cuenta las oportunidades que cumplían la condición pero no
      // tienen conversación donde avisar: son trabajo pendiente, no éxitos.
      const counters = { followup: 0, stall: 0, proposal: 0, probability: 0, sin_canal: 0 };

      for (const opp of opportunities) {
        const stage = stageById.get(opp.stage_id);
        const lastStageChange = new Date(opp.last_stage_change_at ?? opp.created_at).getTime();
        const lastTouch = new Date(opp.updated_at ?? opp.created_at).getTime();

        // La conversación del contacto principal es donde se cuelgan las tareas
        // para que aparezcan en la pantalla de Seguimientos.
        let conversationId: string | null = null;
        if (opp.primary_contact_id) {
          const { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .eq("contact_id", opp.primary_contact_id)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          conversationId = conv?.id ?? null;
        }

        const scheduleFollowup = async (note: string, dueInHours = 24) => {
          if (!conversationId || !opp.primary_contact_id) return false;
          const { error } = await supabase.from("conversation_followups").insert({
            tenant_id: tenantId,
            conversation_id: conversationId,
            contact_id: opp.primary_contact_id,
            assigned_user_id: opp.assigned_to ?? null,
            status: "scheduled",
            due_at: new Date(now.getTime() + dueInHours * 60 * 60 * 1000).toISOString(),
            note,
          });
          if (error) {
            console.error(`[ai-opportunity-agent] no se pudo agendar: ${error.message}`);
            return false;
          }
          return true;
        };

        /**
         * Registra el evento en la bitácora de la conversación. Devuelve false
         * cuando la oportunidad no tiene conversación donde colgarlo: sin ella
         * el aviso no llega a ninguna parte, y contarlo como "alertado" haría
         * que el resumen del runner mintiera.
         */
        const logActivity = async (eventType: string, payload: Record<string, unknown>) => {
          if (!conversationId || !opp.primary_contact_id) return false;
          const { error } = await supabase.from("conversation_activity").insert({
            tenant_id: tenantId,
            conversation_id: conversationId,
            contact_id: opp.primary_contact_id,
            actor_type: "ai",
            event_type: eventType,
            payload: { opportunity_id: opp.id, opportunity_name: opp.name, ...payload },
          });
          if (error) {
            console.error(`[ai-opportunity-agent] no se pudo registrar ${eventType}: ${error.message}`);
            return false;
          }
          return true;
        };

        // ── Loop 3: recordatorio de propuesta ───────────────────────────────
        // Va primero porque es el más específico: si la oportunidad está en
        // propuesta, este recordatorio sustituye al de inactividad genérica.
        let handledByProposalLoop = false;
        if (
          settings.loop_proposal_reminder_enabled &&
          stage?.legacy_stage_key === "etapa_5_propuesta" &&
          opp.proposal_sent_at
        ) {
          const since = new Date(
            opp.last_proposal_reminder_at ?? opp.proposal_sent_at,
          ).getTime();
          const dueMs = settings.proposal_reminder_days * DAY_MS;

          if (now.getTime() - since >= dueMs) {
            const count = (opp.proposal_reminder_count ?? 0) + 1;
            const sent = await scheduleFollowup(
              `Recordatorio de propuesta #${count} — "${opp.name}". Sin respuesta desde hace ${Math.floor((now.getTime() - since) / DAY_MS)} días. Dar seguimiento o marcar como perdida.`,
            );
            await supabase
              .from("opportunities")
              .update({
                last_proposal_reminder_at: now.toISOString(),
                proposal_reminder_count: count,
              })
              .eq("id", opp.id);
            await logActivity("opportunity_proposal_reminder", {
              reminder_number: count,
              days_since: Math.floor((now.getTime() - since) / DAY_MS),
            });
            if (sent) counters.proposal++;
            handledByProposalLoop = true;
          }
        }

        // ── Loop 1: seguimiento por inactividad ─────────────────────────────
        if (
          settings.loop_followup_enabled &&
          !handledByProposalLoop &&
          now.getTime() - lastTouch >= settings.stale_after_days * DAY_MS
        ) {
          const days = Math.floor((now.getTime() - lastTouch) / DAY_MS);
          const sent = await scheduleFollowup(
            `"${opp.name}" lleva ${days} días sin actividad en ${stage?.name ?? "su etapa"}. Retomar el contacto o mover de etapa.`,
          );
          await logActivity("opportunity_stale", { days_without_activity: days });
          if (sent) counters.followup++;
        }

        // ── Loop 2: alerta de estancamiento ─────────────────────────────────
        if (
          settings.loop_stall_alert_enabled &&
          !opp.stall_alerted_at &&
          now.getTime() - lastStageChange >= settings.alert_after_days * DAY_MS
        ) {
          const days = Math.floor((now.getTime() - lastStageChange) / DAY_MS);
          const alerted = await logActivity("opportunity_stalled", {
            days_in_stage: days,
            stage: stage?.name ?? null,
            assigned_to: opp.assigned_to ?? null,
          });
          // Se marca siempre para no reintentar cada hora sobre lo mismo, pero
          // solo cuenta como alerta si de verdad quedó registrada.
          await supabase
            .from("opportunities")
            .update({ stall_alerted_at: now.toISOString() })
            .eq("id", opp.id);
          if (alerted) counters.stall++;
          else counters.sin_canal++;
        }

        // ── Loop 4: actualización de probabilidad ───────────────────────────
        // Parte de la probabilidad propia de la etapa y la castiga por
        // antigüedad: 2 puntos por semana estancada, con piso en la mitad.
        if (settings.loop_probability_update_enabled && stage) {
          const base = stage.probability_default ?? 0;
          const weeksStalled = Math.floor((now.getTime() - lastStageChange) / (7 * DAY_MS));
          const decayed = Math.max(Math.round(base / 2), base - weeksStalled * 2);
          if (decayed !== opp.close_probability) {
            await supabase
              .from("opportunities")
              .update({ close_probability: decayed })
              .eq("id", opp.id);
            counters.probability++;
          }
        }
      }

      summary.push({ tenant_id: tenantId, ...counters });
      console.log(`[ai-opportunity-agent] tenant ${tenantId}:`, counters);
    }

    return new Response(
      JSON.stringify({ success: true, ran_at: now.toISOString(), tenants: summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[ai-opportunity-agent] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
