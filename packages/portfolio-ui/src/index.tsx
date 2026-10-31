import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import { validateUploadSelection } from "./file-validation";
import "./kitchen-ui.css";

export { matchesUploadAccept, validateUploadSelection } from "./file-validation";
export type { UploadCandidate, UploadSelectionOptions } from "./file-validation";

/**
 * Branded pending state for existing business actions.
 * This component does not begin requests, simulate success, or change permissions.
 */
export type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  pendingLabel?: ReactNode;
  tone?: "primary" | "secondary" | "danger";
  density?: "normal" | "comfortable";
};

export function ActionButton({
  children,
  pending = false,
  pendingLabel = "Working…",
  tone = "primary",
  density = "normal",
  type = "button",
  className = "",
  disabled,
  ...props
}: ActionButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-busy={pending}
      disabled={disabled || pending}
      className={["itu-action", "itu-action--" + tone, "itu-action--" + density, className].filter(Boolean).join(" ")}
    >
      {pending ? <span aria-hidden="true" className="itu-action__spinner" /> : null}
      <span className="itu-action__label" aria-live="polite">
        {pending ? pendingLabel : children}
      </span>
    </button>
  );
}

/**
 * Requires sustained pointer or keyboard activation.
 * The caller is responsible for authorization, server confirmation and outcome messaging.
 * Never substitute this control for backend permission checks or native dialogs.
 */
export type HoldConfirmButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onPointerLeave" | "onKeyDown" | "onKeyUp" | "onBlur"
> & {
  onConfirm: () => void;
  holdMs?: number;
  hint?: string;
};

export function HoldConfirmButton({
  children = "Hold to confirm",
  disabled = false,
  holdMs = 1400,
  hint = "Press and hold to confirm this action.",
  onConfirm,
  className = "",
  style,
  type: _type,
  ...props
}: HoldConfirmButtonProps) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const hintId = useId();
  const duration = Math.max(600, holdMs);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (disabled || activeRef.current) return;
    activeRef.current = true;
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!activeRef.current) return;
      activeRef.current = false;
      setHolding(false);
      onConfirm();
    }, duration);
  }, [disabled, duration, onConfirm]);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  return (
    <>
      <button
        {...props}
        type="button"
        disabled={disabled}
        aria-describedby={hintId}
        data-holding={holding ? "true" : "false"}
        className={["itu-hold", className].filter(Boolean).join(" ")}
        style={{ ...style, "--itu-hold-ms": duration + "ms" } as CSSProperties}
        onPointerDown={(event) => { if (event.button === 0) start(); }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            start();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            stop();
          }
        }}
        onBlur={stop}
        onClick={(event) => event.preventDefault()}
      >
        <span className="itu-hold__progress" aria-hidden="true" />
        <span className="itu-hold__label">{children}</span>
      </button>
      <span className="itu-sr-only" id={hintId}>{hint}</span>
    </>
  );
}

export type FileDropZoneProps = {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  maxBytes?: number;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  description?: string;
  className?: string;
};

/** Purely a file chooser; uploads and security checks remain with the caller. */
export function FileDropZone({
  onFilesSelected,
  accept = "",
  maxBytes = 20 * 1024 * 1024,
  multiple = false,
  disabled = false,
  label = "Choose files or drop them here",
  description = "Selected files are not uploaded automatically.",
  className = "",
}: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState("");
  const inputId = useId();

  const select = useCallback((files: File[]) => {
    const message = validateUploadSelection(files, { accept, maxBytes, multiple });
    if (message) {
      setError(message);
      setNames([]);
      return;
    }
    setError("");
    setNames(files.map((file) => file.name));
    onFilesSelected(files);
  }, [accept, maxBytes, multiple, onFilesSelected]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    select(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  }
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) select(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className={["itu-drop", dragging ? "itu-drop--active" : "", disabled ? "itu-drop--disabled" : "", className].filter(Boolean).join(" ")}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={handleDrop}
    >
      <input
        id={inputId}
        className="itu-drop__input"
        type="file"
        accept={accept || undefined}
        multiple={multiple}
        disabled={disabled}
        onChange={handleChange}
        aria-describedby={inputId + "-hint"}
      />
      <label htmlFor={inputId} className="itu-drop__label">
        <span className="itu-drop__icon" aria-hidden="true">↑</span>
        <strong>{label}</strong>
      </label>
      <p id={inputId + "-hint"} className="itu-drop__hint">{description}</p>
      {names.length > 0 ? <p className="itu-drop__selected" role="status">{names.length === 1 ? names[0] : names.length + " files selected — ready for upload"}</p> : null}
      {error ? <p role="alert" className="itu-drop__error">{error}</p> : null}
    </div>
  );
}

export type MetricSparklineProps = {
  label: string;
  values: readonly number[];
  valueLabel?: string;
  className?: string;
};

/** SVG uses only supplied measurements; no artificial trends or extrapolation. */
export function MetricSparkline({
  label,
  values,
  valueLabel,
  className = "",
}: MetricSparklineProps) {
  const points = values.filter((value) => Number.isFinite(value));
  const hasTrend = points.length >= 2;
  const min = hasTrend ? Math.min(...points) : 0;
  const max = hasTrend ? Math.max(...points) : 1;
  const range = Math.max(max - min, 1);
  const coordinates = hasTrend ? points.map((value, index) => {
    const x = 6 + (index / (points.length - 1)) * 228;
    const y = 66 - ((value - min) / range) * 60;
    return x.toFixed(2) + "," + y.toFixed(2);
  }).join(" ") : "";
  return (
    <figure className={["itu-metric", className].filter(Boolean).join(" ")}>
      <figcaption className="itu-metric__label">{label}</figcaption>
      {valueLabel ? <strong className="itu-metric__value">{valueLabel}</strong> : null}
      {hasTrend ? (
        <svg className="itu-metric__chart" role="img" aria-label={label + " trend, " + points.length + " measured values"} viewBox="0 0 240 72" preserveAspectRatio="none">
          <polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <p className="itu-metric__empty">Not enough trend data</p>
      )}
    </figure>
  );
}
