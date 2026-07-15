import type { ReactNode } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { highlightSql } from "../lib/format";

export type Severity = "High" | "Medium" | "Low";

export function severityFromCount(count: number): Severity {
  if (count >= 200) return "High";
  if (count >= 50) return "Medium";
  return "Low";
}

export function severityFromImpact(impact: "high" | "medium" | "low"): Severity {
  return (impact.charAt(0).toUpperCase() + impact.slice(1)) as Severity;
}

const SEVERITY_CLASSES: Record<Severity, string> = {
  High: "bg-danger-soft text-danger",
  Medium: "bg-warning-soft text-warning",
  Low: "bg-wash text-muted",
};

export function Badge({ level, children }: { level: Severity; children: ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-[2px] text-[11px] font-semibold ${SEVERITY_CLASSES[level]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ label, good }: { label: string; good?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-[2px] text-[11px] font-semibold ${
        good ? "bg-success-soft text-success" : "bg-wash text-faint"
      }`}
    >
      {label}
    </span>
  );
}

/** Centered empty/error panel used across every page's non-data states. */
export function StatePanel({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto my-10 flex max-w-[440px] flex-col items-center rounded-xl border border-line px-8 py-14 text-center">
      <div className="mb-2.5">{icon}</div>
      <div className="text-[15px] font-semibold">{title}</div>
      <div className="mb-4 mt-1.5 text-[13px] leading-relaxed text-muted">{message}</div>
      {action}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  full?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[7px] bg-accent px-4 py-2 text-[13px] font-semibold text-accent-on disabled:cursor-not-allowed disabled:opacity-50 ${
        full ? "w-full" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-[10px] bg-wash ${className ?? ""}`}
      style={{ animation: "qg-pulse 1.6s ease-in-out infinite", ...style }}
    />
  );
}

/** SQL string with keyword highlighting, matching the design's accent styling. */
export function Sql({ sql }: { sql: string }) {
  return (
    <>
      {highlightSql(sql).map((part, i) =>
        part.kw ? (
          <span key={i} className="font-semibold text-accent">
            {part.t}
          </span>
        ) : (
          <span key={i}>{part.t}</span>
        )
      )}
    </>
  );
}

export function Sparkline({
  values,
  width = 68,
  height = 24,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="text-[11px] text-faint">—</span>;
  const data = values.map((value, index) => ({ index, value }));

  return (
    <div style={{ width, height }} aria-label="mean execution time trend">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis dataKey="value" domain={["dataMin", "dataMax"]} hide />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={1.7}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[22px] font-semibold tracking-[-0.01em]">{title}</div>
        {subtitle && <div className="mt-1 text-[13px] text-muted">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
