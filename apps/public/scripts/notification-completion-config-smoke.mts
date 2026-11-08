/** Actual completion builders + delivery resolver, isolated synthetic env; no provider I/O. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadMediaFixture } from './media-storage-recovery-fixture.mts';

const routes = [
  ['manifest', '../src/app/api/sites/[siteId]/manifest/route.ts', 'buildBackyCompletionStatus'],
  ['openapi', '../src/app/api/sites/[siteId]/openapi/route.ts', 'buildBackyCompletionStatus'],
  ['settings', '../src/app/api/admin/settings/route.ts', 'buildSettingsCompletionStatus'],
] as const;
// Execute the complete production function and its top-level local constants,
// retaining actual shared functions while excluding unrelated route handlers.
function completionFunction(relative: string, name: string, bindings: Record<string, unknown>) {
  const file = ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = new Map<string, ts.VariableStatement>();
  for (const statement of file.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, statement);
  }
  const selected = new Set<ts.VariableStatement>();
  const include = (key: string) => {
    const statement = declarations.get(key);
    if (!statement || selected.has(statement)) return;
    selected.add(statement);
    const visit = (node: ts.Node) => { if (ts.isIdentifier(node)) include(node.text); ts.forEachChild(node, visit); };
    visit(statement);
  };
  include(name);
  assert.ok(selected.size, 'Current production completion function is present');
  const source = file.statements.filter(statement => selected.has(statement as ts.VariableStatement)).map(statement => statement.getText(file)).join('\n');
  const javascript = ts.transpileModule(source + `\nresult = ${name}();`, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context: any = { ...bindings, exports: {}, result: null };
  vm.runInNewContext(javascript, context, { filename: relative });
  return context.result;
}

const token = 'synthetic-never-live-token';
const from = 'Fixture <mailbox@example.test>';
const unrelated = { BACKY_RESEND_API_KEY: 'unrelated-never-live-key', SMTP_HOST: 'unrelated-smtp.example.test', BACKY_EMAIL_DELIVERY_ENDPOINT: 'https://unrelated.example.test/email' };
const cases: Array<{ label: string; env: Record<string, string>; configured: boolean; provider: string }> = [
  { label: 'Hostinger valid token and sender', env: { BACKY_EMAIL_PROVIDER: 'hostinger', BACKY_HOSTINGER_MAIL_API_TOKEN: token, BACKY_HOSTINGER_MAIL_FROM: from }, configured: true, provider: 'hostinger' },
  { label: 'Hostinger missing token despite unrelated credentials', env: { ...unrelated, BACKY_EMAIL_PROVIDER: 'hostinger', BACKY_HOSTINGER_MAIL_FROM: from }, configured: false, provider: 'hostinger' },
  { label: 'Hostinger missing sender despite unrelated credentials', env: { ...unrelated, BACKY_EMAIL_PROVIDER: 'hostinger', BACKY_HOSTINGER_MAIL_API_TOKEN: token }, configured: false, provider: 'hostinger' },
  { label: 'Hostinger invalid sender', env: { BACKY_EMAIL_PROVIDER: 'hostinger', BACKY_HOSTINGER_MAIL_API_TOKEN: token, BACKY_HOSTINGER_MAIL_FROM: 'invalid' }, configured: false, provider: 'hostinger' },
  { label: 'Hostinger canonical sender alias', env: { BACKY_TRANSACTIONAL_EMAIL_PROVIDER: 'hostinger', BACKY_HOSTINGER_MAIL_API_TOKEN: token, BACKY_EMAIL_FROM: from }, configured: true, provider: 'hostinger' },
  { label: 'Hostinger canonical invalid sender takes precedence', env: { BACKY_EMAIL_PROVIDER: 'hostinger', BACKY_HOSTINGER_MAIL_API_TOKEN: token, BACKY_EMAIL_FROM: 'invalid', BACKY_HOSTINGER_MAIL_FROM: from }, configured: false, provider: 'hostinger' },
  { label: 'Hostinger credentials do not select provider automatically', env: { BACKY_HOSTINGER_MAIL_API_TOKEN: token, BACKY_HOSTINGER_MAIL_FROM: from }, configured: false, provider: 'local-outbox' },
  { label: 'BACKY SMTP host auto detection', env: { BACKY_SMTP_HOST: 'fixture-smtp.example.test' }, configured: true, provider: 'smtp' },
  { label: 'BACKY SMTP selected detection', env: { BACKY_EMAIL_PROVIDER: 'smtp', BACKY_SMTP_HOST: 'fixture-smtp.example.test' }, configured: true, provider: 'smtp' },
  { label: 'Selected SMTP missing host with unrelated Resend key', env: { BACKY_EMAIL_PROVIDER: 'smtp', BACKY_RESEND_API_KEY: unrelated.BACKY_RESEND_API_KEY }, configured: false, provider: 'smtp' },
  { label: 'Selected Resend missing key with unrelated SMTP host', env: { BACKY_EMAIL_PROVIDER: 'resend', BACKY_SMTP_HOST: unrelated.SMTP_HOST }, configured: false, provider: 'resend' },
  { label: 'Selected endpoint missing URL with unrelated Resend key', env: { BACKY_EMAIL_PROVIDER: 'http-endpoint', BACKY_RESEND_API_KEY: unrelated.BACKY_RESEND_API_KEY }, configured: false, provider: 'http-endpoint' },
  { label: 'No credentials uses local outbox', env: {}, configured: false, provider: 'local-outbox' },
  { label: 'Explicit local outbox ignores stale external credentials', env: { ...unrelated, BACKY_EMAIL_PROVIDER: 'local-outbox' }, configured: false, provider: 'local-outbox' },
  { label: 'Transactional local outbox alias ignores stale credentials', env: { ...unrelated, BACKY_TRANSACTIONAL_EMAIL_PROVIDER: ' LOCAL-OUTBOX ' }, configured: false, provider: 'local-outbox' },
  { label: 'Selected Resend configured', env: { BACKY_EMAIL_PROVIDER: 'resend', BACKY_RESEND_API_KEY: unrelated.BACKY_RESEND_API_KEY }, configured: true, provider: 'resend' },
  { label: 'Selected webhook alias configured', env: { BACKY_EMAIL_PROVIDER: 'webhook', BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL: unrelated.BACKY_EMAIL_DELIVERY_ENDPOINT }, configured: true, provider: 'http-endpoint' },
  { label: 'Unknown provider retains existing automatic selection', env: { BACKY_EMAIL_PROVIDER: 'unknown-fixture', BACKY_RESEND_API_KEY: unrelated.BACKY_RESEND_API_KEY }, configured: true, provider: 'resend' },
];
let checks = 0, networkCalls = 0;
const forbidNetwork = () => { networkCalls++; throw new Error('Provider network is forbidden in configuration checks.'); };
for (const scenario of cases) {
  const fixtureProcess = { env: scenario.env };
  const globals = { fetch: forbidNetwork };
  const hostinger = loadMediaFixture('../src/lib/hostingerMail.ts', {}, fixtureProcess, globals);
  const policy = loadMediaFixture('../src/lib/emailSenderPolicy.ts', {}, fixtureProcess, globals);
  const delivery = loadMediaFixture('../src/lib/formEmailDelivery.ts', { '@/lib/emailSenderPolicy': policy, '@/lib/hostingerMail': hostinger, 'node:net': { createConnection: forbidNetwork }, 'node:tls': { connect: forbidNetwork } }, fixtureProcess, globals);
  const closure = loadMediaFixture('../src/lib/completionStatusClosure.ts', {}, fixtureProcess, globals);
  const config = delivery.getEmailDeliveryConfig();
  assert.equal(config.provider, scenario.provider, scenario.label + ': actual selected provider'); checks++;
  assert.equal(delivery.isExternalEmailDeliveryConfigured(config), scenario.configured, scenario.label + ': actual configuration'); checks++;
  if (config.provider === 'local-outbox') {
    const result = await delivery.sendEmailMessage(config, { from: config.from, to: 'reader@example.test', subject: 'Owned configuration fixture', text: 'Synthetic fixture', siteId: 'fixture', status: 'accepted', requestId: 'fixture' });
    assert.equal(result.statusCode, 202); assert.equal(result.metadata.outboxOnly, true); checks += 2;
  }
  if (config.provider === 'hostinger') {
    const summary = hostinger.getHostingerMailConfigurationSummary(config.hostinger);
    assert.equal(summary.authenticationVerified, false); assert.equal(summary.outboundDeliveryVerified, false); checks += 2;
  }
  for (const [label, route, name] of routes) {
    const status = completionFunction(route, name, { ...delivery, ...closure, process: fixtureProcess });
    const gate = status.gates.find((entry: any) => entry.key === 'settings-provider-certification');
    assert.ok(gate, label + ': settings gate'); checks++;
    assert.equal(gate.runtime.configuredFamilies.includes('notifications'), scenario.configured, scenario.label + ': ' + label + ' configured notifications'); checks++;
    assert.equal(gate.runtime.missingFamilies.includes('notifications'), !scenario.configured, scenario.label + ': ' + label + ' missing notifications'); checks++;
    assert.equal(status.privacy.includesSecretValues, false); checks++;
    const serialized = JSON.stringify(status);
    assert.ok(!serialized.includes(token) && !serialized.includes(unrelated.BACKY_RESEND_API_KEY), label + ': no credentials in completion status'); checks++;
    assert.equal(status.status, 'external-gates-required', label + ': configuration alone does not close provider gates'); checks++;
  }
}
assert.equal(networkCalls, 0); checks++;
console.log(`Notification completion configuration: ${checks} checks PASS; actual manifest/OpenAPI/settings builders and selected delivery config; synthetic environment only, no provider calls or authentication/delivery claim.`);
