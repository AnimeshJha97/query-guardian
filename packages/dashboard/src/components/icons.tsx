// Inline SVG icons carried over from the Claude Design mockups.

export function LogoMark({ size = 28 }: { size?: number }) {
  const glyph = Math.round(size * 0.57);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[7px] bg-accent"
      style={{ width: size, height: size }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="var(--accent-text-on)" strokeWidth="1.6" />
        <rect x="8.7" y="6" width="2.6" height="6" rx="1.3" fill="var(--accent-text-on)" />
        <circle cx="10" cy="14" r="1.1" fill="var(--accent-text-on)" />
      </svg>
    </div>
  );
}

export function IconOverview() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8.5" y="1.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1.5" y="8.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8.5" y="8.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function IconQueries() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="13" height="2" rx="1" fill="currentColor" />
      <rect x="1.5" y="7" width="13" height="2" rx="1" fill="currentColor" />
      <rect x="1.5" y="11.5" width="8" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

export function IconSuggestions() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="6" y="11.5" width="4" height="1.8" rx="0.9" fill="currentColor" />
      <rect x="6.6" y="13.6" width="2.8" height="1.3" rx="0.6" fill="currentColor" />
    </svg>
  );
}

export function IconN1() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="8" r="4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10.5" cy="8" r="4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function IconDatabase({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="3.5" rx="5.5" ry="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.5 3.5 V11 C2.5 12.1 4.9 13 8 13 C11.1 13 13.5 12.1 13.5 11 V3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
      />
      <path
        d="M2.5 7.3 C2.5 8.4 4.9 9.3 8 9.3 C11.1 9.3 13.5 8.4 13.5 7.3"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
      />
    </svg>
  );
}

export function IconCollapse({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.16s ease" }}
    >
      <path
        d="M9 2 L4.5 7 L9 12"
        stroke="var(--text-muted)"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconThemeDot({ dark }: { dark: boolean }) {
  return dark ? (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="3.4" fill="currentColor" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="4.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function IconLogout() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path
        d="M6.2 2.5 H3.2 A0.8 0.8 0 0 0 2.4 3.3 V11.7 A0.8 0.8 0 0 0 3.2 12.5 H6.2"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M6.5 7.5 H12.5 M10.3 5.3 L12.5 7.5 L10.3 9.7"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 9.5 L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconChevronDown({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none">
      <path
        d="M2.5 3.5 L5 6.5 L7.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M7.5 2.5 L3 6 L7.5 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconAlert() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="var(--danger)" strokeWidth="1.6" />
      <rect x="9.2" y="5.5" width="1.6" height="6" rx="0.8" fill="var(--danger)" />
      <circle cx="10" cy="14.2" r="1" fill="var(--danger)" />
    </svg>
  );
}

export function IconEmptyDb() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <ellipse cx="11" cy="5" rx="7" ry="2.4" stroke="var(--text-faint)" strokeWidth="1.5" />
      <path
        d="M4 5 V16 C4 17.3 7.1 18.4 11 18.4 C14.9 18.4 18 17.3 18 16 V5"
        stroke="var(--text-faint)"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

export function IconEmptyList() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="3" y="3" width="16" height="16" rx="2.5" stroke="var(--text-faint)" strokeWidth="1.5" />
      <path
        d="M7 8 H15 M7 11 H15 M7 14 H11"
        stroke="var(--text-faint)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconEmptySearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="8.5" cy="8.5" r="6" stroke="var(--text-faint)" strokeWidth="1.5" />
      <path d="M13 13 L17.5 17.5" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconEmptyBulb() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="9" r="6" stroke="var(--text-faint)" strokeWidth="1.5" />
      <rect x="9" y="16" width="4" height="2" rx="1" stroke="var(--text-faint)" strokeWidth="1.3" />
    </svg>
  );
}

export function IconEmptyN1() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="8" cy="11" r="5.5" stroke="var(--text-faint)" strokeWidth="1.5" />
      <circle cx="15" cy="11" r="5.5" stroke="var(--text-faint)" strokeWidth="1.5" />
    </svg>
  );
}

export function IconEmptyPlan() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="var(--text-faint)" strokeWidth="1.5" />
      <path d="M6 8 H14 M6 11 H10" stroke="var(--text-faint)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconCheckCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" fill="var(--success)" />
      <path
        d="M4.2 7.2 L6.2 9.2 L9.8 5"
        stroke="var(--bg-elev)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconFailCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" fill="var(--danger)" />
      <path
        d="M4.8 4.8 L9.2 9.2 M9.2 4.8 L4.8 9.2"
        stroke="var(--bg-elev)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconSpinnerArc() {
  return (
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
  );
}

export function IconSuccessBig() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <circle cx="13" cy="13" r="12" fill="var(--success-bg)" />
      <path
        d="M8 13.5 L11.5 17 L18.5 9.5"
        stroke="var(--success)"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconInfo() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="5.9" y="5.5" width="1.2" height="3.6" rx="0.6" fill="currentColor" />
      <circle cx="6.5" cy="3.9" r="0.8" fill="currentColor" />
    </svg>
  );
}
