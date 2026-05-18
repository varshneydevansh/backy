#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const root = new URL("..", import.meta.url);
const nextEnvUrl = new URL("apps/public/next-env.d.ts", root);
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const publicBaseUrl = (
  process.env.BACKY_PUBLIC_API_BASE_URL || "http://localhost:3001"
).replace(/\/$/, "");
const adminBaseUrl = (
  process.env.BACKY_ADMIN_BASE_URL || "http://localhost:5173"
).replace(/\/$/, "");
const stripeCommerceMockBaseUrl = "http://127.0.0.1:45678";
const commerceProviderMockBaseUrl = "http://127.0.0.1:45679";
const stripeTaxMockBaseUrl = "http://127.0.0.1:45679";
const taxJarMockBaseUrl = "http://127.0.0.1:45689/v2";
const avalaraMockBaseUrl = "http://127.0.0.1:45690";
const stripeRefundMockBaseUrl = "http://127.0.0.1:45680";
const easyPostMockBaseUrl = "http://127.0.0.1:45681/v2";
const shippoMockBaseUrl = "http://127.0.0.1:45682";
const paypalRefundMockBaseUrl = "http://127.0.0.1:45685";
const paddleRefundMockBaseUrl = "http://127.0.0.1:45692";
const squareRefundMockBaseUrl = "http://127.0.0.1:45686";
const adyenRefundMockBaseUrl = "http://127.0.0.1:45687";
const mollieRefundMockBaseUrl = "http://127.0.0.1:45688";
const razorpayRefundMockBaseUrl = "http://127.0.0.1:45691";

