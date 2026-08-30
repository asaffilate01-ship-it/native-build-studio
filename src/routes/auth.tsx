import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Field } from "@/components/control-plane/primitives";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Native Factory Control Plane" },
      {
        name: "description",
        content:
          "Sign in to the Native Factory Control Plane to manage suites, plans, store listings and native build jobs.",
      },
      { property: "og:title", content: "Sign in — Native Factory Control Plane" },
      {
        property: "og:description",
        content: "Secure access to your organisation's native app factory.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/portfolio" });
    });
  }, [navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/portfolio`,
          data: { full_name: fullName },
        },
      });
      setBusy(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setMessage("Account created. If email confirmation is required, check your inbox, then sign in.");
      setMode("signin");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    void navigate({ to: "/portfolio" });
  };

  const google = async () => {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Google sign-in failed. Please try again or use your email address.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/portfolio" });
  };

  return (
    <div className="grid-backdrop flex min-h-screen items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-md p-6 sm:p-8">
        <Link to="/" className="ident hover:text-foreground">
          ← Native Factory
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">
          {mode === "signin" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The control plane holds no signing keys. Credentials stay in protected environments.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" ? (
            <Field label="Full name">
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
          ) : null}
          <Field label="Email address">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Password" hint="At least eight characters.">
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-success" role="status">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={google}
          className="w-full rounded-md border border-input px-4 py-2.5 text-sm font-medium hover:bg-accent"
        >
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-5 w-full text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {mode === "signin" ? "No account? Create one" : "Already registered? Sign in"}
        </button>
      </div>
    </div>
  );
}
