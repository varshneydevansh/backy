import assert from 'node:assert/strict';
import { verifyFormCaptcha } from '../src/lib/formCaptcha';

const ENV_KEYS = [
  'NODE_ENV',
  'BACKY_FORM_CAPTCHA_PROVIDER',
  'BACKY_CAPTCHA_PROVIDER',
  'BACKY_ALLOW_PRODUCTION_MOCK_CAPTCHA',
  'BACKY_FORM_CAPTCHA_MOCK_TOKEN',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const mutableEnv = process.env as Record<string, string | undefined>;

const setEnv = (key: typeof ENV_KEYS[number], value: string | undefined) => {
  if (value === undefined) {
    delete mutableEnv[key];
  } else {
    mutableEnv[key] = value;
  }
};

const resetEnv = (next: Partial<Record<typeof ENV_KEYS[number], string | undefined>>) => {
  for (const key of ENV_KEYS) {
    setEnv(key, next[key]);
  }
};

const verify = () => verifyFormCaptcha({
  token: 'backy-captcha-pass',
  siteId: 'site-smoke',
  formId: 'form-smoke',
});

const main = async () => {
  try {
    resetEnv({ NODE_ENV: 'development' });
    assert.deepEqual(
      await verify(),
      { ok: true, provider: 'mock' },
      'Development should keep the default mock captcha provider',
    );

    resetEnv({ NODE_ENV: 'production', BACKY_FORM_CAPTCHA_PROVIDER: 'mock' });
    const blockedExplicitMock = await verify();
    assert.equal(blockedExplicitMock.ok, false);
    assert.equal(blockedExplicitMock.provider, 'unconfigured');
    assert.equal(blockedExplicitMock.errorCode, 'CAPTCHA_NOT_CONFIGURED');

    resetEnv({ NODE_ENV: 'production', BACKY_CAPTCHA_PROVIDER: 'mock' });
    const blockedLegacyMock = await verify();
    assert.equal(blockedLegacyMock.ok, false);
    assert.equal(blockedLegacyMock.provider, 'unconfigured');
    assert.equal(blockedLegacyMock.errorCode, 'CAPTCHA_NOT_CONFIGURED');

    resetEnv({
      NODE_ENV: 'production',
      BACKY_FORM_CAPTCHA_PROVIDER: 'mock',
      BACKY_ALLOW_PRODUCTION_MOCK_CAPTCHA: 'true',
    });
    assert.deepEqual(
      await verify(),
      { ok: true, provider: 'mock' },
      'Production mock captcha should require an explicit allow flag',
    );

    resetEnv({ NODE_ENV: 'production' });
    const unconfigured = await verify();
    assert.equal(unconfigured.ok, false);
    assert.equal(unconfigured.provider, 'unconfigured');
    assert.equal(unconfigured.errorCode, 'CAPTCHA_NOT_CONFIGURED');

    console.log('Form captcha smoke passed');
  } finally {
    for (const key of ENV_KEYS) {
      setEnv(key, originalEnv[key]);
    }
  }
};

void main();
