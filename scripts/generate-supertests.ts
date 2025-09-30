/**
 * scripts/generate-supertests.ts
 *
 * Gera testes Vitest + Supertest para rotas e entrypoints (src/api.ts, src/server.ts).
 *
 * Uso:
 *   npx tsx scripts/generate-supertests.ts [--force] [--only=routes|api]
 *
 * Notas:
 * - Usa fast-glob + ts-morph para heurísticas AST + regex.
 * - Insere vi.mock(...) no topo de cada teste para evitar side-effects ao importar app/modules.
 * - Gera arquivos em tests/routes/... e tests/api.test.ts
 *
 * Limitações:
 * - Rotas construídas dinamicamente podem não ser detectadas.
 * - Revise manualmente os mocks e fixtures gerados.
 */
import fs from "fs";
import path from "path";
import fg from "fast-glob";
import { Project } from "ts-morph";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = yargs(hideBin(process.argv)).option("force", { type: "boolean", default: false }).option("only", { type: "string", choices: ["routes", "api"], default: "all" }).argv as any;

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

// detect routes dir: prefer src/routes, fallback src/routers
const SRC_ROUTES_DIR = fs.existsSync(path.join(SRC, "routes")) ? path.join(SRC, "routes") : path.join(SRC, "routers");
const ROUTES_GLOB = path.join(SRC_ROUTES_DIR, "**", "*.ts");

const OUT_DIR = path.join(ROOT, "tests");
const OUT_ROUTES = path.join(OUT_DIR, "routes");

function ensureDir(d: string) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function read(p: string) {
  return fs.readFileSync(p, "utf8");
}

function write(p: string, content: string) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, content, "utf8");
  console.log("created:", path.relative(ROOT, p));
}

function writeIfNotExists(p: string, content: string, force = false) {
  ensureDir(path.dirname(p));
  if (!force && fs.existsSync(p)) {
    console.log("skip (exists):", path.relative(ROOT, p));
    return false;
  }
  write(p, content);
  return true;
}

const DEFAULT_ENV_MOCK = `// Environment & common mocks (generated)
vi.mock('../../src/services/env', () => ({ env: {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
  SECRETET_JWT: 'test-jwt'
}}));
`;

/**
 * analyzeRoute(filePath) -> meta information about the route file
 * uses ts-morph to detect default export, named exports and falls back to regex for route calls
 */
