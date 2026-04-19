#!/usr/bin/env node
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const e2eDir = resolve(repoRoot, 'e2e');
const reportsRoot = resolve(process.env.E2E_REPORTS_ROOT ?? resolve(repoRoot, 'e2e-reports'));
const startedAt = new Date();
const runId = `e2e-uat-${startedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`;
const runDir = resolve(reportsRoot, 'runs', runId);
const latestDir = resolve(reportsRoot, 'latest');
const extraArgs = process.argv.slice(2);
const baseUrl = process.env.BASE_URL ?? 'http://localhost';
const commands = [];

function runCommand(label, command, args, env = {}) {
  const started = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: e2eDir,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const finished = new Date().toISOString();
  commands.push({
    label,
    command: [command, ...args].join(' '),
    startedAt: started,
    finishedAt: finished,
    exitCode: result.status ?? 1,
  });
  return result.status ?? 1;
}

function walkSuites(suites = [], collector) {
  for (const suite of suites) {
    if (Array.isArray(suite.specs)) {
      for (const spec of suite.specs) {
        for (const test of spec.tests ?? []) {
          collector(spec, test);
        }
      }
    }
    walkSuites(suite.suites ?? [], collector);
  }
}

function loadPlaywrightSummary(resultsPath) {
  if (!existsSync(resultsPath)) {
    return {
      available: false,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      failedTests: [],
      skippedTests: [],
    };
  }

  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const stats = results.stats ?? {};
  const summary = {
    available: true,
    total: 0,
    passed: Number(stats.expected ?? 0),
    failed: Number(stats.unexpected ?? 0),
    skipped: Number(stats.skipped ?? 0),
    flaky: Number(stats.flaky ?? 0),
    failedTests: [],
    skippedTests: [],
  };

  walkSuites(results.suites ?? [], (spec, test) => {
    summary.total += 1;
    const testTitle = [...(spec.titlePath ?? []), spec.title].filter(Boolean).join(' > ');
    if (test.status === 'unexpected' || test.outcome === 'unexpected') {
      summary.failedTests.push({
        title: testTitle,
        project: test.projectName,
        location: spec.file ? `${spec.file}:${spec.line ?? 1}` : null,
        errors: (test.results ?? [])
          .flatMap(result => result.errors ?? [])
          .map(error => error.message ?? String(error))
          .filter(Boolean),
      });
    }
    if (test.status === 'skipped' || test.outcome === 'skipped') {
      summary.skippedTests.push({
        title: testTitle,
        project: test.projectName,
        location: spec.file ? `${spec.file}:${spec.line ?? 1}` : null,
      });
    }
  });

  return summary;
}

function markdownList(items, mapper, emptyText) {
  if (items.length === 0) return `- ${emptyText}`;
  return items.map(mapper).join('\n');
}

function writeRunFiles(exitCode, typecheckExitCode, playwrightExitCode) {
  const finishedAt = new Date();
  const resultsPath = resolve(runDir, 'results.json');
  const summary = loadPlaywrightSummary(resultsPath);
  const status = exitCode === 0 ? 'passed' : 'failed';
  const manifest = {
    schemaVersion: 1,
    runId,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    baseUrl,
    reportRoot: reportsRoot,
    runDir,
    latestDir,
    commands,
    exitCode,
    typecheckExitCode,
    playwrightExitCode,
    summary,
    artifacts: {
      html: resolve(runDir, 'html', 'index.html'),
      json: resultsPath,
      junit: resolve(runDir, 'junit.xml'),
      markdown: resolve(runDir, 'summary.md'),
      artifactsDir: resolve(runDir, 'artifacts'),
    },
    fixHandoff: {
      readFirst: [
        resolve(runDir, 'summary.md'),
        resultsPath,
        resolve(runDir, 'junit.xml'),
      ],
      stableLatestManifest: resolve(latestDir, 'manifest.json'),
      stableLatestSummary: resolve(latestDir, 'summary.md'),
    },
  };

  const summaryMarkdown = `# E2E/UAT Test Run ${runId}

- Status: ${status}
- Base URL: ${baseUrl}
- Started: ${manifest.startedAt}
- Finished: ${manifest.finishedAt}
- Duration: ${Math.round(manifest.durationMs / 1000)}s
- Typecheck exit code: ${typecheckExitCode}
- Playwright exit code: ${playwrightExitCode}

## Results

- Total: ${summary.total}
- Passed: ${summary.passed}
- Failed: ${summary.failed}
- Flaky: ${summary.flaky}
- Skipped: ${summary.skipped}

## Failed Tests

${markdownList(
  summary.failedTests,
  test => `- ${test.title}${test.location ? ` (${test.location})` : ''}`,
  'None',
)}

## Skipped Tests

${markdownList(
  summary.skippedTests,
  test => `- ${test.title}${test.location ? ` (${test.location})` : ''}`,
  'None',
)}

## Agent Handoff

- Start with this file, then inspect \`manifest.json\`, \`results.json\`, and \`junit.xml\`.
- Browser traces, videos, and screenshots are under \`artifacts/\` when Playwright retains them.
- The stable latest-run paths are \`e2e-reports/latest/summary.md\` and \`e2e-reports/latest/manifest.json\`.
- Historical run archive: \`e2e-reports/runs/${runId}/\`.
`;

  writeFileSync(resolve(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(runDir, 'summary.md'), summaryMarkdown);

  rmSync(latestDir, { recursive: true, force: true });
  mkdirSync(latestDir, { recursive: true });
  cpSync(runDir, latestDir, { recursive: true });
  copyFileSync(resolve(runDir, 'manifest.json'), resolve(latestDir, 'manifest.json'));
  copyFileSync(resolve(runDir, 'summary.md'), resolve(latestDir, 'summary.md'));
}

mkdirSync(runDir, { recursive: true });

const typecheckExitCode = runCommand('typecheck', 'npm', ['run', 'typecheck']);
let playwrightExitCode = 0;

if (typecheckExitCode === 0) {
  playwrightExitCode = runCommand(
    'playwright',
    'npx',
    ['playwright', 'test', ...extraArgs],
    {
      BASE_URL: baseUrl,
      E2E_REPORT_DIR: runDir,
    },
  );
} else {
  playwrightExitCode = 1;
}

const exitCode = typecheckExitCode === 0 && playwrightExitCode === 0 ? 0 : 1;
writeRunFiles(exitCode, typecheckExitCode, playwrightExitCode);

console.log(`\nE2E/UAT run ${runId}: ${exitCode === 0 ? 'passed' : 'failed'}`);
console.log(`Latest summary: ${resolve(latestDir, 'summary.md')}`);
console.log(`Latest manifest: ${resolve(latestDir, 'manifest.json')}`);
console.log(`HTML report: ${resolve(latestDir, 'html', 'index.html')}`);

process.exit(exitCode);
