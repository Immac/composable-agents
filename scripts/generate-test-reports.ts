/**
 * generate-test-reports.ts
 *
 * Scans examples/ and output/ directories for test result reports,
 * converts markdown to HTML via `marked`, and generates a single
 * navigation-indexed page at test-reports/index.html.
 *
 * Usage: npx tsx scripts/generate-test-reports.ts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname ?? __dirname, '..');
const OUTPUT_DIR = join(ROOT, 'test-reports');

// ── Types ────────────────────────────────────────────────────

interface TestEntry {
  id: string;
  name: string;
  result: 'pass' | 'fail' | 'unknown';
  time: string;
}

interface Report {
  id: string;
  project: string;
  title: string;
  path: string;
  markdown: string;
  tests: TestEntry[];
}

// ── Find reports ─────────────────────────────────────────────

function parseTestTable(markdown: string): TestEntry[] {
  const lines = markdown.split('\n').filter(l => l.startsWith('|') && l.includes('TC-'));
  return lines.map(l => {
    const cols = l.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 4) return null;
    const [id, name, status, time] = cols as [string, string, string, string];
    const result = status.includes('✓') ? 'pass' as const
      : status.includes('✗') ? 'fail' as const
      : 'unknown' as const;
    return { id, name, result, time };
  }).filter(Boolean) as TestEntry[];
}

function findReports(): Report[] {
  const reports: Report[] = [];

  // Root-level output/benchmark/report/
  const rootBench = join(ROOT, 'output', 'benchmark', 'report', 'index.html');
  if (existsSync(rootBench)) {
    reports.push({
      id: 'image-resizer-benchmark',
      project: 'image-resizer',
      title: 'Image Resizer — Benchmark Report',
      path: relative(ROOT, rootBench),
      markdown: '',
      tests: [],
    });
  }

  // examples/*/test-results/report.md
  const examplesDir = join(ROOT, 'examples');
  if (existsSync(examplesDir)) {
    for (const proj of readdirSync(examplesDir)) {
      const reportPath = join(examplesDir, proj, 'test-results', 'report.md');
      if (!existsSync(reportPath)) continue;

      const markdown = readFileSync(reportPath, 'utf-8');
      const titleMatch = markdown.match(/^#\s+(.+)/m);
      const title = titleMatch?.[1] ?? `${proj} — Test Report`;
      const tests = parseTestTable(markdown);

      reports.push({
        id: proj,
        project: proj,
        title,
        path: relative(ROOT, reportPath),
        markdown,
        tests,
      });
    }
  }

  return reports;
}

// ── Markdown → HTML ──────────────────────────────────────────

