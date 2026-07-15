export function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtMs(n: number): string {
  if (n >= 3600000) return (n / 3600000).toFixed(1) + "h";
  if (n >= 60000) return (n / 60000).toFixed(1) + "m";
  if (n >= 1000) return (n / 1000).toFixed(2) + "s";
  return n.toFixed(1) + "ms";
}

export function fmtMsInt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "s";
  return Math.round(n) + "ms";
}

export function fmtWindow(seconds: number): string {
  if (seconds < 1) return Math.round(seconds * 1000) + "ms";
  return (Math.round(seconds * 10) / 10).toString() + "s";
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString()}, ${time}`;
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const SQL_KEYWORDS =
  /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|UPDATE|SET|INSERT|INTO|VALUES|DELETE|DESC|ASC|COUNT|DISTINCT|AS|IN|NOT|NULL|IS|LIKE|BETWEEN|CASE|WHEN|THEN|ELSE|END)\b/gi;

export interface SqlPart {
  t: string;
  kw: boolean;
}

export function highlightSql(sql: string): SqlPart[] {
  const parts: SqlPart[] = [];
  let last = 0;
  const re = new RegExp(SQL_KEYWORDS);
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    if (m.index > last) parts.push({ t: sql.slice(last, m.index), kw: false });
    parts.push({ t: m[0], kw: true });
    last = m.index + m[0].length;
  }
  if (last < sql.length) parts.push({ t: sql.slice(last), kw: false });
  return parts;
}

/** SVG polyline points for a mini sparkline. */
export function sparkPoints(vals: number[], w: number, h: number): string {
  if (vals.length < 2) return "";
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  return vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return x.toFixed(1) + "," + y.toFixed(1);
    })
    .join(" ");
}
