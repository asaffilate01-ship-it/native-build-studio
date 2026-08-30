import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type OrgRole = "owner" | "release_owner" | "product_owner" | "member";

export type Membership = {
  org_id: string;
  role: OrgRole;
  organisations: { id: string; name: string; slug: string } | null;
};

type OrgContextValue = {
  user: User | null;
  memberships: Membership[];
  currentOrgId: string | null;
  currentOrg: Membership | null;
  role: OrgRole | null;
  setCurrentOrgId: (id: string) => void;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
};

const OrgContext = createContext<OrgContextValue | null>(null);

const STORAGE_KEY = "nfcp.currentOrgId";

export function OrgProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [currentOrgId, setOrgId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["memberships", user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("organisation_members")
        .select("org_id, role, organisations(id, name, slug)")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Membership[];
    },
  });

  const memberships = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (!memberships.length) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const valid = memberships.find((m) => m.org_id === stored);
    setOrgId((prev) => prev ?? valid?.org_id ?? memberships[0]!.org_id);
  }, [memberships]);

  const setCurrentOrgId = (id: string) => {
    setOrgId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  };

  const currentOrg = memberships.find((m) => m.org_id === currentOrgId) ?? null;

  const value: OrgContextValue = {
    user,
    memberships,
    currentOrgId,
    currentOrg,
    role: currentOrg?.role ?? null,
    setCurrentOrgId,
    isLoading,
    error: (error as Error) ?? null,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: ["memberships"] });
    },
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside OrgProvider");
  return ctx;
}

export function canApprovePlans(role: OrgRole | null) {
  return role === "owner" || role === "product_owner";
}

export function canQueueBuilds(role: OrgRole | null) {
  return role === "owner" || role === "release_owner";
}

export function canEditApps(role: OrgRole | null) {
  return role === "owner" || role === "release_owner" || role === "product_owner";
}

export const roleLabels: Record<OrgRole, string> = {
  owner: "Owner",
  release_owner: "Release owner",
  product_owner: "Product owner",
  member: "Member",
};
