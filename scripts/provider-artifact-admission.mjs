#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const admissionCommand = 'npm run ci:provider-artifact-admission';
const aggregatePreflightCommand = 'npm run test:partial-gate-preflights';
const doctorCommand = 'npm run doctor:release-certification';

const artifactInputs = [
  {
    key: 'settings',
    label: 'Settings provider artifact',
    envNames: ['BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH', 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT'],
  },
  {
    key: 'commerce',
    label: 'Commerce provider artifact',
    envNames: ['BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH', 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT'],
  },
];

const envValue = (name) => (process.env[name] || '').trim();

const configuredArtifact = ({ envNames, ...rest }) => {
  const configuredEnv = envNames.find((name) => envValue(name).length > 0) || null;
  const configuredPath = configuredEnv ? envValue(configuredEnv) : '';
  const absolutePath = configuredPath
    ? path.resolve(repoRoot, configuredPath)
    : '';

  return {
    ...rest,
    envNames,
    configuredEnv,
    configured: Boolean(configuredEnv),
    fileName: configuredPath ? path.basename(configuredPath) : null,
    exists: configuredPath ? fs.existsSync(absolutePath) : false,
  };
};

const configuredArtifacts = artifactInputs.map(configuredArtifact);
const missingArtifacts = configuredArtifacts.filter((artifact) => !artifact.configured || !artifact.exists);

if (missingArtifacts.length > 0) {
  console.error('[provider-artifact-admission] Both redacted provider artifacts are required before admission.');
  for (const artifact of missingArtifacts) {
    const requirement = artifact.envNames.join(' or ');
    const reason = artifact.configured ? 'configured file was not found' : 'path env is not configured';
    console.error(`- ${artifact.label}: ${reason}; set ${requirement}`);
  }
  process.exit(1);
}

const runInherited = (label, args) => {
  console.log(`[provider-artifact-admission] ${label}`);
  const result = spawnSync(npmBin, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[provider-artifact-admission] ${label} failed to launch: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const runDoctor = () => {
  console.log('[provider-artifact-admission] Verifying provider artifacts with release doctor.');
  const result = spawnSync(npmBin, ['run', '--silent', 'doctor:release-certification'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
      BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED: '1',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    console.error(`[provider-artifact-admission] Release doctor failed to launch: ${result.error.message}`);
    process.exit(1);
  }

  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
  }

  let doctor;
  try {
    doctor = JSON.parse(result.stdout);
  } catch {
    process.stdout.write(result.stdout);
    process.exit(result.status || 1);
  }

  const readiness = doctor.partialClosureReadiness || {};
  const summary = {
    ok: doctor.ok === true && readiness.ready === true,
    contract: 'backy.provider-artifact-admission.v1',
    admissionCommand,
    aggregatePreflightCommand,
    doctorCommand,
    currentAuditMode: readiness.currentAuditMode || null,
    currentAudit: readiness.currentAudit || null,
    providerClosure: {
      ready: readiness.ready === true,
      readyCount: readiness.readyCount ?? null,
      partialCount: readiness.partialCount ?? null,
      status: readiness.status || null,
    },
    artifacts: Object.fromEntries(configuredArtifacts.map((artifact) => {
      const doctorArtifact = doctor.certificationArtifacts?.[artifact.key] || {};
      return [
        artifact.key,
        {
          configuredEnv: artifact.configuredEnv,
          fileName: artifact.fileName,
          ready: doctorArtifact.ready === true,
          failure: doctorArtifact.failure || null,
        },
      ];
    })),
    rows: Array.isArray(readiness.rows)
      ? readiness.rows.map((row) => ({
        row: row.row,
        status: row.status,
        artifactKey: row.artifactKey,
        reason: row.reason,
      }))
      : [],
    failures: Array.isArray(doctor.failures) ? doctor.failures : [],
  };

  console.log(JSON.stringify(summary, null, 2));

  if (result.status !== 0 || !summary.ok) {
    process.exit(result.status || 1);
  }
};

runInherited(
  'Running aggregate Partial gate preflight: npm run test:partial-gate-preflights',
  ['run', 'test:partial-gate-preflights'],
);
runDoctor();
