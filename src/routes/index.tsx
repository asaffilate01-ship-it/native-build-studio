import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Native Factory Control Plane — Web app to store approval" },
      {
        name: "description",
        content:
          "Plan, ready, sign and ship branded Android and iOS builds from one web codebase, with organisation-scoped roles and a named human on every release.",
      },
      { property: "og:title", content: "Native Factory Control Plane" },
      {
        property: "og:description",
        content: "From Capacitor readiness to TestFlight and Play Internal Testing, with auditable approvals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const stages = [
  {
    title: "Capacitor readiness",
    body: "A role-aware brief and a checklist the web build must clear before anything is wrapped.",
  },
  {
    title: "Native wrapper",
    body: "Clean native projects per build, with permanent bundle and package identity per role app.",
  },
  {
    title: "Signing and build",
    body: "Protected credentials stay server-side; hosted macOS compiles iOS. No keys in the browser.",
  },
  {
    title: "Store listing",
    body: "Copy, URLs, declarations and artwork captured once and carried into the hand-off pack.",
  },
  {
    title: "Testing",
    body: "Every successful web build uploads to TestFlight and Play Internal Testing automatically.",
  },
  {
    title: "Production",
    body: "Release is never automatic. A named operator submits and promotes the tested build.",
  },
];

function Landing() {
  return (
    <main className="grid-backdrop min-h-screen">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-20">
        <header className="max-w-3xl space-y-6">
          <p className="ident text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Native Factory Control Plane
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            One web codebase. Branded Android and iOS builds in testing, ready for a human to submit.
          </h1>
          <p className="text-lg text-muted-foreground">
            Track readiness, permanent identifiers, store listings, signed builds and update delivery for
            every role app in your suite — with organisation-scoped access and an audit record behind each
            privileged action.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Sign in to the control plane
            </Link>
            <Link
              to="/auth"
              className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent"
            >
              Create an organisation
            </Link>
          </div>
        </header>

        <section aria-labelledby="stages" className="space-y-6">
          <h2 id="stages" className="text-2xl font-semibold">
            What the factory handles, and what you own
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stages.map((stage) => (
              <article key={stage.title} className="panel space-y-2 p-5">
                <h3 className="font-semibold">{stage.title}</h3>
                <p className="text-sm text-muted-foreground">{stage.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="identity" className="panel space-y-3 p-6">
          <h2 id="identity" className="text-xl font-semibold">
            Permanent identity, per role
          </h2>
          <p className="text-sm text-muted-foreground">
            Reuse one suite and assign a unique, permanent identifier to each role app. The bundle or package
            ID is technical identity — it is not the public seller name, which is account-wide.
          </p>
          <ul className="space-y-1 text-sm">
            <li className="ident">uk.co.haccora.customer</li>
            <li className="ident">uk.co.haccora.driver</li>
            <li className="ident">uk.co.haccora.kitchen</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
