import { useState } from "react";
import { apiFetch, ApiError } from "../lib/api";
import { LogoMark } from "../components/icons";
import { PrimaryButton } from "../components/ui";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Incorrect password. Try again.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Wait 15 minutes and try again.");
      } else {
        setError("Couldn't reach the API — is the server running?");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6">
      <div className="flex w-full max-w-[360px] flex-col items-center gap-7">
        <div className="flex flex-col items-center gap-2.5">
          <LogoMark />
          <div className="text-base font-semibold tracking-[-0.01em]">Query Guardian</div>
          <div className="text-[13px] text-muted">Self-hosted Postgres monitoring</div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex w-full flex-col gap-4 rounded-xl border border-line bg-elev p-7 shadow-card"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted" htmlFor="qg-password">
              Admin password
            </label>
            <input
              id="qg-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="••••••••••••"
              autoFocus
              className="w-full rounded-[7px] border border-strong bg-app px-3 py-2.5 text-sm text-ink"
            />
            {error && <div className="text-xs text-danger">{error}</div>}
          </div>
          <PrimaryButton type="submit" disabled={busy || !password.trim()} full>
            {busy ? "Checking…" : "Unlock"}
          </PrimaryButton>
          <div className="text-center text-xs leading-relaxed text-faint">
            Single-admin instance — no accounts, no recovery flow.
            <br />
            Configure an Argon2id hash via QG_ADMIN_PASSWORD_HASH.
          </div>
        </form>
      </div>
    </div>
  );
}
