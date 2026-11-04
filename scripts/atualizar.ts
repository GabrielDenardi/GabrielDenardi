import { readFileSync, writeFileSync } from "node:fs";

type Post = { title: string; link: string; publishedAt: Date };

const FEED_URL = "https://blog.gabrieldenardi.com.br/rss.xml";
const POSTS_SHOWN = 3;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const readmeUrl = new URL("../README.md", import.meta.url);

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
  const response = await fetch(FEED_URL, { headers: { "User-Agent": "GabrielDenardi-perfil" } });
  if (!response.ok) throw new Error(`${FEED_URL} respondeu ${response.status}`);
  const feed = await response.text();
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

const posts = await latestPosts();
if (posts.length > 0) updateReadme(posts);
console.log(posts.length, "posts");
