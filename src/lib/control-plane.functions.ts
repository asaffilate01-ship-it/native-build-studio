import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "owner" | "release_owner" | "product_owner" | "member";

type QueueBuildInput = {
  appId: string;
  platform: "ios" | "android" | "all";
  submitToInternal: boolean;
  uploadMetadata: boolean;
  sourceSha?: string | undefined;
};

function githubSettings() {
  const token = process.env.FACTORY_GITHUB_TOKEN?.trim();
  const repository = process.env.FACTORY_GITHUB_REPOSITORY?.trim();
  const ref = process.env.FACTORY_GITHUB_REF?.trim() || "main";
  if (!token || !repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(
      "The build bridge is not configured. Set FACTORY_GITHUB_TOKEN and FACTORY_GITHUB_REPOSITORY as server-only secrets.",
    );
  }
  return { token, repository, ref };
}

async function dispatchWorkflow(workflow: string, inputs: Record<string, string>) {
  const { token, repository, ref } = githubSettings();
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref, inputs }),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`GitHub workflow dispatch failed (${response.status}): ${detail}`);
  }
  return `https://github.com/${repository}/actions`;
}

/**
 * Queue a native build. Privileged: the browser never dispatches GitHub
 * workflows directly. This server boundary verifies organisation role,
 * records the job and writes an audit event.
 */
export const queueBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: QueueBuildInput) => {
    if (!input?.appId) throw new Error("An app must be selected.");
    if (!["ios", "android", "all"].includes(input.platform)) throw new Error("Invalid platform.");
    if (input.sourceSha && !/^[0-9a-fA-F]{7,40}$/.test(input.sourceSha.trim())) {
      throw new Error("Commit SHA must contain 7–40 hexadecimal characters.");
    }
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

    const { data: job, error } = await supabase
      .from("native_build_jobs")
      .insert({
        app_id: app.id,
        org_id: app.org_id,
        platform: data.platform,
        destination: "internal",
        submit_to_internal: data.submitToInternal,
        upload_metadata: data.uploadMetadata,
        source_sha: data.sourceSha?.trim() || null,
        status: "queued",
        requested_by: userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    let runnerUrl = "";
    try {
      runnerUrl = await dispatchWorkflow("build-app.yml", {
        app_slug: app.slug,
        control_plane_job_id: job.id,
        platform: data.platform,
        submit: data.submitToInternal ? "true" : "false",
        metadata: data.uploadMetadata ? "true" : "false",
        source_sha: data.sourceSha?.trim() ?? "",
      });
      await supabase.from("native_build_jobs").update({ runner_url: runnerUrl }).eq("id", job.id);
    } catch (dispatchError) {
      await supabase
        .from("native_build_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          failure_summary:
            dispatchError instanceof Error ? dispatchError.message : "Dispatch failed",
        })
        .eq("id", job.id);
      throw dispatchError;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_events").insert({
      org_id: app.org_id,
      actor_id: userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? "",
      action: "build.queued.internal",
      target: `${app.slug} · ${data.platform}`,
      detail: { job_id: job.id, upload_metadata: data.uploadMetadata, runner_url: runnerUrl },
    });

    return { jobId: job.id as string, runnerUrl };
  });

type SubmitTestedBuildInput = {
  appId: string;
  platform: "ios" | "android";
  testedBuildNumber: number;
  sourceSha: string;
  qaNotes: string;
  confirmation: string;
};

/** Submit the exact build that passed QA; this never creates a replacement binary. */
export const submitTestedBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SubmitTestedBuildInput) => {
    if (!input?.appId) throw new Error("An app must be selected.");
    if (!["ios", "android"].includes(input.platform)) throw new Error("Invalid platform.");
    if (!Number.isInteger(input.testedBuildNumber) || input.testedBuildNumber < 1) {
      throw new Error("Enter the exact positive TestFlight build number or Play version code.");
    }
    if (!/^[0-9a-fA-F]{7,40}$/.test(input.sourceSha.trim())) {
      throw new Error("Enter the tested source commit SHA.");
    }
    if (input.qaNotes.trim().length < 20) {
      throw new Error("Add meaningful real-device QA evidence (at least 20 characters).");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: app, error: appError } = await supabase
      .from("native_apps")
      .select("id, slug, org_id, active")
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
      throw new Error("Only an owner or release owner may submit tested builds.");
    }
    if (data.confirmation.trim() !== `SUBMIT ${app.slug}`) {
      throw new Error(`Confirmation must be exactly: SUBMIT ${app.slug}`);
    }

    const { data: approval, error: approvalError } = await supabase
      .from("native_release_approvals")
      .insert({
        app_id: app.id,
        org_id: app.org_id,
        platform: data.platform,
        tested_build_number: data.testedBuildNumber,
        source_sha: data.sourceSha.trim(),
        qa_notes: data.qaNotes.trim(),
        confirmation: data.confirmation.trim(),
        status: "approved",
        approved_by: userId,
      })
      .select("id")
      .single();
    if (approvalError) throw new Error(approvalError.message);

    let runnerUrl = "";
    try {
      runnerUrl = await dispatchWorkflow("promote-approved-build.yml", {
        app_slug: app.slug,
        approval_id: approval.id,
        platform: data.platform,
        tested_build_number: String(data.testedBuildNumber),
        source_sha: data.sourceSha.trim(),
        qa_notes: data.qaNotes.trim(),
        confirmation: data.confirmation.trim(),
      });
      await supabase
        .from("native_release_approvals")
        .update({ workflow_dispatch_at: new Date().toISOString(), workflow_url: runnerUrl })
        .eq("id", approval.id);
    } catch (dispatchError) {
      await supabase
        .from("native_release_approvals")
        .update({ status: "dispatch_failed" })
        .eq("id", approval.id);
      throw dispatchError;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_events").insert({
      org_id: app.org_id,
      actor_id: userId,
      actor_email: (context.claims as { email?: string } | null)?.email ?? "",
      action: "release.tested_build.submitted",
      target: `${app.slug} · ${data.platform} · ${data.testedBuildNumber}`,
      detail: {
        approval_id: approval.id,
        source_sha: data.sourceSha.trim(),
        runner_url: runnerUrl,
      },
    });
    return { approvalId: approval.id as string, runnerUrl };
  });

type PlanDecisionInput = {
  planId: string;
  status: "approved" | "superseded";
};

/** Approve or supersede a plan version. Product owners and owners only. */
export const decidePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PlanDecisionInput) => {
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
  .validator((input: RecordEventInput) => {
    if (!input?.orgId || !input?.action)
      throw new Error("An organisation and action are required.");
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
