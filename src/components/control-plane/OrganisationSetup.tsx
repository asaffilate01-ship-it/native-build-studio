import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { Field } from "@/components/control-plane/primitives";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function OrganisationSetup() {
  const { user, refresh } = useOrg();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Enter an organisation name of at least two characters.");
      return;
    }
    setBusy(true);
    const slug = `${slugify(trimmed)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error: insertError } = await supabase
      .from("organisations")
      .insert({ name: trimmed, slug, created_by: user!.id })
      .select("id")
      .single();

    if (insertError || !data) {
      setBusy(false);
      setError(insertError?.message ?? "The organisation could not be created.");
      return;
    }

    const { error: memberError } = await supabase
      .from("organisation_members")
      .insert({ org_id: data.id, user_id: user!.id, role: "owner" });

    setBusy(false);
    if (memberError) {
      setError(memberError.message);
      return;
    }
    refresh();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-16">
      <div className="panel p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Create your organisation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every app, plan, build and audit record is scoped to an organisation. Create the brand
          that legally owns the developer accounts — you will be its owner.
        </p>
        <form onSubmit={create} className="mt-6 space-y-4">
          <Field label="Organisation name" hint="For example, Example Brand Ltd.">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Example Brand Ltd"
            />
          </Field>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create organisation"}
          </button>
        </form>
      </div>
    </div>
  );
}
