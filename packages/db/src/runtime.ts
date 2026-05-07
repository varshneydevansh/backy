import { createDatabaseAdapter, type DatabaseAdapter } from './adapters';
import { createDemoAdapter, type DemoAdapter } from './adapters/demo';
import {
    resolveBackyDataRuntimeConfig,
    type BackyDataRuntimeConfig,
} from './runtime-config';

export type BackyRuntimeAdapter =
    | { mode: 'database'; adapter: DatabaseAdapter }
    | { mode: 'demo'; adapter: DemoAdapter };

export async function createBackyRuntimeAdapter(
    config: BackyDataRuntimeConfig = resolveBackyDataRuntimeConfig(),
): Promise<BackyRuntimeAdapter> {
    if (config.mode === 'demo') {
        return {
            mode: 'demo',
            adapter: createDemoAdapter({
                enabled: true,
                reason: 'Explicit Backy demo mode',
            }),
        };
    }

    if (!config.database) {
        throw new Error('Database runtime mode requires a database configuration.');
    }

    return {
        mode: 'database',
        adapter: await createDatabaseAdapter(config.database),
    };
}

export {
    isBackyDemoModeEnabled,
    resolveBackyDataRuntimeConfig,
    type BackyDataMode,
    type BackyDataRuntimeConfig,
} from './runtime-config';
