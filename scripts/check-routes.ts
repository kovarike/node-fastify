/**
 * scripts/check-routes.ts
 *
 * README (breve)
 * ----------------
 * Ferramenta CLI de auditoria estática das rotas do projeto (Fastify + TypeScript).
 *
 * Instalação (dev):
 *   npm i -D ts-morph @types/node chalk
 *
 * Execução:
 *   npx tsx scripts/check-routes.ts         # executa auditoria e gera relatório JSON em ./reports
 *   npx tsx scripts/check-routes.ts --fix   # gera patches sugeridos (não altera código)
 *   npx tsx scripts/check-routes.ts --init-tests  # cria scaffold de testes em scripts/check-routes.test.ts
 *
 * Integração GitHub Actions (exemplo):
 * .github/workflows/route-audit.yml
 *   name: Route Audit
 *   on: [push, pull_request]
 *   jobs:
 *     audit:
 *       runs-on: ubuntu-latest
 *       steps:
 *         - uses: actions/checkout@v4
 *         - name: Setup Node
 *           uses: actions/setup-node@v4
 *           with: node-version: "20"
 *         - run: npm ci
 *         - run: npx tsx scripts/check-routes.ts --json --fail-on-error
 *
 * Limitações:
 *  - Análise estática: não detecta construção dinâmica de rotas, nomes de tabelas gerados em runtime,
 *    ou imports resolvidos por aliases não configurados.
 *  - Pode produzir falsos positivos; revisar os relatórios antes de automatizar correções.
 *
 * Objetivo:
 *  - Detectar padrões importantes: registro correto de rotas, presença de autenticação em rotas protegidas,
 *    uso de validação Zod, consistência com schema Drizzle, imports inválidos, proteção de endpoints sensíveis.
 *
 * Observações:
 *  - O script tenta carregar 'ts-morph' dinamicamente e indica instruções de instalação caso não esteja presente.
 *
 * --------------------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import process from "process";

const argv = process.argv.slice(2);
const OPT_FIX = argv.includes("--fix");
const OPT_JSON = argv.includes("--json") || argv.includes("--report-json");
const OPT_FAIL_ON_ERROR = argv.includes("--fail-on-error");
const OPT_INIT_TESTS = argv.includes("--init-tests") || argv.includes("--init-tests");
const PROJECT_ROOT =  process.cwd() //path.resolve(__dirname, "..", ".."); // /home/danilo/www/api
const REPORTS_DIR = path.join(PROJECT_ROOT, "reports");

async function tryImportTsMorph() {
  try {
    // dynamic import to provide friendly message if not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Project, SyntaxKind } = await import("ts-morph");
    return { Project, SyntaxKind };
  } catch (err) {
    console.error(
      "\nErro: módulo 'ts-morph' não encontrado. Instale como dependência de desenvolvimento:\n\n  npm i -D ts-morph @types/node chalk\n\n"
    );
    process.exit(2);
  }
}

async function tryImportChalk() {
  try {
    const chalk = await import("chalk");
    return chalk.default || chalk;
  } catch {
    // fallback minimal coloring
    return {
      red: (s: string) => s,
      yellow: (s: string) => s,
      green: (s: string) => s,
      blue: (s: string) => s,
      bold: (s: string) => s,
    };
  }
}

type Severity = "error" | "warning" | "info";

interface Issue {
  file: string;
  line?: number;
  severity: Severity;
  title: string;
  message: string;
  suggestion?: { file: string; snippet: string; where?: string };
}

async function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function main() {
  const { Project, SyntaxKind } = await tryImportTsMorph();
  const chalk = await tryImportChalk();

  const project = new Project({
    tsConfigFilePath: fs.existsSync(path.join(PROJECT_ROOT, "tsconfig.json"))
      ? path.join(PROJECT_ROOT, "tsconfig.json")
      : undefined,
    skipFileDependencyResolution: true,
  });

  // Add relevant source files
  const patterns = [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!**/node_modules/**",
  ];
  project.addSourceFilesAtPaths(patterns);

  // Load specific important files
  const apiFile = project.getSourceFile((p) => p.getFilePath().endsWith("/src/api.ts"));
  const typesFile = project.getSourceFile((p) => p.getFilePath().endsWith("/src/@types/fastify.d.ts"))
    || project.getSourceFile((p) => p.getFilePath().endsWith("/src/@types/fastify.ts"));
  const schemaFile = project.getSourceFile((p) => p.getFilePath().endsWith("/src/db/schema.ts"))
    || project.getSourceFile((p) => p.getFilePath().endsWith("/src/db/schema.ts"));

  const allSourceFiles = project.getSourceFiles();

  // Helpers
  function locatePosition(source: any, pos: number) {
    try {
      const { line } = source.getLineAndColumnAtPos(pos);
      return line;
    } catch {
      return undefined;
    }
  }

  // Extract declared Fastify augmentations (request.user, instance.jwt, etc.)
  function parseFastifyTypes(): { requestUser?: boolean; instanceJwt?: boolean; instanceSetCookie?: boolean } {
    if (!typesFile) return {};
    const text = typesFile.getText();
    return {
      requestUser: /FastifyRequest.*\buser\b|declare module ["']fastify["']([\s\S]*?)user\b/.test(text),
      instanceJwt: /FastifyInstance.*\bjwt\b|declare module ["']fastify["']([\s\S]*?)jwt\b/.test(text),
      instanceSetCookie:
        /FastifyReply.*\bsetCookie\b|declare module ["']fastify["']([\s\S]*?)setCookie\b/.test(text),
    };
  }

  const fastifyTypes = parseFastifyTypes();

  // Parse DB schema: look for pgTable("name" ...) or export const name = pgTable(...)
  function parseDbSchemaNames(): { tables: Set<string>; exportedVarNames: Set<string> } {
    const tables = new Set<string>();
    const vars = new Set<string>();
    if (!schemaFile) return { tables, exportedVarNames: vars };
    const text = schemaFile.getText();
    const pgTableRegex = /pgTable\s*\(\s*['"`]([\w-]+)['"`]/g;
    let m;
    while ((m = pgTableRegex.exec(text)) !== null) {
      tables.add(m[1]);
    }
    // exported const names
    const exportVarRegex = /export\s+const\s+([\w$]+)/g;
    while ((m = exportVarRegex.exec(text)) !== null) {
      vars.add(m[1]);
    }
    return { tables, exportedVarNames: vars };
  }

  const dbInfo = parseDbSchemaNames();

  // Utility to add issue
  const issues: Issue[] = [];

  function addIssue(file: string, line: number | undefined, severity: Severity, title: string, message: string, suggestion?: { file: string; snippet: string; where?: string }) {
    issues.push({ file, line, severity, title, message, suggestion });
  }

  // Scan route files (src/routers/**)
  function scanRoutes() {
    const routeFiles = allSourceFiles.filter((sf) => sf.getFilePath().includes("/src/routers/"));
    for (const sf of routeFiles) {
      const relative = path.relative(PROJECT_ROOT, sf.getFilePath());
      const text = sf.getText();

      // Rule A: must export/register plugin or register routes via fastify.route or fastify.get/post/...
      const hasDefaultExportFunction = !!sf.getDefaultExportSymbol();
      const hasFastifyRouteCall = /(?:\bfastify\.(?:get|post|put|delete|route)|\.route\()/m.test(text);
      if (!hasDefaultExportFunction && !hasFastifyRouteCall) {
        addIssue(relative, 1, "warning", "Rota não registrada/exportada claramente", "Arquivo de rota não exporta um plugin nem registra rotas via fastify.route/fastify.get|post|put|delete. Verifique se este arquivo está sendo registrado pelo servidor.", {
          file: relative,
          snippet: `// SUGESTÃO: export default async function plugin(fastify) {\n//   fastify.get('/path', async (request, reply) => {})\n// }\n`,
        });
      }

      // For each route-like call, attempt to extract the path and method (simple regex)
      const routeCallRegex = /fastify\.(get|post|put|delete|patch)\s*\(\s*(['"`]\/[^'"`]*['"`])/g;
      let rc;
      while ((rc = routeCallRegex.exec(text)) !== null) {
        const method = rc[1].toUpperCase();
        const rawPath = rc[2].slice(1, -1);
        const pos = rc.index;
        const line = locatePosition(sf, pos);
        checkRouteDetails(sf, relative, method, rawPath, pos, line);
      }

      // Also check for fastify.route({ method: 'POST', url: '/x', ... })
      const routeObjRegex = /fastify\.route\s*\(\s*{([\s\S]*?)\}\s*\)/g;
      let ro;
      while ((ro = routeObjRegex.exec(text)) !== null) {
        const objText = ro[1];
        const mMethod = /method\s*:\s*['"`]?(GET|POST|PUT|DELETE|PATCH)['"`]?/i.exec(objText);
        const mUrl = /url\s*:\s*(['"`]\/[^'"`]*['"`])/i.exec(objText);
        const method = mMethod ? mMethod[1].toUpperCase() : "UNKNOWN";
        const rawPath = mUrl ? mUrl[1].slice(1, -1) : "UNKNOWN";
        const pos = ro.index;
        const line = locatePosition(sf, pos);
        checkRouteDetails(sf, relative, method, rawPath, pos, line);
      }

      // If file contains comments with @protected mark and no authentication usage, warn
      if (/@protected\b/.test(text)) {
        const hasAuthMiddleware = /authenticate|preHandler\s*:|register\(\s*.*authenticate|register\(\s*.*auth/.test(text);
        if (!hasAuthMiddleware) {
          addIssue(relative, 1, "error", "Rota marcada como @protected sem middleware de autenticação", "Arquivo contém comentário @protected mas não parece aplicar middleware de autenticação (ex: fastify.authenticate ou registro de middleware).", {
            file: relative,
            snippet: `// SUGESTÃO: adicionar proteção\n// fastify.addHook('preHandler', async (request, reply) => { await request.jwtVerify(); })\n`,
          });
        }
      }

      // Check imports validity and dead imports (Rule G)
      const imports = sf.getImportDeclarations();
      for (const imp of imports) {
        const spec = imp.getModuleSpecifierValue();
        if (spec.startsWith(".") || spec.startsWith("/")) {
          // Resolve relative to file
          const baseDir = path.dirname(sf.getFilePath());
          const resolved = path.resolve(baseDir, spec) + ".ts";
          const resolvedIndex = path.resolve(baseDir, spec, "index.ts");
          if (!fs.existsSync(resolved) && !fs.existsSync(resolvedIndex)) {
            // maybe extensionless or .tsx - try to find any file
            const alt = path.resolve(baseDir, spec);
            const found = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.js"].some((ext) => fs.existsSync(alt + ext));
            if (!found) {
              addIssue(relative, locatePosition(sf, imp.getStart()), "error", "Import inválido / arquivo não encontrado", `Import declara "${spec}" mas o arquivo não foi encontrado a partir de ${relative}. Verifique caminho de import.`, {
                file: relative,
                snippet: `// SUGESTÃO: ajustar import para caminho correto\n// import X from './caminho/correto'`,
              });
            }
          } else {
            // verify named imports exist in the target file (best effort)
            try {
              const resolvedPath = fs.existsSync(resolved) ? resolved : resolvedIndex;
              const targetText = fs.readFileSync(resolvedPath, "utf-8");
              const named = imp.getNamedImports().map((n) => n.getName());
              for (const ni of named) {
                const exportRegex = new RegExp(`export\\s+(?:const|function|class|type|interface)\\s+${ni}\\b|export\\s*\\{[^}]*\\b${ni}\\b`, "m");
                if (!exportRegex.test(targetText)) {
                  addIssue(relative, locatePosition(sf, imp.getStart()), "warning", "Importa identificador que não parece exportado", `O import "${ni}" de "${spec}" não foi encontrado no arquivo alvo. Pode ser um import inválido ou nome alterado.`, {
                    file: resolvedPath,
                    snippet: `// Verificar se '${ni}' está exportado neste arquivo`,
                  });
                }
              }
            } catch {
              // ignore resolution errors
            }
          }
        }
      }

      // Check for throws and direct reply.send with literal errors (Rule E)
      const throwRegex = /throw\s+new\s+Error\s*\(/g;
      while (throwRegex.exec(text) !== null) {
        const pos = throwRegex.lastIndex;
        const line = locatePosition(sf, pos);
        const importsErrorsModule = /from\s+['"].*services\/errors['"]/.test(text) || /services\/errors/.test(text);
        if (!importsErrorsModule) {
          addIssue(relative, line, "warning", "Uso direto de Error sem módulo de errors centralizado", "Encontrado `throw new Error(...)` sem uso visível do módulo services/errors. Recomenda-se usar classes de erro centralizadas para consistência e mapping de status.", {
            file: relative,
            snippet: `// SUGESTÃO: usar error helper\n// import { makeError } from '../services/errors'\n// throw makeError(400, 'mensagem')`,
          });
        }
      }
    }
  }

  // Check a particular route details for multiple rules
  function checkRouteDetails(sf: any, relative: string, method: string, rawPath: string, pos: number, line?: number) {
    const text = sf.getText();
    // Rule B: Protected endpoints detection
    const lowerPath = rawPath.toLowerCase();
    const protectedCandidates = ["/auth", "/me", "/user", "/admin", "/users", "/profile"];
    const suspicious = protectedCandidates.some((p) => lowerPath.includes(p)) || /@protected\b/.test(text);
    if (suspicious) {
      // Check for presence of authenticate usage
      const hasRegisterAuth = /register\([^)]*authenticate|register\([^)]*authMiddleware|authenticate\(|preHandler\s*:/.test(text);
      if (!hasRegisterAuth) {
        addIssue(relative, line, "error", `Rota ${method} ${rawPath} parece protegida mas não aplica autenticação`, `Rota que parece exigir autenticação não aplica middleware de autenticação (fastify.authenticate / preHandler / register(auth)).`, {
          file: relative,
          snippet: `// SUGESTÃO: proteger rota com preHandler\n// fastify.get('${rawPath}', { preHandler: [fastify.authenticate] }, async (request, reply) => {})`,
        });
      } else {
        // If middleware present, verify permission checks maybe exist (best-effort)
        const hasRoleCheck = /check-user-role|checkUserRole|hasRole|isAdmin|roles/.test(text);
        if (!hasRoleCheck && lowerPath.includes("/admin")) {
          addIssue(relative, line, "warning", `Rota admin (${rawPath}) sem verificação explícita de permissões`, "Rota com '/admin' detectada sem checagem de roles/claims. Considere validar claims/roles após autenticação.", {
            file: relative,
            snippet: `// SUGESTÃO: adicionar verificação de role\n// preHandler: [fastify.authenticate, checkUserRole('admin')]`,
          });
        }
      }
    }

    // Rule C: Zod validation: look for z.object usage or schema.parse or validator wires
    const routeBlockStart = pos || 0;
    const snippetAfter = text.slice(routeBlockStart, routeBlockStart + 600);
    const usesZod = /z\.object\s*\(|\.parse\(|TypeOf<|zod/.test(snippetAfter) || /zod/.test(text);
    if (!usesZod) {
      addIssue(relative, line, "warning", `Rota ${method} ${rawPath} sem validação Zod detectada`, "Handler não parece usar Zod para validar body/query/params. Recomenda-se validar entradas com Zod para segurança e typing.", {
        file: relative,
        snippet: `// SUGESTÃO (usar zod):\n// const bodySchema = z.object({ title: z.string() })\n// const input = bodySchema.parse(request.body)\n`,
      });
    }

    // Rule H: rate-limit on public creation endpoints (POST /register, POST /login)
    if (method === "POST" && (rawPath.includes("/register") || rawPath.includes("/login"))) {
      const hasRateLimit = /rateLimit|@fastify\/rate-limit/.test(sf.getText());
      const hasRecaptcha = /recaptcha|reCAPTCHA|recaptchaVerify|verifyRecaptcha/.test(sf.getText());
      if (!hasRateLimit && !hasRecaptcha) {
        addIssue(relative, line, "warning", `Endpoint ${method} ${rawPath} sem proteção de abuse (rate-limit ou recaptcha)`, "Endpoints que criam contas ou fazem login devem ter proteção contra brute-force (rate-limit, recaptcha).", {
          file: relative,
          snippet: `// SUGESTÃO: aplicar rate-limit ao endpoint ou middleware\n// fastify.register(rateLimit, { max: 5, timeWindow: '1 minute' })\n`,
        });
      }
    }

    // Rule I: Cookie / JWT usage: ensure cookies/jwt follow api.ts registration
    if (apiFile) {
      const apiText = apiFile.getText();
      const apiRegistersJwt = /@fastify\/jwt|fastify-jwt|jwt/.test(apiText);
      const apiRegistersCookie = /@fastify\/cookie|cookie/.test(apiText);
      const routeText = text;
      if (apiRegistersJwt) {
        // if route sets tokens, ensure they use reply.setCookie or reply.jwtSign
        const setsCookie = /setCookie\(|reply\.setCookie|reply\.cookie/.test(routeText);
        const usesJwtSign = /reply\.jwtSign|request\.jwt|request\.jwtVerify/.test(routeText);
        if ((rawPath.includes("/login") || rawPath.includes("/auth")) && !setsCookie && !usesJwtSign) {
          addIssue(relative, line, "warning", `Endpoint ${method} ${rawPath} parece auth mas não usa cookies/JWT conforme api.ts`, "Servidor registra JWT/cookie globalmente; rotas de auth tipicamente devem usar reply.jwtSign() ou reply.setCookie().", {
            file: relative,
            snippet: `// SUGESTÃO: use reply.jwtSign({ userId }) ou reply.setCookie('token', token, { httpOnly: true })`,
          });
        }
      }
      if (apiRegistersCookie && rawPath.includes("/login") && !/setCookie\(/.test(routeText)) {
        addIssue(relative, line, "warning", `Endpoint ${method} ${rawPath} não usa reply.setCookie() apesar do registro de cookie no api.ts`, "Considere setar cookie seguro para sessões.", {
          file: relative,
          snippet: `// SUGESTÃO: reply.setCookie('session', token, { httpOnly: true, secure: true })`,
        });
      }
    }

    // Rule D: Types Fastify conformance: usage of request.user or fastify.jwt must be declared
    const usesRequestUser = /\brequest\.user\b/.test(text);
    const usesFastifyJwt = /\bfastify\.jwt\b|\brequest\.jwt\b|\breply\.jwtSign\b|\brequest\.jwtVerify\b/.test(text);
    if (usesRequestUser && !fastifyTypes.requestUser) {
      addIssue(relative, line, "error", `Uso de request.user sem declaração em src/@types/fastify.d.ts`, "Arquivo acessa request.user mas não há declaração na augmentação de tipos do Fastify. Adicione em src/@types/fastify.d.ts: declare module 'fastify' { interface FastifyRequest { user?: YourUserType } }", {
        file: path.relative(PROJECT_ROOT, typesFile?.getFilePath() || "src/@types/fastify.d.ts"),
        snippet: `// SUGESTÃO (em src/@types/fastify.d.ts):\n// declare module 'fastify' {\n//   interface FastifyRequest {\n//     user?: { id: string; email: string }\n//   }\n// }\n`,
      });
    }
    if (usesFastifyJwt && !fastifyTypes.instanceJwt) {
      addIssue(relative, line, "warning", `Uso de fastify.jwt/request.jwt sem augmentação de tipos detectada`, "Considere declarar a augmentação TypeScript para FastifyInstance com jwt (src/@types/fastify.d.ts).", {
        file: path.relative(PROJECT_ROOT, typesFile?.getFilePath() || "src/@types/fastify.d.ts"),
        snippet: `// SUGESTÃO: declare module 'fastify' { interface FastifyInstance { jwt: any } }\n`,
      });
    }

    // Rule F: DB schema consistency - check literal '.from("table")' or "from('users')" usages and verify existence
    const dbFromRegex = /\.from\s*\(\s*['"`]([\w-]+)['"`]\s*\)/g;
    let df;
    while ((df = dbFromRegex.exec(text)) !== null) {
      const tbl = df[1];
      if (!dbInfo.tables.has(tbl) && ![...dbInfo.exportedVarNames].includes(tbl)) {
        addIssue(relative, line, "error", `Referência a tabela "${tbl}" que não existe em src/db/schema.ts`, `Encontrada chamada .from("${tbl}") mas nenhuma tabela "${tbl}" foi declarada em src/db/schema.ts. Verifique ortografia ou export de tabela.`, {
          file: path.relative(PROJECT_ROOT, schemaFile?.getFilePath() || "src/db/schema.ts"),
          snippet: `// SUGESTÃO: verifique se '${tbl}' está declarado em src/db/schema.ts\n`,
        });
      }
    }

    // Also check usage of sql.table('name') or db.table('name')
    const sqlTableRegex = /table\s*\(\s*['"`]([\w-]+)['"`]\s*\)/g;
    let st;
    while ((st = sqlTableRegex.exec(text)) !== null) {
      const tbl = st[1];
      if (!dbInfo.tables.has(tbl) && ![...dbInfo.exportedVarNames].includes(tbl)) {
        addIssue(relative, line, "error", `Uso de sql.table("${tbl}") sem definição no schema`, `Tabela "${tbl}" não encontrada em src/db/schema.ts.`, {
          file: path.relative(PROJECT_ROOT, schemaFile?.getFilePath() || "src/db/schema.ts"),
          snippet: `// SUGESTÃO: adicionar pgTable('${tbl}', ...) em src/db/schema.ts ou importar tabela correta\n`,
        });
      }
    }
  }

  // Run scans
  scanRoutes();

  // Additional checks across project

  // Check api.ts registration of plugins (jwt/cookie)
  function checkApiRegistrations() {
    if (!apiFile) return;
    const text = apiFile.getText();
    const apiRel = path.relative(PROJECT_ROOT, apiFile.getFilePath());
    const registersJwt = /@fastify\/jwt|fastify-jwt/i.test(text) || /register\([^)]*jwt/i.test(text);
    const registersCookie = /@fastify\/cookie/i.test(text) || /register\([^)]*cookie/i.test(text);
    if (!registersJwt) {
      addIssue(apiRel, undefined, "info", "Fastify não parece registrar JWT", "api.ts não registra @fastify/jwt; se pretende usar JWT, registre o plugin em api.ts.", {
        file: apiRel,
        snippet: `// SUGESTÃO: registrar jwt\n// import fastifyJwt from '@fastify/jwt'\n// server.register(fastifyJwt, { secret: process.env.JWT_SECRET })\n`,
      });
    }
    if (!registersCookie) {
      addIssue(apiRel, undefined, "info", "Fastify não parece registrar Cookie", "api.ts não registra @fastify/cookie; se pretende setar cookies, registre o plugin.", {
        file: apiRel,
        snippet: `// SUGESTÃO: registrar cookie\n// import fastifyCookie from '@fastify/cookie'\n// server.register(fastifyCookie, { secret: process.env.CURRENT_COOKIE_SECRETET })\n`,
      });
    }
  }

  checkApiRegistrations();

  // Generate report JSON and table
  await ensureReportsDir();
  const stamp = nowStamp();
  const reportPath = path.join(REPORTS_DIR, `route-audit-${stamp}.json`);
  const report = {
    generatedAt: new Date().toISOString(),
    projectRoot: PROJECT_ROOT,
    issues,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  // Print summary table
  const tableHeader = `${chalk.bold("Arquivo:Linha")} | ${chalk.bold("Sev")} | ${chalk.bold("Resumo")}`;
  console.log("\n" + chalk.blue("Route Audit Summary") + ` — report: ${reportPath}\n`);
  console.log(tableHeader);
  console.log("-".repeat(80));
  for (const it of issues) {
    const loc = `${it.file}${it.line ? ":" + it.line : ""}`;
    const sev =
      it.severity === "error" ? chalk.red("ERROR") : it.severity === "warning" ? chalk.yellow("WARN ") : chalk.green("INFO ");
    console.log(`${loc.padEnd(40)} | ${sev} | ${it.title}`);
  }
  console.log("\nDetalhes completos salvos em:", reportPath);

  // If JSON output requested, also print path (already saved)
  if (OPT_JSON) {
    console.log("JSON report:", reportPath);
  }

  // Generate patch suggestions when --fix
  if (OPT_FIX) {
    const patches: { file: string; diff: string }[] = [];
    for (const it of issues) {
      if (!it.suggestion) continue;
      const targetFile = path.join(PROJECT_ROOT, it.suggestion.file);
      if (!fs.existsSync(targetFile)) continue;
      const original = fs.readFileSync(targetFile, "utf-8");
      // Simple patch: append suggestion at end with comment and marker
      const snippet = `\n/* --- SUGESTION FROM route-audit (${stamp}) --- */\n${it.suggestion.snippet}\n/* --- END SUGGESTION --- */\n`;
      const patched = original + snippet;
      // Create unified diff-like output (simple)
      const diff = `*** ${it.suggestion.file} (original)\n--- suggestion\n@@\n<<append at EOF>>\n${it.suggestion.snippet}\n`;
      patches.push({ file: it.suggestion.file, diff });
    }
    if (patches.length > 0) {
      const patchPath = path.join(REPORTS_DIR, `route-audit-patches-${stamp}.txt`);
      const content = patches.map((p) => `FILE: ${p.file}\n${p.diff}\n`).join("\n");
      fs.writeFileSync(patchPath, content, "utf-8");
      console.log(chalk.green(`Patches sugeridos gerados em: ${patchPath}`));
    } else {
      console.log(chalk.yellow("Nenhuma sugestão automática gerada (ou sugestões apontam para arquivos inexistentes)."));
    }
  }

  // Optionally write scaffold tests
  if (OPT_INIT_TESTS) {
    const testPath = path.join(PROJECT_ROOT, "scripts", "check-routes.test.ts");
    const testDir = path.dirname(testPath);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    if (!fs.existsSync(testPath)) {
      const scaffold = `import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import path from 'path';

describe('check-routes basic', () => {
  it('loads fixture route and detects missing zod', async () => {
    // fixture: a simple in-memory ts-morph project can be used to
    // simulate files and assert our check functions.
    expect(true).toBe(true);
  });
});
`;
      fs.writeFileSync(testPath, scaffold, "utf-8");
      console.log(chalk.green(`Scaffold de testes criado em ${testPath}`));
    } else {
      console.log(chalk.yellow(`Arquivo de teste já existe: ${testPath}`));
    }
  }

  // Final exit code logic
  const hasError = issues.some((i) => i.severity === "error");
  if (OPT_FAIL_ON_ERROR && hasError) {
    console.error(chalk.red(`\nErros detectados (${issues.filter((i) => i.severity === "error").length}). Falhando com código de saída 3.`));
    process.exit(3);
  } else {
    console.log(chalk.green(`\nAuditoria concluída. Issues: ${issues.length} (errors: ${issues.filter((i) => i.severity === "error").length})`));
  }
}

main().catch((err) => {
  console.error("Erro ao executar auditoria:", err);
  process.exit(1);
});