import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, roleLabels } from "@/hooks/useOrg";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/launchpad", label: "Launchpad", hint: "Set up, upload, check and run" },
  { to: "/portfolio", label: "Portfolio", hint: "Suites, role apps and IDs" },
  { to: "/planner", label: "App planner", hint: "Plan versions and approvals" },
  { to: "/readiness", label: "Capacitor readiness", hint: "Pre-wrapper checklist" },
  { to: "/listing", label: "Store listing", hint: "Copy, declarations, artwork" },
  { to: "/builds", label: "Build queue", hint: "Jobs, runners, artefacts" },
  { to: "/delivery", label: "Update delivery", hint: "Source mapping and Appflow" },
  { to: "/audit", label: "Audit", hint: "Who did what, and when" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { memberships, currentOrg, currentOrgId, setCurrentOrgId, role, user } = useOrg();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside className="border-b border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <Link to="/portfolio" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground"
            >
              NF
            </span>
            <span className="font-display text-sm font-semibold leading-tight text-sidebar-foreground">
              Native Factory
              <span className="block text-xs font-normal text-muted-foreground">Control plane</span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-md border border-sidebar-border px-3 py-1.5 text-sm lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>

        <div className={cn("px-3 pb-4", menuOpen ? "block" : "hidden lg:block")}>
          {memberships.length > 1 ? (
            <div className="mb-3 px-2">
              <label
                className="mb-1 block text-xs font-medium text-muted-foreground"
                htmlFor="org-switch"
              >
                Organisation
              </label>
              <select
                id="org-switch"
                value={currentOrgId ?? ""}
                onChange={(event) => setCurrentOrgId(event.target.value)}
                className="w-full rounded-md border border-sidebar-border bg-background px-2.5 py-2 text-sm"
              >
                {memberships.map((m) => (
                  <option key={m.org_id} value={m.org_id}>
                    {m.organisations?.name ?? "Organisation"}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <nav id="primary-navigation" aria-label="Primary">
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent"
                    activeProps={{
                      className:
                        "block rounded-md px-3 py-2 text-sm bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary",
                    }}
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="block text-xs text-muted-foreground">{item.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-5 space-y-2 border-t border-sidebar-border px-3 pt-4">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="break-words text-sm">{user?.email}</p>
            {currentOrg ? (
              <p className="text-xs text-muted-foreground">
                {currentOrg.organisations?.name} · {role ? roleLabels[role] : "—"}
              </p>
            ) : null}
            <button
              type="button"
              onClick={signOut}
              className="mt-1 w-full rounded-md border border-sidebar-border px-3 py-1.5 text-sm hover:bg-sidebar-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
