import { AsyncLocalStorage } from 'node:async_hooks';
// Internal request-scoped exclusion prevents counting a staged upload twice
// during normal media admission. Never derive this value from HTTP headers.
const completingUpload = new AsyncLocalStorage<string>();
export const currentCompletingMediaUpload = () => completingUpload.getStore();
export const withCompletingMediaUpload = <T>(id: string, run: () => Promise<T>) => completingUpload.run(id, run);
