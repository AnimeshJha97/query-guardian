import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useDatabases, useNPlusOne, useSuggestions } from "../lib/hooks";
import { useCapabilities } from "../lib/useCapabilities";
import { useTheme } from "../lib/theme";
import { timeAgo } from "../lib/format";
import {
  IconCollapse,
  IconDatabase,
  IconLogout,
  IconN1,
  IconOverview,
  IconQueries,
  IconSuggestions,
  IconThemeDot,
  LogoMark,
} from "./icons";

const SIDEBAR_KEY = "qg_sidebar_collapsed";
const POLL_INTERVAL_MS = 30_000;
const STALE_HEARTBEAT_MS = POLL_INTERVAL_MS * 2;

const STATUS_DOT: Record<string, string> = {
  healthy: "bg-success shadow-[0_0_0_3px_var(--success-bg)]",
  degraded: "bg-warning shadow-[0_0_0_3px_var(--warning-bg)]",
  error: "bg-danger shadow-[0_0_0_3px_var(--danger-bg)]",
  pending: "bg-faint",
};

function NavItem({
  to,
  icon,
  label,
  collapsed,
  count,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  count?: number;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      title={label}
      className={({ isActive }) =>
        `relative flex w-full items-center gap-2.5 rounded-[7px] py-[9px] text-[13px] font-medium ${
          collapsed ? "justify-center px-0" : "px-2.5"
        } ${isActive ? "bg-accent-soft text-accent" : "text-muted hover:bg-wash"}`
      }
    >
      {icon}
      {!collapsed && <span>{label}</span>}
      {!collapsed && count !== undefined && count > 0 && (
        <span className="absolute right-2.5 top-1/2 min-w-[18px] -translate-y-1/2 rounded-full bg-wash px-1.5 py-[1px] text-center text-[11px] font-semibold text-faint">
          {count}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar({ onLogout }: { onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const { theme, toggle } = useTheme();
  const { data: suggestions } = useSuggestions();
  const { data: n1 } = useNPlusOne();
  const { data: databases } = useDatabases();
  const { data: capabilities } = useCapabilities();

  const pendingSuggestions = suggestions?.filter((s) => s.status === "pending").length ?? 0;
  const openN1 = n1?.items.filter((p) => p.status === "open").length ?? 0;
  const db = databases?.[0];
  const heartbeatMs = db?.lastHeartbeatAt ? Date.parse(db.lastHeartbeatAt) : null;
  const heartbeatStale = heartbeatMs !== null && Date.now() - heartbeatMs > STALE_HEARTBEAT_MS;
  const healthStatus = db ? (heartbeatStale ? "degraded" : db.status) : "pending";
  const healthLabel = !db
    ? "connect one to begin"
    : heartbeatMs === null
      ? "awaiting heartbeat"
      : heartbeatStale
        ? `stale heartbeat ${timeAgo(db.lastHeartbeatAt!)}`
        : `heartbeat ${timeAgo(db.lastHeartbeatAt!)}`;

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {
        /* localStorage unavailable */
      }
      return !c;
    });
  };

  return (
    <div
      className="sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-line bg-elev"
      style={{ width: collapsed ? 64 : 236, transition: "width 0.16s ease" }}
    >
      <div className="flex min-h-[53px] items-center justify-between border-b border-line px-3 py-3.5">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <LogoMark />
          {!collapsed && (
            <div className="whitespace-nowrap text-sm font-semibold tracking-[-0.01em]">
              Query Guardian
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] hover:bg-wash"
            title="Collapse sidebar"
          >
            <IconCollapse collapsed={collapsed} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-0.5 p-2">
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            className="mb-1 flex w-full items-center justify-center rounded-[7px] py-[9px] text-muted hover:bg-wash"
            title="Expand sidebar"
          >
            <IconCollapse collapsed={collapsed} />
          </button>
        )}
        <NavItem to="/" icon={<IconOverview />} label="Overview" collapsed={collapsed} />
        <NavItem to="/queries" icon={<IconQueries />} label="Queries" collapsed={collapsed} />
        <NavItem
          to="/suggestions"
          icon={<IconSuggestions />}
          label="Suggestions"
          collapsed={collapsed}
          count={pendingSuggestions}
        />
        <NavItem
          to="/n-plus-one"
          icon={<IconN1 />}
          label="N+1 Patterns"
          collapsed={collapsed}
          count={openN1}
        />
        <NavItem
          to="/connect"
          icon={<IconDatabase />}
          label="Connect Database"
          collapsed={collapsed}
        />
      </div>

      <div className="flex-1" />

      <div className="border-t border-line py-1.5">
        <div className="flex items-center gap-2 px-2.5 py-2">
          <div
            className={`h-[7px] w-[7px] shrink-0 rounded-full ${
              STATUS_DOT[healthStatus] ?? "bg-faint"
            }`}
            title={db ? healthLabel : "No database connected"}
          />
          {!collapsed && (
            <div className="flex flex-col gap-[1px] overflow-hidden">
              <div className="whitespace-nowrap text-xs text-ink">
                {db ? db.name : "no database"}
              </div>
              <div className="whitespace-nowrap text-[11px] text-faint">{healthLabel}</div>
            </div>
          )}
        </div>
        <div className={`flex gap-0.5 px-2 pb-2 pt-1 ${collapsed ? "flex-col items-center" : ""}`}>
          <button
            onClick={toggle}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-wash"
            title="Toggle theme"
          >
            <IconThemeDot dark={theme === "dark"} />
          </button>
          <button
            onClick={onLogout}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-wash"
            title="Log out"
          >
            <IconLogout />
          </button>
          {!collapsed && (
            <span className="ml-auto self-center text-[11px] text-faint">
              {capabilities?.edition ?? ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