async function analyzeRoute(filePath: string) {
  const project = new Project({ tsConfigFilePath: path.join(ROOT, "tsconfig.json") });
  const source = project.addSourceFileAtPath(filePath);
  const text = source.getFullText();

  // default export?
  const defaultExport = !!source.getDefaultExportSymbol();
  const namedExports = source.getExportSymbols().map(s => s.getName());

  // detect zod usage
  const usesZod = /\bz\.object\b|from ['"]zod['"]|import\s+{?\s*zod\s*}?\s+from\s+['"]zod['"]/.test(text);

  // protected heuristics (jwtVerify, authenticate, preHandler with auth)
  const protectedCandidate = /\b(jwtVerify|authenticate|preHandler:\s*\[.*authenticate.*\]|request\.jwtVerify|security:)/.test(text);

  // detect fastify.<method>(path...) calls
  const methodsAndPaths: { method: string; path: string }[] = [];
  const methodRegex = /\b(?:fastify|server)\.(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"`]+)\2/g;
  let m;
  while ((m = methodRegex.exec(text)) !== null) {
    methodsAndPaths.push({ method: m[1].toUpperCase(), path: m[3] });
  }

  // detect fastify.route({ url: '/x', method: 'POST' })
  const routeObjRegex = /(?:fastify|server)\.route\s*\(\s*{([\s\S]*?)\}\s*\)/g;
  while ((m = routeObjRegex.exec(text)) !== null) {
    const obj = m[1];
    const mm = /method\s*:\s*['"`]?([A-Za-z]+)['"`]?/i.exec(obj);
    const uu = /url\s*:\s*(['"`])([^'"`]+)\1/.exec(obj);
    methodsAndPaths.push({ method: mm ? mm[1].toUpperCase() : "ANY", path: uu ? uu[2] : "/" });
  }

  // fallback: base name as path guess
  if (methodsAndPaths.length === 0) {
    const name = path.basename(filePath, ".ts");
    methodsAndPaths.push({ method: "GET", path: `/${name === "index" ? "" : name}` });
  }

  return {
    rel: path.relative(SRC, filePath).replace(/\\/g, "/"),
    filePath,
    fileName: path.basename(filePath, ".ts"),
    defaultExport,
    namedExports,
    usesZod,
    protectedCandidate,
    methodsAndPaths
  };
}

function toImportFromTest(testPath: string, srcPath: string) {
  // testPath: tests/routes/..., srcPath: src/...
  let rel = path.relative(path.dirname(testPath), srcPath).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel.replace(/\.ts$/, "");
}

/**
 * Create the content of a single route test using templates
 */
function makeRouteTest(meta: Awaited<ReturnType<typeof analyzeRoute>>, outFile: string) {
  const m = meta;
  const importPath = toImportFromTest(outFile, m.filePath);
  const routePath = m.methodsAndPaths[0]?.path || "/";
  const method = (m.methodsAndPaths[0]?.method || "GET").toLowerCase();

  // top-of-file mocks: db, utils, errors — paths chosen relative to test file (tests/routes/.. -> ../../src/..)
  const topMocks = `// TEST GENERATED - VERIFY MANUALLY
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fastify from 'fastify';
import supertest from 'supertest';

${DEFAULT_ENV_MOCK}
// db mock (adjust path if your db client is elsewhere)
vi.mock('../../src/db/client', () => ({ db: {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn()
}}));

// utils & services mocks
vi.mock('../../src/services/utils', () => ({ hashPassword: vi.fn(), verifyPassword: vi.fn() }));
vi.mock('../../src/services/errors', () => ({ errors: { toHttp: (e: any) => ({ status: 500, body: { message: e.message } }) } }));

`;

  const registerSnippet = m.defaultExport
    ? `    // route exports default plugin function
    const mod = await import('${importPath}');
    const plugin = mod.default || mod;
    if (typeof plugin === 'function') await app.register(plugin as any);`
    : `    // route exports named or module.exports
    const mod = await import('${importPath}');
    const plugin = mod['${m.namedExports[0] ?? m.fileName}'] || mod;
    if (typeof plugin === 'function') await app.register(plugin as any);`;

  const zodTest = m.usesZod
    ? `
  it('validation: returns 400 for invalid payload (Zod)', async () => {
    const res = await request.${method}('${routePath}').send({ invalid: true }).set('Content-Type', 'application/json');
    expect([400,422]).toContain(res.status);
  });`
    : `  // no Zod schema detected by heuristics - no validation test generated`;

  const authTests = m.protectedCandidate
    ? `
  it('auth: rejects without token', async () => {
    const res = await request.${method}('${routePath}');
    expect([401,403]).toContain(res.status);
  });

  it('auth: allows with fake token (mocked)', async () => {
    // set Authorization header - ensure your auth verify is mocked in tests if needed
    const res = await request.${method}('${routePath}').set('Authorization', 'Bearer FAKE');
    expect(res.status).not.toBe(500);
  });`
    : `  // public route - auth tests not generated`;

  const content = `${topMocks}
describe('Route: ${m.rel}', () => {
  let app: ReturnType<typeof fastify>;
  let request: supertest.SuperTest<supertest.Test>;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = fastify({ logger: false });
${registerSnippet}
    await app.ready();
    request = supertest(app.server);
  });

  afterEach(async () => {
    try { await app.close(); } catch {}
    vi.resetAllMocks();
  });

  it('smoke: ${method.toUpperCase()} ${routePath} should not return 500', async () => {
    const res = await request.${method}('${routePath}');
    expect(res.status).not.toBe(500);
  });
${zodTest}

${authTests}

  it('error mapping: when DB fails, route returns handled error (400/500)', async () => {
    const db = (await import('../../src/db/client')).db as any;
    if (db.select) (db.select as any).mockImplementationOnce(() => { throw new Error('db-failure'); });
    const res = await request.${method}('${routePath}');
    expect([400,500]).toContain(res.status);
  });

});
`;

  return content;
}

/**
 * generate tests for all route files
 */
async function generateRouteTests(force = false) {
  ensureDir(OUT_DIR);
  ensureDir(OUT_ROUTES);

  const routeFiles = await fg([ROUTES_GLOB], { dot: true });
  const generated: string[] = [];

  for (const rf of routeFiles) {
    try {
      const meta = await analyzeRoute(rf);
      // preserve nested folder structure under tests/routes
      const rel = path.relative(SRC_ROUTES_DIR, rf).replace(/\\/g, "/");
      const outFile = path.join(OUT_ROUTES, rel.replace(/\.ts$/, ".test.ts"));
      ensureDir(path.dirname(outFile));
      const testContent = makeRouteTest(meta, outFile);
      const ok = writeIfNotExists(outFile, testContent, force);
      if (ok) generated.push(outFile);
    } catch (err) {
      console.error("fail analyze:", rf, err);
    }
  }

  return generated;
}

/**
 * generate a basic test for src/api.ts (server bootstrap)
 */
function makeApiTest(outFile: string) {
  const content = `// TEST GENERATED - VERIFY MANUALLY
import { it, describe, expect, vi } from 'vitest';
import fastify from 'fastify';

vi.mock('./src/services/env', () => ({ env: { NODE_ENV: 'development' } }));
vi.mock('./src/db/client', () => ({ db: { select: vi.fn(), insert: vi.fn() } }));

describe('API bootstrap (src/api.ts)', () => {
  it('imports server and does not throw', async () => {
    const mod = await import('../src/api');
    expect(mod).toBeDefined();
    const server = mod.server as ReturnType<typeof fastify>;
    expect(server).toBeDefined();
    try { await server.close(); } catch {}
  });

  it('health endpoint if present returns 200/404', async () => {
    const mod = await import('../src/api');
    const server = mod.server as ReturnType<typeof fastify>;
    try {
      await server.ready();
      const res = await server.inject({ method: 'GET', path: '/health' });
      expect([200,404]).toContain(res.statusCode);
    } finally {
      try { await server.close(); } catch {}
    }
  });
});
`;
  writeIfNotExists(outFile, content, argv.force);
}

/**
 * entrypoint
 */
async function main() {
  console.log("generate-supertests: scanning routes in", path.relative(ROOT, SRC_ROUTES_DIR));
  if (argv.only === "routes" || argv.only === "all") {
    const gen = await generateRouteTests(argv.force);
    console.log(`\nGenerated ${gen.length} route tests (output: ${path.relative(ROOT, OUT_ROUTES)})`);
  }

  if (argv.only === "api" || argv.only === "all") {
    const apiTestPath = path.join(OUT_DIR, "api.test.ts");
    makeApiTest(apiTestPath);
    console.log("Generated api test:", path.relative(ROOT, apiTestPath));
  }

  console.log("\nDone. Review the generated tests in the tests/ folder and adjust mocks/fixtures as necessary.");
}

main().catch(err => {
  console.error("generator failed:", err);
  process.exit(1);
});
