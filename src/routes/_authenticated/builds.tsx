import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useApps } from "@/hooks/useApps";
import { canQueueBuilds, useOrg } from "@/hooks/useOrg";
import { AppPicker } from "@/components/control-plane/AppPicker";
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  StatusPill,
  statusTone,
} from "@/components/control-plane/primitives";
import { queueBuild, submitTestedBuild } from "@/lib/control-plane.functions";

export const Route = createFileRoute("/_authenticated/builds")({
  head: () => ({
    meta: [
      { title: "Build queue — Native Factory Control Plane" },
      {
        name: "description",
        content:
          "Queue signed Android and iOS builds to internal testing, review runner and commit details, and track artefacts and failures.",
      },
      { property: "og:title", content: "Build queue — Native Factory Control Plane" },
      {
        property: "og:description",
        content: "Internal testing by default; production release stays a human decision.",
      },
    ],
  }),
  component: BuildsPage,
});

function BuildsPage() {
  const { currentOrgId, role } = useOrg();
  const queryClient = useQueryClient();
  const { data: apps = [], isLoading: appsLoading } = useApps(currentOrgId);
  const [appId, setAppId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "all">("android");
  const [commitSha, setCommitSha] = useState("");
  const [releasePlatform, setReleasePlatform] = useState<"ios" | "android">("android");
  const [testedBuildNumber, setTestedBuildNumber] = useState("");
  const [qaNotes, setQaNotes] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const queue = useServerFn(queueBuild);
  const release = useServerFn(submitTestedBuild);

  useEffect(() => {
    if (!appId && apps.length) setAppId(apps[0]!.id);
  }, [apps, appId]);

  const {
    data: jobs,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["builds", appId],
    enabled: Boolean(appId),
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("native_build_jobs")
        .select("*")
        .eq("app_id", appId!)
        .order("requested_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: approvals = [] } = useQuery({
    queryKey: ["release-approvals", appId],
    enabled: Boolean(appId),
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("native_release_approvals")
        .select("*")
        .eq("app_id", appId!)
        .order("approved_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      await queue({
        data: {
          appId: appId!,
          platform,
          submitToInternal: true,
          uploadMetadata: true,
          sourceSha: commitSha.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      setActionError(null);
      setConfirmation("");
      void queryClient.invalidateQueries({ queryKey: ["builds", appId] });
    },
    onError: (mutationError: Error) => setActionError(mutationError.message),
  });

  const submitRelease = useMutation({
    mutationFn: async () => {
      await release({
        data: {
          appId: appId!,
          platform: releasePlatform,
          testedBuildNumber: Number(testedBuildNumber),
          sourceSha: commitSha.trim(),
          qaNotes: qaNotes.trim(),
          confirmation,
        },
      });
    },
    onSuccess: () => {
      setActionError(null);
      setTestedBuildNumber("");
      setQaNotes("");
      setConfirmation("");
      void queryClient.invalidateQueries({ queryKey: ["release-approvals", appId] });
    },
    onError: (mutationError: Error) => setActionError(mutationError.message),
  });

  if (appsLoading) return <LoadingState />;
  if (!apps.length) {
    return (
      <>
        <PageHeader title="Build queue" description="Builds are queued against a role app." />
        <EmptyState title="No role apps yet" description="Add a role app in Portfolio first." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Build queue"
        description="Android builds first, then iOS on hosted macOS. Signing material never touches the browser — the queue only records intent and the runner reads protected secrets."
      />

      <AppPicker apps={apps} value={appId} onChange={setAppId} />

      {actionError ? (
        <p className="panel border-destructive/40 p-4 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      {canQueueBuilds(role) ? (
        <form
          className="panel space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <h2 className="text-lg font-semibold">Queue a build</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Platform">
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value as "ios" | "android" | "all")}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="all">Both</option>
              </select>
            </Field>
            <Field label="Commit SHA" hint="Optional; defaults to the branch head.">
              <input
                value={commitSha}
                onChange={(event) => setCommitSha(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={submit.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {submit.isPending ? "Queueing…" : "Build and upload to internal testing"}
          </button>
        </form>
      ) : (
        <p className="panel p-4 text-sm text-muted-foreground">
          Only owners and release owners can queue builds. You can still review build history below.
        </p>
      )}

      {canQueueBuilds(role) ? (
        <form
          className="panel space-y-4 border-destructive/30 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            submitRelease.mutate();
          }}
        >
          <div>
            <h2 className="text-lg font-semibold">Submit the exact tested build</h2>
            <p className="text-sm text-muted-foreground">
              This promotes an existing TestFlight or Play Internal build. It never compiles a
              different binary.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Store">
              <select
                value={releasePlatform}
                onChange={(event) => setReleasePlatform(event.target.value as "ios" | "android")}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="android">Google Play</option>
                <option value="ios">Apple App Store</option>
              </select>
            </Field>
            <Field label="Tested build number" hint="TestFlight build number or Play version code.">
              <input
                required
                inputMode="numeric"
                value={testedBuildNumber}
                onChange={(event) => setTestedBuildNumber(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>
            <Field label="Tested commit SHA" hint="Use the SHA shown on the internal build.">
              <input
                required
                value={commitSha}
                onChange={(event) => setCommitSha(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>
            <Field
              label={`Type SUBMIT ${apps.find((app) => app.id === appId)?.slug ?? "app-slug"}`}
            >
              <input
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>
          </div>
          <Field
            label="Real-device QA evidence"
            hint="Include devices, OS versions, roles and critical journeys tested."
          >
            <textarea
              required
              rows={4}
              value={qaNotes}
              onChange={(event) => setQaNotes(event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
          <button
            type="submit"
            disabled={submitRelease.isPending}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
          >
            {submitRelease.isPending ? "Submitting…" : "Queue protected store submission"}
          </button>
        </form>
      ) : null}

      {isLoading ? <LoadingState label="Loading build history…" /> : null}
      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : null}
      {!isLoading && !(jobs ?? []).length ? (
        <EmptyState
          title="No builds yet"
          description="Queue the first internal build for this role app."
        />
      ) : null}

      <div className="space-y-2">
        {(jobs ?? []).map((job) => (
          <article
            key={job.id}
            className="panel flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm"
          >
            <StatusPill tone={statusTone(job.status)}>{job.status}</StatusPill>
            <span className="font-medium capitalize">{job.platform}</span>
            <span className="text-muted-foreground capitalize">{job.destination}</span>
            <span className="ident">
              {job.source_sha ? job.source_sha.slice(0, 12) : "branch head"}
            </span>
            <span className="text-muted-foreground">
              {job.runner_job_id ?? "unassigned runner"}
            </span>
            <span className="text-muted-foreground">
              {new Date(job.requested_at).toLocaleString("en-GB")}
            </span>
            {job.runner_url ? (
              <a href={job.runner_url} className="underline underline-offset-4">
                Artefact
              </a>
            ) : null}
            {job.failure_summary ? (
              <span className="w-full text-destructive">{job.failure_summary}</span>
            ) : null}
          </article>
        ))}
      </div>

      {approvals.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Store submission approvals</h2>
          {approvals.map((approval) => (
            <article
              key={approval.id}
              className="panel flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm"
            >
              <StatusPill tone={statusTone(approval.status)}>{approval.status}</StatusPill>
              <span className="font-medium capitalize">{approval.platform}</span>
              <span>tested build {approval.tested_build_number}</span>
              <span className="ident">{approval.source_sha.slice(0, 12)}</span>
              <span className="text-muted-foreground">
                {new Date(approval.approved_at).toLocaleString("en-GB")}
              </span>
              {approval.workflow_url ? (
                <a href={approval.workflow_url} className="underline underline-offset-4">
                  Workflow
                </a>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
