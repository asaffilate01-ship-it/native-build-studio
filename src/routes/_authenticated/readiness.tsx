import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApps } from "@/hooks/useApps";
import { useOrg } from "@/hooks/useOrg";
import { AppPicker } from "@/components/control-plane/AppPicker";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
  statusTone,
} from "@/components/control-plane/primitives";

export const Route = createFileRoute("/_authenticated/readiness")({
  head: () => ({
    meta: [
      { title: "Capacitor readiness — Native Factory Control Plane" },
      {
        name: "description",
        content:
          "Track responsive layout, safe areas, keyboard behaviour, offline and auth restore, required links and native capabilities before wrapping.",
      },
      { property: "og:title", content: "Capacitor readiness — Native Factory Control Plane" },
      { property: "og:description", content: "The checklist a web build must pass before it is wrapped." },
    ],
  }),
  component: ReadinessPage,
});

const template = [
  { key: "responsive", label: "Responsive layout on phone and tablet widths", category: "Interface" },
  { key: "safe-areas", label: "Safe areas respected on notched devices", category: "Interface" },
  { key: "keyboard", label: "Keyboard does not obscure inputs or actions", category: "Interface" },
  { key: "no-hover-only", label: "No hover-only controls; touch targets at least 44px", category: "Interface" },
  { key: "offline", label: "Graceful offline and slow-network states", category: "Resilience" },
  { key: "auth-restore", label: "Session restores after background and relaunch", category: "Resilience" },
  { key: "deep-links", label: "External links and deep links behave correctly", category: "Resilience" },
  { key: "dist-build", label: "Clean build produces dist/index.html", category: "Build" },
  { key: "no-native-folders", label: "No generated ios/ or android/ directories committed", category: "Build" },
  { key: "support-url", label: "Support URL published and reachable", category: "Policy links" },
  { key: "privacy-url", label: "Privacy policy URL published and reachable", category: "Policy links" },
  { key: "deletion-url", label: "In-app account deletion route and URL published", category: "Policy links" },
  { key: "capabilities", label: "Native capabilities confirmed (camera, files, push)", category: "Native" },
  { key: "permissions", label: "Permission prompts include clear purpose strings", category: "Native" },
  { key: "icons", label: "Icons and launch screens supplied at required sizes", category: "Native" },
] as const;

const states = ["pending", "in_progress", "done", "not_applicable"] as const;
const stateLabels: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  not_applicable: "Not applicable",
};

function ReadinessPage() {
  const { currentOrgId } = useOrg();
  const queryClient = useQueryClient();
  const { data: apps = [], isLoading: appsLoading } = useApps(currentOrgId);
  const [appId, setAppId] = useState<string | null>(null);

  useEffect(() => {
    if (!appId && apps.length) setAppId(apps[0]!.id);
  }, [apps, appId]);

  const { data: checks, isLoading, error, refetch } = useQuery({
    queryKey: ["readiness", appId],
    enabled: Boolean(appId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("readiness_checks")
        .select("*")
        .eq("app_id", appId!)
        .order("category", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const seed = useMutation({
    mutationFn: async () => {
      const rows = template.map((item) => ({
        app_id: appId!,
        org_id: currentOrgId!,
        check_key: item.key,
        label: item.label,
        category: item.category,
      }));
      const { error } = await supabase.from("readiness_checks").upsert(rows, { onConflict: "app_id,check_key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["readiness", appId] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { state?: string; notes?: string } }) => {
      const { error } = await supabase.from("readiness_checks").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["readiness", appId] }),
  });

  if (appsLoading) return <LoadingState />;
  if (!apps.length) {
    return (
      <>
        <PageHeader title="Capacitor readiness" description="Readiness is tracked per role app." />
        <EmptyState title="No role apps yet" description="Add a role app in Portfolio first." />
      </>
    );
  }

  const done = (checks ?? []).filter((c) => c.state === "done" || c.state === "not_applicable").length;

  return (
    <>
      <PageHeader
        title="Capacitor readiness"
        description="Confirm the web build behaves like a native app before the factory generates native projects. Every item is a human judgement recorded against the role app."
        actions={
          <button
            type="button"
            onClick={() => seed.mutate()}
            disabled={seed.isPending}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
          >
            {checks?.length ? "Restore missing items" : "Create checklist"}
          </button>
        }
      />

      <AppPicker apps={apps} value={appId} onChange={setAppId} />

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} onRetry={() => void refetch()} /> : null}

      {!isLoading && !(checks ?? []).length ? (
        <EmptyState
          title="Checklist not created"
          description="Create the standard readiness checklist for this role app, then work through each item."
        />
      ) : null}

      {(checks ?? []).length ? (
        <>
          <p className="text-sm text-muted-foreground">
            {done} of {checks!.length} items cleared.
          </p>
          <div className="space-y-2">
            {checks!.map((check) => (
              <article key={check.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{check.category}</p>
                  <p className="font-medium">{check.label}</p>
                  <input
                    defaultValue={check.notes}
                    onBlur={(event) =>
                      event.target.value !== check.notes &&
                      update.mutate({ id: check.id, patch: { notes: event.target.value } })
                    }
                    placeholder="Evidence or notes"
                    className="mt-2 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={statusTone(check.state)}>{stateLabels[check.state]}</StatusPill>
                  <label className="sr-only" htmlFor={`state-${check.id}`}>
                    State for {check.label}
                  </label>
                  <select
                    id={`state-${check.id}`}
                    value={check.state}
                    onChange={(event) => update.mutate({ id: check.id, patch: { state: event.target.value } })}
                    className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                  >
                    {states.map((state) => (
                      <option key={state} value={state}>
                        {stateLabels[state]}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
