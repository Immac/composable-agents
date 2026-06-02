/**
 * serve-reports.ts — Dynamic test report server
 *
 * Usage: npx tsx scripts/serve-reports.ts
 *        npm run reports
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 4042;
const HTML_PATH = join(__dirname, 'report-page.html');

// ── Report scanner ──────────────────────────────────────────

interface TestEntry {
  id: string;
  name: string;
  result: 'pass' | 'fail' | 'unknown';
  time: string;
}

interface ReportMeta {
  id: string;
  project: string;
  title: string;
  tests: TestEntry[];
  passCount: number;
  totalCount: number;
}

function scanReports(): ReportMeta[] {
  const reports: ReportMeta[] = [];

  const bench = resolve(ROOT, 'output', 'benchmark', 'report', 'index.html');
  if (existsSync(bench)) {
    reports.push({
      id: 'image-resizer-benchmark',
      project: 'image-resizer',
      title: 'Image Resizer — Benchmark Report',
      tests: [],
      passCount: 0, totalCount: 0,
    });
  }

  const examples = resolve(ROOT, 'examples');
  if (existsSync(examples)) {
    for (const proj of readdirSync(examples)) {
      const reportPath = join(examples, proj, 'test-results', 'report.md');
      if (!existsSync(reportPath)) continue;

      const md = readFileSync(reportPath, 'utf-8');
      const title = md.match(/^#\s+(.+)/m)?.[1] ?? `${proj} — Test Report`;
      const tests = parseTestTable(md);

      reports.push({
        id: proj,
        project: proj,
        title,
        tests,
        passCount: tests.filter(t => t.result === 'pass').length,
        totalCount: tests.length,
      });
    }
  }

  return reports.sort((a, b) => a.project.localeCompare(b.project));
}

function parseTestTable(md: string): TestEntry[] {
  return md.split('\n')
    .filter(l => l.startsWith('|') && l.includes('TC-'))
    .map(l => {
      const cols = l.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length < 4) return null;
      const [id, name, status, time] = cols;
      const result = status.includes('✓') ? 'pass' as const
        : status.includes('✗') ? 'fail' as const
        : 'unknown' as const;
      return { id, name, result, time };
    })
    .filter(Boolean);
}

function getReportContent(id: string): string | null {
  const examples = resolve(ROOT, 'examples');
  if (existsSync(examples)) {
    for (const proj of readdirSync(examples)) {
      if (proj !== id) continue;
      const mdPath = join(examples, proj, 'test-results', 'report.md');
      if (existsSync(mdPath)) return readFileSync(mdPath, 'utf-8');
    }
  }
  return null;
}

// ── Server ───────────────────────────────────────────────────

const app = new Hono();

// API — list all reports
app.get('/api/reports', (c) => {
  return c.json(scanReports());
});

// API — get report content by ID
app.get('/api/reports/:id', (c) => {
  const id = c.req.param('id');
  const meta = scanReports().find(r => r.id === id);
  if (!meta) return c.json({ error: 'Report not found' }, 404);

  const content = getReportContent(id);
  const variant = meta.project === 'image-resizer' && id.endsWith('benchmark')
    ? 'iframe' as const
    : 'markdown' as const;

  return c.json({ meta, content, variant });
});

// Serve static assets (benchmark reports, images, etc.)
app.get('/output/*', (c) => {
  const filePath = resolve(ROOT, c.req.path.slice(1));
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return c.notFound();
  const ext = extname(filePath);
  const mime: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
  };
  const contentType = mime[ext] ?? 'application/octet-stream';
  const content = readFileSync(filePath);
  return c.newResponse(content, 200, { 'Content-Type': contentType });
});

// Serve the frontend from report-page.html
app.get('/', (c) => {
  const html = readFileSync(HTML_PATH, 'utf-8');
  return c.html(html);
});

// ── Startup ──────────────────────────────────────────────────

console.log(`
  🧪 Composable Agents — Test Reports Server

  Server:  http://localhost:${PORT}
  API:     http://localhost:${PORT}/api/reports
  Reports: ${scanReports().length} found

  Press Ctrl+C to stop.
`);

serve({ fetch: app.fetch, port: PORT });
