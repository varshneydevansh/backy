import { spawnSync } from 'node:child_process';

const audit = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(audit.stdout || '{}');
} catch {
  console.error(audit.stderr || 'npm audit did not return valid JSON.');
  process.exit(1);
}

const vulnerabilities = report.metadata?.vulnerabilities;
if (!vulnerabilities) {
  console.error('npm audit did not return vulnerability metadata.');
  process.exit(1);
}

const residual = Object.entries(report.vulnerabilities || {}).map(([name, finding]) => ({
  name,
  severity: finding.severity,
  direct: Boolean(finding.isDirect),
}));
const blockingCount = Number(vulnerabilities.high || 0) + Number(vulnerabilities.critical || 0);

console.log(JSON.stringify({
  ok: blockingCount === 0,
  contract: 'backy.production-dependency-security.v1',
  vulnerabilities,
  residual,
}, null, 2));

if (blockingCount > 0) {
  process.exit(1);
}
