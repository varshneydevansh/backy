/**
 * ==========================================================================
 * @backy/auth - Authentication & Authorization
 * ==========================================================================
 *
 * Abstract authentication layer supporting multiple providers:
 * - Email/Password (with hashing)
 * - OAuth 2.0 SSO (Google, GitHub, Microsoft)
 * - Supabase Auth (convenient wrapper)
 *
 * @module @backy/auth
 * @author Backy Team
 * @license MIT
 */

/// <reference path="./third-party-shims.d.ts" />
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, createHash } from 'crypto';

// ==========================================================================
// TYPES
// ==========================================================================

/** Supported OAuth providers */
export type OAuthProvider = 'google' | 'github' | 'microsoft';

/** Authentication provider types */
export type AuthProviderType = 'email' | 'oauth' | 'supabase';

/**
 * User session returned after authentication
 */
export interface Session {
    /** Access token (JWT) */
    accessToken: string;
    /** Refresh token */
    refreshToken?: string;
    /** Token expiration timestamp (Unix) */
    expiresAt: number;
    /** Authenticated user */
    user: AuthUser;
}

/**
 * Authenticated user data
 */
export interface AuthUser {
    /** User ID */
    id: string;
    /** Email address */
    email: string;
    /** Display name */
    name?: string;
    /** Avatar URL */
    avatarUrl?: string;
    /** OAuth provider (if applicable) */
    provider?: OAuthProvider;
    /** Provider-specific user ID */
    providerId?: string;
    /** Whether email is verified */
    emailVerified?: boolean;
}

/**
 * User metadata for signup
 */
export interface UserMetadata {
    name?: string;
    avatarUrl?: string;
    [key: string]: unknown;
}

/**
 * OAuth configuration for a provider
 */
export interface OAuthConfig {
    /** OAuth provider */
    provider: OAuthProvider;
    /** Client ID from provider */
    clientId: string;
    /** Client Secret from provider */
    clientSecret: string;
    /** OAuth callback URL */
    redirectUri: string;
    /** Additional scopes to request */
    scopes?: string[];
}

/**
 * Complete auth configuration
 */
export interface AuthConfig {
    /** Type of auth provider */
    type: AuthProviderType;
    /** JWT secret for token signing */
    jwtSecret: string;
    /** Token expiration in seconds (default: 1 hour) */
    tokenExpiry?: number;
    /** Refresh token expiration in seconds (default: 7 days) */
    refreshExpiry?: number;
    /** OAuth configurations */
    oauth?: OAuthConfig[];
    /** Supabase configuration (if using supabase type) */
    supabase?: {
        url: string;
        key: string;
    };
}

// ==========================================================================
// AUTH ADAPTER INTERFACE
// ==========================================================================

/**
 * Authentication adapter interface
 */
export interface AuthAdapter {
    /** Provider type */
    readonly type: AuthProviderType;

    /**
     * Sign in with email and password
     */
    signIn(email: string, password: string): Promise<Session>;

    /**
     * Sign up with email and password
     */
    signUp(
        email: string,
        password: string,
        metadata?: UserMetadata
    ): Promise<Session>;

    /**
     * Sign out (invalidate session)
     */
    signOut(token?: string): Promise<void>;

    /**
     * Get current session from token
     */
    getSession(token?: string): Promise<Session | null>;

    /**
     * Refresh an expired token
     */
    refreshToken(refreshToken?: string): Promise<Session>;

    /**
     * Initiate OAuth flow - returns redirect URL
     */
    getOAuthUrl(provider: OAuthProvider, state?: string): string;

    /**
     * Handle OAuth callback - exchange code for session
     */
    handleOAuthCallback(
        provider: OAuthProvider,
        code: string
    ): Promise<Session>;

    /**
     * Verify a JWT token
     */
    verifyToken(token: string): Promise<AuthUser | null>;

    /**
     * Reset password - sends email
     */
    resetPassword(email: string): Promise<void>;

    /**
     * Update password with reset token
     */
    updatePassword(token: string, newPassword: string): Promise<void>;
}

// ==========================================================================
// OAUTH PROVIDER CONFIGS
// ==========================================================================

