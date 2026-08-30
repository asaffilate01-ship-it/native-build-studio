import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "owner" | "release_owner" | "product_owner" | "member";

type QueueBuildInput = {
  appId: string;
  platform: "ios" | "android" | "all";
  destination: "internal" | "production";
  submitToInternal: boolean;
  uploadMetadata: boolean;
  sourceSha?: string;
  releaseOwnerConfirmation?: string;
};

/**
 * Queue a native build. Privileged: the browser never dispatches GitHub
 * workflows directly. This server boundary verifies organisation role,
 * records the job and writes an audit event.
 */
export const queueBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: QueueBuildInput) => {
    if (!input?.appId) throw new Error("An app must be selected.");
    if (!["ios", "android", "all"].includes(input.platform)) throw new Error("Invalid platform.");
    if (!["internal", "production"].includes(input.destination)) throw new Error("Invalid destination.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: app, error: appError } = await supabase
      .from("native_apps")
      .select("id, slug, org_id, active, display_name")
      .eq("id", data.appId)
      .maybeSingle();

    if (appError) throw new Error(appError.message);
    if (!app || !app.active) throw new Error("Unknown or inactive app.");

    const { data: membership } = await supabase
      .from("organisation_members")
      .select("role")
      .eq("org_id", app.org_id)
      .eq("user_id", userId)
      .maybeSingle();

    const role = membership?.role as Role | undefined;
    if (!role || !["owner", "release_owner"].includes(role)) {
      throw new Error("Only an owner or release owner may queue builds.");
    }

    if (data.destination === "production") {
      if ((data.releaseOwnerConfirmation ?? "").trim().toUpperCase() !== "RELEASE") {
        throw new Error("Production requires an explicit release-owner confirmation.");
      }
    }

    const { data: job, error } = await supabase
      .from("native_build_jobs")
      .insert({
        app_id: app.id,
        org_id: app.org_id,
        platform: data.platform,
        destination: data.destination,
        submit_to_internal: data.submitToInternal,
        upload_metadata: data.uploadMetadata,
        source_sha: data.sourceSha?.trim() || null,
        status: "queued",
        requested_by: userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_events").insert({
      org_id: app.org_id,
      actor_id: userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? "",
      action: data.destination === "production" ? "build.queued.production" : "build.queued.internal",
      target: `${app.slug} · ${data.platform}`,
      detail: { job_id: job.id, upload_metadata: data.uploadMetadata },
    });

    return { jobId: job.id as string };
  });

type PlanDecisionInput = {
  planId: string;
  status: "approved" | "superseded";
};

/** Approve or supersede a plan version. Product owners and owners only. */
export const decidePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PlanDecisionInput) => {
    if (!input?.planId) throw new Error("A plan must be selected.");
    if (!["approved", "superseded"].includes(input.status)) throw new Error("Invalid decision.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: plan, error: planError } = await supabase
      .from("native_app_plans")
      .select("id, org_id, app_id, version, status")
      .eq("id", data.planId)
      .maybeSingle();

    if (planError) throw new Error(planError.message);
    if (!plan) throw new Error("Plan not found.");

    const { data: membership } = await supabase
      .from("organisation_members")
      .select("role")
      .eq("org_id", plan.org_id)
      .eq("user_id", userId)
      .maybeSingle();

    const role = membership?.role as Role | undefined;
    if (!role || !["owner", "product_owner"].includes(role)) {
      throw new Error("Only an owner or product owner may approve or supersede a plan.");
    }

    const { error } = await supabase
      .from("native_app_plans")
      .update({
        status: data.status,
        approved_by: data.status === "approved" ? userId : null,
        approved_at: data.status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", plan.id);

    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_events").insert({
      org_id: plan.org_id,
      actor_id: userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? "",
      action: data.status === "approved" ? "plan.approved" : "plan.superseded",
      target: `plan v${plan.version}`,
      detail: { plan_id: plan.id },
    });

    return { ok: true };
  });

type RecordEventInput = {
  orgId: string;
  action: string;
  target?: string;
  detail?: Record<string, string | number | boolean | null>;
};

/** Write an audit event for a member action performed in the browser. */
export const recordAuditEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RecordEventInput) => {
    if (!input?.orgId || !input?.action) throw new Error("An organisation and action are required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: membership } = await supabase
      .from("organisation_members")
      .select("role")
      .eq("org_id", data.orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) throw new Error("You are not a member of this organisation.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_events").insert({
      org_id: data.orgId,
      actor_id: userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? "",
      action: data.action.slice(0, 120),
      target: (data.target ?? "").slice(0, 200),
      detail: data.detail ?? {},
    });

    return { ok: true };
  });
