import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useApps, type NativeApp } from "@/hooks/useApps";
import { canEditApps, canQueueBuilds, useOrg } from "@/hooks/useOrg";
import { AppPicker } from "@/components/control-plane/AppPicker";
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/control-plane/primitives";
import { queueBuild } from "@/lib/control-plane.functions";

export const Route = createFileRoute("/_authenticated/launchpad")({
  head: () => ({
    meta: [
      { title: "Launchpad — Native Factory Control Plane" },
      {
        name: "description",
        content:
          "Guided source, identity, signing, asset, preflight and build setup for every native role app.",
      },
    ],
  }),
  component: LaunchpadPage,
});

type Tab = "source" | "accounts" | "assets" | "preflight";
type Platform = "android" | "ios" | "all";
type Connection = {
  id: string;
  provider: string;
  status: string;
  account_name: string;
  account_email: string;
  external_id: string;
  key_id: string;
  issuer_id: string;
  service_account_email: string;
  environment_name: string;
  notes: string;
};

const tabs: Array<{ id: Tab; label: string; detail: string }> = [
  { id: "source", label: "1. App setup", detail: "Source, website and permanent IDs" },
  { id: "accounts", label: "2. Store accounts", detail: "Apple, Google and protected secrets" },
  {
    id: "assets",
    label: "3. Upload assets",
    detail: "Icons, splash, screenshots and service files",
  },
  {
    id: "preflight",
    label: "4. Check & run",
    detail: "Resolve blockers and send to internal testing",
  },
];

const capabilityOptions = [
  ["camera", "Camera"],
  ["filesystem", "Files"],
  ["network", "Network status"],
  ["preferences", "Device preferences"],
  ["push", "Push notifications"],
  ["share", "Native share"],
  ["browser", "In-app browser"],
] as const;

const assetRequirements = [
  {
    type: "app_icon",
    title: "App icon",
    help: "1024 × 1024 PNG, square, no transparency. The factory generates platform sizes.",
    accept: "image/png",
    multiple: false,
  },
  {
    type: "splash",
    title: "Launch artwork",
    help: "2732 × 2732 PNG with the important artwork centred and generous safe space.",
    accept: "image/png",
    multiple: false,
  },
  {
    type: "apple_screenshot",
    title: "Apple screenshots",
    help: "Upload approved, real in-app screenshots. Add each required device size as a separate file.",
    accept: "image/png,image/jpeg",
    multiple: true,
  },
  {
    type: "google_screenshot",
    title: "Google screenshots",
    help: "Phone and tablet screenshots for the Play listing.",
    accept: "image/png,image/jpeg",
    multiple: true,
  },
  {
    type: "google_feature_graphic",
    title: "Play feature graphic",
    help: "1024 × 500 PNG or JPEG. Required for a polished Google Play listing.",
    accept: "image/png,image/jpeg",
    multiple: false,
  },
  {
    type: "firebase_android",
    title: "Firebase Android config",
    help: "google-services.json, needed only when this app uses push notifications.",
    accept: "application/json,.json",
    multiple: false,
  },
] as const;

function safeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function imageDimensions(file: File) {
  return await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const source = new Image();
    source.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: source.naturalWidth, height: source.naturalHeight });
    };
    source.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} is not a readable image.`));
    };
    source.src = url;
  });
}

async function validateAsset(type: string, file: File, app: NativeApp) {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} is larger than 20 MB.`);
  if (
    [
      "app_icon",
      "splash",
      "apple_screenshot",
      "google_screenshot",
      "google_feature_graphic",
    ].includes(type)
  ) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      throw new Error(`${file.name} must be a PNG or JPEG image.`);
    }
    const size = await imageDimensions(file);
    if (type === "app_icon" && (size.width !== 1024 || size.height !== 1024)) {
      throw new Error(`${file.name} must be exactly 1024 × 1024 pixels.`);
    }
    if (type === "splash" && (size.width !== 2732 || size.height !== 2732)) {
      throw new Error(`${file.name} must be exactly 2732 × 2732 pixels.`);
    }
    if (type === "google_feature_graphic" && (size.width !== 1024 || size.height !== 500)) {
      throw new Error(`${file.name} must be exactly 1024 × 500 pixels.`);
    }
  }
  if (type === "firebase_android") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error(`${file.name} is not valid JSON.`);
    }
    const firebase = parsed as {
      client?: Array<{ client_info?: { android_client_info?: { package_name?: string } } }>;
    };
    const packages = (firebase.client ?? [])
      .map((item) => item.client_info?.android_client_info?.package_name)
      .filter(Boolean);
    if (!packages.includes(app.android_package)) {
      throw new Error(
        `${file.name} does not contain Android package ${app.android_package}. Download the config for this exact app from Firebase.`,
      );
    }
  }
}

function appCapabilities(app: NativeApp | undefined) {
  return Array.isArray(app?.capabilities)
    ? app.capabilities.filter((item): item is string => typeof item === "string")
    : [];
}