const OAUTH_ENDPOINTS: Record<
    OAuthProvider,
    {
        authUrl: string;
        tokenUrl: string;
        userInfoUrl: string;
        scopes: string[];
    }
> = {
    google: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        scopes: ['email', 'profile'],
    },
    github: {
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        scopes: ['user:email'],
    },
    microsoft: {
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
        scopes: ['openid', 'email', 'profile'],
    },
};

// ==========================================================================
// JWT UTILITIES
// ==========================================================================

/**
 * Create a JWT token
 */
async function createToken(
    payload: Record<string, unknown>,
    secret: string,
    expiresIn: number
): Promise<string> {
    const secretKey = new TextEncoder().encode(secret);
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
        .sign(secretKey);
}

/**
 * Verify a JWT token
 */
async function verifyJwt(
    token: string,
    secret: string
): Promise<Record<string, unknown> | null> {
    try {
        const secretKey = new TextEncoder().encode(secret);
        const { payload } = await jwtVerify(token, secretKey);
        return payload as Record<string, unknown>;
    } catch {
        return null;
    }
}

/**
 * Hash a password with salt
 */
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const useSalt = salt || randomBytes(16).toString('hex');
    const hash = createHash('sha256')
        .update(password + useSalt)
        .digest('hex');
    return { hash, salt: useSalt };
}

/**
 * Verify password against hash
 */
function verifyPassword(password: string, hash: string, salt: string): boolean {
    const { hash: newHash } = hashPassword(password, salt);
    return newHash === hash;
}

// ==========================================================================
// OAUTH ADAPTER
// ==========================================================================

/**
 * Create an OAuth-based auth adapter
 *
 * This adapter handles OAuth SSO flows and manages JWT sessions.
 * User storage should be handled by your database layer.
 */
