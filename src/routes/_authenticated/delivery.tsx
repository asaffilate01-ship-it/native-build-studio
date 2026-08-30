import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApps } from "@/hooks/useApps";
import { canEditApps, useOrg } from "@/hooks/useOrg";
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
} from "@/components/control-plane/primitives";

export const Route = createFileRoute("/_authenticated/delivery")({
  head: () => ({
    meta: [
      { title: "Update delivery — Native Factory Control Plane" },
      {
        name: "description",
        content:
          "Map source repositories to role apps, keep automatic internal-test uploads on every successful web build, and record the optional live-update channel.",
      },
      { property: "og:title", content: "Update delivery — Native Factory Control Plane" },
      {
        property: "og:description",
        content: "Successful web builds dispatch native jobs; production release stays manual.",
      },
    ],
  }),
  component: DeliveryPage,
});

function DeliveryPage() {
  const { currentOrgId, role } = useOrg();
  const queryClient = useQueryClient();
  const { data: apps = [] } = useApps(currentOrgId);
  const [sourceRepo, setSourceRepo] = useState("");
  const [sourceRef, setSourceRef] = useState("main");
  const [selected, setSelected] = useState<string[]>([]);
  const [autoUpload, setAutoUpload] = useState(true);
  const [bridgeInstalled, setBridgeInstalled] = useState(false);
  const [appflowChannel, setAppflowChannel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const {
    data: mappings,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["delivery", currentOrgId],
    enabled: Boolean(currentOrgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("update_delivery")
        .select("*")
        .eq("org_id", currentOrgId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!selected.length)
        throw new Error("Select at least one role app for this source repository.");
      const { error } = await supabase.from("update_delivery").insert({
        org_id: currentOrgId!,
        source_repo: sourceRepo.trim(),
        source_ref: sourceRef.trim() || "main",
        app_ids: selected,
        auto_upload: autoUpload,
        bridge_installed: bridgeInstalled,
        appflow_channel: appflowChannel.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setFormError(null);
      setSourceRepo("");
      setSelected([]);
      setAppflowChannel("");
      void queryClient.invalidateQueries({ queryKey: ["delivery", currentOrgId] });
    },
    onError: (mutationError: Error) => setFormError(mutationError.message),
  });

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) =>
      on ? [...new Set([...prev, id])] : prev.filter((value) => value !== id),
    );

  return (
    <>
      <PageHeader
        title="Update delivery"
        description="Every push builds the web bundle first. Only a successful build dispatches native jobs, and each mapped role app receives its own runtime role, permanent ID and signed internal-test upload. Nothing here releases to production."
      />

      {canEditApps(role) ? (
        <form
          className="panel space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="text-lg font-semibold">Map a source repository</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source repository" hint="owner/repo containing the Lovable web app.">
              <input
                required
                value={sourceRepo}
                onChange={(event) => setSourceRepo(event.target.value)}
                placeholder="your-org/your-lovable-app"
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>
            <Field label="Branch or ref">
              <input
                value={sourceRef}
                onChange={(event) => setSourceRef(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Role apps built from this repository</legend>
            {apps.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {apps.map((app) => (
                  <label key={app.id} className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(app.id)}
                      onChange={(event) => toggle(app.id, event.target.checked)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    <span>
                      {app.display_name} <span className="ident">{app.android_package}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Add role apps in Portfolio first.</p>
            )}
          </fieldset>

          <div className="space-y-2 border-t border-border pt-4">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={autoUpload}
                onChange={(event) => setAutoUpload(event.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Automatically upload every successful change to TestFlight and Play Internal Testing
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={bridgeInstalled}
                onChange={(event) => setBridgeInstalled(event.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Delivery bridge installed in the source repository
            </label>
          </div>

          <Field
            label="Live web update channel (optional)"
            hint="Web-layer commits only. New plugins, permissions, native SDKs, icons or IDs require a new signed store build."
          >
            <input
              value={appflowChannel}
              onChange={(event) => setAppflowChannel(event.target.value)}
              placeholder="production-web"
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
          </Field>

          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save mapping"}
          </button>
        </form>
      ) : null}

      {isLoading ? <LoadingState /> : null}
      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : null}
      {!isLoading && !(mappings ?? []).length ? (
        <EmptyState
          title="No delivery mappings"
          description="Map a source repository to its role apps."
        />
      ) : null}

      <div className="space-y-2">
        {(mappings ?? []).map((mapping) => {
          const ids = Array.isArray(mapping.app_ids) ? (mapping.app_ids as string[]) : [];
          const names = ids
            .map((id) => apps.find((app) => app.id === id)?.display_name ?? id)
            .join(", ");
          return (
            <article key={mapping.id} className="panel space-y-1 p-4 text-sm">
              <p className="font-medium">
                <span className="ident">{mapping.source_repo}</span> @ {mapping.source_ref}
              </p>
              <p className="text-muted-foreground">Role apps: {names || "none"}</p>
              <p className="text-muted-foreground">
                Auto internal upload: {mapping.auto_upload ? "on" : "off"} · Bridge:{" "}
                {mapping.bridge_installed ? "installed" : "not installed"}
                {mapping.appflow_channel ? ` · Live channel: ${mapping.appflow_channel}` : ""}
              </p>
            </article>
          );
        })}
      </div>
    </>
  );
}
