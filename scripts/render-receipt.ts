import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Repo = {
  name: string;
  owner: { login: string };
  fork: boolean;
  archived: boolean;
  private: boolean;
  stargazers_count: number;
  pushed_at: string | null;
  languages_url: string;
};

type TextStyle = {
  dim?: boolean;
  bold?: boolean;
  size?: number;
  spacing?: number;
};

type Row =
  | ({ kind: "center"; text: string; h?: number } & TextStyle)
  | ({ kind: "pair"; l: string; r: string; h?: number } & TextStyle)
  | { kind: "rule" }
  | { kind: "bar"; shares: number[]; h: number }
  | { kind: "barcode"; h: number };

const THEME_NAMES = ["light", "dark"] as const;
type ThemeName = (typeof THEME_NAMES)[number];

type Theme = {
  paper: string;
  ink: string;
  dim: string;
  slot: string;
  shadow: number;
};

const THEMES = {
  light: { paper: "#fffdf7", ink: "#1f2328", dim: "#59636e", slot: "#25292e", shadow: 0.14 },
  dark: { paper: "#1c2128", ink: "#e6edf3", dim: "#9198a1", slot: "#010409", shadow: 0.6 },
} satisfies Record<ThemeName, Theme>;

const LANGS_COUNT = 6;
const LANGUAGE_FETCH_CONCURRENCY = 10;

const W = 360;
const PX = 12;
const PAD = 22;
const LINE = 22;
const TOOTH = 7;
const TOP = 5;
const LEFT = PX + PAD;
const RIGHT = W - PX - PAD;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const user = requireEnv("GH_USER");
const token = process.env.GITHUB_TOKEN;
const outDir = process.env.OUT_DIR ?? "assets";
const receiptNo = String(process.env.GITHUB_RUN_NUMBER ?? 0).padStart(4, "0");
const animate = process.env.RECEIPT_ANIMATION !== "off";

const headers: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token && { Authorization: `Bearer ${token}` }),
};

class GitHubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function ghGet(url: string): Promise<{ body: unknown; next: string | undefined }> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new GitHubApiError(res.status, `GitHub API ${res.status} for ${url}: ${await res.text()}`);
  const body: unknown = await res.json();
  return { body, next: res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] };
}

async function ghGetAll(url: string | undefined): Promise<unknown[]> {
  const items: unknown[] = [];
  while (url) {
    const page = await ghGet(url);
    if (!Array.isArray(page.body)) throw new Error(`GitHub API returned an unexpected response for ${url}`);
    items.push(...page.body);
    url = page.next;
  }
  return items;
}

const isOwnRepo = (r: Repo): boolean =>
  !r.fork && r.owner.login.toLowerCase() === user.toLowerCase() && r.name.toLowerCase() !== user.toLowerCase();

async function fetchPrivateRepos(): Promise<Repo[]> {
  if (!token) return [];
  try {
    return (await ghGetAll("https://api.github.com/user/repos?visibility=private&affiliation=owner&per_page=100")) as Repo[];
  } catch (e) {
    // Actions の GITHUB_TOKEN のようにユーザー API を持たないトークンは 403 になるので公開のみで続行する
    if (e instanceof GitHubApiError && e.status === 403) return [];
    throw e;
  }
}

const publicRepos = (
  (await ghGetAll(`https://api.github.com/users/${encodeURIComponent(user)}/repos?type=owner&per_page=100`)) as Repo[]
).filter(isOwnRepo);
const privateRepos = (await fetchPrivateRepos()).filter(isOwnRepo);
const repos = [...publicRepos, ...privateRepos];
const latest = publicRepos
  .filter((r): r is Repo & { pushed_at: string } => !r.archived && r.pushed_at !== null)
  .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at))[0];

