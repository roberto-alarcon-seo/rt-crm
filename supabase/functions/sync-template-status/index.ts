import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Twilio's WhatsApp approval status values → our internal status
function mapTwilioStatus(twilioStatus: string): string {
  switch (twilioStatus) {
    case 'approved':    return 'approved';
    case 'rejected':    return 'rejected';
    case 'pending':
    case 'received':    return 'pending';
    case 'unsubmitted': return 'draft';
    default:            return ''; // unknown — skip update
  }
}

async function fetchApprovalStatusV2(
  contentSid: string,
  twilioAuth: string,
): Promise<{ status: string; rejection_reason?: string } | null> {
  const res = await fetch(
    `https://content.twilio.com/v2/ContentAndApprovals/${contentSid}`,
    { method: 'GET', headers: { 'Authorization': `Basic ${twilioAuth}` } },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const whatsapp = data?.approval_requests?.whatsapp;
  if (!whatsapp?.status) return null;
  return { status: whatsapp.status, rejection_reason: whatsapp.rejection_reason || undefined };
}

async function fetchApprovalStatusV1(
  contentSid: string,
  twilioAuth: string,
): Promise<{ status: string; rejection_reason?: string } | null> {
  const res = await fetch(
    `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`,
    { method: 'GET', headers: { 'Authorization': `Basic ${twilioAuth}` } },
  );
  if (!res.ok) {
    console.warn(`⚠️ v1 ApprovalRequests failed for ${contentSid}: HTTP ${res.status}`);
    return null;
  }
  const data = await res.json();
  const whatsapp = data?.whatsapp;
  if (!whatsapp?.status) {
    console.warn(`⚠️ No whatsapp.status in v1 response for ${contentSid}:`, JSON.stringify(data));
    return null;
  }
  return { status: whatsapp.status, rejection_reason: whatsapp.rejection_reason || undefined };
}

// Core sync logic for a single tenant — shared by cron and manual modes.
async function syncTenantTemplates(
  supabase: SupabaseClient,
  tenantId: string,
  twilioAuth: string,
): Promise<{ synced: number; updated: number }> {
  const { data: templates, error } = await supabase
    .from('templates')
    .select('id, twilio_template_sid, approval_status, name')
    .eq('tenant_id', tenantId)
    .not('twilio_template_sid', 'is', null)
    .in('approval_status', ['pending', 'draft', 'approved']);

  if (error) throw error;

  const toSync = templates ?? [];
  let updated = 0;

  for (const template of toSync) {
    if (!template.twilio_template_sid) continue;
    try {
      let approval = await fetchApprovalStatusV2(template.twilio_template_sid, twilioAuth);
      if (!approval) {
        approval = await fetchApprovalStatusV1(template.twilio_template_sid, twilioAuth);
      }
      if (!approval) {
        console.log(`ℹ️ No status found for "${template.name}" (${template.twilio_template_sid})`);
        continue;
      }

      const newStatus = mapTwilioStatus(approval.status);
      if (!newStatus) {
        console.warn(`⚠️ Unknown Twilio status "${approval.status}" for "${template.name}"`);
        continue;
      }

      console.log(`📋 [${tenantId.slice(0, 8)}] "${template.name}": ${template.approval_status} → ${newStatus}`);

      const updateData: Record<string, unknown> = { last_synced_at: new Date().toISOString() };

      if (newStatus !== template.approval_status) {
        updateData.approval_status = newStatus;
        updateData.rejection_reason =
          newStatus === 'rejected' ? (approval.rejection_reason ?? null) : null;
        updated++;
      }

      await supabase.from('templates').update(updateData).eq('id', template.id);
    } catch (err) {
      console.error(`❌ Error syncing "${template.name}":`, err);
    }
  }

  return { synced: toSync.length, updated };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const isCronCall = body?.source === 'pg_cron';

    // ── CRON MODE: sync all tenants with a connected Twilio account ──────────
    if (isCronCall) {
      console.log('🕐 Cron sync: scanning all connected tenants...');

      const { data: integrations, error: intError } = await supabase
        .from('tenant_integrations')
        .select('tenant_id, account_sid, auth_token_encrypted')
        .eq('provider', 'twilio')
        .eq('status', 'connected');

      if (intError) throw intError;

      const results: Array<{ tenant_id: string; synced: number; updated: number }> = [];

      for (const integration of integrations ?? []) {
        try {
          const authToken = atob(integration.auth_token_encrypted!);
          const twilioAuth = btoa(`${integration.account_sid}:${authToken}`);
          const { synced, updated } = await syncTenantTemplates(supabase, integration.tenant_id, twilioAuth);
          results.push({ tenant_id: integration.tenant_id, synced, updated });
        } catch (err) {
          console.error(`❌ Failed to sync tenant ${integration.tenant_id}:`, err);
        }
      }

      const totalSynced  = results.reduce((s, r) => s + r.synced, 0);
      const totalUpdated = results.reduce((s, r) => s + r.updated, 0);

      console.log(`✅ Cron complete: ${results.length} tenant(s), ${totalSynced} templates checked, ${totalUpdated} updated.`);

      return new Response(
        JSON.stringify({ success: true, tenants: results.length, synced: totalSynced, updated: totalUpdated }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── MANUAL MODE: authenticate and sync only the calling user's tenant ────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ code: 'UNAUTHORIZED', message: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ code: 'UNAUTHORIZED', message: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return new Response(
        JSON.stringify({ code: 'FORBIDDEN', message: 'User has no tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tenantId = profile.tenant_id;
    console.log(`🔄 Manual sync for tenant: ${tenantId}`);

    const { data: integration } = await supabase
      .from('tenant_integrations')
      .select('account_sid, auth_token_encrypted, status')
      .eq('tenant_id', tenantId)
      .eq('provider', 'twilio')
      .single();

    if (!integration || integration.status !== 'connected') {
      return new Response(
        JSON.stringify({ code: 'NO_INTEGRATION', message: 'No hay cuenta de Twilio conectada.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const authToken = atob(integration.auth_token_encrypted!);
    const twilioAuth = btoa(`${integration.account_sid}:${authToken}`);

    const { synced, updated } = await syncTenantTemplates(supabase, tenantId, twilioAuth);

    console.log(`✅ Manual sync complete: ${synced} checked, ${updated} updated.`);

    return new Response(
      JSON.stringify({
        success: true,
        synced_count: synced,
        updated_count: updated,
        message: updated > 0
          ? `Se actualizaron ${updated} plantilla(s)`
          : 'Todas las plantillas están al día',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('❌ Error in sync-template-status:', error);
    return new Response(
      JSON.stringify({
        code: 'INTERNAL_ERROR',
        message: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
