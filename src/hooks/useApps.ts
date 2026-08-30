import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type NativeApp = Tables<"native_apps">;

export function useApps(orgId: string | null) {
  return useQuery({
    queryKey: ["apps", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<NativeApp[]> => {
      const { data, error } = await supabase
        .from("native_apps")
        .select("*")
        .eq("org_id", orgId!)
        .order("suite", { ascending: true })
        .order("app_role", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