export async function createOAuthAdapter(
    config: AuthConfig,
    callbacks: {
        /** Find user by email */
        findUserByEmail: (email: string) => Promise<AuthUser | null>;
        /** Find user by OAuth provider ID */
        findUserByProviderId: (provider: OAuthProvider, id: string) => Promise<AuthUser | null>;
        /** Create new user */
        createUser: (user: Omit<AuthUser, 'id'>, passwordHash?: string, salt?: string) => Promise<AuthUser>;
        /** Get user password hash for verification */
        getPasswordHash: (userId: string) => Promise<{ hash: string; salt: string } | null>;
        /** Update password hash */
        updatePasswordHash: (userId: string, hash: string, salt: string) => Promise<void>;
        /** Store refresh token */
        storeRefreshToken: (userId: string, token: string, expiresAt: Date) => Promise<void>;
        /** Get refresh token data */
        getRefreshToken: (token: string) => Promise<{ userId: string; expiresAt: Date } | null>;
        /** Invalidate refresh token */
        invalidateRefreshToken: (token: string) => Promise<void>;
    }
): Promise<AuthAdapter> {
    const tokenExpiry = config.tokenExpiry || 3600; // 1 hour
    const refreshExpiry = config.refreshExpiry || 604800; // 7 days

    const oauthConfigs = new Map<OAuthProvider, OAuthConfig>();
    config.oauth?.forEach((c) => oauthConfigs.set(c.provider, c));

    /**
     * Create session from user
     */
    async function createSession(user: AuthUser): Promise<Session> {
        const accessToken = await createToken(
            { sub: user.id, email: user.email },
            config.jwtSecret,
            tokenExpiry
        );

        const refreshToken = randomBytes(32).toString('hex');
        await callbacks.storeRefreshToken(
            user.id,
            refreshToken,
            new Date(Date.now() + refreshExpiry * 1000)
        );

        return {
            accessToken,
            refreshToken,
            expiresAt: Math.floor(Date.now() / 1000) + tokenExpiry,
            user,
        };
    }

    return {
        type: 'oauth',

        async signIn(email: string, password: string): Promise<Session> {
            const user = await callbacks.findUserByEmail(email);
            if (!user) {
                throw new Error('Invalid email or password');
            }

            const stored = await callbacks.getPasswordHash(user.id);
            if (!stored || !verifyPassword(password, stored.hash, stored.salt)) {
                throw new Error('Invalid email or password');
            }

            return createSession(user);
        },

        async signUp(
            email: string,
            password: string,
            metadata?: UserMetadata
        ): Promise<Session> {
            const existing = await callbacks.findUserByEmail(email);
            if (existing) {
                throw new Error('Email already registered');
            }

            const { hash, salt } = hashPassword(password);
            const user = await callbacks.createUser(
                {
                    email,
                    name: metadata?.name,
                    avatarUrl: metadata?.avatarUrl as string | undefined,
                    emailVerified: false,
                },
                hash,
                salt
            );

            return createSession(user);
        },

        async signOut(token: string): Promise<void> {
            // Invalidate refresh token if provided
            // JWTs can't be truly invalidated without a blacklist
            await callbacks.invalidateRefreshToken(token);
        },

        async getSession(token: string): Promise<Session | null> {
            const payload = await verifyJwt(token, config.jwtSecret);
            if (!payload) return null;

            const user = await callbacks.findUserByEmail(payload.email as string);
            if (!user) return null;

            return {
                accessToken: token,
                expiresAt: payload.exp as number,
                user,
            };
        },

        async refreshToken(refreshToken: string): Promise<Session> {
            const stored = await callbacks.getRefreshToken(refreshToken);
            if (!stored || stored.expiresAt < new Date()) {
                throw new Error('Invalid or expired refresh token');
            }

            const user = await callbacks.findUserByEmail('');
            if (!user) {
                throw new Error('User not found');
            }

            // Invalidate old refresh token
            await callbacks.invalidateRefreshToken(refreshToken);

            return createSession(user);
        },

        getOAuthUrl(provider: OAuthProvider, state?: string): string {
            const oauthConfig = oauthConfigs.get(provider);
            if (!oauthConfig) {
                throw new Error(`OAuth provider ${provider} not configured`);
            }

            const endpoints = OAUTH_ENDPOINTS[provider];
            const scopes = [...endpoints.scopes, ...(oauthConfig.scopes || [])].join(' ');

            const params = new URLSearchParams({
                client_id: oauthConfig.clientId,
                redirect_uri: oauthConfig.redirectUri,
                response_type: 'code',
                scope: scopes,
                state: state || randomBytes(16).toString('hex'),
            });

            return `${endpoints.authUrl}?${params.toString()}`;
        },

        async handleOAuthCallback(
            provider: OAuthProvider,
            code: string
        ): Promise<Session> {
            const oauthConfig = oauthConfigs.get(provider);
            if (!oauthConfig) {
                throw new Error(`OAuth provider ${provider} not configured`);
            }

            const endpoints = OAUTH_ENDPOINTS[provider];

            // Exchange code for tokens
            const tokenResponse = await fetch(endpoints.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
                body: new URLSearchParams({
                    client_id: oauthConfig.clientId,
                    client_secret: oauthConfig.clientSecret,
                    code,
                    redirect_uri: oauthConfig.redirectUri,
                    grant_type: 'authorization_code',
                }),
            });

            const tokens = await tokenResponse.json();
            if (!tokens.access_token) {
                throw new Error('Failed to get access token from OAuth provider');
            }

            // Get user info
            const userInfoResponse = await fetch(endpoints.userInfoUrl, {
                headers: {
                    Authorization: `Bearer ${tokens.access_token}`,
                    Accept: 'application/json',
                },
            });

            const userInfo = await userInfoResponse.json();

            // Extract user data (varies by provider)
            let email: string;
            let name: string | undefined;
            let avatarUrl: string | undefined;
            let providerId: string;

            switch (provider) {
                case 'google':
                    email = userInfo.email;
                    name = userInfo.name;
                    avatarUrl = userInfo.picture;
                    providerId = userInfo.id;
                    break;
                case 'github':
                    email = userInfo.email;
                    name = userInfo.name || userInfo.login;
                    avatarUrl = userInfo.avatar_url;
                    providerId = String(userInfo.id);
                    break;
                case 'microsoft':
                    email = userInfo.mail || userInfo.userPrincipalName;
                    name = userInfo.displayName;
                    providerId = userInfo.id;
                    break;
            }

            // Find or create user
            let user = await callbacks.findUserByProviderId(provider, providerId);
            if (!user) {
                user = await callbacks.findUserByEmail(email);
            }

            if (!user) {
                user = await callbacks.createUser({
                    email,
                    name,
                    avatarUrl,
                    provider,
                    providerId,
                    emailVerified: true,
                });
            }

            return createSession(user);
        },

        async verifyToken(token: string): Promise<AuthUser | null> {
            const payload = await verifyJwt(token, config.jwtSecret);
            if (!payload) return null;

            return callbacks.findUserByEmail(payload.email as string);
        },

        async resetPassword(email: string): Promise<void> {
            const user = await callbacks.findUserByEmail(email);
            if (!user) {
                // Don't reveal if user exists
                return;
            }

            // In a real implementation, generate reset token and send email
            // This is a placeholder - integrate with your email service
            console.log(`Password reset requested for ${email}`);
        },

        async updatePassword(token: string, newPassword: string): Promise<void> {
            const payload = await verifyJwt(token, config.jwtSecret);
            if (!payload) {
                throw new Error('Invalid or expired reset token');
            }

            const { hash, salt } = hashPassword(newPassword);
            await callbacks.updatePasswordHash(payload.sub as string, hash, salt);
        },
    };
}

