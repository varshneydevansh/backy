import {
  createBackyCustomFrontendClient,
  resolveBackyCustomFrontendConfig,
} from "./backy-client";

export const backyConfig = resolveBackyCustomFrontendConfig({
  env: process.env,
});

export const backy = createBackyCustomFrontendClient({
  env: process.env,
});

export const sitePublicHost = backyConfig.sitePublicHost;
