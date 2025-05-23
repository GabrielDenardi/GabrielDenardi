import fs from "fs";
import path from "path";
import { Octokit } from "@octokit/rest";
import { startOfMonth, subMonths, endOfMonth, formatISO } from "date-fns";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME     = "GabrielDenardi";
const README_PATH  = path.resolve(process.cwd(), "README.md");
const MARKER_START = "<!-- MONTHLY_LANGUAGES_START -->";
const MARKER_END   = "<!-- MONTHLY_LANGUAGES_END -->";

const EXT_TO_LANG = {
  js:   "JavaScript",
  ts:   "TypeScript",
  php:  "PHP",
  go:   "Go",
  py:   "Python",
  java: "Java",
  rb:   "Ruby",
  cs:   "C#",
  cpp:  "C++",
};

async function main() {
  if (!GITHUB_TOKEN) {
    console.error("⚠️  Defina a variável de ambiente GITHUB_TOKEN");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  const now          = new Date();
  const firstOfThis  = startOfMonth(now);
  const lastMonthEnd = subMonths(firstOfThis, 1);
  const sinceISO     = formatISO(startOfMonth(lastMonthEnd));
  const untilISO     = formatISO(endOfMonth(lastMonthEnd));

  console.log(`Buscando commits de ${sinceISO} até ${untilISO}…`);

  const repos = await octokit.paginate(octokit.repos.listForUser, {
    username: USERNAME,
    per_page: 100,
  });

  const langCounts = {};

  for (const repo of repos) {
    const commits = await octokit.paginate(octokit.repos.listCommits, {
      owner:  USERNAME,
      repo:   repo.name,
      author: USERNAME,
      since:  sinceISO,
      until:  untilISO,
      per_page: 100,
    });

    for (const c of commits) {
      const { data: full } = await octokit.repos.getCommit({
        owner: USERNAME,
        repo:  repo.name,
        ref:   c.sha,
      });

      for (const file of full.files || []) {
        const ext = path.extname(file.filename).replace(/^\./, "");
        // Ignora extensões não mapeadas
        if (!(ext in EXT_TO_LANG)) continue;
        const lang = EXT_TO_LANG[ext];
        langCounts[lang] = (langCounts[lang] || 0) + 1;
      }
    }
  }

  const sortedLangs = Object.entries(langCounts)
    .sort(([,a],[,b]) => b - a);

  console.log("Linguagens ordenadas:", sortedLangs);

  const lines = [
    MARKER_START,
    "## 🗓️ Linguagens do mês passado\n",
    ...sortedLangs.map(([lang, count]) => `- **${lang}**: ${count} commits`),
    "",
    MARKER_END,
  ].join("\n");

  const readme = fs.readFileSync(README_PATH, "utf8");
  const [before] = readme.split(MARKER_START);
  const [, after] = readme.split(MARKER_END);
  const updated = before + lines + after;

  fs.writeFileSync(README_PATH, updated, "utf8");
  console.log("✅ README.md atualizado com sucesso!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
