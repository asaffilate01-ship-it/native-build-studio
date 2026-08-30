import type { NativeApp } from "@/hooks/useApps";

export function AppPicker({
  apps,
  value,
  onChange,
  label = "Role app",
}: {
  apps: NativeApp[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <div className="panel flex flex-wrap items-end gap-3 p-4">
      <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm">
        <span className="font-medium">{label}</span>
        <select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Select a role app
          </option>
          {apps.map((app) => (
            <option key={app.id} value={app.id}>
              {app.suite} · {app.display_name} ({app.app_role})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