function LaunchpadPage() {
  const { currentOrgId, role, user } = useOrg();
  const queryClient = useQueryClient();
  const {
    data: apps = [],
    isLoading: appsLoading,
    error: appsError,
    refetch: refetchApps,
  } = useApps(currentOrgId);
  const [appId, setAppId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("source");

  useEffect(() => {
    if (!appId && apps.length) setAppId(apps[0]!.id);
    if (appId && apps.length && !apps.some((app) => app.id === appId)) setAppId(apps[0]!.id);
  }, [apps, appId]);

  const app = apps.find((item) => item.id === appId);
  const setup = useQuery({
    queryKey: ["launchpad", appId],
    enabled: Boolean(appId && currentOrgId),
    queryFn: async () => {
      const [connections, assets, listing, readiness, deliveries, jobs] = await Promise.all([
        supabase.from("app_connections").select("*").eq("app_id", appId!),
        supabase
          .from("app_assets")
          .select("*")
          .eq("app_id", appId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("store_listings")
          .select("*")
          .eq("app_id", appId!)
          .eq("locale", "en-GB")
          .maybeSingle(),
        supabase.from("readiness_checks").select("state").eq("app_id", appId!),
        supabase.from("update_delivery").select("*").eq("org_id", currentOrgId!),
        supabase
          .from("native_build_jobs")
          .select("*")
          .eq("app_id", appId!)
          .order("requested_at", { ascending: false })
          .limit(1),
      ]);
      const firstError = [
        connections.error,
        assets.error,
        listing.error,
        readiness.error,
        deliveries.error,
        jobs.error,
      ].find(Boolean);
      if (firstError) throw new Error(firstError.message);
      return {
        connections: (connections.data ?? []) as Connection[],
        assets: assets.data ?? [],
        listing: listing.data,
        readiness: readiness.data ?? [],
        deliveries: deliveries.data ?? [],
        latestJob: jobs.data?.[0] ?? null,
      };
    },
  });

  const score = useMemo(() => {
    if (!app || !setup.data)
      return {
        done: 0,
        total: 8,
        items: [] as Array<{ label: string; ok: boolean; route?: string }>,
      };
    const apple = setup.data.connections.find((item) => item.provider === "apple");
    const google = setup.data.connections.find((item) => item.provider === "google");
    const assetTypes = new Set(setup.data.assets.map((item) => item.asset_type));
    const listing = setup.data.listing;
    const checks = setup.data.readiness;
    const mapped = setup.data.deliveries.some((item) => {
      const ids = Array.isArray(item.app_ids) ? item.app_ids : [];
      return ids.includes(app.id) && item.bridge_installed;
    });
    const items = [
      {
        label: "Source and live website",
        ok: Boolean(app.source_repo && app.source_ref && app.live_url),
      },
      {
        label: "Permanent iOS and Android IDs",
        ok: Boolean(app.ios_bundle_id && app.android_package),
      },
      {
        label: "Apple signing connection",
        ok: apple?.status === "verified" || apple?.status === "secrets_added",
      },
      {
        label: "Google signing connection",
        ok: google?.status === "verified" || google?.status === "secrets_added",
      },
      {
        label: "Icon and launch artwork",
        ok: assetTypes.has("app_icon") && assetTypes.has("splash"),
      },
      {
        label: "Store listing core fields",
        ok: Boolean(
          listing?.title &&
          listing?.short_description &&
          listing?.full_description &&
          listing?.privacy_url &&
          listing?.support_url,
        ),
        route: "/listing",
      },
      {
        label: "Capacitor readiness checklist",
        ok:
          checks.length >= 15 &&
          checks.every((item) => ["done", "not_applicable"].includes(item.state)),
        route: "/readiness",
      },
      { label: "Git/Lovable update bridge", ok: mapped, route: "/delivery" },
    ];
    return { done: items.filter((item) => item.ok).length, total: items.length, items };
  }, [app, setup.data]);

  if (appsLoading) return <LoadingState label="Opening launchpad…" />;
  if (appsError)
    return <ErrorState message={appsError.message} onRetry={() => void refetchApps()} />;
  if (!apps.length) {
    return (
      <>
        <PageHeader
          title="Launchpad"
          description="Create the first role app, then the launchpad will guide its source, accounts, assets, testing and release setup."
        />
        <EmptyState
          title="Start with a role app"
          description="A suite can contain Customer, Driver, Kitchen, Admin or any other separately installed app. Each receives its own permanent store identity."
          action={
            <Link
              to="/portfolio"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Add your first role app
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Launchpad"
        description="One guided workspace for everything needed to turn a Capacitor-ready Lovable project into signed internal-test builds. Sensitive signing files stay in GitHub Environments."
        actions={
          <Link
            to="/portfolio"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          >
            Add another role app
          </Link>
        }
      />

      <section className="panel overflow-hidden">
        <div className="grid gap-5 border-b border-border p-5 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Current role app
            </p>
            <div className="mt-2 max-w-xl">
              <AppPicker apps={apps} value={appId} onChange={setAppId} />
            </div>
          </div>
          <div className="min-w-44">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Setup progress</span>
              <span>
                {score.done}/{score.total}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(score.done / score.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
        <nav aria-label="Launch setup stages" className="grid md:grid-cols-4">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`border-b border-border px-4 py-4 text-left transition-colors md:border-b-0 md:border-r ${tab === item.id ? "bg-primary/10" : "hover:bg-accent"}`}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span>
            </button>
          ))}
        </nav>
      </section>

      {setup.isLoading ? <LoadingState label="Loading app setup…" /> : null}
      {setup.error ? (
        <ErrorState message={setup.error.message} onRetry={() => void setup.refetch()} />
      ) : null}
      {app && setup.data && tab === "source" ? (
        <SourcePanel app={app} editable={canEditApps(role)} />
      ) : null}
      {app && setup.data && tab === "accounts" ? (
        <AccountsPanel
          app={app}
          connections={setup.data.connections}
          editable={canQueueBuilds(role)}
          userId={user!.id}
        />
      ) : null}
      {app && setup.data && tab === "assets" ? (
        <AssetsPanel
          app={app}
          assets={setup.data.assets}
          orgId={currentOrgId!}
          userId={user!.id}
          editable={canEditApps(role)}
        />
      ) : null}
      {app && setup.data && tab === "preflight" ? (
        <PreflightPanel
          app={app}
          score={score}
          latestJob={setup.data.latestJob}
          canRun={canQueueBuilds(role)}
        />
      ) : null}
    </>
  );
}

function SourcePanel({ app, editable }: { app: NativeApp; editable: boolean }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(() => ({
    display_name: app.display_name,
    public_brand: app.public_brand,
    legal_owner: app.legal_owner,
    suite: app.suite,
    app_role: app.app_role,
    source_repo: app.source_repo,
    source_ref: app.source_ref,
    live_url: app.live_url,
    ios_bundle_id: app.ios_bundle_id,
    android_package: app.android_package,
    package_manager: app.package_manager,
    install_command: app.install_command,
    build_command: app.build_command,
    web_dir: app.web_dir,
    version: app.version,
    build_number: String(app.build_number),
    runner: app.runner,
    capabilities: appCapabilities(app),
  }));

  useEffect(() => {
    setForm({
      display_name: app.display_name,
      public_brand: app.public_brand,
      legal_owner: app.legal_owner,
      suite: app.suite,
      app_role: app.app_role,
      source_repo: app.source_repo,
      source_ref: app.source_ref,
      live_url: app.live_url,
      ios_bundle_id: app.ios_bundle_id,
      android_package: app.android_package,
      package_manager: app.package_manager,
      install_command: app.install_command,
      build_command: app.build_command,
      web_dir: app.web_dir,
      version: app.version,
      build_number: String(app.build_number),
      runner: app.runner,
      capabilities: appCapabilities(app),
    });
  }, [app]);

  const save = useMutation({
    mutationFn: async () => {
      if (app.engine === "capacitor" && form.ios_bundle_id !== form.android_package) {
        throw new Error(
          "This Capacitor factory uses one permanent app ID on both platforms. Enter the same value for iOS and Android.",
        );
      }
      if (form.live_url && !form.live_url.startsWith("https://"))
        throw new Error("Live website URL must use HTTPS.");
      const { error } = await supabase
        .from("native_apps")
        .update({
          ...form,
          build_number: Number(form.build_number),
          capabilities: form.capabilities,
          github_environment: app.github_environment || app.slug,
        })
        .eq("id", app.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["apps"] });
      void queryClient.invalidateQueries({ queryKey: ["launchpad", app.id] });
    },
  });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const toggleCapability = (capability: string, checked: boolean) =>
    setForm((previous) => ({
      ...previous,
      capabilities: checked
        ? [...new Set([...previous.capabilities, capability])]
        : previous.capabilities.filter((item) => item !== capability),
    }));

  return (
    <form
      className="panel space-y-6 p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">App source and identity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These values drive the generated Capacitor wrapper. Bundle/package IDs become permanent
            after store creation.
          </p>
        </div>
        <StatusPill tone="info">
          {app.engine} · {app.runner}
        </StatusPill>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Display name">
          <input
            required
            disabled={!editable}
            value={form.display_name}
            onChange={(e) => set("display_name")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Public brand">
          <input
            disabled={!editable}
            value={form.public_brand}
            onChange={(e) => set("public_brand")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Legal developer account owner">
          <input
            disabled={!editable}
            value={form.legal_owner}
            onChange={(e) => set("legal_owner")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Suite" hint="Shared by Customer, Driver, Kitchen, etc.">
          <input
            required
            disabled={!editable}
            value={form.suite}
            onChange={(e) => set("suite")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </Field>
        <Field label="Role">
          <input
            required
            disabled={!editable}
            value={form.app_role}
            onChange={(e) => set("app_role")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Build runner">
          <select
            disabled={!editable}
            value={form.runner}
            onChange={(e) => set("runner")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="github-macos">GitHub hosted macOS</option>
            <option value="mac">Own Mac mini runner</option>
            <option value="eas">EAS (Expo apps only)</option>
          </select>
        </Field>
        <Field label="GitHub repository" hint="owner/repository or an HTTPS Git URL">
          <input
            required
            disabled={!editable}
            value={form.source_repo}
            onChange={(e) => set("source_repo")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </Field>
        <Field label="Branch">
          <input
            required
            disabled={!editable}
            value={form.source_ref}
            onChange={(e) => set("source_ref")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </Field>
        <Field
          label="Live Lovable website"
          hint="Used for links and verification; wrapper builds embed dist by default."
        >
          <input
            required
            type="url"
            disabled={!editable}
            value={form.live_url}
            onChange={(e) => set("live_url")(e.target.value)}
            placeholder="https://app.example.co.uk"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="iOS bundle ID" hint="Permanent, e.g. uk.co.brand.customer">
          <input
            required
            disabled={!editable}
            value={form.ios_bundle_id}
            onChange={(e) => set("ios_bundle_id")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </Field>
        <Field label="Android package" hint="Use the same value for this Capacitor factory.">
          <input
            required
            disabled={!editable}
            value={form.android_package}
            onChange={(e) => set("android_package")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </Field>
        <Field label="Version">
          <input
            required
            disabled={!editable}
            value={form.version}
            onChange={(e) => set("version")(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </Field>
      </div>

      <details className="rounded-md border border-border bg-background/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Advanced web build settings
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Package manager">
            <select
              disabled={!editable}
              value={form.package_manager}
              onChange={(e) => set("package_manager")(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option>bun</option>
              <option>npm</option>
              <option>pnpm</option>
              <option>yarn</option>
            </select>
          </Field>
          <Field label="Install command">
            <input
              disabled={!editable}
              value={form.install_command}
              onChange={(e) => set("install_command")(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
          </Field>
          <Field label="Build command">
            <input
              disabled={!editable}
              value={form.build_command}
              onChange={(e) => set("build_command")(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
          </Field>
          <Field label="Output folder">
            <input
              disabled={!editable}
              value={form.web_dir}
              onChange={(e) => set("web_dir")(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
          </Field>
        </div>
      </details>

      <fieldset>
        <legend className="text-sm font-semibold">Native capabilities</legend>
        <p className="mt-1 text-xs text-muted-foreground">
          The factory installs only the Capacitor plugins this role app requires.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {capabilityOptions.map(([value, label]) => (
            <label
              key={value}
              className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                disabled={!editable}
                checked={form.capabilities.includes(value)}
                onChange={(event) => toggleCapability(value, event.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {save.error ? (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      ) : null}
      {saved && !save.error ? (
        <p role="status" className="text-sm text-success">
          App setup saved. The next build will hydrate these values automatically.
        </p>
      ) : null}
      {editable ? (
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : "Save app setup"}
        </button>
      ) : null}
    </form>
  );
}

function AccountsPanel({
  app,
  connections,
  editable,
  userId,
}: {
  app: NativeApp;
  connections: Connection[];
  editable: boolean;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const apple = connections.find((item) => item.provider === "apple");
  const google = connections.find((item) => item.provider === "google");
  return (
    <div className="space-y-4">
      <section className="panel border-info/30 bg-info/5 p-5">
        <h2 className="text-lg font-semibold">Signing keys never go into this form</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Enter non-secret IDs here so the factory can validate the app. Add private keys,
          service-account JSON and keystores directly to the protected GitHub Environment named{" "}
          <span className="ident">{app.github_environment || app.slug}</span>. This keeps
          credentials out of browser history, Supabase rows and logs.
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ConnectionCard
          provider="apple"
          title="Apple Developer + App Store Connect"
          app={app}
          current={apple}
          editable={editable}
          userId={userId}
          fields={[
            [
              "account_name",
              "Legal account / seller name",
              "The brand organisation shown as the developer",
            ],
            ["account_email", "Account email", "Owner or release contact"],
            ["external_id", "Apple Team ID", "10-character team identifier"],
            ["issuer_id", "API issuer ID", "App Store Connect → Users and Access → Integrations"],
            ["key_id", "API key ID", "The ID paired with the .p8 key"],
          ]}
          secrets={[
            "APPLE_KEY_ID",
            "APPLE_ISSUER_ID",
            "APPLE_PRIVATE_KEY_B64",
            "MATCH_GIT_URL",
            "MATCH_REPO_TOKEN",
            "MATCH_PASSWORD",
          ]}
        />
        <ConnectionCard
          provider="google"
          title="Google Play Console"
          app={app}
          current={google}
          editable={editable}
          userId={userId}
          fields={[
            ["account_name", "Developer name", "The brand name shown on Google Play"],
            ["account_email", "Developer account email", "Owner or release contact"],
            ["external_id", "Play developer account ID", "Shown in Play Console account details"],
            [
              "service_account_email",
              "Service-account email",
              "Grant Release Manager access in Play Console",
            ],
          ]}
          secrets={[
            "GOOGLE_SERVICE_ACCOUNT_B64",
            "ANDROID_KEYSTORE_B64",
            "ANDROID_KEYSTORE_PASSWORD",
            "ANDROID_KEY_ALIAS",
            "ANDROID_KEY_PASSWORD",
          ]}
        />
      </div>
      <section className="panel p-5">
        <h3 className="font-semibold">Where the brand ownership appears</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          The public developer or seller name comes from each brand’s Apple/Google account.{" "}
          <span className="ident">{app.ios_bundle_id}</span> is only the app’s permanent technical
          identity; it does not make your central factory the seller.
        </p>
      </section>
    </div>
  );
}

function ConnectionCard({
  provider,
  title,
  app,
  current,
  editable,
  userId,
  fields,
  secrets,
}: {
  provider: "apple" | "google";
  title: string;
  app: NativeApp;
  current: Connection | undefined;
  editable: boolean;
  userId: string;
  fields: Array<[keyof Connection, string, string]>;
  secrets: string[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(([key]) => [key, current?.[key] ?? ""])),
  );
  const [confirmed, setConfirmed] = useState(
    current?.status === "secrets_added" || current?.status === "verified",
  );
  useEffect(() => {
    setForm(Object.fromEntries(fields.map(([key]) => [key, current?.[key] ?? ""])));
    setConfirmed(current?.status === "secrets_added" || current?.status === "verified");
  }, [current, fields]);
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        app_id: app.id,
        org_id: app.org_id,
        provider,
        ...form,
        environment_name: app.github_environment || app.slug,
        secret_names: secrets,
        status: confirmed ? "secrets_added" : "details_added",
        verified_by: current?.status === "verified" ? userId : null,
      };
      const { error } = await supabase
        .from("app_connections")
        .upsert(payload, { onConflict: "app_id,provider" });
      if (error) throw new Error(error.message);
      const appPatch =
        provider === "apple"
          ? { apple_team_id: form.external_id ?? "" }
          : { google_developer_name: form.account_name ?? "" };
      const { error: appError } = await supabase
        .from("native_apps")
        .update(appPatch)
        .eq("id", app.id);
      if (appError) throw new Error(appError.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["launchpad", app.id] });
      void queryClient.invalidateQueries({ queryKey: ["apps"] });
    },
  });
  return (
    <form
      className="panel space-y-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{provider}</p>
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <StatusPill
          tone={current?.status === "verified" ? "success" : confirmed ? "info" : "warning"}
        >
          {current?.status?.replaceAll("_", " ") ?? "not started"}
        </StatusPill>
      </div>
      {fields.map(([key, label, hint]) => (
        <Field key={key} label={label} hint={hint}>
          <input
            disabled={!editable}
            value={form[key] ?? ""}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, [key]: event.target.value }))
            }
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
      ))}
      <div className="rounded-md border border-border bg-background/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Required GitHub secrets
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {secrets.map((secret) => (
            <code
              key={secret}
              className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground"
            >
              {secret}
            </code>
          ))}
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          disabled={!editable}
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
        />
        <span>
          I confirm the secrets above have been added to the protected{" "}
          <span className="ident">{app.github_environment || app.slug}</span> GitHub Environment.
        </span>
      </label>
      {save.error ? (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      ) : null}
      {editable ? (
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : "Save connection"}
        </button>
      ) : null}
    </form>
  );
}

function AssetsPanel({
  app,
  assets,
  orgId,
  userId,
  editable,
}: {
  app: NativeApp;
  assets: Array<{
    id: string;
    asset_type: string;
    original_name: string;
    storage_path: string;
    size_bytes: number;
    created_at: string;
  }>;
  orgId: string;
  userId: string;
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const upload = async (type: string, files: FileList | null) => {
    if (!files?.length) return;
    setUploading(type);
    setMessage(null);
    try {
      for (const file of Array.from(files)) {
        await validateAsset(type, file, app);
        const path = `${orgId}/${app.id}/${type}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error: storageError } = await supabase.storage
          .from("native-app-assets")
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (storageError) throw new Error(storageError.message);
        const { error: rowError } = await supabase.from("app_assets").insert({
          app_id: app.id,
          org_id: orgId,
          asset_type: type,
          storage_path: path,
          original_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          uploaded_by: userId,
        });
        if (rowError) {
          await supabase.storage.from("native-app-assets").remove([path]);
          throw new Error(rowError.message);
        }
      }
      setMessage(
        "Upload complete. The next build will fetch these files directly from protected storage.",
      );
      void queryClient.invalidateQueries({ queryKey: ["launchpad", app.id] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  };
  const openAsset = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("native-app-assets")
      .createSignedUrl(path, 60);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <h2 className="text-xl font-semibold">Upload once, reuse in every build</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Files are private and scoped to this organisation and role app. Uploading a newer icon or
          launch file makes it the active one for subsequent builds; earlier files remain as an
          audit trail.
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {assetRequirements.map((requirement) => {
          const uploaded = assets.filter((asset) => asset.asset_type === requirement.type);
          const needed =
            requirement.type === "firebase_android" && !appCapabilities(app).includes("push")
              ? false
              : true;
          return (
            <article key={requirement.type} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{requirement.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{requirement.help}</p>
                </div>
                <StatusPill tone={uploaded.length ? "success" : needed ? "warning" : "neutral"}>
                  {uploaded.length
                    ? `${uploaded.length} uploaded`
                    : needed
                      ? "required"
                      : "optional"}
                </StatusPill>
              </div>
              {editable ? (
                <label className="mt-4 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-border bg-background/40 px-4 py-5 text-center text-sm transition-colors hover:border-primary hover:bg-primary/5">
                  <input
                    type="file"
                    accept={requirement.accept}
                    multiple={requirement.multiple}
                    disabled={uploading !== null}
                    onChange={(event) => {
                      void upload(requirement.type, event.target.files);
                      event.currentTarget.value = "";
                    }}
                    className="sr-only"
                  />
                  <span>
                    {uploading === requirement.type
                      ? "Uploading…"
                      : uploaded.length && !requirement.multiple
                        ? "Upload replacement"
                        : "Choose file(s)"}
                  </span>
                </label>
              ) : null}
              {uploaded.length ? (
                <ul className="mt-3 space-y-2">
                  {uploaded.slice(0, 6).map((asset) => (
                    <li
                      key={asset.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-background/50 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate">{asset.original_name}</span>
                      <button
                        type="button"
                        onClick={() => void openAsset(asset.storage_path)}
                        className="shrink-0 underline underline-offset-4"
                      >
                        Preview
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
      {message ? (
        <p
          role="status"
          className={`panel p-4 text-sm ${message.toLowerCase().includes("fail") || message.toLowerCase().includes("larger") ? "text-destructive" : "text-success"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function PreflightPanel({
  app,
  score,
  latestJob,
  canRun,
}: {
  app: NativeApp;
  score: {
    done: number;
    total: number;
    items: Array<{ label: string; ok: boolean; route?: string }>;
  };
  latestJob: {
    status: string;
    platform: string;
    source_sha: string | null;
    requested_at: string;
    runner_url: string | null;
  } | null;
  canRun: boolean;
}) {
  const queryClient = useQueryClient();
  const dispatch = useServerFn(queueBuild);
  const [platform, setPlatform] = useState<Platform>("all");
  const [sha, setSha] = useState("");
  const run = useMutation({
    mutationFn: () =>
      dispatch({
        data: {
          appId: app.id,
          platform,
          submitToInternal: true,
          uploadMetadata: true,
          sourceSha: sha.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setSha("");
      void queryClient.invalidateQueries({ queryKey: ["launchpad", app.id] });
    },
  });
  const ready = score.done === score.total;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Automated preflight</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Complete every item before sending a signed build to testers.
            </p>
          </div>
          <StatusPill tone={ready ? "success" : "warning"}>
            {ready ? "Ready to build" : `${score.total - score.done} blockers`}
          </StatusPill>
        </div>
        <ul className="mt-5 divide-y divide-border rounded-md border border-border">
          {score.items.map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${item.ok ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}
                >
                  {item.ok ? "✓" : "!"}
                </span>
                {item.label}
              </span>
              {!item.ok && item.route ? (
                <Link to={item.route} className="text-xs underline underline-offset-4">
                  Open
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {item.ok ? "Complete" : "Required"}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Platforms">
            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value as Platform)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">iOS and Android</option>
              <option value="android">Android only</option>
              <option value="ios">iOS only</option>
            </select>
          </Field>
          <Field label="Exact commit SHA" hint="Optional. Blank builds the configured branch head.">
            <input
              value={sha}
              onChange={(event) => setSha(event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
          </Field>
        </div>
        {run.error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {run.error.message}
          </p>
        ) : null}
        {run.isSuccess ? (
          <p className="mt-3 text-sm text-success" role="status">
            Build queued. GitHub Actions will compile and upload to TestFlight and Play Internal
            Testing.
          </p>
        ) : null}
        <button
          type="button"
          disabled={!ready || !canRun || run.isPending}
          onClick={() => run.mutate()}
          className="mt-5 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {run.isPending ? "Queueing build…" : "Build and send to internal testing"}
        </button>
        {!canRun ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            An organisation owner or release owner must run signed builds.
          </p>
        ) : null}
      </section>
      <div className="space-y-4">
        <section className="panel p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest build</p>
          {latestJob ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize">{latestJob.platform}</span>
                <StatusPill
                  tone={
                    latestJob.status === "succeeded"
                      ? "success"
                      : latestJob.status === "failed"
                        ? "danger"
                        : "info"
                  }
                >
                  {latestJob.status}
                </StatusPill>
              </div>
              <p className="ident">{latestJob.source_sha?.slice(0, 12) ?? "branch head"}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(latestJob.requested_at).toLocaleString("en-GB")}
              </p>
              {latestJob.runner_url ? (
                <a
                  href={latestJob.runner_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm underline underline-offset-4"
                >
                  Open build runner
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No builds have run for this role app.
            </p>
          )}
        </section>
        <section className="panel p-5">
          <h3 className="font-semibold">Testing path</h3>
          <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1. Android:</span> Play Console
              internal-testing link, physical Android device or Firebase Test Lab.
            </li>
            <li>
              <span className="font-medium text-foreground">2. iOS:</span> TestFlight on real
              iPhone/iPad. Apple’s simulator cannot install a TestFlight build.
            </li>
            <li>
              <span className="font-medium text-foreground">3. Approval:</span> Record real-device
              QA, then promote the exact tested build from Build queue.
            </li>
          </ol>
        </section>
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/builds"
            className="rounded-md border border-border px-3 py-2 text-center text-sm hover:bg-accent"
          >
            Build history
          </Link>
          <Link
            to="/listing"
            className="rounded-md border border-border px-3 py-2 text-center text-sm hover:bg-accent"
          >
            Store listing
          </Link>
        </div>
      </div>
    </div>
  );
}