const languageSizes = new Map<string, number>();
for (let i = 0; i < repos.length; i += LANGUAGE_FETCH_CONCURRENCY) {
  const pages = await Promise.all(repos.slice(i, i + LANGUAGE_FETCH_CONCURRENCY).map((r) => ghGet(r.languages_url)));
  for (const { body } of pages) {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("GitHub API returned an unexpected languages response");
    }
    for (const [name, size] of Object.entries(body as Record<string, number>)) {
      languageSizes.set(name, (languageSizes.get(name) ?? 0) + size);
    }
  }
}
const topLanguages = [...languageSizes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, LANGS_COUNT);
const shownLanguageSize = topLanguages.reduce((n, [, size]) => n + size, 0);
const languages = topLanguages.map(([name, size]) => ({ name, share: size / shownLanguageSize }));
const topLanguage = languages[0]?.name ?? "-";

const jst = (date: Date, opts: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", ...opts }).format(date);
const fit = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const rows: Row[] = [
  { kind: "center", text: `@${user}`, size: 17, bold: true, h: 26 },
  { kind: "center", text: "PROFILE RECEIPT", dim: true, spacing: 3, h: 30 },
  { kind: "pair", l: `${jst(new Date(), { dateStyle: "short", timeStyle: "short" })} JST`, r: `NO.${receiptNo}`, dim: true },
  { kind: "rule" },
  { kind: "pair", l: "PUBLIC REPOS", r: `x ${publicRepos.length}` },
  ...(privateRepos.length > 0 ? [{ kind: "pair", l: "PRIVATE REPOS", r: `x ${privateRepos.length}` } as const] : []),
  { kind: "pair", l: "STARS EARNED", r: `x ${repos.reduce((n, r) => n + r.stargazers_count, 0)}` },
  { kind: "pair", l: "LAST PUSH", r: latest ? fit(latest.name, 22) : "-" },
  ...(latest
    ? [{ kind: "pair", l: "", r: jst(new Date(latest.pushed_at), { dateStyle: "short" }), dim: true } as const]
    : []),
  ...(languages.length > 0
    ? [
        { kind: "rule" } as const,
        { kind: "center", text: "MOST USED LANGUAGES", dim: true, spacing: 2, h: 26 } as const,
        { kind: "bar", shares: languages.map((l) => l.share), h: 24 } as const,
        ...languages.map((l): Row => ({ kind: "pair", l: fit(l.name, 22), r: `${(l.share * 100).toFixed(2)}%` })),
      ]
    : []),
  { kind: "rule" },
  { kind: "pair", l: "COFFEE", r: "x ∞" },
  { kind: "rule" },
  { kind: "pair", l: "TOTAL", r: "1 DEVELOPER", bold: true, size: 15, h: 26 },
  { kind: "pair", l: "PAID WITH", r: "CURIOSITY" },
  { kind: "barcode", h: 62 },
  { kind: "center", text: "*** APPROVED ***", bold: true },
  { kind: "center", text: "THANK YOU FOR VISITING", dim: true },
];

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ESCAPES[c] ?? c);

function text(
  x: number,
  y: number,
  value: string,
  { anchor = "start", dim, bold, size, spacing }: TextStyle & { anchor?: "start" | "middle" | "end" } = {},
): string {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    anchor !== "start" && `text-anchor="${anchor}"`,
    dim && `class="dim"`,
    bold && `font-weight="700"`,
    size !== undefined && `font-size="${size}"`,
    spacing !== undefined && `letter-spacing="${spacing}"`,
  ].filter((a): a is string => typeof a === "string");
  return `<text ${attrs.join(" ")}>${esc(value)}</text>`;
}

function rowHeight(row: Row): number {
  switch (row.kind) {
    case "rule":
      return 16;
    case "bar":
    case "barcode":
      return row.h;
    default:
      return row.h ?? LINE;
  }
}

