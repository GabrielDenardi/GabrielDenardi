import { readFileSync, writeFileSync } from "node:fs";

type Repository = { name: string; fork: boolean; archived: boolean; pushed_at: string };
type Post = { title: string; link: string; publishedAt: Date };

const USER = "GabrielDenardi";
const FEED_URL = "https://blog.gabrieldenardi.com.br/rss.xml";
const RECENT_DAYS = 21;
const POSTS_SHOWN = 3;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const root = new URL("..", import.meta.url);
const readmeUrl = new URL("README.md", root);
const bannerUrls = ["assets/banner-light.svg", "assets/banner-dark.svg"].map((path) => new URL(path, root));

async function fetchOk(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const response = await fetch(url, { headers: { "User-Agent": `${USER}-perfil`, ...headers } });
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}`);
  return response;
}

async function latestRepository(): Promise<Repository | undefined> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetchOk(
    `https://api.github.com/users/${USER}/repos?type=owner&sort=pushed&per_page=20`,
    headers,
  );
  const repositories: Repository[] = await response.json();
  return repositories.find((repository) => !repository.fork && !repository.archived && repository.name !== USER);
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

function isRecent(isoDate: string): boolean {
  const ageInDays = (Date.now() - new Date(isoDate).getTime()) / 86_400_000;
  return ageInDays <= RECENT_DAYS;
}

function statusText(repository: Repository): string {
  const prefix = isRecent(repository.pushed_at) ? "agora em" : "último push em";
  return `${prefix} ${repository.name}`;
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

const [repository, posts] = await Promise.all([latestRepository(), latestPosts()]);

if (repository) updateBanners(statusText(repository));
if (posts.length > 0) updateReadme(posts);

console.log(repository ? statusText(repository) : "sem repositório", "/", posts.length, "posts");