// ==========================================================================
// SUPABASE ADAPTER
// ==========================================================================

/**
 * Create a Supabase Auth adapter
 *
 * Convenient wrapper around Supabase Auth for those already using Supabase.
 */
export async function createSupabaseAuthAdapter(
    config: AuthConfig
): Promise<AuthAdapter> {
    if (!config.supabase) {
        throw new Error('Supabase configuration required');
    }

    const supabaseConfig = config.supabase;

    const { createClient } = await import('@supabase/supabase-js').catch(() => {
        throw new Error(
            '@supabase/supabase-js is required to use the Supabase auth adapter.'
        );
    });
    const supabase = createClient(supabaseConfig.url, supabaseConfig.key);
    const supabaseAuth: Record<string, any> = supabase.auth as Record<string, any>;
    const providerMap: Record<OAuthProvider, string> = {
        google: 'google',
        github: 'github',
        microsoft: 'azure',
    };

    type SupabaseAuthSession = {
        access_token: string;
        refresh_token: string;
        expires_at?: number | null;
    };

    type SupabaseAuthUser = {
        id: string;
        email?: string | null;
        user_metadata?: {
            full_name?: string | null;
            avatar_url?: string | null;
        } | null;
        email_confirmed_at?: string | null;
    };

    type SupabaseAuthResponse = {
        data?: {
            session?: SupabaseAuthSession | null;
            user?: SupabaseAuthUser | null;
        };
        error?: {
            message?: string;
        };
    };

    const toSession = (session: SupabaseAuthSession, user: SupabaseAuthUser): Session => ({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at || 0,
        user: {
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.full_name || undefined,
            avatarUrl: user.user_metadata?.avatar_url || undefined,
            emailVerified: !!user.email_confirmed_at,
        },
    });

    const getSession = async (): Promise<Session | null> => {
        const { data: currentSession, error } = (await supabaseAuth.getSession()) as SupabaseAuthResponse;
        const session = currentSession?.session;
        if (error || !session) return null;

        const { data: currentUser } = (await supabaseAuth.getUser()) as {
            data?: { user?: SupabaseAuthUser | null };
            error?: { message?: string };
        };
        const user = currentUser?.user;
        if (!user) return null;

        return toSession(session, user);
    };

    return {
        type: 'supabase',

        async signIn(email: string, password: string): Promise<Session> {
            const { data: authData, error } = (await supabaseAuth.signInWithPassword({
                email,
                password,
            })) as {
                data?: {
                    session?: SupabaseAuthSession | null;
                    user?: SupabaseAuthUser | null;
                };
                error?: { message?: string };
            };

            if (error) throw new Error(error.message);
            const session = authData?.session;
            const user = authData?.user;
            if (!session || !user) throw new Error('Login failed');

            return toSession(session, user);
        },

        async signUp(
            email: string,
            password: string,
            metadata?: UserMetadata
        ): Promise<Session> {
            const { data: authData, error } = (await supabaseAuth.signUp({
                email,
                password,
                options: { data: metadata },
            })) as {
                data?: {
                    session?: SupabaseAuthSession | null;
                    user?: SupabaseAuthUser | null;
                };
                error?: { message?: string };
            };

            if (error) throw new Error(error.message);
            const session = authData?.session;
            const user = authData?.user;
            if (!session || !user) throw new Error('Signup failed');

            return toSession(session, user);
        },

        async signOut(): Promise<void> {
            const { error } = (await supabaseAuth.signOut()) as {
                error?: { message: string };
            };
            if (error) throw new Error(error.message);
        },

        async getSession(): Promise<Session | null> {
            return getSession();
        },

        async refreshToken(): Promise<Session> {
            const { data: authData, error } = (await supabaseAuth.refreshSession()) as {
                data?: {
                    session?: SupabaseAuthSession | null;
                    user?: SupabaseAuthUser | null;
                };
                error?: { message?: string };
            };
            if (error) throw new Error(error.message);
            const session = authData?.session;
            const user = authData?.user;
            if (!session || !user) throw new Error('Refresh failed');

            return toSession(session, user);
        },

        getOAuthUrl(
            provider: OAuthProvider,
            state?: string
        ): string {
            // Supabase handles OAuth redirects differently
            // Return the Supabase OAuth URL
            const redirectTo = config.oauth?.find((c) => c.provider === provider)?.redirectUri;
            const providerName = providerMap[provider];
            const baseUrl = new URL('/auth/v1/authorize', supabaseConfig.url);

            const params = new URLSearchParams({
                provider: providerName,
                redirect_to: redirectTo || '',
                flow_type: 'pkce',
            });

            if (state) {
                params.set('state', state);
            }

            return `${baseUrl.toString()}?${params.toString()}`;
        },

        async handleOAuthCallback(
            _provider: OAuthProvider,
            _code: string
        ): Promise<Session> {
            void _provider;
            void _code;
            // Supabase handles this automatically via URL hash
            const session = await getSession();
            if (!session) throw new Error('OAuth callback failed');
            return session;
        },

        async verifyToken(): Promise<AuthUser | null> {
            const { data } = (await supabaseAuth.getUser()) as {
                data?: { user?: SupabaseAuthUser | null };
                error?: { message?: string };
            };
            if (!data || !data.user) return null;
            const { user } = data;

            return {
                id: user.id,
                email: user.email || '',
                name: user.user_metadata?.full_name || undefined,
                avatarUrl: user.user_metadata?.avatar_url || undefined,
                emailVerified: !!user.email_confirmed_at,
            };
        },

        async resetPassword(email: string): Promise<void> {
            const { error } = (await supabaseAuth.resetPasswordForEmail(email)) as {
                error?: { message: string };
            };
            if (error) throw new Error(error.message);
        },

        async updatePassword(_token: string, newPassword: string): Promise<void> {
            const { error } = (await supabaseAuth.updateUser({ password: newPassword })) as {
                error?: { message: string };
            };
            if (error) throw new Error(error.message);
        },
    };
}

// ==========================================================================
// FACTORY
// ==========================================================================

/**
 * Create an auth adapter based on configuration
 *
 * @example
 * ```ts
 * // With Supabase
 * const auth = await createAuthAdapter({
 *   type: 'supabase',
 *   jwtSecret: process.env.JWT_SECRET,
 *   supabase: {
 *     url: process.env.SUPABASE_URL,
 *     key: process.env.SUPABASE_KEY,
 *   },
 * });
 *
 * // With OAuth (requires database callbacks)
 * const auth = await createOAuthAdapter(config, callbacks);
 * ```
 */
export async function createAuthAdapter(
    config: AuthConfig
): Promise<AuthAdapter> {
    switch (config.type) {
        case 'supabase':
            return await createSupabaseAuthAdapter(config);
        default:
            throw new Error(
                `Auth type ${config.type} requires createOAuthAdapter with database callbacks`
            );
    }
}

// ==========================================================================
// EXPORTS
// ==========================================================================

export { hashPassword, verifyPassword, createToken, verifyJwt };
