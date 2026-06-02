/**
 * serve-reports.ts — Dynamic test report server
 *
 * A Hono server that scans for reports at request time and serves them
 * through a proper web UI with reactive client-side rendering.
 *
 * Usage: npx tsx scripts/serve-reports.ts
 *        npm run reports:serve
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 4042;

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

  // root output/benchmark/
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

  // examples/*/test-results/report.md
  const examples = resolve(ROOT, 'examples');
  if (existsSync(examples)) {
    for (const proj of readdirSync(examples)) {
      const mdPath = join(examples, proj, 'test-results', 'report.md');
      if (!existsSync(mdPath)) continue;

      const md = readFileSync(mdPath, 'utf-8');
      const title = md.match(/^#\s+(.+)/m)?.[1] ?? `${proj} — Test Report`;
      const tests = parseTestTable(md);
      const passCount = tests.filter(t => t.result === 'pass').length;

      reports.push({
        id: proj,
        project: proj,
        title,
        tests,
        passCount,
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
  // Check examples/*/test-results/report.md
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
  const reports = scanReports();
  return c.json(reports);
});

// API — get report content by ID
app.get('/api/reports/:id', (c) => {
  const id = c.req.param('id');
  const reports = scanReports();
  const meta = reports.find(r => r.id === id);
  if (!meta) return c.json({ error: 'Report not found' }, 404);

  const content = getReportContent(id);
  const variant = meta.project === 'image-resizer' && id.endsWith('benchmark')
    ? 'iframe' as const
    : 'markdown' as const;

  return c.json({ meta, content, variant });
});

// Serve static assets (benchmark reports, images, etc.)
app.get('/output/*', (c) => {
  const filePath = resolve(ROOT, c.req.path.slice(1)); // strip leading /
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

// Serve the frontend
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Composable Agents — Test Reports</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Inter', -apple-system, sans-serif; }
  code, pre { font-family: 'JetBrains Mono', monospace; }
  .report h1 { @apply text-2xl font-bold mb-4 pb-2 border-b border-gray-200; }
  .report h2 { @apply text-xl font-semibold mt-8 mb-3; }
  .report h3 { @apply text-lg font-semibold mt-6 mb-2 text-blue-600; }
  .report p { @apply my-2 leading-relaxed; }
  .report table { @apply w-full border-collapse my-4 text-sm; }
  .report th { @apply bg-gray-50 font-semibold text-left; }
  .report th, .report td { @apply px-3 py-2 border border-gray-200; }
  .report pre { @apply bg-gray-50 rounded-lg p-4 my-3 overflow-x-auto text-sm; }
  .report code { @apply text-sm; }
  .report p code { @apply bg-gray-100 px-1.5 py-0.5 rounded text-sm; }
  .report hr { @apply my-8 border-gray-200; }
  .report strong { @apply text-gray-900; }
  .report iframe { @apply rounded-xl border-0 w-full; min-height: 80vh; }

  /* Sidebar scrollbar */
  #sidebar::-webkit-scrollbar { width: 6px; }
  #sidebar::-webkit-scrollbar-track { background: transparent; }
  #sidebar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
  #sidebar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
  .dark #sidebar::-webkit-scrollbar-thumb { background: #4b5563; }
  .dark #sidebar::-webkit-scrollbar-thumb:hover { background: #6b7280; }



  /* Active project indicator */
  .project-header.active-project {
    @apply bg-gray-100 dark:bg-gray-800;
    box-shadow: inset 3px 0 0 #3b82f6;
  }

  @media (prefers-color-scheme: dark) {
    .report h1 { @apply border-gray-700; }
    .report h3 { @apply text-blue-400; }
    .report th { @apply bg-gray-800; }
    .report th, .report td { @apply border-gray-700; }
    .report pre { @apply bg-gray-800/50; }
    .report p code { @apply bg-gray-800; }
    .report hr { @apply border-gray-700; }
    .report strong { @apply text-gray-100; }
  }
</style>
</head>
<body class="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
  <div id="app" class="flex h-screen">
    <!-- Sidebar -->
    <aside class="w-80 min-w-[20rem] border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50/50 dark:bg-gray-900/50">
      <header class="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
        <h1 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Test Reports</h1>
      </header>
      <nav id="sidebar" class="flex-1 overflow-y-auto">
        <div class="p-4 text-center text-sm text-gray-400">Loading...</div>
      </nav>
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto bg-white dark:bg-gray-950">
      <div id="welcome" class="flex flex-col items-center justify-center h-full text-gray-400">
        <div class="text-5xl mb-4">🧪</div>
        <h2 class="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">Select a project</h2>
        <p class="text-sm max-w-sm text-center">Choose a project from the sidebar to view test reports and results.</p>
      </div>
      <div id="content" class="hidden p-8 max-w-6xl mx-auto report"></div>
    </main>
  </div>

<script>
const API = '/api/reports';
let reports = [];

// ── Fetch reports ──────────────────────────────────────────

async function loadReports() {
  try {
    const res = await fetch(API);
    reports = await res.json();
    renderSidebar();
  } catch (e) {
    document.querySelector('#sidebar').innerHTML =
      '<div class="p-4 text-center text-sm text-red-500">Failed to load reports</div>';
  }
}

// ── Sidebar ────────────────────────────────────────────────

function renderSidebar() {
  const nav = document.querySelector('#sidebar');
  if (!reports.length) {
    nav.innerHTML = '<div class="p-4 text-center text-sm text-gray-400">No reports found</div>';
    return;
  }

  nav.innerHTML = reports.map((r, i) => {
    const summary = r.totalCount > 0
      ? \`<span class="project-summary text-xs \${r.passCount === r.totalCount ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}">\${r.passCount}/\${r.totalCount} pass</span>\`
      : '';

    const testsHtml = r.tests.map(t => {
      const icon = t.result === 'pass' ? '✓' : t.result === 'fail' ? '✗' : '?';
      const cls = t.result === 'pass' ? 'text-green-600 dark:text-green-400'
        : t.result === 'fail' ? 'text-red-500'
        : 'text-gray-400';
      return \`<button onclick="showTest('\${r.id}','\${t.id}')"
        class="test-entry w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors text-left"
        data-project="\${r.id}" data-test="\${t.id}">
        <span class="\${cls} font-bold w-4 text-center shrink-0">\${icon}</span>
        <span class="text-blue-600 dark:text-blue-400 font-mono text-xs w-16 shrink-0">\${t.id}</span>
        <span class="flex-1 truncate">\${h(t.name)}</span>
        <span class="text-gray-400 text-xs font-mono shrink-0">\${t.time}</span>
      </button>\`;
    }).join('');

    return \`<div class="project border-b border-gray-100 dark:border-gray-800" data-project="\${r.id}">
      <button onclick="toggle(\${i})"
        class="project-header w-full flex items-center gap-2 px-5 py-3 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left">
        <svg class="chevron w-3 h-3 text-gray-400 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
        <span class="flex-1">\${h(r.project)}</span>
        \${summary}
      </button>
      <div class="tests-panel hidden pl-7 pr-3 pb-3 space-y-0.5">
        \${testsHtml || '<div class="text-xs text-gray-400 px-3 py-1">Benchmark report</div>'}
        <button onclick="showReport('\${r.id}')"
          class="w-full text-left px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
          📄 View full report →
        </button>
      </div>
    </div>\`;
  }).join('');

  // Open first project that HAS tests (skip benchmarks with 0 tests)
  const candidates = nav.querySelectorAll('.project');
  let target = null;
  for (const c of candidates) {
    const summary = c.querySelector('.project-summary');
    if (summary && summary.textContent.trim() !== '(' && summary.textContent.trim() !== '') {
      target = c; break;
    }
  }
  target = target || candidates[0];
  if (target) {
    const btn = target.querySelector('.project-header');
    if (btn) btn.click();
    const id = target.getAttribute('data-project');
    if (id) showReport(id);
  }
}

function toggle(i) {
  const proj = document.querySelectorAll('.project')[i];
  if (!proj) return;
  const panel = proj.querySelector('.tests-panel');
  const chevron = proj.querySelector('.chevron');
  const isOpen = !panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
}

function h(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Content ────────────────────────────────────────────────

async function showReport(id) {
  document.querySelector('#welcome').classList.add('hidden');
  const content = document.querySelector('#content');
  content.classList.remove('hidden');
  content.innerHTML = '<div class="text-center py-8 text-gray-400">Loading...</div>';

  try {
    const res = await fetch(\`/api/reports/\${id}\`);
    const data = await res.json();

    if (data.variant === 'iframe') {
      content.innerHTML = \`<iframe src="../output/benchmark/report/index.html"></iframe>\`;
    } else if (data.variant === 'markdown' && data.content) {
      content.innerHTML = marked.parse(data.content);
    } else {
      content.innerHTML = '<div class="text-center py-8 text-red-500">Report content not found</div>';
    }
  } catch (e) {
    content.innerHTML = '<div class="text-center py-8 text-red-500">Failed to load report</div>';
  }

  // Highlight active project in sidebar
  document.querySelectorAll('.project-header').forEach(h => h.classList.remove('bg-gray-100','dark:bg-gray-800','active-project'));
  const activeProj = document.querySelector(\`[data-project="\${id}"] .project-header\`);
  if (activeProj) activeProj.classList.add('bg-gray-100','dark:bg-gray-800','active-project');

  // Ensure the parent project is open
  const parent = activeProj?.closest('.project');
  if (parent) {
    const panel = parent.querySelector('.tests-panel');
    const chevron = parent.querySelector('.chevron');
    if (panel) panel.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(90deg)';
  }

  // Clear test highlights
  document.querySelectorAll('.test-entry').forEach(e => e.classList.remove('bg-blue-100','dark:bg-blue-900','text-blue-700','dark:text-blue-300'));
}

async function showTest(projectId, testId) {
  await showReport(projectId);
  document.querySelectorAll('.test-entry').forEach(e => {
    e.classList.remove('bg-blue-100','dark:bg-blue-900','text-blue-700','dark:text-blue-300');
  });
  const entry = document.querySelector(\`[data-project="\${projectId}"][data-test="\${testId}"]\`);
  if (entry) {
    entry.classList.add('bg-blue-100','dark:bg-blue-900','text-blue-700','dark:text-blue-300');
    entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  // Scroll to test section in report
  const anchor = document.getElementById(testId.toLowerCase());
  if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Init ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadReports);
</script>
</body>
</html>`);
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
