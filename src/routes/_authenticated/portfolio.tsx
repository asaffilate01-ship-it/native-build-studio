import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, canEditApps } from "@/hooks/useOrg";
import { useApps } from "@/hooks/useApps";
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  StatusPill,
  statusTone,
} from "@/components/control-plane/primitives";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Native Factory Control Plane" },
      {
        name: "description",
        content: "Suites, role apps, permanent bundle IDs, source repositories and latest builds.",
      },
      { property: "og:title", content: "Portfolio — Native Factory Control Plane" },
      {
        property: "og:description",
        content: "Every role app in your suite, with its permanent identity.",
      },
    ],
  }),
  component: PortfolioPage,
});

const emptyForm = {
  suite: "",
  app_role: "customer",
  slug: "",
  display_name: "",
  source_repo: "",
  source_ref: "main",
  engine: "capacitor",
  runner: "github-macos",
  ios_bundle_id: "",
  android_package: "",
  credential_scope: "default",
  legal_owner: "",
  public_brand: "",
  apple_team_id: "",
  apple_app_id: "",
  google_developer_name: "",
};

function PortfolioPage() {
  const { currentOrgId, role } = useOrg();
  const queryClient = useQueryClient();
  const { data: apps, isLoading, error, refetch } = useApps(currentOrgId);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: latestBuilds } = useQuery({
    queryKey: ["latest-builds", currentOrgId],
    enabled: Boolean(currentOrgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("native_build_jobs")
        .select("app_id, status, platform, requested_at")
        .eq("org_id", currentOrgId!)
        .order("requested_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: readiness } = useQuery({
    queryKey: ["readiness-summary", currentOrgId],
    enabled: Boolean(currentOrgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("readiness_checks")
        .select("app_id, state")
        .eq("org_id", currentOrgId!);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = { ...form, org_id: currentOrgId! };
      const { error } = await supabase.from("native_apps").insert(payload);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setShowForm(false);
      setForm(emptyForm);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["apps"] });
    },
    onError: (mutationError: Error) => setFormError(mutationError.message),
  });

  const suites = useMemo(() => {
    const grouped = new Map<string, typeof apps>();
    (apps ?? []).forEach((app) => {
      const list = grouped.get(app.suite) ?? [];
      grouped.set(app.suite, [...(list ?? []), app]);
    });
    return [...grouped.entries()];
  }, [apps]);

  const set = (key: keyof typeof emptyForm) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Every suite and role app, with its permanent technical identity, source repository and latest build. Bundle and package IDs are permanent; they are not the public seller name."
        actions={
          canEditApps(role) ? (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {showForm ? "Cancel" : "Add role app"}
            </button>
          ) : null
        }
      />

      {showForm ? (
        <form
          className="panel space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="text-lg font-semibold">New role app</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Suite" hint="Reuse one suite across roles, e.g. example-platform.">
              <input
                required
                value={form.suite}
                onChange={(e) => set("suite")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Role" hint="customer, driver, kitchen…">
              <input
                required
                value={form.app_role}
                onChange={(e) => set("app_role")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Slug" hint="Lower case and hyphens, e.g. example-customer.">
              <input
                required
                value={form.slug}
                onChange={(e) => set("slug")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Display name">
              <input
                required
                value={form.display_name}
                onChange={(e) => set("display_name")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Source repository" hint="owner/repository">
              <input
                required
                value={form.source_repo}
                onChange={(e) => set("source_repo")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Branch">
              <input
                required
                value={form.source_ref}
                onChange={(e) => set("source_ref")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Engine">
              <select
                value={form.engine}
                onChange={(e) => set("engine")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="capacitor">Capacitor</option>
                <option value="expo">Expo</option>
              </select>
            </Field>
            <Field label="Runner">
              <select
                value={form.runner}
                onChange={(e) => set("runner")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="github-macos">GitHub-hosted macOS</option>
                <option value="mac">Self-managed Mac</option>
                <option value="eas">EAS Build</option>
              </select>
            </Field>
            <Field label="iOS bundle ID" hint="Permanent, e.g. uk.co.brand.customer">
              <input
                required
                value={form.ios_bundle_id}
                onChange={(e) => set("ios_bundle_id")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Android package" hint="Permanent, must match Play Console.">
              <input
                required
                value={form.android_package}
                onChange={(e) => set("android_package")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Legal owner" hint="The organisation that owns the developer accounts.">
              <input
                value={form.legal_owner}
                onChange={(e) => set("legal_owner")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Public brand">
              <input
                value={form.public_brand}
                onChange={(e) => set("public_brand")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Apple Team ID">
              <input
                value={form.apple_team_id}
                onChange={(e) => set("apple_team_id")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Apple App ID" hint="Numeric App Store Connect ID.">
              <input
                value={form.apple_app_id}
                onChange={(e) => set("apple_app_id")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Google developer name">
              <input
                value={form.google_developer_name}
                onChange={(e) => set("google_developer_name")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field
              label="Credential scope"
              hint="Which GitHub environment holds this app's secrets."
            >
              <input
                value={form.credential_scope}
                onChange={(e) => set("credential_scope")(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </Field>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {create.isPending ? "Saving…" : "Save role app"}
          </button>
        </form>
      ) : null}

      {isLoading ? <LoadingState label="Loading your portfolio…" /> : null}
      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : null}

      {!isLoading && !error && !suites.length ? (
        <EmptyState
          title="No role apps yet"
          description="Add the first role app for your suite. Reuse one suite across customer, driver and kitchen roles, each with its own permanent bundle and package ID."
        />
      ) : null}

      {suites.map(([suite, suiteApps]) => (
        <section key={suite} className="space-y-3">
          <h2 className="font-display text-lg font-semibold">
            {suite} <span className="ident">· {suiteApps?.length ?? 0} role app(s)</span>
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {(suiteApps ?? []).map((app) => {
              const build = (latestBuilds ?? []).find((b) => b.app_id === app.id);
              const checks = (readiness ?? []).filter((c) => c.app_id === app.id);
              const done = checks.filter(
                (c) => c.state === "done" || c.state === "not_applicable",
              ).length;
              return (
                <article key={app.id} className="panel flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{app.display_name}</h3>
                      <p className="ident">
                        {app.slug} · {app.app_role}
                      </p>
                    </div>
                    <StatusPill tone={app.active ? "success" : "neutral"}>
                      {app.active ? "Active" : "Inactive"}
                    </StatusPill>
                  </div>

                  <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">iOS bundle ID</dt>
                      <dd className="ident break-all text-foreground">{app.ios_bundle_id}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Android package</dt>
                      <dd className="ident break-all text-foreground">{app.android_package}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Source</dt>
                      <dd className="ident break-all text-foreground">
                        {app.source_repo}@{app.source_ref}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Brand owner</dt>
                      <dd className="text-foreground">{app.legal_owner || "Not recorded"}</dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <StatusPill
                      tone={checks.length && done === checks.length ? "success" : "warning"}
                    >
                      Readiness {checks.length ? `${done}/${checks.length}` : "not started"}
                    </StatusPill>
                    {build ? (
                      <StatusPill tone={statusTone(build.status)}>
                        Latest build {build.platform} · {build.status}
                      </StatusPill>
                    ) : (
                      <StatusPill>No builds yet</StatusPill>
                    )}
                    <Link
                      to="/builds"
                      className="ml-auto rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
                    >
                      Build queue
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
