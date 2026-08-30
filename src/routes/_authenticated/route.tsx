import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { OrgProvider, useOrg } from "@/hooks/useOrg";
import { AppShell } from "@/components/control-plane/AppShell";
import { ErrorState, LoadingState } from "@/components/control-plane/primitives";
import { OrganisationSetup } from "@/components/control-plane/OrganisationSetup";
import type { User } from "@supabase/supabase-js";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext() as { user: User };
  return (
    <OrgProvider user={user}>
      <OrgGate />
    </OrgProvider>
  );
}

function OrgGate() {
  const { isLoading, error, memberships, currentOrgId, refresh } = useOrg();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <LoadingState label="Loading your organisations…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState message={error.message} onRetry={refresh} />
      </div>
    );
  }

  if (!memberships.length || !currentOrgId) {
    return <OrganisationSetup />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
