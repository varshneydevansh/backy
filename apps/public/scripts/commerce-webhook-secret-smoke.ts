import assert from 'node:assert/strict';
import {
  commerceWebhookSecretReference,
  resolveCommerceWebhookSecret,
} from '../src/lib/commerceWebhookSecrets';

const settings = (reference: string) => ({
  integrations: {
    commerce: {
      providerWebhookSecretId: reference,
    },
  },
});

assert.equal(
  commerceWebhookSecretReference(settings('stripe_whsec_live')),
  'stripe_whsec_live',
  'Expected commerce webhook secret reference to be read from settings',
);

assert.deepEqual(
  resolveCommerceWebhookSecret(settings(''), { NODE_ENV: 'production' }),
  { reference: '', secret: '', source: 'none', envKeys: [] },
  'Missing reference should keep webhook signature verification optional',
);

const envReference = resolveCommerceWebhookSecret(settings('env:STRIPE_WEBHOOK_SECRET'), {
  NODE_ENV: 'production',
  STRIPE_WEBHOOK_SECRET: 'whsec_real',
});
assert.equal(envReference.secret, 'whsec_real');
assert.equal(envReference.source, 'env');
assert.deepEqual(envReference.envKeys, ['STRIPE_WEBHOOK_SECRET']);

const normalizedReference = resolveCommerceWebhookSecret(settings('stripe_whsec_live'), {
  NODE_ENV: 'production',
  BACKY_COMMERCE_WEBHOOK_SECRET_STRIPE_WHSEC_LIVE: 'whsec_normalized',
});
assert.equal(normalizedReference.secret, 'whsec_normalized');
assert.equal(normalizedReference.source, 'env');
assert(normalizedReference.envKeys.includes('BACKY_COMMERCE_WEBHOOK_SECRET_STRIPE_WHSEC_LIVE'));

const legacyReference = resolveCommerceWebhookSecret(settings('smoke-direct-secret'), {
  NODE_ENV: 'development',
});
assert.equal(legacyReference.secret, 'smoke-direct-secret');
assert.equal(legacyReference.source, 'development-direct');

const unresolvedProduction = resolveCommerceWebhookSecret(settings('stripe_whsec_live'), {
  NODE_ENV: 'production',
});
assert.equal(unresolvedProduction.secret, '');
assert.equal(unresolvedProduction.source, 'unresolved');
assert(unresolvedProduction.envKeys.includes('BACKY_COMMERCE_WEBHOOK_SECRET_STRIPE_WHSEC_LIVE'));

console.log(JSON.stringify({
  ok: true,
  cases: 6,
}));
