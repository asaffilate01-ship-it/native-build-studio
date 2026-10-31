/**
 * Portable, dependency-free client-side selection hints.
 * The receiving server MUST independently enforce extension, MIME, content and size policy.
 */
export type UploadCandidate = Readonly<{ name: string; type: string; size: number }>;

export type UploadSelectionOptions = Readonly<{
  accept?: string;
  maxBytes?: number;
  multiple?: boolean;
}>;

export function matchesUploadAccept(file: UploadCandidate, accept = ""): boolean {
  const rules = accept.split(",").map((rule) => rule.trim().toLowerCase()).filter(Boolean);
  if (rules.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

export function validateUploadSelection(
  files: readonly UploadCandidate[],
  { accept = "", maxBytes = 20 * 1024 * 1024, multiple = false }: UploadSelectionOptions = {},
): string | null {
  if (files.length === 0) return "Choose a file to continue.";
  if (!multiple && files.length > 1) return "Choose only one file.";
  if (files.some((file) => file.size < 0 || !Number.isFinite(file.size))) {
    return "One of the selected files has an invalid size.";
  }
  if (files.some((file) => file.size > maxBytes)) {
    return "A selected file exceeds the upload size limit.";
  }
  if (files.some((file) => !matchesUploadAccept(file, accept))) {
    return "A selected file has an unsupported file type.";
  }
  return null;
}
