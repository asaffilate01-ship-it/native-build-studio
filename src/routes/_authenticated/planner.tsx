import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useApps } from "@/hooks/useApps";
import { useOrg, canApprovePlans } from "@/hooks/useOrg";
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
import { decidePlan } from "@/lib/control-plane.functions";

export const Route = createFileRoute("/_authenticated/planner")({
  head: () => ({
    meta: [
      { title: "App planner — Native Factory Control Plane" },
      {
        name: "description",
        content:
          "Capture product context, review generated plan versions, track human-confirmation items and approve or supersede plans.",
      },
      { property: "og:title", content: "App planner — Native Factory Control Plane" },
      { property: "og:description", content: "Plan versions, comments and role-gated approval." },
    ],
  }),
  component: PlannerPage,
});

function PlannerPage() {
  const { currentOrgId, role, user } = useOrg();
  const queryClient = useQueryClient();
  const { data: apps = [], isLoading: appsLoading } = useApps(currentOrgId);
  const [appId, setAppId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [planMarkdown, setPlanMarkdown] = useState("");
  const [confirmations, setConfirmations] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const decide = useServerFn(decidePlan);

  useEffect(() => {
    if (!appId && apps.length) setAppId(apps[0]!.id);
  }, [apps, appId]);

  const { data: plans, isLoading, error, refetch } = useQuery({
    queryKey: ["plans", appId],
    enabled: Boolean(appId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("native_app_plans")
        .select("*")
        .eq("app_id", appId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const createPlan = useMutation({
    mutationFn: async () => {
      const items = confirmations
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const nextVersion = (plans?.length ?? 0) + 1;
      const { error } = await supabase.from("native_app_plans").insert({
        app_id: appId!,
        org_id: currentOrgId!,
        version: nextVersion,
        prompt,
        plan_markdown: planMarkdown,
        confirmation_items: items,
        status: planMarkdown.trim() ? "draft" : "prompt_ready",
        created_by: user!.id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setPrompt("");
      setPlanMarkdown("");
      setConfirmations("");
      void queryClient.invalidateQueries({ queryKey: ["plans", appId] });
    },
    onError: (mutationError: Error) => setActionError(mutationError.message),
  });

  const decision = useMutation({
    mutationFn: async ({ planId, status }: { planId: string; status: "approved" | "superseded" }) => {
      if (status === "approved" && !window.confirm("Approve this plan version as product owner?")) {
        throw new Error("Approval cancelled.");
      }
      await decide({ data: { planId, status } });
    },
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["plans", appId] });
    },
    onError: (mutationError: Error) => setActionError(mutationError.message),
  });

  if (appsLoading) return <LoadingState />;

  if (!apps.length) {
    return (
      <>
        <PageHeader title="App planner" description="Plan versions belong to a role app." />
        <EmptyState title="No role apps yet" description="Add a role app in Portfolio before planning." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="App planner"
        description="Capture product context, store the drafted plan and track the items a human must confirm. Drafting assistance is advisory only — approval is always a named human decision."
      />

      <AppPicker apps={apps} value={appId} onChange={setAppId} />

      <form
        className="panel space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          createPlan.mutate();
        }}
      >
        <h2 className="text-lg font-semibold">New plan version</h2>
        <Field label="Product context and prompt" hint="Goals, roles, native capabilities, constraints.">
          <textarea
            required
            rows={5}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Drafted plan (Markdown)" hint="Leave empty to store a prompt-ready version.">
          <textarea
            rows={8}
            value={planMarkdown}
            onChange={(event) => setPlanMarkdown(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </Field>
        <Field label="Human-confirmation items" hint="One per line: data practices, legal text, regulated claims.">
          <textarea
            rows={4}
            value={confirmations}
            onChange={(event) => setConfirmations(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <button
          type="submit"
          disabled={createPlan.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {createPlan.isPending ? "Saving…" : "Save plan version"}
        </button>
      </form>

      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      {isLoading ? <LoadingState label="Loading plan versions…" /> : null}
      {error ? <ErrorState message={(error as Error).message} onRetry={() => void refetch()} /> : null}

      {!isLoading && !error && !(plans ?? []).length ? (
        <EmptyState title="No plan versions" description="Save the first plan version for this role app." />
      ) : null}

      <div className="space-y-3">
        {(plans ?? []).map((plan) => {
          const items = Array.isArray(plan.confirmation_items) ? (plan.confirmation_items as string[]) : [];
          return (
            <article key={plan.id} className="panel space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Version {plan.version}</h3>
                <StatusPill tone={statusTone(plan.status)}>{plan.status.replace("_", " ")}</StatusPill>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{plan.prompt}</p>
              {plan.plan_markdown ? (
                <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-xs">
                  {plan.plan_markdown}
                </pre>
              ) : null}
              {items.length ? (
                <div>
                  <h4 className="text-sm font-medium">Requires human confirmation</h4>
                  <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                    {items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <PlanComments planId={plan.id} orgId={currentOrgId!} />

              {canApprovePlans(role) && plan.status !== "approved" ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => decision.mutate({ planId: plan.id, status: "approved" })}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => decision.mutate({ planId: plan.id, status: "superseded" })}
                    className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    Mark superseded
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}

function PlanComments({ planId, orgId }: { planId: string; orgId: string }) {
  const { user } = useOrg();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

  const { data: comments } = useQuery({
    queryKey: ["plan-comments", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_comments")
        .select("id, body, created_at, author_id")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("plan_comments")
        .insert({ plan_id: planId, org_id: orgId, author_id: user!.id, body });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["plan-comments", planId] });
    },
  });

  return (
    <div className="border-t border-border pt-3">
      <h4 className="text-sm font-medium">Comments</h4>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        {(comments ?? []).map((comment) => (
          <li key={comment.id}>
            <span className="ident">{new Date(comment.created_at).toLocaleString("en-GB")}</span> —{" "}
            {comment.body}
          </li>
        ))}
        {!(comments ?? []).length ? <li>No comments yet.</li> : null}
      </ul>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a comment"
          className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
          Comment
        </button>
      </form>
    </div>
  );
}
