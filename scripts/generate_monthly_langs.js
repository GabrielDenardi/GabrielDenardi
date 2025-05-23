import fs from "fs";
import path from "path";
import { Octokit } from "@octokit/rest";
import { startOfMonth, subMonths, endOfMonth, formatISO } from "date-fns";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME     = "GabrielDenardi";
const README_PATH  = path.resolve(process.cwd(), "README.md");
const MARKER_START = "<!-- MONTHLY_LANGUAGES_START -->";
const MARKER_END   = "<!-- MONTHLY_LANGUAGES_END -->";

// Mapeamento de extensão → nome da linguagem (opcionalmente ajuste ou remova extensões que não deseja contar)
const EXT_TO_LANG = {
  js:   "JavaScript",
  ts:   "TypeScript",
  jsx:  "JavaScript (JSX)",
  tsx:  "TypeScript (TSX)",
  php:  "PHP",
  go:   "Go",
  py:   "Python",
  java: "Java",
  rb:   "Ruby",
  cs:   "C#",
  cpp:  "C++",
  css:  "CSS",
  html: "HTML",
  // adicione mais se precisar
};

async function main() {
  if (!GITHUB_TOKEN) {
    console.error("⚠️  Defina a variável de ambiente GITHUB_TOKEN");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  // Intervalo: mês anterior completo
  const now          = new Date();
  const firstOfThis  = startOfMonth(now);
  const lastMonthEnd = subMonths(firstOfThis, 1);
  const sinceISO     = formatISO(startOfMonth(lastMonthEnd));
  const untilISO     = formatISO(endOfMonth(lastMonthEnd));

  console.log(`Buscando commits de ${sinceISO} até ${untilISO}…`);

  // 1) Recupera todos os repositórios do usuário
  const repos = await octokit.paginate(octokit.repos.listForUser, {
    username: USERNAME,
    per_page: 100,
  });

  const langCounts = {};

  for (const repo of repos) {
    // 2) Lista commits no intervalo, apenas do autor
    const commits = await octokit.paginate(octokit.repos.listCommits, {
      owner:   USERNAME,
      repo:    repo.name,
      author:  USERNAME,
      since:   sinceISO,
      until:   untilISO,
      per_page: 100,
    });

    for (const c of commits) {
      // 3) Pega detalhes do commit para acessar os arquivos modificados
      const { data: full } = await octokit.repos.getCommit({
        owner: USERNAME,
        repo:  repo.name,
        ref:   c.sha,
      });

      for (const file of full.files || []) {
        // extrai extensão sem ponto e em lowercase
        const ext = path.extname(file.filename).slice(1).toLowerCase();
        if (!ext) continue;                   // ignora sem extensão

        // nome legível ou ext por padrão
        const lang = EXT_TO_LANG[ext] ?? ext;
        langCounts[lang] = (langCounts[lang] || 0) + 1;
      }
    }
  } // fim do for de repos

  // 4) Ordena todas as linguagens por contagem de commits
  const sortedLangs = Object.entries(langCounts)
    .sort(([,a],[,b]) => b - a);

  console.log("Linguagens ordenadas:", sortedLangs);

  // 5) Monta o bloco de markdown
  const lines = [
    MARKER_START,
    "## 🗓️ Linguagens do mês passado\n",
    ...sortedLangs.map(([lang, count]) => `- **${lang}**: ${count} commits`),
    "",
    MARKER_END,
  ].join("\n");

  // 6) Injeta no README entre os marcadores
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
