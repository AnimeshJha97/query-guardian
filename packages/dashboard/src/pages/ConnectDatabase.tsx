import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateDatabase, usePreflight } from "../lib/hooks";
import { useToast } from "../lib/toast";
import type {
  ConnectionMode,
  MonitoredDatabase,
  PreflightResponse,
  SslMode,
} from "../lib/types";
import {
  IconCheckCircle,
  IconFailCircle,
  IconInfo,
  IconSuccessBig,
} from "../components/icons";
import { PrimaryButton } from "../components/ui";

const CONNECTION_MODES: { value: ConnectionMode; label: string; hint: string }[] = [
  { value: "both", label: "Stats + logs", hint: "Best coverage" },
  { value: "direct", label: "Stats only", hint: "pg_stat_statements" },
  { value: "log_tail", label: "Logs only", hint: "auto_explain" },
];

const SSL_MODES: { value: SslMode; label: string; hint: string }[] = [
  { value: "verify-full", label: "Verify full", hint: "Recommended" },
  { value: "require", label: "Require", hint: "No CA check" },
];

function StepDots({ step }: { step: number }) {
  return (
    <div className="mb-7 grid grid-cols-3 gap-2.5">
      {["Configure", "Preflight", "Saved"].map((label, i) => {
        const n = i + 1;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                step >= n ? "bg-accent text-accent-on" : "bg-wash text-faint"
              }`}
            >
              {step > n ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2 5.2 L4 7.2 L8 2.8"
                    stroke="var(--accent-text-on)"
                    strokeWidth="1.6"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                n
              )}
            </div>
            <span
              className={`min-w-0 truncate text-[12.5px] font-medium ${
                step >= n ? "text-ink" : "text-faint"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function OptionGrid<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-[7px] border px-3 py-2 text-left ${
            value === option.value
              ? "border-accent bg-accent-soft text-accent"
              : "border-strong bg-app text-muted hover:bg-wash"
          }`}
        >
          <div className="truncate text-[12.5px] font-semibold">{option.label}</div>
          <div className="mt-0.5 truncate text-[10.5px] opacity-75">{option.hint}</div>
        </button>
      ))}
    </div>
  );
}

function CheckRow({
  status,
  label,
  fix,
}: {
  status: "pending" | "pass" | "fail";
  label: string;
  fix?: string;
}) {
  return (
    <div className="border-b border-line py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex shrink-0">
          {status === "pending" ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              style={{ animation: "qg-spin 0.9s linear infinite" }}
            >
              <circle
                cx="7"
                cy="7"
                r="5.5"
                stroke="var(--text-faint)"
                strokeWidth="1.6"
                strokeDasharray="6 100"
                strokeLinecap="round"
              />
            </svg>
          ) : status === "pass" ? (
            <IconCheckCircle />
          ) : (
            <IconFailCircle />
          )}
        </div>
        <span className="text-[13px] font-medium text-ink">{label}</span>
      </div>
      {status === "fail" && fix && (
        <div className="ml-6 mt-2 rounded-[7px] bg-danger-soft px-[11px] py-[9px]">
          <div className="mb-[5px] text-[11.5px] font-medium text-danger">
            Missing requirement
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-code-ink">
            {fix}
          </pre>
        </div>
      )}
    </div>
  );
}

function statusFor(
  result: PreflightResponse | undefined,
  key: "canConnect" | "canReadStats" | "canReadStatements"
): "pending" | "pass" | "fail" {
  if (!result) return "pending";
  return result[key] ? "pass" : "fail";
}

export function ConnectDatabase() {
  const navigate = useNavigate();
  const toast = useToast();
  const preflight = usePreflight();
  const create = useCreateDatabase();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [dsn, setDsn] = useState("");
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("both");
  const [sslMode, setSslMode] = useState<SslMode>("verify-full");
  const [showTip, setShowTip] = useState(false);
  const [preflightResult, setPreflightResult] = useState<PreflightResponse>();
  const [created, setCreated] = useState<MonitoredDatabase | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canCheck = name.trim().length > 0 && dsn.trim().length > 0;
  const checking = preflight.isPending;
  const allPass =
    !!preflightResult &&
    preflightResult.canConnect &&
    preflightResult.canReadStats &&
    preflightResult.canReadStatements;

  const runPreflight = () => {
    if (!canCheck) return;
    setSaveError(null);
    setPreflightResult(undefined);
    preflight.mutate(
      { dsn: dsn.trim(), sslMode },
      {
        onSuccess: (result) => setPreflightResult(result),
        onError: (err) => {
          setPreflightResult(undefined);
          toast(`Preflight failed: ${(err as Error).message}`);
        },
      }
    );
  };

  const goVerify = () => {
    if (!canCheck) return;
    setStep(2);
    runPreflight();
  };

  const copySetupSql = async () => {
    if (!preflightResult?.setupSql) return;
    try {
      await navigator.clipboard.writeText(preflightResult.setupSql);
      toast("Setup SQL copied", "success");
    } catch {
      toast("Clipboard access is unavailable in this browser.");
    }
  };

  const save = () => {
    if (!allPass) return;
    setSaveError(null);
    create.mutate(
      {
        name: name.trim(),
        dsn: dsn.trim(),
        connectionMode,
        sslMode,
      },
      {
        onSuccess: (db) => {
          setCreated(db);
          setStep(3);
          toast("Database connection saved", "success");
        },
        onError: (err) => setSaveError((err as Error).message),
      }
    );
  };

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-[560px] rounded-[14px] border border-line bg-elev px-8 pb-7 pt-8 shadow-card">
        <StepDots step={step} />

        {step === 1 && (
          <>
            <div className="mb-1.5 text-lg font-semibold tracking-[-0.01em]">
              Connect a database
            </div>
            <div className="mb-[22px] text-[13px] leading-relaxed text-muted">
              Use a dedicated read-only Postgres role. Query Guardian checks the grants before it
              saves anything.
            </div>

            <div className="mb-4 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">Connection name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="prod-primary"
                className="w-full rounded-[7px] border border-strong bg-app px-3 py-[9px] text-[13.5px] text-ink"
              />
            </div>

            <div className="mb-4 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted">Connection string</label>
                <div
                  className="relative inline-flex"
                  onMouseEnter={() => setShowTip(true)}
                  onMouseLeave={() => setShowTip(false)}
                >
                  <span className="flex cursor-help text-faint">
                    <IconInfo />
                  </span>
                  <div
                    className="absolute right-0 top-5 z-10 w-64 rounded-lg border border-strong bg-elev2 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted shadow-card"
                    style={{
                      opacity: showTip ? 1 : 0,
                      visibility: showTip ? "visible" : "hidden",
                      transition: "opacity 0.12s ease",
                    }}
                  >
                    Use query_guardian_reader, not a superuser or write-capable application role.
                  </div>
                </div>
              </div>
              <input
                value={dsn}
                onChange={(e) => setDsn(e.target.value)}
                placeholder="postgres://query_guardian_reader:password@db.internal:5432/app?sslmode=verify-full"
                className="w-full rounded-[7px] border border-strong bg-app px-3 py-[9px] font-mono text-[12.5px] text-ink"
              />
            </div>

            <div className="mb-4 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">Collection mode</label>
              <OptionGrid value={connectionMode} options={CONNECTION_MODES} onChange={setConnectionMode} />
            </div>

            <div className="mb-5 flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">TLS mode</label>
              <OptionGrid value={sslMode} options={SSL_MODES} onChange={setSslMode} />
            </div>

            <PrimaryButton onClick={goVerify} disabled={!canCheck} full>
              Check connection
            </PrimaryButton>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mb-1.5 text-lg font-semibold tracking-[-0.01em]">
              Preflight checks
            </div>
            <div className="mb-[22px] text-[13px] leading-relaxed text-muted">
              Running read-only checks against {name.trim()} with {sslMode}.
            </div>

            <div className="flex flex-col gap-1">
              <CheckRow status={statusFor(preflightResult, "canConnect")} label="Can connect to database" />
              <CheckRow
                status={statusFor(preflightResult, "canReadStats")}
                label="Can read pg_stat activity"
                fix={preflightResult?.missing.find((item) => item.key === "stats")?.sql}
              />
              <CheckRow
                status={statusFor(preflightResult, "canReadStatements")}
                label="Can read pg_stat_statements"
                fix={preflightResult?.missing.find((item) => item.key === "statements")?.sql}
              />
            </div>

            {preflightResult && (
              <div className="mt-4 rounded-[9px] border border-line bg-app">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <div>
                    <div className="text-[12.5px] font-semibold text-ink">Setup SQL</div>
                    <div className="mt-0.5 text-[11.5px] text-faint">
                      Run this as a Postgres admin if any check is missing.
                    </div>
                  </div>
                  <button
                    onClick={copySetupSql}
                    className="rounded-[7px] border border-strong px-3 py-1.5 text-[12px] font-medium text-muted hover:bg-wash"
                  >
                    Copy
                  </button>
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11.5px] leading-relaxed text-code-ink">
                  {preflightResult.setupSql}
                </pre>
              </div>
            )}

            {preflightResult && preflightResult.errors.length > 0 && (
              <div className="mt-3 rounded-[7px] bg-danger-soft px-[11px] py-[9px]">
                {preflightResult.errors.map((err, i) => (
                  <div key={i} className="font-mono text-[11.5px] leading-relaxed text-danger">
                    {err}
                  </div>
                ))}
              </div>
            )}

            {saveError && (
              <div className="mt-3 rounded-[7px] bg-danger-soft px-[11px] py-[9px] text-[12px] text-danger">
                {saveError}
              </div>
            )}

            <div className="mt-5 flex gap-2.5">
              <button
                onClick={() => setStep(1)}
                className="rounded-lg border border-strong px-3.5 py-2.5 text-[13px] font-medium text-muted hover:bg-wash"
              >
                Back
              </button>
              <button
                onClick={runPreflight}
                disabled={checking}
                className="rounded-lg border border-strong px-3.5 py-2.5 text-[13px] font-medium text-muted disabled:opacity-50"
              >
                {checking ? "Checking..." : "Re-run"}
              </button>
              <div className="flex-1">
                <PrimaryButton onClick={save} disabled={!allPass || create.isPending} full>
                  {create.isPending ? "Saving..." : "Save connection"}
                </PrimaryButton>
              </div>
            </div>
          </>
        )}

        {step === 3 && created && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-3.5">
              <IconSuccessBig />
            </div>
            <div className="mb-1.5 text-lg font-semibold tracking-[-0.01em]">
              Connection saved
            </div>
            <div className="mb-[22px] text-[13px] leading-relaxed text-muted">
              The collector picks up {created.name} on its next cycle and starts sampling based on
              the mode you selected.
            </div>
            <div className="mb-[22px] flex w-full flex-col gap-2 rounded-[9px] border border-line bg-app px-4 py-3.5">
              <div className="flex justify-between gap-4">
                <span className="text-[12.5px] text-muted">Connection</span>
                <span className="truncate font-mono text-[12.5px] font-medium text-ink">
                  {created.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[12.5px] text-muted">Mode</span>
                <span className="font-mono text-[12.5px] font-medium text-ink">
                  {created.connectionMode}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[12.5px] text-muted">SSL</span>
                <span className="font-mono text-[12.5px] font-medium text-ink">
                  {created.sslMode}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[12.5px] text-muted">Status</span>
                <span className="font-mono text-[12.5px] font-medium text-ink">
                  {created.status}
                </span>
              </div>
            </div>
            <PrimaryButton onClick={() => navigate("/")} full>
              Go to Overview
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
