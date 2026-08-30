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
import { queueBuild } from "@/lib/control-plane.functions";

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
      { property: "og:description", content: "Internal testing by default; production release stays a human decision." },
    ],
  }),
  component: BuildsPage,
});

function BuildsPage() {
  const { currentOrgId, role } = useOrg();
  const queryClient = useQueryClient();
  const { data: apps = [], isLoading: appsLoading } = useApps(currentOrgId);
  const [appId, setAppId] = useState<string | null>(null);
  const [platform, setPlatform] = useState("android");
  const [destination, setDestination] = useState("internal");
  const [commitSha, setCommitSha] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const queue = useServerFn(queueBuild);

  useEffect(() => {
    if (!appId && apps.length) setAppId(apps[0]!.id);
  }, [apps, appId]);

  const { data: jobs, isLoading, error, refetch } = useQuery({
    queryKey: ["builds", appId],
    enabled: Boolean(appId),
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("native_build_jobs")
        .select("*")
        .eq("app_id", appId!)
        .order("created_at", { ascending: false })
        .limit(50);
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
          destination,
          commitSha: commitSha.trim() || null,
          confirmation: destination === "production" ? confirmation : null,
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

      {canQueueBuilds(role) ? (
        <form
          className="panel space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <h2 className="text-lg font-semibold">Queue a build</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Platform">
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="all">Both</option>
              </select>
            </Field>
            <Field label="Destination" hint="Internal testing is the default and safest route.">
              <select
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="internal">Internal testing</option>
                <option value="production">Production hand-off</option>
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

          {destination === "production" ? (
            <Field
              label="Type RELEASE to confirm"
              hint="Production hand-off requires an explicit, named confirmation. Uploading is not releasing."
            >
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>
          ) : null}

          {actionError ? (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submit.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {submit.isPending ? "Queueing…" : "Queue build"}
          </button>
        </form>
      ) : (
        <p className="panel p-4 text-sm text-muted-foreground">
          Only owners and release owners can queue builds. You can still review build history below.
        </p>
      )}

      {isLoading ? <LoadingState label="Loading build history…" /> : null}
      {error ? <ErrorState message={(error as Error).message} onRetry={() => void refetch()} /> : null}
      {!isLoading && !(jobs ?? []).length ? (
        <EmptyState title="No builds yet" description="Queue the first internal build for this role app." />
      ) : null}

      <div className="space-y-2">
        {(jobs ?? []).map((job) => (
          <article key={job.id} className="panel flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
            <StatusPill tone={statusTone(job.status)}>{job.status}</StatusPill>
            <span className="font-medium capitalize">{job.platform}</span>
            <span className="text-muted-foreground capitalize">{job.destination}</span>
            <span className="ident">{job.commit_sha ? job.commit_sha.slice(0, 12) : "branch head"}</span>
            <span className="text-muted-foreground">{job.runner ?? "unassigned runner"}</span>
            <span className="text-muted-foreground">
              {new Date(job.created_at).toLocaleString("en-GB")}
            </span>
            {job.artifact_url ? (
              <a href={job.artifact_url} className="underline underline-offset-4">
                Artefact
              </a>
            ) : null}
            {job.error_message ? (
              <span className="w-full text-destructive">{job.error_message}</span>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
