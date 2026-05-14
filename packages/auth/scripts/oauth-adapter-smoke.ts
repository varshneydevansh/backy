import assert from 'node:assert/strict';
import { createOAuthAdapter, type AuthUser } from '../src/index';

const users = new Map<string, AuthUser>();
const passwordCredentials = new Map<string, { hash: string; salt: string }>();
const refreshTokens = new Map<string, { userId: string; expiresAt: Date }>();
const deliveredResetTokens: Array<{ user: AuthUser; token: string; expiresAt: Date }> = [];

const seedUser: AuthUser = {
    id: 'user_1',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    emailVerified: true,
};

users.set(seedUser.id, seedUser);

const adapter = await createOAuthAdapter(
    {
        type: 'oauth',
        jwtSecret: 'test-secret-with-enough-entropy',
        tokenExpiry: 60,
        refreshExpiry: 60,
        passwordResetExpiry: 60,
    },
    {
        findUserByEmail: async (email) => Array.from(users.values()).find((user) => user.email === email) || null,
        findUserById: async (userId) => users.get(userId) || null,
        findUserByProviderId: async (provider, providerId) => (
            Array.from(users.values()).find((user) => user.provider === provider && user.providerId === providerId) || null
        ),
        createUser: async (user, passwordHash, salt) => {
            const created = { ...user, id: `user_${users.size + 1}` };
            users.set(created.id, created);
            if (passwordHash && salt) {
                passwordCredentials.set(created.id, { hash: passwordHash, salt });
            }
            return created;
        },
        getPasswordHash: async (userId) => passwordCredentials.get(userId) || null,
        updatePasswordHash: async (userId, hash, salt) => {
            passwordCredentials.set(userId, { hash, salt });
        },
        storeRefreshToken: async (userId, token, expiresAt) => {
            refreshTokens.set(token, { userId, expiresAt });
        },
        getRefreshToken: async (token) => refreshTokens.get(token) || null,
        invalidateRefreshToken: async (token) => {
            refreshTokens.delete(token);
        },
        sendPasswordReset: async (input) => {
            deliveredResetTokens.push(input);
        },
    },
);

const signup = await adapter.signUp('grace@example.com', 'correct horse battery staple', { name: 'Grace Hopper' });
assert.equal(signup.user.email, 'grace@example.com');
assert.ok(signup.refreshToken, 'signup should issue a refresh token');

const refreshed = await adapter.refreshToken(signup.refreshToken);
assert.equal(refreshed.user.id, signup.user.id, 'refresh should load the user by stored refresh token userId');
assert.ok(!refreshTokens.has(signup.refreshToken), 'refresh should rotate the old refresh token');
assert.ok(refreshed.refreshToken && refreshed.refreshToken !== signup.refreshToken, 'refresh should issue a new refresh token');

await adapter.resetPassword('ada@example.com');
assert.equal(deliveredResetTokens.length, 1, 'resetPassword should deliver one reset token for existing users');
assert.equal(deliveredResetTokens[0]?.user.id, seedUser.id);
assert.ok(deliveredResetTokens[0]?.token, 'reset delivery should include a token');
assert.ok(deliveredResetTokens[0]?.expiresAt > new Date(), 'reset delivery should include a future expiry');

await adapter.updatePassword(deliveredResetTokens[0].token, 'new secure password');
assert.ok(passwordCredentials.has(seedUser.id), 'updatePassword should persist a password credential for the reset token subject');

await assert.rejects(
    () => adapter.updatePassword(refreshed.accessToken, 'should not work'),
    /Invalid or expired reset token/,
    'ordinary access tokens must not be accepted as reset tokens',
);

await adapter.resetPassword('missing@example.com');
assert.equal(deliveredResetTokens.length, 1, 'resetPassword must not reveal or deliver for missing accounts');

console.log(JSON.stringify({ ok: true, users: users.size }));
