import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApps } from "@/hooks/useApps";
import { useOrg } from "@/hooks/useOrg";
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

export const Route = createFileRoute("/_authenticated/listing")({
  head: () => ({
    meta: [
      { title: "Store listing — Native Factory Control Plane" },
      {
        name: "description",
        content:
          "Per-locale store copy, support and privacy URLs, policy declarations, artwork inventory and submission status.",
      },
      { property: "og:title", content: "Store listing — Native Factory Control Plane" },
      { property: "og:description", content: "Everything a reviewer sees, prepared before hand-off." },
    ],
  }),
  component: ListingPage,
});

const declarationFields = [
  { key: "ads", label: "Contains advertising" },
  { key: "tracking", label: "Tracks users across apps or websites" },
  { key: "personal_data", label: "Collects personal data" },
  { key: "account_creation", label: "Requires account creation" },
  { key: "children", label: "Directed at children" },
  { key: "encryption", label: "Uses non-exempt encryption" },
  { key: "ugc", label: "Hosts user-generated content" },
  { key: "regulated", label: "Includes regulated features" },
] as const;

const artworkFields = [
  { key: "apple_screenshots", label: "Apple screenshots supplied" },
  { key: "google_screenshots", label: "Google screenshots supplied" },
  { key: "google_feature_graphic", label: "Google feature graphic supplied" },
] as const;

const textFields = [
  ["title", "Title"],
  ["subtitle", "Subtitle"],
  ["short_description", "Short description"],
  ["full_description", "Full description"],
  ["keywords", "Keywords"],
  ["promotional_text", "Promotional text"],
  ["release_notes", "Release notes"],
  ["support_url", "Support URL"],
  ["privacy_url", "Privacy URL"],
  ["account_deletion_url", "Account deletion URL"],
  ["marketing_url", "Marketing URL"],
  ["apple_category", "Apple category"],
  ["google_category", "Google category"],
  ["audience", "Audience"],
  ["reviewer_notes", "Reviewer notes"],
  ["contact_name", "Contact name"],
  ["contact_email", "Contact email"],
  ["contact_phone", "Contact phone"],
] as const;

const longFields = new Set(["full_description", "short_description", "reviewer_notes", "release_notes"]);

type Listing = Record<string, unknown> & { id: string };

function ListingPage() {
  const { currentOrgId } = useOrg();
  const queryClient = useQueryClient();
  const { data: apps = [], isLoading: appsLoading } = useApps(currentOrgId);
  const [appId, setAppId] = useState<string | null>(null);
  const [locale, setLocale] = useState("en-GB");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [declarations, setDeclarations] = useState<Record<string, boolean>>({});
  const [artwork, setArtwork] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!appId && apps.length) setAppId(apps[0]!.id);
  }, [apps, appId]);

  const { data: listing, isLoading, error, refetch } = useQuery({
    queryKey: ["listing", appId, locale],
    enabled: Boolean(appId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_listings")
        .select("*")
        .eq("app_id", appId!)
        .eq("locale", locale)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Listing | null) ?? null;
    },
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    textFields.forEach(([key]) => {
      next[key] = ((listing?.[key] as string) ?? "");
    });
    setDraft(next);
    setDeclarations((listing?.declarations as Record<string, boolean>) ?? {});
    setArtwork((listing?.artwork as Record<string, boolean>) ?? {});
  }, [listing]);

  const save = useMutation({
    mutationFn: async (submissionStatus?: string) => {
      const payload = {
        app_id: appId!,
        org_id: currentOrgId!,
        locale,
        ...draft,
        declarations,
        artwork,
        ...(submissionStatus ? { submission_status: submissionStatus } : {}),
      };
      const { error } = await supabase.from("store_listings").upsert(payload, { onConflict: "app_id,locale" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setSaveError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["listing", appId, locale] });
    },
    onError: (mutationError: Error) => setSaveError(mutationError.message),
  });

  const completeness = useMemo(() => {
    const filled = textFields.filter(([key]) => (draft[key] ?? "").trim()).length;
    return `${filled}/${textFields.length}`;
  }, [draft]);

  if (appsLoading) return <LoadingState />;
  if (!apps.length) {
    return (
      <>
        <PageHeader title="Store listing" description="Listings are recorded per role app and locale." />
        <EmptyState title="No role apps yet" description="Add a role app in Portfolio first." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Store listing"
        description="Copy, URLs, declarations and artwork for the hand-off pack. These switches prepare the submission; they do not replace Apple App Privacy or Play Data Safety, which must reflect real production behaviour."
        actions={
          <StatusPill tone={statusTone((listing?.submission_status as string) ?? "draft")}>
            {((listing?.submission_status as string) ?? "draft").replace("_", " ")}
          </StatusPill>
        }
      />

      <AppPicker apps={apps} value={appId} onChange={setAppId} />

      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <Field label="Locale" hint="One listing per locale.">
          <input
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          />
        </Field>
        <p className="text-sm text-muted-foreground">Copy fields completed: {completeness}</p>
      </div>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} onRetry={() => void refetch()} /> : null}

      <form
        className="panel space-y-5 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(undefined);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {textFields.map(([key, label]) => (
            <div key={key} className={longFields.has(key) ? "sm:col-span-2" : undefined}>
              <Field label={label}>
                {longFields.has(key) ? (
                  <textarea
                    rows={4}
                    value={draft[key] ?? ""}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                ) : (
                  <input
                    value={draft[key] ?? ""}
                    onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                )}
              </Field>
            </div>
          ))}
        </div>

        <fieldset className="space-y-2 border-t border-border pt-4">
          <legend className="text-sm font-semibold">Policy declarations</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {declarationFields.map((item) => (
              <label key={item.key} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(declarations[item.key])}
                  onChange={(event) =>
                    setDeclarations((prev) => ({ ...prev, [item.key]: event.target.checked }))
                  }
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2 border-t border-border pt-4">
          <legend className="text-sm font-semibold">Artwork inventory</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {artworkFields.map((item) => (
              <label key={item.key} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(artwork[item.key])}
                  onChange={(event) => setArtwork((prev) => ({ ...prev, [item.key]: event.target.checked }))}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>

        {saveError ? (
          <p className="text-sm text-destructive" role="alert">
            {saveError}
          </p>
        ) : null}
        {saved && !saveError ? (
          <p className="text-sm text-success" role="status">
            Listing saved.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save listing"}
          </button>
          <button
            type="button"
            onClick={() => save.mutate("ready")}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Mark ready for hand-off
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Record that a named human has submitted this listing for review?")) {
                save.mutate("submitted");
              }
            }}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Record submission
          </button>
        </div>
      </form>
    </>
  );
}