function bar(shares: number[], y: number): string {
  const gap = 2;
  const width = RIGHT - LEFT - gap * (shares.length - 1);
  const rects: string[] = [];
  let x = LEFT;
  shares.forEach((share, i) => {
    const w = Math.max(1, share * width);
    const opacity = Math.max(0.2, 1 - i * 0.16).toFixed(2);
    rects.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="10" rx="1" fill-opacity="${opacity}"/>`);
    x += w + gap;
  });
  return `<g class="ink">${rects.join("")}</g>`;
}

function barcode(seed: string, y: number): string {
  let s = [...seed].reduce((h, c) => Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619) >>> 0, 2166136261);
  const next = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
  const bars: string[] = [];
  for (let x = LEFT + 36; ; ) {
    const w = 1 + ((next() >>> 28) % 3);
    if (x + w > RIGHT - 36) break;
    bars.push(`<rect x="${x}" y="${y}" width="${w}" height="40"/>`);
    x += w + 1 + ((next() >>> 30) % 2);
  }
  return `<g class="ink">${bars.join("")}</g>`;
}

function paperPath(bottom: number): string {
  const n = Math.round((W - 2 * PX) / (TOOTH * 2));
  const step = (W - 2 * PX) / n;
  let d = `M${PX} ${TOP} H${W - PX} V${bottom}`;
  for (let i = n - 1; i >= 0; i--) {
    const x = PX + i * step;
    d += ` L${(x + step / 2).toFixed(1)} ${bottom + TOOTH} L${x.toFixed(1)} ${bottom}`;
  }
  return `${d} Z`;
}

function render(theme: ThemeName): string {
  const t = THEMES[theme];
  const body: string[] = [];
  let y = TOP + 22;
  for (const row of rows) {
    const base = y + 15;
    switch (row.kind) {
      case "center":
        body.push(text(W / 2, base, row.text, { ...row, anchor: "middle" }));
        break;
      case "pair":
        if (row.l) body.push(text(LEFT, base, row.l, row));
        body.push(text(RIGHT, base, row.r, { ...row, anchor: "end" }));
        break;
      case "rule":
        body.push(`<line x1="${LEFT}" x2="${RIGHT}" y1="${y + 8}" y2="${y + 8}" class="rule"/>`);
        break;
      case "bar":
        body.push(bar(row.shares, y + 6));
        break;
      case "barcode":
        body.push(barcode(user, y + 10));
        break;
    }
    y += rowHeight(row);
  }
  const bottom = y + 14;
  const height = bottom + TOOTH + PX;
  const travel = bottom + TOOTH;
  const motion = animate
    ? `.paper { animation: print 1.8s steps(28, end) both; }
  @keyframes print { from { transform: translateY(-${travel}px); } to { transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .paper { animation: none; } }`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-labelledby="title">
<title id="title">Receipt for @${esc(user)}: ${publicRepos.length} public repos, top language ${esc(topLanguage)}</title>
<style>
  text { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 13px; fill: ${t.ink}; }
  .dim { fill: ${t.dim}; }
  .ink { fill: ${t.ink}; }
  .rule { stroke: ${t.dim}; stroke-width: 1; stroke-dasharray: 4 4; }
  ${motion}
</style>
<defs>
  <clipPath id="below-slot"><rect x="0" y="${TOP}" width="${W}" height="${height - TOP}"/></clipPath>
  <filter id="shadow" x="-10%" y="-5%" width="120%" height="115%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="${t.shadow}"/></filter>
</defs>
<g clip-path="url(#below-slot)">
  <g class="paper">
    <path d="${paperPath(bottom)}" fill="${t.paper}" filter="url(#shadow)"/>
    ${body.join("\n    ")}
  </g>
</g>
<rect x="2" y="0" width="${W - 4}" height="10" rx="5" fill="${t.slot}"/>
</svg>
`;
}

await mkdir(outDir, { recursive: true });
for (const theme of THEME_NAMES) {
  await writeFile(join(outDir, `receipt-${theme}.svg`), render(theme));
}
console.log(`Printed receipt NO.${receiptNo} for @${user} (${repos.length} repos, ${privateRepos.length} private)`);
