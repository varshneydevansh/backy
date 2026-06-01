import {
  createBackyCustomFrontendClient,
  resolveBackyCustomFrontendConfig,
} from "@backy/sdk-js";

export const backyConfig = resolveBackyCustomFrontendConfig({
  env: process.env,
});

export const backy = createBackyCustomFrontendClient({
  env: process.env,
});

export const sitePublicHost = backyConfig.sitePublicHost;
