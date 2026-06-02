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
  .report h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 2px solid #e5e7eb; }
  .report h2 { font-size: 1.25rem; font-weight: 600; margin-top: 2.5rem; margin-bottom: 1rem; }
  .report h3 { font-size: 1.125rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; color: #2563eb; }
  .report p { margin: 0.75rem 0; line-height: 1.625; color: #374151; }
  .report table { width: 100%; border-collapse: collapse; margin: 1.25rem 0; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); border-radius: 0.5rem; overflow: hidden; }
  .report thead { background: #f3f4f6; }
  .report th { font-weight: 600; text-align: left; color: #374151; padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb; }
  .report td { padding: 0.75rem 1rem; border-bottom: 1px solid #f3f4f6; }
  .report tbody tr:hover { background: #f9fafb; }
  .report tbody tr:last-child td { border-bottom: 0; }
  .report pre { background: #f9fafb; border-radius: 0.5rem; padding: 1.25rem; margin: 1rem 0; overflow-x: auto; font-size: 0.875rem; border: 1px solid #f3f4f6; }
  .report code { font-size: 0.875rem; }
  .report p code { background: #f3f4f6; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.875rem; }
  .report hr { margin: 2.5rem 0; border: 0; border-top: 1px solid #e5e7eb; }
  .report strong { color: #111827; font-weight: 600; }
  .report iframe { border-radius: 0.75rem; border: 1px solid #e5e7eb; width: 100%; min-height: 80vh; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); }
  .report blockquote { border-left: 4px solid #60a5fa; padding-left: 1rem; font-style: italic; color: #4b5563; margin: 1rem 0; }
  .report ul { list-style: disc; padding-left: 1.25rem; margin: 0.75rem 0; }
  .report ol { list-style: decimal; padding-left: 1.25rem; margin: 0.75rem 0; }

  @media (prefers-color-scheme: dark) {
    .report h1 { border-bottom-color: #374151; }
    .report h3 { color: #60a5fa; }
    .report thead { background: #1f2937; }
    .report th { color: #d1d5db; border-bottom-color: #4b5563; }
    .report td { border-bottom-color: #1f2937; }
    .report tbody tr:hover { background: #111827; }
    .report pre { background: #111827; border-color: #374151; }
    .report p code { background: #1f2937; }
    .report hr { border-top-color: #374151; }
    .report strong { color: #f9fafb; }
    .report p { color: #d1d5db; }
    .report blockquote { color: #9ca3af; }
  }

  #sidebar::-webkit-scrollbar { width: 5px; }
  #sidebar::-webkit-scrollbar-track { background: transparent; }
  #sidebar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
  #sidebar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }

  .test-entry { transition: all 0.15s ease; }
  .test-entry:hover { transform: translateX(2px); }

  .project-header { cursor: pointer; transition: background 0.15s; }
  .project-header:hover { background: #f9fafb; }
  .project-header.active-project {
    background: rgba(59,130,246,0.08);
    box-shadow: inset 3px 0 0 #3b82f6;
  }
  .project-header.active-project:hover { background: rgba(59,130,246,0.08); }
  @media (prefers-color-scheme: dark) {
    .project-header.active-project { background: rgba(59,130,246,0.15); }
    #sidebar::-webkit-scrollbar-thumb { background: #4b5563; }
    #sidebar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
  }

  .status-badge { display: inline-flex; align-items: center; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
  .status-badge.pass { background: #dcfce7; color: #166534; }
  .status-badge.fail { background: #fee2e2; color: #991b1b; }
  .status-badge.info { background: #f3f4f6; color: #4b5563; }
  .hidden { display: none !important; }
  .test-entry:hover span:last-child { opacity: 1 !important; }
  @media (prefers-color-scheme: dark) {
    .status-badge.pass { background: rgba(34,197,94,0.15); color: #86efac; }
    .status-badge.fail { background: rgba(239,68,68,0.15); color: #fca5a5; }
    .status-badge.info { background: #374151; color: #d1d5db; }
  }
</style>
</head>
<body style="min-height:100vh;background:#f9fafb;color:#111827;">
  <div id="app" style="display:flex;height:100vh;">
    <aside style="width:22rem;min-width:22rem;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,0.03);z-index:10;">
      <header style="padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;background:#f9fafb;">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          <h1 style="font-size:0.75rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.1em;">Test Reports</h1>
        </div>
        <div style="position:relative;">
          <svg style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);width:1rem;height:1rem;color:#9ca3af;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input id="test-filter" type="text" placeholder="Filter tests..."
            style="width:100%;padding:0.5rem 0.75rem 0.5rem 2.25rem;background:#f3f4f6;border:0;border-radius:0.5rem;font-size:0.875rem;outline:none;"
            oninput="filterTests(this.value)"/>
        </div>
      </header>
      <nav id="sidebar" style="flex:1;overflow-y:auto;">
        <div style="padding:1rem;text-align:center;font-size:0.875rem;color:#9ca3af;">Loading...</div>
      </nav>
    </aside>

    <main style="flex:1;overflow-y:auto;background:#f9fafb;">
      <div id="welcome" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#9ca3af;">
        <div style="background:#fff;border-radius:1rem;padding:2.5rem;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);border:1px solid #f3f4f6;text-align:center;">
          <div style="font-size:3rem;margin-bottom:1.25rem;">🧪</div>
          <h2 style="font-size:1.25rem;font-weight:600;color:#374151;margin-bottom:0.5rem;">Select a project</h2>
          <p style="font-size:0.875rem;max-width:20rem;color:#6b7280;">Choose a project from the sidebar to view test reports and results.</p>
        </div>
      </div>
      <div id="content" class="hidden" style="padding:2rem;max-width:64rem;margin:0 auto;"></div>
    </main>
  </div>

<script>
const API = '/api/reports';
let reports = [];

async function loadReports() {
  try {
    const res = await fetch(API);
    reports = await res.json();
    renderSidebar();
  } catch (e) {
    document.querySelector('#sidebar').innerHTML =
      '<div style="padding:1rem;text-align:center;font-size:0.875rem;color:#ef4444;">Failed to load reports</div>';
  }
}

function renderSidebar() {
  const nav = document.querySelector('#sidebar');
  if (!reports.length) {
    nav.innerHTML = '<div style="padding:1rem;text-align:center;font-size:0.875rem;color:#9ca3af;">No reports found</div>';
    return;
  }

  nav.innerHTML = reports.map((r, i) => {
    let badge = '';
    if (r.totalCount > 0) {
      const cls = r.passCount === r.totalCount ? 'pass' : r.passCount === 0 ? 'fail' : 'info';
      badge = '<span class="status-badge ' + cls + '">' + r.passCount + '/' + r.totalCount + '</span>';
    }

    const testsHtml = r.tests.map(t => {
      let icon = '';
      if (t.result === 'pass') {
        icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
      } else if (t.result === 'fail') {
        icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M6 6l12 12"/></svg>';
      } else {
        icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
      }
      const nameClass = (t.name.toLowerCase().includes('rejected') || t.name.toLowerCase().includes('empty')) ? 'color:#d97706;' : '';
      return '<button onclick="showTest(' + JSON.stringify(r.id) + ',' + JSON.stringify(t.id) + ')"' +
        ' class="test-entry" style="width:100%;display:flex;align-items:center;gap:0.75rem;padding:0.625rem 1rem;font-size:0.875rem;border-radius:0.5rem;text-align:left;border:0;background:transparent;cursor:pointer;color:#374151;"' +
        ' data-project="' + h(r.id) + '" data-test="' + h(t.id) + '" data-filter-text="' + h((t.id + ' ' + t.name).toLowerCase()) + '">' +
        '<span style="flex-shrink:0;">' + icon + '</span>' +
        '<span style="font-family:monospace;font-size:0.75rem;color:#2563eb;width:3.5rem;flex-shrink:0;">' + h(t.id) + '</span>' +
        '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + nameClass + '">' + h(t.name) + '</span>' +
        '<span style="color:#9ca3af;font-size:0.75rem;font-family:monospace;flex-shrink:0;opacity:0;transition:opacity 0.15s;">' + h(t.time) + '</span>' +
      '</button>';
    }).join('');

    return '<div class="project" style="border-bottom:1px solid #f3f4f6;" data-project="' + h(r.id) + '">' +
      '<button onclick="toggle(' + i + ')"' +
        ' style="width:100%;display:flex;align-items:center;gap:0.75rem;padding:0.875rem 1.25rem;font-size:0.875rem;font-weight:600;color:#111827;text-align:left;border:0;background:transparent;cursor:pointer;transition:background 0.15s;"' +
        ' class="project-header">' +
        '<svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;transition:transform 0.2s;"><polyline points="9 18 15 12 9 6"/></svg>' +
        '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + h(r.project) + '</span>' +
        '<span style="flex-shrink:0;">' + badge + '</span>' +
      '</button>' +
      '<div class="tests-panel hidden" style="padding:0 1rem 0.75rem 2.75rem;">' +
        (testsHtml || '<div style="font-size:0.75rem;color:#9ca3af;padding:0.5rem 1rem;">Benchmark / visual report</div>') +
        '<button onclick="showReport(' + JSON.stringify(r.id) + ')" style="width:100%;text-align:left;padding:0.5rem 1rem;font-size:0.875rem;color:#2563eb;border:0;background:transparent;border-radius:0.5rem;cursor:pointer;margin-top:0.25rem;display:flex;align-items:center;gap:0.5rem;">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>' +
          '<span>Full Report</span>' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Open first project with tests
  const candidates = nav.querySelectorAll('.project');
  let target = null;
  for (const c of candidates) {
    if (c.querySelector('.status-badge')) { target = c; break; }
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

function filterTests(q) {
  const term = q.toLowerCase().trim();
  document.querySelectorAll('.test-entry').forEach(e => {
    const text = e.getAttribute('data-filter-text') || '';
    e.style.display = (!term || text.includes(term)) ? '' : 'none';
  });
  document.querySelectorAll('.project').forEach(p => {
    const visible = p.querySelectorAll('.test-entry:not([style*="display: none"])');
    const panel = p.querySelector('.tests-panel');
    const chevron = p.querySelector('.chevron');
    if (term && visible.length > 0 && panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      chevron.style.transform = 'rotate(90deg)';
    }
  });
}

function h(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function showReport(id) {
  document.querySelector('#welcome').classList.add('hidden');
  const content = document.querySelector('#content');
  content.classList.remove('hidden');
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:5rem 0;color:#9ca3af;"><svg class="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" style="margin-right:0.75rem;color:#3b82f6;"><circle style="opacity:0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path style="opacity:0.75;" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Loading report...</div>';

  try {
    const res = await fetch('/api/reports/' + encodeURIComponent(id));
    const data = await res.json();

    if (data.variant === 'iframe') {
      content.innerHTML = '<iframe src="../output/benchmark/report/index.html" style="border-radius:0.75rem;border:1px solid #e5e7eb;width:100%;min-height:80vh;box-shadow:0 1px 2px 0 rgba(0,0,0,0.05);"></iframe>';
    } else if (data.variant === 'markdown' && data.content) {
      const meta = data.meta;
      let badge = '';
      if (meta.totalCount > 0) {
        const cls = meta.passCount === meta.totalCount ? 'pass' : 'info';
        badge = '<span class="status-badge ' + cls + '">' + meta.passCount + '/' + meta.totalCount + ' tests passing</span>';
      }
      const headerHtml = '<div style="margin-bottom:1.5rem;">' +
        '<div style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:#6b7280;margin-bottom:0.25rem;">' +
          '<span>Test Reports</span>' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>' +
          '<span style="font-weight:500;color:#374151;">' + h(meta.project) + '</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:0.75rem;">' +
          '<h1 style="font-size:1.875rem;font-weight:700;color:#111827;">' + h(meta.title) + '</h1>' +
          badge +
        '</div>' +
      '</div>';
      content.innerHTML = headerHtml + marked.parse(data.content);
    } else {
      content.innerHTML = '<div style="text-align:center;padding:3rem 0;color:#ef4444;">Report content not found</div>';
    }
  } catch (e) {
    content.innerHTML = '<div style="text-align:center;padding:3rem 0;color:#ef4444;">Failed to load report</div>';
  }

  document.querySelectorAll('.project-header').forEach(h => {
    h.classList.remove('active-project');
    h.style.background = 'transparent';
  });
  const activeProj = document.querySelector('[data-project="' + id + '"] .project-header');
  if (activeProj) {
    activeProj.classList.add('active-project');
    activeProj.style.background = '';
  }

  const parent = activeProj?.closest('.project');
  if (parent) {
    const panel = parent.querySelector('.tests-panel');
    const chevron = parent.querySelector('.chevron');
    if (panel) panel.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(90deg)';
  }

  document.querySelectorAll('.test-entry').forEach(e => {
    e.style.background = 'transparent';
    e.style.outline = 'none';
  });
}

async function showTest(projectId, testId) {
  await showReport(projectId);
  document.querySelectorAll('.test-entry').forEach(e => {
    e.style.background = 'transparent';
    e.style.outline = 'none';
  });
  const entry = document.querySelector('[data-project="' + projectId + '"][data-test="' + testId + '"]');
  if (entry) {
    entry.style.background = 'rgba(59,130,246,0.08)';
    entry.style.outline = '1px solid rgba(59,130,246,0.3)';
    entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  const anchor = document.getElementById(testId.toLowerCase());
  if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
