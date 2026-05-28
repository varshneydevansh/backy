const SETTINGS_ARTIFACT_PATH = 'artifacts/backy-settings-provider-certification.json';
const COMMERCE_ARTIFACT_PATH = 'artifacts/backy-commerce-provider-certification.json';
const SETTINGS_ARTIFACT_PATH_ENV = 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT';
const COMMERCE_ARTIFACT_PATH_ENV = 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT';
const PROVIDER_ARTIFACT_REQUIRED_ENV = 'BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1';
const DOCTOR_COMMAND = 'npm run doctor:release-certification';
const ARTIFACT_ADMISSION_COMMAND = 'npm run ci:provider-artifact-admission';
const AGGREGATE_PREFLIGHT = 'npm run test:partial-gate-preflights';
const DEFAULT_AUDIT_COUNTS = {
  ready: 41,
  partial: 4,
  prototype: 0,
  missing: 0,
  total: 45,
  readyPercent: 91,
} as const;
const ARTIFACT_ACCEPTED_AUDIT_COUNTS = {
  ready: 45,
  partial: 0,
  prototype: 0,
  missing: 0,
  total: 45,
  readyPercent: 100,
} as const;

const artifactBackedDoctorCommand = [
  PROVIDER_ARTIFACT_REQUIRED_ENV,
  `BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH=${SETTINGS_ARTIFACT_PATH}`,
  `BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH=${COMMERCE_ARTIFACT_PATH}`,
  DOCTOR_COMMAND,
].join(' ');

const closureRows = [
  {
    key: 'settings',
    row: '/settings',
    gate: 'settings-provider-certification',
    artifactKey: 'settings',
    artifactPath: SETTINGS_ARTIFACT_PATH,
    artifactPathEnv: SETTINGS_ARTIFACT_PATH_ENV,
    artifactSchemaVersion: 'backy.settings-provider-certification-artifact.v1',
    requiredEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
    sourceOnlyGuard: 'BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin',
    nextAction: 'Run Settings provider certification, then verify the saved redacted Settings artifact with the release doctor.',
  },
  {
    key: 'settings-admin-apis',
    row: 'Settings admin APIs',
    gate: 'settings-provider-certification',
    artifactKey: 'settings',
    artifactPath: SETTINGS_ARTIFACT_PATH,
    artifactPathEnv: SETTINGS_ARTIFACT_PATH_ENV,
    artifactSchemaVersion: 'backy.settings-provider-certification-artifact.v1',
    requiredEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
    sourceOnlyGuard: 'BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin',
    nextAction: 'Archive the typed Settings admin API completion/evidence packet after the Settings artifact passes the release doctor.',
  },
  {
    key: 'products',
    row: '/products',
    gate: 'commerce-provider-certification',
    artifactKey: 'commerce',
    artifactPath: COMMERCE_ARTIFACT_PATH,
    artifactPathEnv: COMMERCE_ARTIFACT_PATH_ENV,
    artifactSchemaVersion: 'backy.commerce-provider-certification-artifact.v1',
    requiredEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
    sourceOnlyGuard: 'BACKY_COMMERCE_SOURCE_ONLY=1 npm run test:commerce --workspace @backy-cms/admin',
    nextAction: 'Run Commerce provider certification, then verify the saved redacted Commerce artifact with the release doctor.',
  },
  {
    key: 'orders',
    row: '/orders',
    gate: 'commerce-provider-certification',
    artifactKey: 'commerce',
    artifactPath: COMMERCE_ARTIFACT_PATH,
    artifactPathEnv: COMMERCE_ARTIFACT_PATH_ENV,
    artifactSchemaVersion: 'backy.commerce-provider-certification-artifact.v1',
    requiredEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
    sourceOnlyGuard: 'BACKY_ORDERS_SOURCE_ONLY=1 npm run test:orders --workspace @backy-cms/admin',
    nextAction: 'Archive the Orders analytics provider evidence packet after the Commerce artifact passes the release doctor.',
  },
] as const;

export const buildBackyPartialClosureReadiness = () => ({
  schemaVersion: 'backy.partial-closure-readiness.v1',
  source: 'completion-status-handoff',
  status: 'external-artifacts-required',
  ready: false,
  readyCount: 0,
  partialCount: closureRows.length,
  prototypeCount: 0,
  missingCount: 0,
  total: closureRows.length,
  aggregatePreflight: AGGREGATE_PREFLIGHT,
  doctorCommand: DOCTOR_COMMAND,
  artifactAdmissionCommand: ARTIFACT_ADMISSION_COMMAND,
  artifactRequiredEnv: PROVIDER_ARTIFACT_REQUIRED_ENV,
  artifactBackedDoctorCommand,
  auditImpact: {
    schemaVersion: 'backy.partial-closure-audit-impact.v1',
    defaultNoArtifactAudit: DEFAULT_AUDIT_COUNTS,
    artifactAcceptedAudit: ARTIFACT_ACCEPTED_AUDIT_COUNTS,
    readyRowsAdded: closureRows.length,
    partialRowsClosed: closureRows.length,
  },
  defaultNoArtifactMode: {
    ready: false,
    readyCount: 0,
    partialCount: closureRows.length,
    status: 'partial',
    audit: DEFAULT_AUDIT_COUNTS,
    description: 'The public completion-status audit stays at 41 Ready / 4 Partial until saved redacted Settings and Commerce artifacts are supplied to the release doctor.',
  },
  artifactAcceptedMode: {
    ready: true,
    readyCount: closureRows.length,
    partialCount: 0,
    status: 'ready',
    audit: ARTIFACT_ACCEPTED_AUDIT_COUNTS,
    description: 'When fresh no-secret Settings and Commerce artifacts pass the artifact-required release doctor, the provider closure block is 4 Ready / 0 Partial and the artifact-backed audit view is 45 Ready / 0 Partial.',
  },
  rows: closureRows.map((row) => ({
    ...row,
    status: 'partial',
    ready: false,
    artifactAcceptedStatus: 'ready',
  })),
  privacy: {
    includesSecretValues: false,
    exposesOnlyArtifactPathsAndBooleans: true,
    secretHandling: 'Partial closure readiness exposes commands, artifact paths, schema names, row mapping, and expected counts only; artifact contents, provider credentials, admin keys, database URLs, customer payloads, and raw provider responses are never returned.',
  },
});
