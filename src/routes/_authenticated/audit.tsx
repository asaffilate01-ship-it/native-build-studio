import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/control-plane/primitives";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit — Native Factory Control Plane" },
      {
        name: "description",
        content:
          "An organisation-scoped record of who approved plans, queued builds and changed release-significant settings.",
      },
      { property: "og:title", content: "Audit — Native Factory Control Plane" },
      { property: "og:description", content: "Named accountability for every privileged action." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { currentOrgId } = useOrg();
  const [filter, setFilter] = useState("");

  const { data: events, isLoading, error, refetch } = useQuery({
    queryKey: ["audit", currentOrgId],
    enabled: Boolean(currentOrgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_events")
        .select("*")
        .eq("org_id", currentOrgId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const visible = (events ?? []).filter((event) => {
    if (!filter.trim()) return true;
    const needle = filter.toLowerCase();
    return (
      event.action.toLowerCase().includes(needle) ||
      event.target.toLowerCase().includes(needle) ||
      event.actor_email.toLowerCase().includes(needle)
    );
  });

  return (
    <>
      <PageHeader
        title="Audit"
        description="Privileged actions are written server-side, so the record cannot be edited from the browser."
      />

      <div className="panel p-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Filter</span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="action, target or person"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      {isLoading ? <LoadingState label="Loading audit events…" /> : null}
      {error ? <ErrorState message={(error as Error).message} onRetry={() => void refetch()} /> : null}
      {!isLoading && !visible.length ? (
        <EmptyState
          title="No audit events"
          description="Approvals, queued builds and release decisions will appear here."
        />
      ) : null}

      {visible.length ? (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((event) => (
                <tr key={event.id} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(event.created_at).toLocaleString("en-GB")}
                  </td>
                  <td className="px-4 py-3">{event.actor_email}</td>
                  <td className="px-4 py-3 font-medium">{event.action}</td>
                  <td className="px-4 py-3 text-muted-foreground">{event.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
