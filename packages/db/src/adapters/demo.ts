/**
 * Explicit demo adapter marker.
 *
 * The seeded in-memory/JSON runtime still lives in the public app while the
 * repository migration is in progress. This adapter makes demo mode an
 * intentional configuration choice instead of an implicit database fallback.
 */

export interface DemoAdapterConfig {
    enabled: boolean;
    reason?: string;
}

export interface DemoAdapter {
    readonly type: 'demo';
    readonly mode: 'demo';
    readonly reason?: string;
    isEnabled(): boolean;
}

export function createDemoAdapter(config: DemoAdapterConfig): DemoAdapter {
    if (!config.enabled) {
        throw new Error('Demo adapter requires BACKY_DATA_MODE=demo or BACKY_DEMO_MODE=true.');
    }

    return {
        type: 'demo',
        mode: 'demo',
        reason: config.reason,
        isEnabled: () => true,
    };
}