const detectChromeBin = () => {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const candidate of [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return process.env.CHROME_BIN;
};

const chromeBin = detectChromeBin();
const baseEnv = {
  ...process.env,
  BACKY_PUBLIC_API_BASE_URL: publicBaseUrl,
  BACKY_PUBLIC_BASE_URL: publicBaseUrl,
  BACKY_ADMIN_BASE_URL: adminBaseUrl,
  BACKY_COMMERCE_WEBHOOK_SECRET:
    process.env.BACKY_COMMERCE_WEBHOOK_SECRET ||
    "smoke-commerce-webhook-secret",
  BACKY_ADMIN_MFA_CODE:
    process.env.BACKY_ADMIN_MFA_CODE || "backy-commerce-provider-smoke-mfa",
  ...(chromeBin ? { CHROME_BIN: chromeBin } : {}),
};

const commerceMockEnv = {
  BACKY_STRIPE_SECRET_KEY: "sk_test_backy_commerce_mock",
  BACKY_STRIPE_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_PAYPAL_ACCESS_TOKEN: "paypal-commerce-mock-token",
  BACKY_PAYPAL_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_PADDLE_API_KEY: "paddle-commerce-mock-key",
  BACKY_PADDLE_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_SQUARE_ACCESS_TOKEN: "square-commerce-mock-token",
  BACKY_SQUARE_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_ADYEN_API_KEY: "adyen-commerce-mock-key",
  BACKY_ADYEN_MERCHANT_ACCOUNT: "BackyCommerceMock",
  BACKY_ADYEN_RECURRING_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_MOLLIE_API_KEY: "mollie-commerce-mock-key",
  BACKY_MOLLIE_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_RAZORPAY_KEY_ID: "razorpay-commerce-mock-key",
  BACKY_RAZORPAY_KEY_SECRET: "razorpay-commerce-mock-secret",
  BACKY_RAZORPAY_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN: "shopify-commerce-mock-token",
  BACKY_SHOPIFY_ADMIN_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_BIGCOMMERCE_ACCESS_TOKEN: "bigcommerce-commerce-mock-token",
  BACKY_BIGCOMMERCE_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_WOOCOMMERCE_CONSUMER_KEY: "woocommerce-commerce-mock-key",
  BACKY_WOOCOMMERCE_CONSUMER_SECRET: "woocommerce-commerce-mock-secret",
  BACKY_WOOCOMMERCE_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_ETSY_ACCESS_TOKEN: "etsy-commerce-mock-token",
  BACKY_ETSY_API_KEY: "etsy-commerce-mock-key",
  BACKY_ETSY_SHOP_ID: "etsy-commerce-mock-shop",
  BACKY_ETSY_API_BASE_URL: stripeCommerceMockBaseUrl,
  BACKY_ETSY_TAXONOMY_ID: "1",
  BACKY_MAGENTO_ACCESS_TOKEN: "magento-commerce-mock-token",
  BACKY_MAGENTO_API_BASE_URL: `${stripeCommerceMockBaseUrl}/magento/V1`,
  BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL: `${commerceProviderMockBaseUrl}/subscription/action`,
  BACKY_TAXJAR_API_KEY: "taxjar-commerce-mock-key",
  BACKY_TAXJAR_API_BASE_URL: `${commerceProviderMockBaseUrl}/v2`,
  BACKY_AVALARA_ACCOUNT_ID: "avalara-commerce-account",
  BACKY_AVALARA_LICENSE_KEY: "avalara-commerce-license",
  BACKY_AVALARA_COMPANY_CODE: "BACKY",
  BACKY_AVALARA_API_BASE_URL: commerceProviderMockBaseUrl,
  BACKY_EASYPOST_API_KEY: "easypost-commerce-mock-key",
  BACKY_EASYPOST_API_BASE_URL: `${commerceProviderMockBaseUrl}/v2`,
  BACKY_SHIPPO_API_KEY: "shippo-commerce-mock-key",
  BACKY_SHIPPO_API_BASE_URL: commerceProviderMockBaseUrl,
  BACKY_STRIPE_DISCOUNT_API_BASE_URL: commerceProviderMockBaseUrl,
};

const ordersMockEnv = {
  BACKY_STRIPE_SECRET_KEY: "sk_test_backy_orders_mock",
  BACKY_STRIPE_TAX_API_BASE_URL: stripeTaxMockBaseUrl,
  BACKY_STRIPE_DISCOUNT_API_BASE_URL: stripeTaxMockBaseUrl,
  BACKY_STRIPE_REFUND_API_BASE_URL: stripeRefundMockBaseUrl,
  BACKY_TAXJAR_API_KEY: "taxjar-orders-mock-key",
  BACKY_TAXJAR_API_BASE_URL: taxJarMockBaseUrl,
  BACKY_AVALARA_ACCOUNT_ID: "avalara-orders-account",
  BACKY_AVALARA_LICENSE_KEY: "avalara-orders-license",
  BACKY_AVALARA_COMPANY_CODE: "BACKY",
  BACKY_AVALARA_API_BASE_URL: avalaraMockBaseUrl,
  BACKY_EASYPOST_API_KEY: "easypost-orders-mock-key",
  BACKY_EASYPOST_API_BASE_URL: easyPostMockBaseUrl,
  BACKY_SHIPPO_API_KEY: "shippo-orders-mock-key",
  BACKY_SHIPPO_API_BASE_URL: shippoMockBaseUrl,
  BACKY_PAYPAL_ACCESS_TOKEN: "paypal-orders-mock-token",
  BACKY_PAYPAL_API_BASE_URL: paypalRefundMockBaseUrl,
  BACKY_PADDLE_API_KEY: "paddle-orders-mock-key",
  BACKY_PADDLE_API_BASE_URL: paddleRefundMockBaseUrl,
  BACKY_SQUARE_ACCESS_TOKEN: "square-orders-mock-token",
  BACKY_SQUARE_API_BASE_URL: squareRefundMockBaseUrl,
  BACKY_ADYEN_API_KEY: "adyen-orders-mock-key",
  BACKY_ADYEN_MERCHANT_ACCOUNT: "BackyOrdersMock",
  BACKY_ADYEN_API_BASE_URL: adyenRefundMockBaseUrl,
  BACKY_MOLLIE_API_KEY: "mollie-orders-mock-key",
  BACKY_MOLLIE_API_BASE_URL: mollieRefundMockBaseUrl,
  BACKY_RAZORPAY_KEY_ID: "razorpay-orders-mock-key",
  BACKY_RAZORPAY_KEY_SECRET: "razorpay-orders-mock-secret",
  BACKY_RAZORPAY_API_BASE_URL: razorpayRefundMockBaseUrl,
};

const runStep = (label, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(npmBin, args, {
      cwd: root,
      stdio: "inherit",
      env: {
        ...baseEnv,
        ...options.env,
      },
    });

    let settled = false;
    const monitorTimers = [];

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      for (const timer of monitorTimers) clearInterval(timer);
      callback(value);
    };

    const stopChild = () => {
      if (child.exitCode !== null || child.signalCode) return;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
      }, 5000).unref();
    };

    for (const state of options.monitorStates || []) {
      const timer = setInterval(() => {
        if (!state.exited) return;
        stopChild();
        finish(
          reject,
          new Error(
            `${label} failed because the ${state.label} dev server exited before the smoke step completed`,
          ),
        );
      }, 500);
      timer.unref();
      monitorTimers.push(timer);
    }

    child.once("error", (error) => finish(reject, error));
    child.once("exit", (code, signal) => {
      if (code === 0) {
        finish(resolve);
        return;
      }

      finish(
        reject,
        new Error(`${label} failed with ${signal || `exit code ${code}`}`),
      );
    });
  });