function mdToHtml(md: string): string {
  // Use marked CLI for proper conversion
  const tmpFile = join(ROOT, '.tmp-report-md.md');
  writeFileSync(tmpFile, md, 'utf-8');
  try {
    const html = execSync(
      `npx --yes marked -i "${tmpFile}" --gfm --breaks 2>/dev/null`,
      { encoding: 'utf-8', timeout: 15000, cwd: ROOT },
    ).trim();
    return html;
  } catch {
    return fallbackMdToHtml(md);
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

function fallbackMdToHtml(md: string): string {
  let html = md
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="language-${lang}">${esc(code.trim())}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^---$/gm, '<hr>');

  // Tables
  html = html.replace(
    /\|(.+)\|\n\|[-:| ]+\|\n((?:\|.+\|\n?)*)/g,
    (_, header: string, body: string) => {
      const h = header.split('|').map((c: string) => `<th>${c.trim()}</th>`).join('');
      const r = body.trim().split('\n').map((row: string) =>
        `<tr>${row.split('|').map((c: string) => `<td>${c.trim()}</td>`).join('')}</tr>`
      ).join('\n');
      return `<table><thead><tr>${h}</tr></thead><tbody>${r}</tbody></table>`;
    },
  );

  return html;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Generate HTML page ───────────────────────────────────────

function generatePage(reports: Report[]): string {
  const navItems = reports.map(r => {
    const tests = r.tests.map(t => {
      const icon = t.result === 'pass' ? '✓' : t.result === 'fail' ? '✗' : '?';
      return `<div class="test-entry ${t.result}" data-test="${t.id}" onclick="showTest('${r.id}','${t.id}')">
        <span class="test-icon">${icon}</span>
        <span class="test-id">${t.id}</span>
        <span class="test-name">${esc(t.name)}</span>
        <span class="test-time">${t.time}</span>
      </div>`;
    }).join('');

    const pass = r.tests.filter(t => t.result === 'pass').length;
    const total = r.tests.length;
    const summary = total > 0 ? `(${pass}/${total} pass)` : '';

    return `<div class="project" data-project="${r.id}">
      <div class="project-header" onclick="toggleProject('${r.id}')">
        <span class="project-toggle">▶</span>
        <span class="project-name">${esc(r.project)}</span>
        <span class="project-summary">${summary}</span>
      </div>
      <div class="project-tests" id="tests-${r.id}">
        ${tests || '<div class="no-tests">No structured test data</div>'}
        <div class="view-report" onclick="showReport('${r.id}')">📄 View full report →</div>
      </div>
    </div>`;
  }).join('');

  const reportPanels = reports.map(r => {
    const body = r.markdown ? mdToHtml(r.markdown)
      : `<iframe src="../${r.path}" style="width:100%;height:100%;border:none;" onload="this.style.height=this.contentWindow.document.body.scrollHeight+'px'"></iframe>`;
    return `<div class="report-panel" id="report-${r.id}" style="display:none;">${body}</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Composable Agents — Test Reports</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --text-dim: #8b949e; --accent: #58a6ff;
    --pass: #3fb950; --fail: #f85149;
    --sidebar-w: 340px;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg); color: var(--text);
    display: flex; height: 100vh; overflow: hidden;
  }
  a { color: var(--accent); }

  .sidebar {
    width: var(--sidebar-w); min-width: var(--sidebar-w);
    background: var(--surface); border-right: 1px solid var(--border);
    overflow-y: auto; display: flex; flex-direction: column;
  }
  .sidebar-header {
    padding: 16px; border-bottom: 1px solid var(--border);
    font-size: 14px; font-weight: 600; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .project { border-bottom: 1px solid var(--border); }
  .project-header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; cursor: pointer; user-select: none; transition: background 0.15s;
  }
  .project-header:hover { background: rgba(255,255,255,0.04); }
  .project-toggle { font-size: 10px; color: var(--text-dim); transition: transform 0.2s; }
  .project.open .project-toggle { transform: rotate(90deg); }
  .project-name { font-weight: 600; flex: 1; }
  .project-summary { font-size: 12px; color: var(--text-dim); }
  .project-tests { display: none; padding: 0 16px 8px; }
  .project.open .project-tests { display: block; }

  .test-entry {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 8px; margin: 2px 0; border-radius: 6px;
    cursor: pointer; font-size: 13px; transition: background 0.15s;
  }
  .test-entry:hover { background: rgba(255,255,255,0.06); }
  .test-entry.active { background: rgba(88,166,255,0.12); }
  .test-icon { font-weight: bold; width: 16px; text-align: center; }
  .test-icon.pass { color: var(--pass); }
  .test-icon.fail { color: var(--fail); }
  .test-id { color: var(--accent); font-family: monospace; font-size: 12px; min-width: 60px; }
  .test-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .test-time { color: var(--text-dim); font-size: 11px; font-family: monospace; }
  .view-report {
    padding: 6px 8px; margin: 4px 0; font-size: 13px;
    color: var(--accent); cursor: pointer; border-radius: 6px;
  }
  .view-report:hover { background: rgba(88,166,255,0.1); }
  .no-tests { font-size: 12px; color: var(--text-dim); padding: 8px; }

  .main { flex: 1; overflow-y: auto; padding: 32px; max-width: 960px; }
  .report-panel { animation: fadeIn 0.2s ease; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .report-panel h1 { font-size: 24px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .report-panel h2 { font-size: 20px; margin: 24px 0 12px; }
  .report-panel h3 { font-size: 16px; margin: 20px 0 8px; color: var(--accent); }
  .report-panel p { margin: 8px 0; line-height: 1.6; }
  .report-panel table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
  .report-panel th, .report-panel td { padding: 8px 12px; text-align: left; border: 1px solid var(--border); }
  .report-panel th { background: var(--surface); font-weight: 600; }
  .report-panel pre { background: var(--surface); padding: 12px 16px; border-radius: 6px; overflow-x: auto; margin: 12px 0; font-size: 13px; }
  .report-panel code { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; }
  .report-panel p code { background: var(--surface); padding: 2px 6px; border-radius: 4px; }
  .report-panel hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
  .report-panel strong { color: #f0f6fc; }
  .report-panel iframe { border-radius: 8px; background: transparent; width: 100%; }

  .welcome {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100%; color: var(--text-dim); text-align: center;
  }
  .welcome h2 { color: var(--text); margin-bottom: 8px; }
  .welcome p { max-width: 400px; line-height: 1.6; }
</style>
</head>
<body>
<div class="sidebar">
  <div class="sidebar-header">🧪 Test Reports</div>
  ${navItems}
</div>
<div class="main" id="main">
  <div class="welcome">
    <h2>Select a project</h2>
    <p>Choose a project from the sidebar to view its test reports and results.</p>
  </div>
  ${reportPanels}
</div>
<script>
  function toggleProject(id) {
    document.querySelector('[data-project="'+id+'"]')?.classList.toggle('open');
  }
  function showReport(id) {
    document.querySelectorAll('.report-panel').forEach(p => p.style.display='none');
    document.getElementById('report-'+id).style.display='block';
    document.querySelectorAll('.test-entry').forEach(e => e.classList.remove('active'));
    document.querySelector('.welcome')?.style.setProperty('display','none');
  }
  function showTest(projectId, testId) {
    showReport(projectId);
    document.querySelectorAll('.test-entry').forEach(e => e.classList.remove('active'));
    const entry = document.querySelector('[data-project="'+projectId+'"] [data-test="'+testId+'"]');
    if (entry) { entry.classList.add('active'); entry.scrollIntoView({behavior:'smooth',block:'nearest'}); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const first = document.querySelector('.project');
    if (first) { first.classList.add('open'); const id = first.getAttribute('data-project'); if(id) showReport(id); }
  });
</script>
</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────

function main() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const reports = findReports();
  if (reports.length === 0) {
    console.log('⚠ No test reports found.');
    console.log('  Run tests first to generate reports (e.g. examples/story-writer/run-tests.ts)');
    process.exit(0);
  }

  console.log(`Found ${reports.length} report(s):`);
  for (const r of reports) console.log(`  ${r.id.padEnd(30)} ${r.tests.length} test(s)`);

  const html = generatePage(reports);
  const indexPath = join(OUTPUT_DIR, 'index.html');
  writeFileSync(indexPath, html, 'utf-8');
  console.log(`\n📄 Generated: ${indexPath}`);
  console.log('   Open in browser to navigate test results.');
}

main();
