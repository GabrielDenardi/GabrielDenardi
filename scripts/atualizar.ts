import { readFileSync, writeFileSync } from "node:fs";

type Post = { title: string; link: string; publishedAt: Date };
type PushEvent = { type: string; public: boolean; created_at: string; repo: { name: string } };

const USER = "GabrielDenardi";
const FEED_URL = "https://blog.gabrieldenardi.com.br/rss.xml";
const FOCUS = "estudando agentes de IA, MCP e evals";
const ACTIVE_HOURS = 72;
const POSTS_SHOWN = 3;
const EVENT_PAGES = 3;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const ORGANIZATION_LABELS: Record<string, string> = {
  "logithink": "em projetos da Logithink",
  "logicode-logithink": "em projetos da Logithink",
  "bom-evento": "no Bom Evento",
};

const PRODUCT_LABELS: Record<string, string> = {
  "app-financeiro": "no App Nitin",
  "app-financeiro-landing": "no App Nitin",
  "nitin-support": "no App Nitin",
  "figurinha-vi": "na Figurinha VI",
  "gabriel-blog": "no meu blog",
  "gabriel-portfolio": "no meu portfólio",
  "portfolio": "no meu portfólio",
};

const PRIVATE_CLIENT_LABEL = "em um projeto de cliente";

const root = new URL("..", import.meta.url);
const readmeUrl = new URL("README.md", root);
const bannerUrls = ["assets/banner-light.svg", "assets/banner-dark.svg"].map((path) => new URL(path, root));

function warn(message: string): void {
  console.log(`::warning::${message}`);
}

async function fetchOk(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const response = await fetch(url, { headers: { "User-Agent": `${USER}-perfil`, ...headers } });
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}`);
  return response;
}

async function recentPushes(): Promise<PushEvent[]> {
  const token = process.env.PERFIL_TOKEN;
  if (!token) warn("PERFIL_TOKEN ausente: só os pushes públicos ficam visíveis");
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const pages = await Promise.all(
    Array.from({ length: EVENT_PAGES }, async (_, index) => {
      const url = `https://api.github.com/users/${USER}/events?per_page=100&page=${index + 1}`;
      const events: PushEvent[] = await (await fetchOk(url, headers)).json();
      return events;
    }),
  );
  return pages
    .flat()
    .filter((event) => event.type === "PushEvent" && event.repo.name !== `${USER}/${USER}`)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

function placeLabel(push: PushEvent): string | undefined {
  const [owner, repository] = push.repo.name.split("/");
  const organizationLabel = ORGANIZATION_LABELS[owner.toLowerCase()];
  if (organizationLabel) return organizationLabel;
  if (owner !== USER) return undefined;
  if (push.public) return `em ${repository}`;
  return PRODUCT_LABELS[repository] ?? PRIVATE_CLIENT_LABEL;
}

function isActive(push: PushEvent): boolean {
  return Date.now() - Date.parse(push.created_at) <= ACTIVE_HOURS * 3_600_000;
}

async function currentStatus(): Promise<string> {
  try {
    const latest = (await recentPushes())[0];
    const label = latest && isActive(latest) ? placeLabel(latest) : undefined;
    return label ? `agora ${label}` : FOCUS;
  } catch (error) {
    warn(`não consegui ler os pushes (${(error as Error).message}); usando a linha de foco`);
    return FOCUS;
  }
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function updateBanners(status: string): void {
  for (const url of bannerUrls) {
    const banner = readFileSync(url, "utf8");
    writeFileSync(url, banner.replace(/(<text id="status"[^>]*>)[^<]*(<\/text>)/, `$1${escapeXml(status)}$2`));
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tagContent(item: string, tag: string): string {
  return decodeEntities(item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
}

async function latestPosts(): Promise<Post[]> {
  const feed = await (await fetchOk(FEED_URL)).text();
  return [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => ({
      title: tagContent(item, "title"),
      link: tagContent(item, "link"),
      publishedAt: new Date(tagContent(item, "pubDate")),
    }))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

function monthLabel(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/([[\]])/g, "\\$1");
}

function updateReadme(posts: Post[]): void {
  const rows = posts
    .slice(0, POSTS_SHOWN)
    .map((post) => `| ${monthLabel(post.publishedAt)} | [${escapeTableCell(post.title)}](${post.link}) |`);
  const table = ["| Data | Texto |", "| --- | --- |", ...rows].join("\n");
  const readme = readFileSync(readmeUrl, "utf8");
  writeFileSync(
    readmeUrl,
    readme.replace(/(<!-- blog:start -->\r?\n)[\s\S]*?(\r?\n<!-- blog:end -->)/, `$1${table}$2`),
  );
}

const status = await currentStatus();
updateBanners(status);

try {
  const posts = await latestPosts();
  if (posts.length > 0) updateReadme(posts);
} catch (error) {
  warn(`não consegui ler o RSS do blog (${(error as Error).message})`);
}

console.log(status);