const startServer = (label, args, env = {}) => {
  const state = { label, exited: false };
  const server = spawn(npmBin, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...baseEnv,
      ...env,
    },
  });
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  server.once("exit", () => {
    state.exited = true;
  });
  return { server, state };
};

const waitForJsonDiscovery = async (serverState) => {
  const deadline =
    Date.now() +
    Number(process.env.BACKY_COMMERCE_PROVIDER_CI_SERVER_TIMEOUT_MS || 90000);
  let lastError = null;

  while (Date.now() < deadline) {
    if (serverState.exited && lastError) break;

    try {
      const response = await fetch(
        `${publicBaseUrl}/api/sites/site-demo/manifest`,
        {
          headers: { accept: "application/json" },
        },
      );
      if (response.ok) {
        const json = await response.json();
        if (json?.success !== false && json?.data?.site) return;
      }
      lastError = new Error(
        `public discovery returned HTTP ${response.status}`,
      );
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(
    `Backy public app did not become ready at ${publicBaseUrl}: ${lastError?.message || "timeout"}`,
  );
};

const waitForAdmin = async (serverState) => {
  const deadline =
    Date.now() +
    Number(process.env.BACKY_COMMERCE_PROVIDER_CI_SERVER_TIMEOUT_MS || 90000);
  let lastError = null;

  while (Date.now() < deadline) {
    if (serverState.exited && lastError) break;

    try {
      const response = await fetch(adminBaseUrl, {
        headers: { accept: "text/html" },
      });
      if (response.ok) return;
      lastError = new Error(`admin returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(
    `Backy admin app did not become ready at ${adminBaseUrl}: ${lastError?.message || "timeout"}`,
  );
};

const stopServer = async (server) => {
  if (!server || server.exitCode !== null || server.signalCode) return;

  server.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    delay(5000).then(() => false),
  ]);

  if (exited === false && server.exitCode === null) {
    server.kill("SIGKILL");
  }
};

let originalNextEnv = null;
let publicServer = null;
let adminServer = null;

try {
  originalNextEnv = await readFile(nextEnvUrl, "utf8").catch(() => null);

  const publicProcess = startServer(
    "public",
    ["--workspace", "@backy/public", "run", "dev"],
    commerceMockEnv,
  );
  publicServer = publicProcess.server;
  await waitForJsonDiscovery(publicProcess.state);

  const adminProcess = startServer("admin", [
    "--workspace",
    "@backy-cms/admin",
    "run",
    "dev:smoke:admin",
  ]);
  adminServer = adminProcess.server;
  await waitForAdmin(adminProcess.state);

  await runStep(
    "Commerce provider mock smoke with Razorpay subscription coverage",
    ["--workspace", "@backy-cms/admin", "run", "test:commerce"],
    {
      env: commerceMockEnv,
      monitorStates: [publicProcess.state, adminProcess.state],
    },
  );

  await stopServer(publicServer);
  publicServer = null;

  const ordersPublicProcess = startServer(
    "public",
    ["--workspace", "@backy/public", "run", "dev"],
    ordersMockEnv,
  );
  publicServer = ordersPublicProcess.server;
  await waitForJsonDiscovery(ordersPublicProcess.state);

  await runStep(
    "Orders provider mock smoke",
    ["--workspace", "@backy-cms/admin", "run", "test:orders"],
    {
      env: ordersMockEnv,
      monitorStates: [ordersPublicProcess.state, adminProcess.state],
    },
  );
} finally {
  await stopServer(adminServer);
  await stopServer(publicServer);

  if (originalNextEnv !== null) {
    await writeFile(nextEnvUrl, originalNextEnv);
  }
}
