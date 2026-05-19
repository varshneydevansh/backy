#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ADMIN_BASE_URL = process.env.BACKY_ADMIN_BASE_URL || 'http://localhost:5173';
const API_BASE_URL = process.env.BACKY_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const SITE_ID = process.env.BACKY_PAGE_CREATE_SMOKE_SITE_ID || 'site-demo';
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.BACKY_PAGE_CREATE_CDP_PORT || 9372);
const SCREENSHOT_PATH = process.env.BACKY_PAGE_CREATE_SCREENSHOT || path.join(os.tmpdir(), 'backy-page-create-smoke.png');
const TEMPLATE_DESKTOP_SCREENSHOT_PATH = process.env.BACKY_PAGE_CREATE_TEMPLATE_DESKTOP_SCREENSHOT
  || path.join(os.tmpdir(), 'backy-page-create-templates-desktop.png');
const TEMPLATE_MOBILE_SCREENSHOT_PATH = process.env.BACKY_PAGE_CREATE_TEMPLATE_MOBILE_SCREENSHOT
  || path.join(os.tmpdir(), 'backy-page-create-templates-mobile.png');
const EDITOR_TEMPLATE_SCREENSHOT_DIR = process.env.BACKY_PAGE_CREATE_EDITOR_TEMPLATE_SCREENSHOT_DIR || os.tmpdir();
const FRONTEND_DESIGN_TEMPLATE_ID = 'smoke-page-contract-template';
const FRONTEND_DESIGN_TEMPLATE_NAME = 'Smoke Contract Landing';
let apiAdminSessionToken = '';

const EDITOR_SCREENSHOT_THRESHOLDS = {
  minClipWidth: 500,
  minClipHeight: 460,
  minSampledPixels: 60000,
  minLumaRange: 120,
  minCanvasNonWhiteRatio: 0.004,
  minCanvasDarkRatio: 0.0007,
};

const BLANK_EDITOR_SCREENSHOT_THRESHOLDS = {
  ...EDITOR_SCREENSHOT_THRESHOLDS,
  minClipWidth: 560,
  minClipHeight: 380,
  minCanvasNonWhiteRatio: 0.0015,
  minCanvasDarkRatio: 0.0003,
};

const PUBLIC_TEMPLATE_SCREENSHOT_THRESHOLDS = {
  minClipWidth: 320,
  minClipHeight: 640,
  minSampledPixels: 45000,
  minLumaRange: 90,
  minCanvasNonWhiteRatio: 0.003,
  minCanvasDarkRatio: 0.00045,
};

const BLANK_PUBLIC_TEMPLATE_SCREENSHOT_THRESHOLDS = {
  ...PUBLIC_TEMPLATE_SCREENSHOT_THRESHOLDS,
  minCanvasNonWhiteRatio: 0.0012,
  minCanvasDarkRatio: 0.0002,
};

const PUBLIC_TEMPLATE_RESPONSIVE_VIEWPORTS = [
  { key: 'mobile', width: 390, height: 900, expectedBreakpoint: 'mobile' },
  { key: 'tablet', width: 820, height: 1024, expectedBreakpoint: 'tablet' },
];

const STARTER_TEMPLATE_BACKEND_CASES = [
  {
    template: 'landing',
    title: 'Smoke Landing Template',
    slugBase: 'smoke-landing-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'landing',
    navigationItem: 'Features',
    headingId: 'landing-hero-heading',
    minRootElementCount: 4,
    minTotalElementCount: 20,
    minCanvasHeight: 1000,
    requiredElementIds: [
      'landing-site-header',
      'landing-site-navigation',
      'landing-site-footer',
      'landing-hero-section',
      'landing-hero-heading',
      'landing-hero-copy',
      'landing-hero-button',
      'landing-feature-section',
      'landing-feature-0',
      'landing-feature-1',
      'landing-feature-2',
    ],
  },
  {
    template: 'storefront',
    title: 'Smoke Storefront Template',
    slugBase: 'smoke-storefront-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'storefront',
    navigationItem: 'Shop',
    headingId: 'storefront-heading',
    minRootElementCount: 4,
    minTotalElementCount: 22,
    minCanvasHeight: 1000,
    requiredElementIds: [
      'storefront-site-header',
      'storefront-site-navigation',
      'storefront-site-footer',
      'storefront-hero-section',
      'storefront-featured-product',
      'storefront-products-section',
      'storefront-product-card-0',
      'storefront-product-card-1',
      'storefront-product-card-2',
    ],
    dataBindingElementIds: [
      'storefront-hero-section',
      'storefront-featured-product',
      'storefront-products-section',
      'storefront-product-card-0',
    ],
  },
  {
    template: 'product-detail',
    title: 'Smoke Product Detail Template',
    slugBase: 'smoke-product-detail-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'product-detail',
    navigationItem: 'Product',
    headingId: 'product-detail-heading',
    minRootElementCount: 4,
    minTotalElementCount: 24,
    minCanvasHeight: 1100,
    requiredElementIds: [
      'product-detail-site-header',
      'product-detail-site-navigation',
      'product-detail-site-footer',
      'product-detail-hero-section',
      'product-detail-media',
      'product-detail-heading',
      'product-detail-price',
      'product-detail-option',
      'product-detail-buy-button',
      'product-detail-stock',
      'product-detail-related-section',
      'product-detail-related-card-0',
    ],
    dataBindingElementIds: [
      'product-detail-hero-section',
      'product-detail-media',
      'product-detail-heading',
      'product-detail-related-section',
      'product-detail-related-card-0',
    ],
  },
  {
    template: 'pricing',
    title: 'Smoke Pricing Template',
    slugBase: 'smoke-pricing-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'pricing',
    navigationItem: 'Pricing',
    headingId: 'pricing-heading',
    minRootElementCount: 5,
    minTotalElementCount: 42,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'pricing-site-header',
      'pricing-site-navigation',
      'pricing-site-footer',
      'pricing-hero-section',
      'pricing-billing-toggle',
      'pricing-monthly-toggle',
      'pricing-annual-toggle',
      'pricing-plan-section',
      'pricing-plan-card-0',
      'pricing-plan-price-0',
      'pricing-plan-button-0',
      'pricing-comparison-section',
      'pricing-comparison-table',
      'pricing-comparison-row-0',
      'pricing-faq-card',
    ],
    dataBindingElementIds: [
      'pricing-hero-section',
      'pricing-billing-toggle',
      'pricing-plan-section',
      'pricing-plan-card-0',
      'pricing-plan-name-0',
      'pricing-plan-price-0',
      'pricing-comparison-section',
      'pricing-comparison-table',
      'pricing-comparison-row-0',
    ],
  },
  {
    template: 'services',
    title: 'Smoke Services Template',
    slugBase: 'smoke-services-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'services',
    navigationItem: 'Services',
    headingId: 'services-heading',
    minRootElementCount: 5,
    minTotalElementCount: 46,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'services-site-header',
      'services-site-navigation',
      'services-site-footer',
      'services-hero-section',
      'services-format-filter',
      'services-filter-all',
      'services-filter-online',
      'services-list-section',
      'services-card-0',
      'services-card-title-0',
      'services-card-price-0',
      'services-booking-button-0',
      'services-process-section',
      'services-process-step-0',
      'services-inquiry-card',
      'services-inquiry-button',
    ],
    dataBindingElementIds: [
      'services-hero-section',
      'services-format-filter',
      'services-list-section',
      'services-card-0',
      'services-card-title-0',
      'services-card-duration-0',
      'services-card-price-0',
      'services-process-section',
      'services-process-step-0',
    ],
  },
  {
    template: 'booking',
    title: 'Smoke Booking Template',
    slugBase: 'smoke-booking-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'booking',
    navigationItem: 'Book',
    headingId: 'booking-heading',
    minRootElementCount: 5,
    minTotalElementCount: 48,
    minCanvasHeight: 1400,
    requiredElementIds: [
      'booking-site-header',
      'booking-site-navigation',
      'booking-site-footer',
      'booking-hero-section',
      'booking-heading',
      'booking-intro-copy',
      'booking-availability-card',
      'booking-availability-value',
      'booking-appointment-section',
      'booking-location-filter',
      'booking-appointment-card-0',
      'booking-appointment-title-0',
      'booking-appointment-duration-0',
      'booking-appointment-price-0',
      'booking-appointment-summary-0',
      'booking-appointment-button-0',
      'booking-intake-section',
      'booking-intake-form',
      'booking-intake-name',
      'booking-intake-email',
      'booking-intake-topic',
      'booking-confirmation-card',
      'booking-confirmation-button',
    ],
    formElementIds: ['booking-intake-form'],
    dataBindingElementIds: [
      'booking-hero-section',
      'booking-availability-card',
      'booking-availability-value',
      'booking-appointment-section',
      'booking-location-filter',
      'booking-appointment-card-0',
      'booking-appointment-title-0',
      'booking-appointment-duration-0',
      'booking-appointment-price-0',
      'booking-appointment-summary-0',
      'booking-appointment-button-0',
      'booking-intake-section',
      'booking-intake-form',
      'booking-confirmation-card',
      'booking-confirmation-button',
    ],
  },
  {
    template: 'portfolio',
    title: 'Smoke Portfolio Template',
    slugBase: 'smoke-portfolio-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'portfolio',
    navigationItem: 'Portfolio',
    headingId: 'portfolio-heading',
    minRootElementCount: 5,
    minTotalElementCount: 42,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'portfolio-site-header',
      'portfolio-site-navigation',
      'portfolio-site-footer',
      'portfolio-hero-section',
      'portfolio-featured-card',
      'portfolio-gallery-section',
      'portfolio-category-filter',
      'portfolio-filter-all',
      'portfolio-project-card-0',
      'portfolio-project-media-0',
      'portfolio-project-title-0',
      'portfolio-project-button-0',
      'portfolio-inquiry-section',
      'portfolio-inquiry-button',
    ],
    dataBindingElementIds: [
      'portfolio-hero-section',
      'portfolio-featured-card',
      'portfolio-gallery-section',
      'portfolio-category-filter',
      'portfolio-project-card-0',
      'portfolio-project-media-0',
      'portfolio-project-title-0',
      'portfolio-inquiry-section',
    ],
  },
  {
    template: 'gallery',
    title: 'Smoke Gallery Template',
    slugBase: 'smoke-gallery-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'gallery',
    navigationItem: 'Gallery',
    headingId: 'gallery-heading',
    minRootElementCount: 6,
    minTotalElementCount: 58,
    minCanvasHeight: 1500,
    requiredElementIds: [
      'gallery-site-header',
      'gallery-site-navigation',
      'gallery-site-footer',
      'gallery-hero-section',
      'gallery-featured-asset',
      'gallery-featured-thumbnail',
      'gallery-filter-section',
      'gallery-folder-filter',
      'gallery-filter-all',
      'gallery-filter-images',
      'gallery-filter-videos',
      'gallery-filter-files',
      'gallery-filter-fonts',
      'gallery-upload-handoff-button',
      'gallery-grid-section',
      'gallery-media-card-0',
      'gallery-media-thumbnail-0',
      'gallery-media-title-0',
      'gallery-media-open-button-0',
      'gallery-lightbox-section',
      'gallery-lightbox-button',
    ],
    dataBindingElementIds: [
      'gallery-hero-section',
      'gallery-featured-asset',
      'gallery-featured-thumbnail',
      'gallery-filter-section',
      'gallery-folder-filter',
      'gallery-grid-section',
      'gallery-media-card-0',
      'gallery-media-thumbnail-0',
      'gallery-media-title-0',
      'gallery-media-open-button-0',
      'gallery-lightbox-section',
      'gallery-lightbox-button',
    ],
  },
  {
    template: 'events',
    title: 'Smoke Events Template',
    slugBase: 'smoke-events-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'events',
    navigationItem: 'Events',
    headingId: 'events-heading',
    minRootElementCount: 5,
    minTotalElementCount: 46,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'events-site-header',
      'events-site-navigation',
      'events-site-footer',
      'events-hero-section',
      'events-format-filter',
      'events-filter-all',
      'events-list-section',
      'events-card-0',
      'events-card-date-0',
      'events-card-title-0',
      'events-card-location-0',
      'events-rsvp-button-0',
      'events-agenda-section',
      'events-agenda-step-0',
      'events-rsvp-card',
      'events-main-rsvp-button',
    ],
    dataBindingElementIds: [
      'events-hero-section',
      'events-format-filter',
      'events-list-section',
      'events-card-0',
      'events-card-date-0',
      'events-card-title-0',
      'events-card-location-0',
      'events-card-capacity-0',
      'events-agenda-section',
      'events-agenda-step-0',
    ],
  },
  {
    template: 'privacy',
    title: 'Smoke Privacy Template',
    slugBase: 'smoke-privacy-template',
    expectedNavigationPlacement: 'footer',
    chromePrefix: 'privacy',
    navigationItem: 'Privacy',
    headingId: 'privacy-heading',
    minRootElementCount: 5,
    minTotalElementCount: 38,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'privacy-site-header',
      'privacy-site-navigation',
      'privacy-site-footer',
      'privacy-hero-section',
      'privacy-effective-card',
      'privacy-effective-date',
      'privacy-policy-section',
      'privacy-policy-card-0',
      'privacy-policy-card-title-0',
      'privacy-policy-card-copy-0',
      'privacy-rights-section',
      'privacy-rights-card',
      'privacy-contact-card',
      'privacy-contact-button',
    ],
    dataBindingElementIds: [
      'privacy-hero-section',
      'privacy-effective-card',
      'privacy-effective-date',
      'privacy-policy-section',
      'privacy-policy-card-0',
      'privacy-policy-card-title-0',
      'privacy-policy-card-copy-0',
      'privacy-rights-section',
      'privacy-rights-card',
      'privacy-contact-card',
    ],
  },
  {
    template: 'terms',
    title: 'Smoke Terms Template',
    slugBase: 'smoke-terms-template',
    expectedNavigationPlacement: 'footer',
    chromePrefix: 'terms',
    navigationItem: 'Terms',
    headingId: 'terms-heading',
    minRootElementCount: 5,
    minTotalElementCount: 38,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'terms-site-header',
      'terms-site-navigation',
      'terms-site-footer',
      'terms-hero-section',
      'terms-effective-card',
      'terms-effective-date',
      'terms-policy-section',
      'terms-policy-card-0',
      'terms-policy-card-title-0',
      'terms-policy-card-copy-0',
      'terms-contact-section',
      'terms-acceptance-card',
      'terms-contact-card',
      'terms-contact-button',
    ],
    dataBindingElementIds: [
      'terms-hero-section',
      'terms-effective-card',
      'terms-effective-date',
      'terms-policy-section',
      'terms-policy-card-0',
      'terms-policy-card-title-0',
      'terms-policy-card-copy-0',
      'terms-contact-section',
      'terms-acceptance-card',
      'terms-contact-card',
    ],
  },
  {
    template: 'cookie-policy',
    title: 'Smoke Cookie Policy Template',
    slugBase: 'smoke-cookie-policy-template',
    expectedNavigationPlacement: 'footer',
    chromePrefix: 'cookie-policy',
    navigationItem: 'Cookies',
    headingId: 'cookie-policy-heading',
    minRootElementCount: 5,
    minTotalElementCount: 38,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'cookie-policy-site-header',
      'cookie-policy-site-navigation',
      'cookie-policy-site-footer',
      'cookie-policy-hero-section',
      'cookie-policy-consent-card',
      'cookie-policy-consent-value',
      'cookie-policy-categories-section',
      'cookie-policy-category-card-0',
      'cookie-policy-category-card-title-0',
      'cookie-policy-category-card-copy-0',
      'cookie-policy-preferences-section',
      'cookie-policy-retention-card',
      'cookie-policy-preferences-card',
      'cookie-policy-preferences-button',
    ],
    dataBindingElementIds: [
      'cookie-policy-hero-section',
      'cookie-policy-consent-card',
      'cookie-policy-consent-value',
      'cookie-policy-categories-section',
      'cookie-policy-category-card-0',
      'cookie-policy-category-card-title-0',
      'cookie-policy-category-card-copy-0',
      'cookie-policy-preferences-section',
      'cookie-policy-retention-card',
      'cookie-policy-preferences-card',
    ],
  },
  {
    template: 'accessibility-statement',
    title: 'Smoke Accessibility Statement Template',
    slugBase: 'smoke-accessibility-statement-template',
    expectedNavigationPlacement: 'footer',
    chromePrefix: 'accessibility-statement',
    navigationItem: 'Accessibility',
    headingId: 'accessibility-statement-heading',
    minRootElementCount: 5,
    minTotalElementCount: 38,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'accessibility-statement-site-header',
      'accessibility-statement-site-navigation',
      'accessibility-statement-site-footer',
      'accessibility-statement-hero-section',
      'accessibility-statement-standard-card',
      'accessibility-statement-standard-value',
      'accessibility-statement-support-section',
      'accessibility-statement-support-card-0',
      'accessibility-statement-support-card-title-0',
      'accessibility-statement-support-card-copy-0',
      'accessibility-statement-feedback-section',
      'accessibility-statement-review-card',
      'accessibility-statement-feedback-card',
      'accessibility-statement-feedback-button',
    ],
    dataBindingElementIds: [
      'accessibility-statement-hero-section',
      'accessibility-statement-standard-card',
      'accessibility-statement-standard-value',
      'accessibility-statement-support-section',
      'accessibility-statement-support-card-0',
      'accessibility-statement-support-card-title-0',
      'accessibility-statement-support-card-copy-0',
      'accessibility-statement-feedback-section',
      'accessibility-statement-review-card',
      'accessibility-statement-feedback-card',
    ],
  },
  {
    template: 'refund-policy',
    title: 'Smoke Refund Policy Template',
    slugBase: 'smoke-refund-policy-template',
    expectedNavigationPlacement: 'footer',
    chromePrefix: 'refund-policy',
    navigationItem: 'Refunds',
    headingId: 'refund-policy-heading',
    minRootElementCount: 5,
    minTotalElementCount: 38,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'refund-policy-site-header',
      'refund-policy-site-navigation',
      'refund-policy-site-footer',
      'refund-policy-hero-section',
      'refund-policy-window-card',
      'refund-policy-window-value',
      'refund-policy-rules-section',
      'refund-policy-rule-card-0',
      'refund-policy-rule-card-title-0',
      'refund-policy-rule-card-copy-0',
      'refund-policy-actions-section',
      'refund-policy-eligibility-card',
      'refund-policy-contact-card',
      'refund-policy-contact-button',
    ],
    dataBindingElementIds: [
      'refund-policy-hero-section',
      'refund-policy-window-card',
      'refund-policy-window-value',
      'refund-policy-rules-section',
      'refund-policy-rule-card-0',
      'refund-policy-rule-card-title-0',
      'refund-policy-rule-card-copy-0',
      'refund-policy-actions-section',
      'refund-policy-eligibility-card',
      'refund-policy-contact-card',
    ],
  },
  {
    template: 'shipping-policy',
    title: 'Smoke Shipping Policy Template',
    slugBase: 'smoke-shipping-policy-template',
    expectedNavigationPlacement: 'footer',
    chromePrefix: 'shipping-policy',
    navigationItem: 'Shipping',
    headingId: 'shipping-policy-heading',
    minRootElementCount: 5,
    minTotalElementCount: 38,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'shipping-policy-site-header',
      'shipping-policy-site-navigation',
      'shipping-policy-site-footer',
      'shipping-policy-hero-section',
      'shipping-policy-timeline-card',
      'shipping-policy-timeline-value',
      'shipping-policy-methods-section',
      'shipping-policy-method-card-0',
      'shipping-policy-method-card-title-0',
      'shipping-policy-method-card-copy-0',
      'shipping-policy-actions-section',
      'shipping-policy-tracking-card',
      'shipping-policy-contact-card',
      'shipping-policy-contact-button',
    ],
    dataBindingElementIds: [
      'shipping-policy-hero-section',
      'shipping-policy-timeline-card',
      'shipping-policy-timeline-value',
      'shipping-policy-methods-section',
      'shipping-policy-method-card-0',
      'shipping-policy-method-card-title-0',
      'shipping-policy-method-card-copy-0',
      'shipping-policy-actions-section',
      'shipping-policy-tracking-card',
      'shipping-policy-contact-card',
    ],
  },
  {
    template: 'cart',
    title: 'Smoke Cart Template',
    slugBase: 'smoke-cart-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'cart',
    navigationItem: 'Cart',
    headingId: 'cart-heading',
    minRootElementCount: 5,
    minTotalElementCount: 42,
    minCanvasHeight: 1200,
    requiredElementIds: [
      'cart-site-header',
      'cart-site-navigation',
      'cart-site-footer',
      'cart-hero-section',
      'cart-status-card',
      'cart-items-section',
      'cart-item-list',
      'cart-item-row-0',
      'cart-quantity-control-0',
      'cart-remove-button-0',
      'cart-summary-card',
      'cart-total-value',
      'cart-actions-section',
      'cart-continue-shopping-button',
      'cart-checkout-button',
    ],
    dataBindingElementIds: [
      'cart-hero-section',
      'cart-status-card',
      'cart-status-count',
      'cart-item-list',
      'cart-item-row-0',
      'cart-quantity-control-0',
      'cart-total-value',
    ],
  },
  {
    template: 'checkout',
    title: 'Smoke Checkout Template',
    slugBase: 'smoke-checkout-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'checkout',
    navigationItem: 'Checkout',
    headingId: 'checkout-heading',
    minRootElementCount: 6,
    minTotalElementCount: 34,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'checkout-site-header',
      'checkout-site-navigation',
      'checkout-site-footer',
      'checkout-hero-section',
      'checkout-provider-note',
      'checkout-main-section',
      'checkout-customer-card',
      'checkout-email',
      'checkout-shipping-address',
      'checkout-shipping-method',
      'checkout-order-summary',
      'checkout-total-value',
      'checkout-payment-section',
      'checkout-payment-button',
      'checkout-payment-safe-note',
    ],
    dataBindingElementIds: [
      'checkout-hero-section',
      'checkout-customer-card',
      'checkout-order-summary',
      'checkout-total-value',
      'checkout-payment-section',
    ],
  },
  {
    template: 'order-confirmation',
    title: 'Smoke Order Confirmation Template',
    slugBase: 'smoke-order-confirmation-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'order-confirmation',
    navigationItem: 'Orders',
    headingId: 'order-confirmation-heading',
    minRootElementCount: 5,
    minTotalElementCount: 40,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'order-confirmation-site-header',
      'order-confirmation-site-navigation',
      'order-confirmation-site-footer',
      'order-confirmation-hero-section',
      'order-confirmation-status-card',
      'order-confirmation-number',
      'order-confirmation-receipt-section',
      'order-confirmation-receipt-card',
      'order-confirmation-total-value',
      'order-confirmation-delivery-card',
      'order-confirmation-tracking-status',
      'order-confirmation-next-section',
      'order-confirmation-next-card-0',
      'order-confirmation-next-button-0',
    ],
    dataBindingElementIds: [
      'order-confirmation-hero-section',
      'order-confirmation-status-card',
      'order-confirmation-status',
      'order-confirmation-number',
      'order-confirmation-receipt-card',
      'order-confirmation-total-value',
      'order-confirmation-delivery-card',
      'order-confirmation-tracking-status',
      'order-confirmation-next-section',
    ],
  },
  {
    template: 'help-center',
    title: 'Smoke Help Center Template',
    slugBase: 'smoke-help-center-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'help-center',
    navigationItem: 'Help',
    headingId: 'help-center-heading',
    minRootElementCount: 5,
    minTotalElementCount: 38,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'help-center-site-header',
      'help-center-site-navigation',
      'help-center-site-footer',
      'help-center-hero-section',
      'help-center-search-input',
      'help-center-search-button',
      'help-center-category-section',
      'help-center-category-card-0',
      'help-center-faq-section',
      'help-center-faq-list',
      'help-center-faq-item-0',
      'help-center-faq-question-0',
      'help-center-escalation-card',
      'help-center-contact-button',
    ],
    dataBindingElementIds: [
      'help-center-hero-section',
      'help-center-category-section',
      'help-center-category-card-0',
      'help-center-faq-section',
      'help-center-faq-list',
      'help-center-faq-item-0',
      'help-center-faq-question-0',
    ],
  },
  {
    template: 'faq',
    title: 'Smoke FAQ Template',
    slugBase: 'smoke-faq-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'faq',
    navigationItem: 'FAQ',
    headingId: 'faq-heading',
    minRootElementCount: 5,
    minTotalElementCount: 38,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'faq-site-header',
      'faq-site-navigation',
      'faq-site-footer',
      'faq-hero-section',
      'faq-heading',
      'faq-intro-copy',
      'faq-search-input',
      'faq-search-button',
      'faq-question-section',
      'faq-category-filter',
      'faq-category-chip-0',
      'faq-question-list',
      'faq-question-item-0',
      'faq-question-title-0',
      'faq-question-answer-0',
      'faq-question-toggle-0',
      'faq-support-section',
      'faq-support-card',
      'faq-contact-card',
      'faq-contact-button',
    ],
    dataBindingElementIds: [
      'faq-hero-section',
      'faq-search-input',
      'faq-question-section',
      'faq-category-filter',
      'faq-category-chip-0',
      'faq-question-list',
      'faq-question-item-0',
      'faq-question-title-0',
      'faq-question-answer-0',
      'faq-support-section',
      'faq-contact-card',
      'faq-contact-button',
    ],
  },
  {
    template: 'testimonials',
    title: 'Smoke Testimonials Template',
    slugBase: 'smoke-testimonials-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'testimonials',
    navigationItem: 'Testimonials',
    headingId: 'testimonials-heading',
    minRootElementCount: 5,
    minTotalElementCount: 40,
    minCanvasHeight: 1400,
    requiredElementIds: [
      'testimonials-site-header',
      'testimonials-site-navigation',
      'testimonials-site-footer',
      'testimonials-hero-section',
      'testimonials-heading',
      'testimonials-intro-copy',
      'testimonials-rating-card',
      'testimonials-rating-value',
      'testimonials-review-section',
      'testimonials-source-filter',
      'testimonials-review-card-0',
      'testimonials-review-rating-0',
      'testimonials-review-quote-0',
      'testimonials-review-name-0',
      'testimonials-review-role-0',
      'testimonials-cta-section',
      'testimonials-logo-wall',
      'testimonials-inquiry-card',
      'testimonials-inquiry-button',
    ],
    dataBindingElementIds: [
      'testimonials-hero-section',
      'testimonials-rating-card',
      'testimonials-rating-value',
      'testimonials-review-section',
      'testimonials-source-filter',
      'testimonials-review-card-0',
      'testimonials-review-rating-0',
      'testimonials-review-quote-0',
      'testimonials-review-name-0',
      'testimonials-review-role-0',
      'testimonials-cta-section',
      'testimonials-logo-wall',
      'testimonials-inquiry-card',
      'testimonials-inquiry-button',
    ],
  },
  {
    template: 'blog-index',
    title: 'Smoke Blog Index Template',
    slugBase: 'smoke-blog-index-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'blog-index',
    navigationItem: 'Blog',
    headingId: 'blog-index-heading',
    minRootElementCount: 4,
    minTotalElementCount: 20,
    minCanvasHeight: 1000,
    requiredElementIds: [
      'blog-index-site-header',
      'blog-index-site-navigation',
      'blog-index-site-footer',
      'blog-index-hero-section',
      'blog-index-featured-card',
      'blog-index-list-section',
      'blog-index-post-row-0',
      'blog-index-post-row-1',
      'blog-index-post-row-2',
    ],
    dataBindingElementIds: [
      'blog-index-hero-section',
      'blog-index-featured-card',
      'blog-index-list-section',
      'blog-index-post-row-0',
    ],
  },
  {
    template: 'blog-post',
    title: 'Smoke Blog Post Template',
    slugBase: 'smoke-blog-post-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'blog-post',
    navigationItem: 'Blog',
    headingId: 'blog-post-heading',
    minRootElementCount: 5,
    minTotalElementCount: 44,
    minCanvasHeight: 1400,
    requiredElementIds: [
      'blog-post-site-header',
      'blog-post-site-navigation',
      'blog-post-site-footer',
      'blog-post-hero-section',
      'blog-post-heading',
      'blog-post-excerpt',
      'blog-post-meta-row',
      'blog-post-featured-media',
      'blog-post-body-section',
      'blog-post-body-card',
      'blog-post-author-card',
      'blog-post-taxonomy-card',
      'blog-post-tag-0',
      'blog-post-related-section',
      'blog-post-related-card-0',
      'blog-post-related-title-0',
    ],
    dataBindingElementIds: [
      'blog-post-hero-section',
      'blog-post-heading',
      'blog-post-excerpt',
      'blog-post-meta-row',
      'blog-post-featured-media',
      'blog-post-body-section',
      'blog-post-body-card',
      'blog-post-author-card',
      'blog-post-taxonomy-card',
      'blog-post-related-section',
      'blog-post-related-card-0',
      'blog-post-related-title-0',
    ],
  },
  {
    template: 'team',
    title: 'Smoke Team Template',
    slugBase: 'smoke-team-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'team',
    navigationItem: 'Team',
    headingId: 'team-heading',
    minRootElementCount: 5,
    minTotalElementCount: 38,
    minCanvasHeight: 1300,
    requiredElementIds: [
      'team-site-header',
      'team-site-navigation',
      'team-site-footer',
      'team-hero-section',
      'team-heading',
      'team-intro-copy',
      'team-roster-section',
      'team-role-filter',
      'team-profile-card-0',
      'team-profile-name-0',
      'team-profile-role-0',
      'team-profile-bio-0',
      'team-profile-social-0',
      'team-culture-section',
      'team-values-card',
      'team-hiring-card',
      'team-hiring-button',
    ],
    dataBindingElementIds: [
      'team-hero-section',
      'team-roster-section',
      'team-profile-card-0',
      'team-profile-name-0',
      'team-profile-role-0',
      'team-profile-bio-0',
      'team-culture-section',
      'team-values-card',
      'team-hiring-card',
    ],
  },
  {
    template: 'careers',
    title: 'Smoke Careers Template',
    slugBase: 'smoke-careers-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'careers',
    navigationItem: 'Careers',
    headingId: 'careers-heading',
    minRootElementCount: 5,
    minTotalElementCount: 42,
    minCanvasHeight: 1500,
    requiredElementIds: [
      'careers-site-header',
      'careers-site-navigation',
      'careers-site-footer',
      'careers-hero-section',
      'careers-heading',
      'careers-intro-copy',
      'careers-role-filter',
      'careers-jobs-section',
      'careers-job-card-0',
      'careers-job-title-0',
      'careers-job-meta-0',
      'careers-job-summary-0',
      'careers-job-apply-0',
      'careers-culture-section',
      'careers-benefits-card',
      'careers-process-card',
      'careers-apply-card',
      'careers-apply-button',
    ],
    dataBindingElementIds: [
      'careers-hero-section',
      'careers-role-filter',
      'careers-jobs-section',
      'careers-job-card-0',
      'careers-job-title-0',
      'careers-job-meta-0',
      'careers-job-summary-0',
      'careers-job-apply-0',
      'careers-culture-section',
      'careers-benefits-card',
      'careers-process-card',
      'careers-apply-card',
      'careers-apply-button',
    ],
  },
  {
    template: 'about',
    title: 'Smoke About Template',
    slugBase: 'smoke-about-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'about',
    navigationItem: 'About',
    headingId: 'about-heading',
    minRootElementCount: 5,
    minTotalElementCount: 18,
    minCanvasHeight: 1000,
    requiredElementIds: [
      'about-site-header',
      'about-site-navigation',
      'about-site-footer',
      'about-heading',
      'about-story-copy',
      'about-values-section',
      'about-value-0',
      'about-value-1',
      'about-value-2',
      'about-value-heading-0',
      'about-value-copy-0',
    ],
  },
  {
    template: 'contact',
    title: 'Smoke Contact Template',
    slugBase: 'smoke-contact-template',
    expectedNavigationPlacement: 'footer',
    chromePrefix: 'contact',
    navigationItem: 'Contact',
    headingId: 'contact-heading',
    minRootElementCount: 5,
    minTotalElementCount: 14,
    minCanvasHeight: 850,
    requiredElementIds: [
      'contact-site-header',
      'contact-site-navigation',
      'contact-site-footer',
      'contact-heading',
      'contact-copy',
      'contact-form-card',
      'contact-name',
      'contact-email',
      'contact-message',
      'contact-submit',
    ],
    formElementIds: ['contact-form-card'],
  },
  {
    template: 'newsletter',
    title: 'Smoke Newsletter Template',
    slugBase: 'smoke-newsletter-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'newsletter',
    navigationItem: 'Newsletter',
    headingId: 'newsletter-heading',
    minRootElementCount: 4,
    minTotalElementCount: 28,
    minCanvasHeight: 1000,
    requiredElementIds: [
      'newsletter-site-header',
      'newsletter-site-navigation',
      'newsletter-site-footer',
      'newsletter-hero-section',
      'newsletter-heading',
      'newsletter-copy',
      'newsletter-proof-card',
      'newsletter-signup-form',
      'newsletter-first-name',
      'newsletter-email',
      'newsletter-topic',
      'newsletter-consent',
      'newsletter-source',
      'newsletter-submit',
      'newsletter-confirmation-section',
      'newsletter-confirmation-card',
      'newsletter-manage-preferences-button',
    ],
    formElementIds: ['newsletter-signup-form'],
  },
  {
    template: 'survey',
    title: 'Smoke Survey Template',
    slugBase: 'smoke-survey-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'survey',
    navigationItem: 'Survey',
    headingId: 'survey-heading',
    minRootElementCount: 4,
    minTotalElementCount: 30,
    minCanvasHeight: 1000,
    requiredElementIds: [
      'survey-site-header',
      'survey-site-navigation',
      'survey-site-footer',
      'survey-hero-section',
      'survey-heading',
      'survey-copy',
      'survey-insight-card',
      'survey-response-form',
      'survey-rating',
      'survey-topic',
      'survey-feedback',
      'survey-email',
      'survey-consent',
      'survey-submit',
      'survey-summary-section',
      'survey-routing-card',
      'survey-results-button',
    ],
    formElementIds: ['survey-response-form'],
  },
  {
    template: 'registration',
    title: 'Smoke Registration Template',
    slugBase: 'smoke-registration-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'registration',
    navigationItem: 'Register',
    headingId: 'registration-heading',
    minRootElementCount: 3,
    minTotalElementCount: 20,
    minCanvasHeight: 1000,
    requiredElementIds: [
      'registration-site-header',
      'registration-site-navigation',
      'registration-site-footer',
      'registration-hero-section',
      'registration-note',
      'registration-form-card',
      'registration-name',
      'registration-email',
      'registration-phone',
      'registration-member-type',
      'registration-consent',
      'registration-submit',
    ],
    formElementIds: ['registration-form-card'],
  },
  {
    template: 'member-login',
    title: 'Smoke Member Login Template',
    slugBase: 'smoke-member-login-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'member-login',
    navigationItem: 'Login',
    headingId: 'member-login-heading',
    minRootElementCount: 3,
    minTotalElementCount: 20,
    minCanvasHeight: 900,
    requiredElementIds: [
      'member-login-site-header',
      'member-login-site-navigation',
      'member-login-site-footer',
      'member-login-hero-section',
      'member-login-access-form',
      'member-login-email',
      'member-login-access-reason',
      'member-login-submit',
      'member-login-register-card',
      'member-login-register-button',
    ],
    formElementIds: ['member-login-access-form'],
  },
  {
    template: 'member-account',
    title: 'Smoke Member Account Template',
    slugBase: 'smoke-member-account-template',
    expectedNavigationPlacement: 'primary',
    chromePrefix: 'member-account',
    navigationItem: 'Account',
    headingId: 'member-account-heading',
    minRootElementCount: 3,
    minTotalElementCount: 28,
    minCanvasHeight: 1000,
    requiredElementIds: [
      'member-account-site-header',
      'member-account-site-navigation',
      'member-account-site-footer',
      'member-account-hero-section',
      'member-account-profile-card',
      'member-account-preferences-form',
      'member-account-display-name',
      'member-account-email',
      'member-account-updates',
      'member-account-submit',
      'member-account-resource-section',
      'member-account-resource-0',
    ],
    formElementIds: ['member-account-preferences-form'],
    dataBindingElementIds: [
      'member-account-profile-card',
      'member-account-resource-0',
    ],
  },
  {
    template: 'blank',
    title: 'Smoke Blank Template',
    slugBase: 'smoke-blank-template',
    expectedNavigationPlacement: 'none',
    headingId: 'blank-heading',
    minRootElementCount: 2,
    minTotalElementCount: 2,
    minCanvasHeight: 800,
    requiredElementIds: ['blank-heading', 'blank-intro'],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertPageCreateSourceContracts = () => {
  const source = fs.readFileSync(new URL('../src/routes/pages.new.tsx', import.meta.url), 'utf8');
  assert(
    source.includes('&& selectedSite') &&
      source.includes("if (!selectedSite) return 'Select a target site before creating this page.';"),
    'Page create submit readiness must require a resolved target site, not just a stale siteId',
  );
  assert(
    source.includes('getScheduledPageDateError') &&
      source.includes('Date.parse(scheduledAt)') &&
      source.includes('scheduledAtMs <= Date.now()') &&
      source.includes('Choose a future publish date before creating a scheduled page.'),
    'Page create submit readiness must block scheduled pages with non-future publish dates before submit',
  );
  assert(
    source.includes("'member-login'") &&
      source.includes('member-login-access-form') &&
      source.includes("'member-account'") &&
      source.includes('member-account-preferences-form') &&
      source.includes("'product-detail'") &&
      source.includes('product-detail-buy-button') &&
      source.includes("'pricing'") &&
      source.includes('pricing-plan-card-${index}') &&
      source.includes('pricing-billing-toggle') &&
      source.includes("'services'") &&
      source.includes('services-format-filter') &&
      source.includes('services-booking-button-${index}') &&
      source.includes('services.inquiry.open') &&
      source.includes("'booking'") &&
      source.includes('booking-appointment-card-${index}') &&
      source.includes('booking-intake-form') &&
      source.includes('booking.provider.open') &&
      source.includes("'portfolio'") &&
      source.includes('portfolio-category-filter') &&
      source.includes('portfolio-project-card-${index}') &&
      source.includes('portfolio.inquiry.open') &&
      source.includes("'gallery'") &&
      source.includes('gallery-folder-filter') &&
      source.includes('gallery-media-card-${index}') &&
      source.includes('media.lightbox.open') &&
      source.includes("'events'") &&
      source.includes('events-format-filter') &&
      source.includes('events-card-${index}') &&
      source.includes('events.registration.open') &&
      source.includes("'privacy'") &&
      source.includes('privacy-policy-card-${index}') &&
      source.includes('privacy-rights-card') &&
      source.includes('privacy.request.open') &&
      source.includes("'terms'") &&
      source.includes('terms-policy-card-${index}') &&
      source.includes('terms-acceptance-card') &&
      source.includes('terms.contact.open') &&
      source.includes("'cookie-policy'") &&
      source.includes('cookie-policy-category-card-${index}') &&
      source.includes('cookie-policy-retention-card') &&
      source.includes('cookies.preferences.open') &&
      source.includes("'accessibility-statement'") &&
      source.includes('accessibility-statement-support-card-${index}') &&
      source.includes('accessibility-statement-review-card') &&
      source.includes('accessibility.feedback.open') &&
      source.includes("'refund-policy'") &&
      source.includes('refund-policy-rule-card-${index}') &&
      source.includes('refund-policy-eligibility-card') &&
      source.includes('refund.request.open') &&
      source.includes("'shipping-policy'") &&
      source.includes('shipping-policy-method-card-${index}') &&
      source.includes('shipping-policy-tracking-card') &&
      source.includes('shipping.tracking.open') &&
      source.includes("'cart'") &&
      source.includes('cart-checkout-button') &&
      source.includes("'checkout'") &&
      source.includes('checkout-payment-safe-note') &&
      source.includes('No card number, CVV, or raw payment secret is collected by this page starter.') &&
      source.includes("'order-confirmation'") &&
      source.includes('order-confirmation-status-card') &&
      source.includes('customer-safe receipt details') &&
      source.includes("'help-center'") &&
      source.includes('help-center-search-input') &&
      source.includes('help-center-contact-button') &&
      source.includes("'faq'") &&
      source.includes('faq-question-item-${index}') &&
      source.includes('faq-contact-card') &&
      source.includes('faq.contact.open') &&
      source.includes("'testimonials'") &&
      source.includes('testimonials-review-card-${index}') &&
      source.includes('testimonials-rating-card') &&
      source.includes('testimonials.inquiry.open') &&
      source.includes("'blog-post'") &&
      source.includes('blog-post-body-section') &&
      source.includes('blog-post-author-card') &&
      source.includes('blog-post-related-card-${index}') &&
      source.includes("'team'") &&
      source.includes('team-profile-card-${index}') &&
      source.includes('team-values-card') &&
      source.includes('team.hiring.open') &&
      source.includes("'careers'") &&
      source.includes('careers-job-card-${index}') &&
      source.includes('careers-benefits-card') &&
      source.includes('careers.application.open') &&
      source.includes("'newsletter'") &&
      source.includes('newsletter-signup-form') &&
      source.includes('newsletter-consent') &&
      source.includes('newsletter.preferences.open') &&
      source.includes("'survey'") &&
      source.includes('survey-response-form') &&
      source.includes('survey-rating') &&
      source.includes('survey.results.open') &&
      source.includes('This starter never asks visitors to submit a password into Backy Forms.'),
    'Page create must keep safe member, commerce, pricing, services, booking, portfolio, gallery, events, privacy, terms, cookie policy, accessibility statement, refund policy, shipping policy, help-center, FAQ, testimonials, blog-post, team, careers, newsletter, and survey starters',
  );
};

const isIgnorableBrowserLogError = (event) => (
  event.method === 'Log.entryAdded' &&
  event.params?.entry?.source === 'intervention' &&
  /beforeunload.*confirmation panel/i.test(event.params?.entry?.text || '')
);

const waitForExit = (childProcess, timeoutMs = 1500) => new Promise((resolve) => {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    resolve(true);
    return;
  }

  const timeout = setTimeout(() => {
    childProcess.off('exit', onExit);
    resolve(false);
  }, timeoutMs);

  const onExit = () => {
    clearTimeout(timeout);
    resolve(true);
  };

  childProcess.once('exit', onExit);
});

const requestApi = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(endpoint.startsWith('/api/admin/') && apiAdminSessionToken ? { authorization: `Bearer ${apiAdminSessionToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 300)}`);
  }

  return payload;
};

const loginAdminApi = async () => {
  const login = (twoFactorCode) => fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });

  let response = await login();
  let payload = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_PAGE_CREATE_SMOKE_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE;
  if (!response.ok && payload.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
    response = await login(smokeMfaCode);
    payload = await response.json().catch(() => ({}));
  }

  if (!response.ok || payload.success === false || !payload.data?.session?.token) {
    throw new Error(`Unable to create API admin session: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  apiAdminSessionToken = payload.data.session.token;
  return payload.data;
};

const createParentPage = async () => {
  const slug = `page-create-parent-${Date.now().toString(36)}`;
  const title = 'Smoke Parent Page';
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      slug,
      status: 'published',
      description: 'Temporary parent page for page create hierarchy smoke.',
      content: [],
      meta: {
        title,
        description: 'Temporary parent page for page create hierarchy smoke.',
        canonical: `/${slug}`,
      },
    }),
  });
  return payload.data.page;
};

const createDatasetCollection = async () => {
  const suffix = Date.now().toString(36);
  const slug = `page-create-dataset-${suffix}`;
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/collections`, {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke Dataset ${suffix}`,
      slug,
      description: 'Temporary collection for page create dataset import smoke.',
      status: 'published',
      listRoutePattern: `/${slug}`,
      routePattern: `/${slug}/:recordSlug`,
      permissions: {
        publicRead: true,
        publicCreate: false,
        publicUpdate: false,
        publicDelete: false,
      },
      fields: [
        { key: 'title', label: 'Title', type: 'text', required: true, unique: true, sortOrder: 10 },
        { key: 'summary', label: 'Summary', type: 'richText', required: false, unique: false, sortOrder: 20 },
        { key: 'image', label: 'Image', type: 'image', required: false, unique: false, sortOrder: 30 },
        { key: 'category', label: 'Category', type: 'select', required: false, unique: false, sortOrder: 40, options: ['Smoke', 'Featured'] },
      ],
    }),
  });
  const collection = payload.data?.collection || payload.collection;
  assert(collection?.id, `Dataset collection was not created: ${JSON.stringify(payload).slice(0, 500)}`);
  return collection;
};

const getFrontendDesign = async () => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`);
  const frontendDesign = payload.data?.frontendDesign;
  assert(frontendDesign?.schemaVersion === 'backy.frontend-design.v1', `Unexpected frontend design response: ${JSON.stringify(payload).slice(0, 500)}`);
  return frontendDesign;
};

const patchFrontendDesign = async (frontendDesign) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/frontend-design`, {
    method: 'PATCH',
    body: JSON.stringify({ frontendDesign }),
  });
  const updated = payload.data?.frontendDesign;
  assert(updated?.schemaVersion === 'backy.frontend-design.v1', `Patch did not return frontend design: ${JSON.stringify(payload).slice(0, 500)}`);
  return updated;
};

const smokeFrontendDesignContract = () => ({
  schemaVersion: 'backy.frontend-design.v1',
  status: 'synced',
  source: {
    type: 'custom-frontend',
    label: 'Smoke page create frontend',
    url: 'https://example.com/smoke-frontend',
    repository: 'example/backy-smoke-frontend',
    branch: 'main',
  },
  tokens: {
    colors: {
      primary: '#0f766e',
      surface: '#ffffff',
      text: '#111827',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
    customCss: ':root { --backy-smoke-primary: #0f766e; }',
  },
  chrome: {
    header: {
      component: 'SmokeHeader',
      source: 'site.navigation.primary',
    },
    navigation: {
      component: 'SmokeNavigation',
      source: 'site.navigation.primary',
    },
    footer: {
      component: 'SmokeFooter',
      source: 'site.navigation.footer',
    },
  },
  templates: [
    {
      id: FRONTEND_DESIGN_TEMPLATE_ID,
      type: 'page',
      name: FRONTEND_DESIGN_TEMPLATE_NAME,
      routePattern: '/smoke-contract',
      description: 'Frontend contract template used by the page create smoke.',
      canvasSize: { width: 1280, height: 960 },
      bindingHints: [
        { role: 'page.title', binding: 'page.title' },
        { role: 'page.description', binding: 'page.description' },
      ],
    },
    {
      id: 'smoke-blog-contract-template',
      type: 'blogPost',
      name: 'Smoke Contract Blog',
      routePattern: '/blog/{slug}',
      canvasSize: { width: 1200, height: 900 },
      bindingHints: [
        { role: 'post.title', binding: 'post.title' },
      ],
    },
  ],
  editableMap: [
    {
      selector: '[data-backy-role="site-header"]',
      role: 'site.header',
      binding: 'site.navigation.primary',
      fields: ['label', 'href'],
    },
    {
      selector: '[data-backy-role="page-title"]',
      role: 'page.title',
      binding: 'page.title',
      fields: ['content'],
    },
  ],
  notes: 'Temporary contract for validating page creation from custom frontend templates.',
});

const fetchJson = async (endpoint) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${endpoint}`);
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}`);
  }
  return response.json();
};

const waitForCdp = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await fetchJson('/json/list');
    } catch {
      await sleep(100);
    }
  }

  throw new Error(`Chrome DevTools did not start on port ${PORT}`);
};

const connectCdp = (webSocketDebuggerUrl) => {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        request.reject(new Error(JSON.stringify(message.error)));
      } else {
        request.resolve(message.result);
      }
      return;
    }

    events.push(message);
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    events,
    opened,
    close: () => socket.close(),
    send: (method, params = {}) => {
      const messageId = id += 1;
      socket.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
      });
    },
  };
};

const authStorageScript = (sessionToken) => `
localStorage.setItem('backy-auth-storage', ${JSON.stringify(JSON.stringify({
  state: {
    user: { id: 'user-admin', email: 'admin@backy.io', fullName: 'Admin User', role: 'admin' },
    session: {
      token: sessionToken,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authMode: 'local-demo',
    },
  },
  version: 0,
}))});
`;

const seedBrowserSessionCookie = async (client) => {
  await client.send('Network.enable');
  await client.send('Network.setCookie', {
    url: API_BASE_URL,
    name: 'backy_admin_session',
    value: apiAdminSessionToken,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
};

const evaluate = async (client, expression) => {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }

  return result.result.value;
};

const captureScreenshotData = async (client, screenshotPath) => {
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  return {
    screenshotPath,
    data: screenshot.data,
  };
};

const captureScreenshot = async (client, screenshotPath) => {
  await captureScreenshotData(client, screenshotPath);
  return screenshotPath;
};

const getEditorScreenshotThresholds = (template) => (
  template === 'blank' ? BLANK_EDITOR_SCREENSHOT_THRESHOLDS : EDITOR_SCREENSHOT_THRESHOLDS
);

const getPublicTemplateScreenshotThresholds = (template) => (
  template === 'blank' ? BLANK_PUBLIC_TEMPLATE_SCREENSHOT_THRESHOLDS : PUBLIC_TEMPLATE_SCREENSHOT_THRESHOLDS
);

const requestPagePreview = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}/preview`, {
    method: 'POST',
    body: JSON.stringify({ ttlSeconds: 600 }),
  });
  const preview = payload.data || {};
  assert(preview.hostedUrl && preview.previewToken, `Unable to create page preview: ${JSON.stringify(payload).slice(0, 500)}`);
  return preview;
};

const assertScreenshotPixelThresholds = async (client, label, screenshotData, thresholds, cropRect) => {
  const metrics = await evaluate(client, `(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(`data:image/png;base64,${screenshotData}`)};
    await image.decode();

    const crop = ${JSON.stringify(cropRect)};
    const scaleX = window.innerWidth > 0 ? image.width / window.innerWidth : 1;
    const scaleY = window.innerHeight > 0 ? image.height / window.innerHeight : 1;
    const sourceX = Math.max(0, Math.round((crop?.x || 0) * scaleX));
    const sourceY = Math.max(0, Math.round((crop?.y || 0) * scaleY));
    const sourceWidth = Math.max(1, Math.min(image.width - sourceX, Math.round((crop?.width || image.width) * scaleX)));
    const sourceHeight = Math.max(1, Math.min(image.height - sourceY, Math.round((crop?.height || image.height) * scaleY)));

    const scale = Math.min(1, 360 / sourceWidth, 360 / sourceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    let nonWhitePixels = 0;
    let darkPixels = 0;
    let sampledPixels = 0;
    let minLuma = 255;
    let maxLuma = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 16) continue;

      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luma = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722);
      sampledPixels += 1;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);

      if ((Math.abs(255 - red) + Math.abs(255 - green) + Math.abs(255 - blue)) > 36) {
        nonWhitePixels += 1;
      }

      if (luma < 190) {
        darkPixels += 1;
      }
    }

    return {
      width: sourceWidth,
      height: sourceHeight,
      imageWidth: image.width,
      imageHeight: image.height,
      crop,
      sampledWidth: canvas.width,
      sampledHeight: canvas.height,
      sampledPixels,
      nonWhiteRatio: sampledPixels > 0 ? nonWhitePixels / sampledPixels : 0,
      darkRatio: sampledPixels > 0 ? darkPixels / sampledPixels : 0,
      minLuma: Math.round(minLuma),
      maxLuma: Math.round(maxLuma),
      lumaRange: Math.round(maxLuma - minLuma),
    };
  })()`);

  assert(metrics.width >= thresholds.minClipWidth, `${label} screenshot clip is too narrow: ${JSON.stringify({ metrics, thresholds })}`);
  assert(metrics.height >= thresholds.minClipHeight, `${label} screenshot clip is too short: ${JSON.stringify({ metrics, thresholds })}`);
  assert(metrics.sampledPixels >= thresholds.minSampledPixels, `${label} screenshot sample was too small: ${JSON.stringify({ metrics, thresholds })}`);
  assert(metrics.nonWhiteRatio >= thresholds.minCanvasNonWhiteRatio, `${label} screenshot appears visually blank: ${JSON.stringify({ metrics, thresholds })}`);
  assert(metrics.darkRatio >= thresholds.minCanvasDarkRatio, `${label} screenshot is missing rendered text/detail contrast: ${JSON.stringify({ metrics, thresholds })}`);
  assert(metrics.lumaRange >= thresholds.minLumaRange, `${label} screenshot is missing visual contrast range: ${JSON.stringify({ metrics, thresholds })}`);

  return metrics;
};

const setViewport = async (client, { width, height, mobile = false, deviceScaleFactor = 1 }) => {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    mobile,
    deviceScaleFactor,
  });
};

const openPublicPreviewTab = async (parentClient, url, viewport) => {
  const target = await parentClient.send('Target.createTarget', { url: 'about:blank' });
  const page = (await fetchJson('/json/list')).find((candidate) => candidate.id === target.targetId);
  assert(page?.webSocketDebuggerUrl, `No Chrome target found for public preview check ${target.targetId}`);

  const client = connectCdp(page.webSocketDebuggerUrl);
  await client.opened;
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('Log.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.expectedBreakpoint === 'mobile',
  });
  await client.send('Page.navigate', { url });
  return client;
};

const assertTemplatePreviewVisualState = async (client, label, screenshotPath) => {
  await evaluate(client, `(() => {
    document.querySelector('#page-design')?.scrollIntoView({ block: 'start' });
    window.scrollTo(0, window.scrollY);
    return true;
  })()`);
  await sleep(250);

  const state = await evaluate(client, `(() => {
    const previews = Array.from(document.querySelectorAll('[data-testid^="page-template-preview-"]'));
    const cards = previews.map((preview) => {
      const rect = preview.getBoundingClientRect();
      const card = preview.closest('label') || preview.parentElement || preview;
      const cardRect = card.getBoundingClientRect();
      return {
        testId: preview.getAttribute('data-testid'),
        template: preview.getAttribute('data-template'),
        active: preview.getAttribute('data-active') === 'true',
        blockCount: Number(preview.getAttribute('data-block-count') || 0),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        cardWidth: Math.round(cardRect.width),
        clippedInsideCard: rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1,
      };
    });
    const leftBuckets = Array.from(new Set(cards.map((card) => Math.round(card.left / 12) * 12)));
    const selected = document.querySelector('[data-testid="page-selected-template-preview"]');
    const selectedRect = selected?.getBoundingClientRect();
    return {
      label: ${JSON.stringify(label)},
      viewport: { width: window.innerWidth, height: window.innerHeight },
      count: previews.length,
      templates: cards.map((card) => card.template),
      activeTemplates: cards.filter((card) => card.active).map((card) => card.template),
      minPreviewWidth: Math.min(...cards.map((card) => card.width)),
      minPreviewHeight: Math.min(...cards.map((card) => card.height)),
      minLeft: Math.min(...cards.map((card) => card.left)),
      maxRight: Math.max(...cards.map((card) => card.right)),
      columns: leftBuckets.length,
      clippedInsideCards: cards.filter((card) => card.clippedInsideCard),
      zeroBlockTemplates: cards.filter((card) => card.blockCount <= 0).map((card) => card.template),
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      selectedTemplate: selected?.getAttribute('data-template') || '',
      selectedVisible: Boolean(selectedRect && selectedRect.width > 220 && selectedRect.height > 150),
      body: document.body?.innerText?.slice(0, 220) || '',
    };
  })()`);

  assert(state.count === 7, `${label} template preview count mismatch: ${JSON.stringify(state)}`);
  assert(state.templates.includes('about'), `${label} about template preview missing: ${JSON.stringify(state)}`);
  assert(state.activeTemplates.length === 1 && state.activeTemplates[0] === 'about', `${label} active template mismatch: ${JSON.stringify(state)}`);
  assert(state.zeroBlockTemplates.length === 0, `${label} templates without preview blocks: ${JSON.stringify(state)}`);
  assert(state.minPreviewWidth >= 180, `${label} preview width is too small: ${JSON.stringify(state)}`);
  assert(state.minPreviewHeight >= 110, `${label} preview height is too small: ${JSON.stringify(state)}`);
  assert(state.clippedInsideCards.length === 0, `${label} preview clipped inside card: ${JSON.stringify(state)}`);
  assert(state.minLeft >= -1 && state.maxRight <= state.viewport.width + 1, `${label} template preview is outside the viewport: ${JSON.stringify(state)}`);
  assert(state.horizontalOverflow <= 4, `${label} page has horizontal overflow: ${JSON.stringify(state)}`);
  assert(state.selectedTemplate === 'about' && state.selectedVisible, `${label} selected template summary missing: ${JSON.stringify(state)}`);

  if (state.viewport.width >= 1024) {
    assert(state.columns >= 2, `${label} template grid did not use multiple columns on desktop: ${JSON.stringify(state)}`);
  }

  await captureScreenshot(client, screenshotPath);

  return {
    ...state,
    screenshotPath,
  };
};

const assertTemplateSwitching = async (client) => {
  const cases = [
    {
      template: 'contact',
      navPlacement: 'footer',
      selectedTemplateName: 'Contact page',
      forms: 'Backy form API seeded',
      dynamicData: 'none',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'newsletter',
      navPlacement: 'primary',
      selectedTemplateName: 'Newsletter page',
      forms: 'Backy form API seeded',
      dynamicData: 'none',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'survey',
      navPlacement: 'primary',
      selectedTemplateName: 'Survey page',
      forms: 'Backy form API seeded',
      dynamicData: 'none',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'storefront',
      navPlacement: 'primary',
      selectedTemplateName: 'Storefront page',
      forms: 'none',
      dynamicData: 'Backy products catalog placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'product-detail',
      navPlacement: 'primary',
      selectedTemplateName: 'Product detail',
      forms: 'none',
      dynamicData: 'Backy product detail placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'pricing',
      navPlacement: 'primary',
      selectedTemplateName: 'Pricing page',
      forms: 'none',
      dynamicData: 'Backy pricing plan placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'services',
      navPlacement: 'primary',
      selectedTemplateName: 'Services page',
      forms: 'none',
      dynamicData: 'Backy service package placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'booking',
      navPlacement: 'primary',
      selectedTemplateName: 'Booking page',
      forms: 'none',
      dynamicData: 'Backy booking and appointment placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'portfolio',
      navPlacement: 'primary',
      selectedTemplateName: 'Portfolio page',
      forms: 'none',
      dynamicData: 'Backy portfolio project placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'gallery',
      navPlacement: 'primary',
      selectedTemplateName: 'Gallery page',
      forms: 'none',
      dynamicData: 'Backy media gallery placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'events',
      navPlacement: 'primary',
      selectedTemplateName: 'Events page',
      forms: 'none',
      dynamicData: 'Backy event schedule placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'privacy',
      navPlacement: 'footer',
      selectedTemplateName: 'Privacy policy',
      forms: 'none',
      dynamicData: 'Backy legal policy placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'terms',
      navPlacement: 'footer',
      selectedTemplateName: 'Terms page',
      forms: 'none',
      dynamicData: 'Backy legal terms placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'cookie-policy',
      navPlacement: 'footer',
      selectedTemplateName: 'Cookie policy',
      forms: 'none',
      dynamicData: 'Backy cookie consent placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'accessibility-statement',
      navPlacement: 'footer',
      selectedTemplateName: 'Accessibility statement',
      forms: 'none',
      dynamicData: 'Backy accessibility statement placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'refund-policy',
      navPlacement: 'footer',
      selectedTemplateName: 'Refund policy',
      forms: 'none',
      dynamicData: 'Backy refund policy placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'shipping-policy',
      navPlacement: 'footer',
      selectedTemplateName: 'Shipping policy',
      forms: 'none',
      dynamicData: 'Backy shipping policy placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'cart',
      navPlacement: 'primary',
      selectedTemplateName: 'Cart page',
      forms: 'none',
      dynamicData: 'Backy cart placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'checkout',
      navPlacement: 'primary',
      selectedTemplateName: 'Checkout page',
      forms: 'none',
      dynamicData: 'Backy checkout and order placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'order-confirmation',
      navPlacement: 'primary',
      selectedTemplateName: 'Order confirmation',
      forms: 'none',
      dynamicData: 'Backy order confirmation placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'help-center',
      navPlacement: 'primary',
      selectedTemplateName: 'Help center',
      forms: 'none',
      dynamicData: 'Backy help center placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'faq',
      navPlacement: 'primary',
      selectedTemplateName: 'FAQ page',
      forms: 'none',
      dynamicData: 'Backy FAQ placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'testimonials',
      navPlacement: 'primary',
      selectedTemplateName: 'Testimonials page',
      forms: 'none',
      dynamicData: 'Backy testimonial and review placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'blog-index',
      navPlacement: 'primary',
      selectedTemplateName: 'Blog index',
      forms: 'none',
      dynamicData: 'Backy blog feed placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'blog-post',
      navPlacement: 'primary',
      selectedTemplateName: 'Blog post',
      forms: 'none',
      dynamicData: 'Backy blog post placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'team',
      navPlacement: 'primary',
      selectedTemplateName: 'Team page',
      forms: 'none',
      dynamicData: 'Backy team profile placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'careers',
      navPlacement: 'primary',
      selectedTemplateName: 'Careers page',
      forms: 'none',
      dynamicData: 'Backy careers and job posting placeholders',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'blank',
      navPlacement: 'none',
      selectedTemplateName: 'Blank page',
      forms: 'none',
      dynamicData: 'none',
      siteChrome: 'available from component library',
    },
    {
      template: 'registration',
      navPlacement: 'primary',
      selectedTemplateName: 'Registration page',
      forms: 'Backy form API seeded',
      dynamicData: 'none',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'member-login',
      navPlacement: 'primary',
      selectedTemplateName: 'Member login',
      forms: 'Backy form API seeded',
      dynamicData: 'none',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
    {
      template: 'member-account',
      navPlacement: 'primary',
      selectedTemplateName: 'Member account',
      forms: 'Backy form API seeded',
      dynamicData: 'none',
      siteChrome: 'editable header, navigation, and footer seeded',
    },
  ];
  const observed = [];

  for (const testCase of cases) {
    let nextState = null;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      nextState = await evaluate(client, `(() => {
        const input = document.querySelector('input[name="template"][value="${testCase.template}"]');
        if (!(input instanceof HTMLInputElement)) {
          return { clicked: false, reason: 'missing-input', template: ${JSON.stringify(testCase.template)} };
        }
        if (!input.disabled) {
          (input.closest('label') || input).click();
        }
        const payload = JSON.parse(document.querySelector('#page-payload pre')?.textContent || '{}');
        return {
          clicked: !input.disabled,
          disabled: input.disabled,
          template: ${JSON.stringify(testCase.template)},
          selectedTemplatePreview: document.querySelector('[data-testid="page-selected-template-preview"]')?.getAttribute('data-template') || '',
          activeTemplatePreview: document.querySelector('[data-testid="page-template-preview-${testCase.template}"]')?.getAttribute('data-active') || '',
          navPlacement: document.querySelector('#page-navigation-placement-select')?.value || '',
          selectedTemplateName: Array.from(document.querySelectorAll('#page-preview dd')).map((node) => node.textContent?.trim() || '')[0] || '',
          payloadTemplate: payload.template || '',
          forms: payload.forms || '',
          dynamicData: payload.dynamicData || '',
          siteChrome: payload.siteChrome || '',
          body: document.body?.innerText?.slice(0, 220) || '',
        };
      })()`);

      if (
        nextState.selectedTemplatePreview === testCase.template
        && nextState.activeTemplatePreview === 'true'
        && nextState.navPlacement === testCase.navPlacement
        && nextState.selectedTemplateName === testCase.selectedTemplateName
        && nextState.payloadTemplate === testCase.template
      ) {
        break;
      }

      await sleep(250);
    }

    assert(nextState.selectedTemplatePreview === testCase.template, `Selected preview did not update for ${testCase.template}: ${JSON.stringify(nextState)}`);
    assert(nextState.activeTemplatePreview === 'true', `Active preview did not update for ${testCase.template}: ${JSON.stringify(nextState)}`);
    assert(nextState.navPlacement === testCase.navPlacement, `Navigation placement did not update for ${testCase.template}: ${JSON.stringify(nextState)}`);
    assert(nextState.selectedTemplateName === testCase.selectedTemplateName, `Route preview template name did not update for ${testCase.template}: ${JSON.stringify(nextState)}`);
    assert(nextState.payloadTemplate === testCase.template, `Payload template did not update for ${testCase.template}: ${JSON.stringify(nextState)}`);
    assert(nextState.forms === testCase.forms, `Payload form seed state mismatch for ${testCase.template}: ${JSON.stringify(nextState)}`);
    assert(nextState.dynamicData === testCase.dynamicData, `Payload dynamic data state mismatch for ${testCase.template}: ${JSON.stringify(nextState)}`);
    assert(nextState.siteChrome === testCase.siteChrome, `Payload site chrome state mismatch for ${testCase.template}: ${JSON.stringify(nextState)}`);
    observed.push(nextState);
  }

  const resetState = await evaluate(client, `(() => {
    const input = document.querySelector('input[name="template"][value="about"]');
    if (!(input instanceof HTMLInputElement)) {
      return { clicked: false };
    }
    input.click();
    return { clicked: true };
  })()`);
  assert(resetState.clicked, `Unable to reset template to about: ${JSON.stringify(resetState)}`);
  await sleep(250);

  const aboutState = await evaluate(client, `(() => ({
    selectedTemplatePreview: document.querySelector('[data-testid="page-selected-template-preview"]')?.getAttribute('data-template') || '',
    activeTemplatePreview: document.querySelector('[data-testid="page-template-preview-about"]')?.getAttribute('data-active') || '',
    navPlacement: document.querySelector('#page-navigation-placement-select')?.value || '',
  }))()`);
  assert(aboutState.selectedTemplatePreview === 'about' && aboutState.activeTemplatePreview === 'true' && aboutState.navPlacement === 'primary', `Template reset to about failed: ${JSON.stringify(aboutState)}`);

  return {
    observed,
    reset: aboutState,
  };
};

const waitForPageCreateControls = async (client, slug, title, navLabel, seo, parentPageId, url) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      ready: Boolean(document.querySelector('[data-testid="page-creation-command-center"]')),
      nav: Boolean(document.querySelector('[data-testid="page-navigation-placement"]')),
      title: document.querySelector('#page-title')?.value || '',
      slug: document.querySelector('#page-slug')?.value || '',
      navPlacement: document.querySelector('#page-navigation-placement-select')?.value || '',
      navLabel: document.querySelector('#page-navigation-label')?.value || '',
      parentPageId: document.querySelector('#page-parent-page')?.value || '',
      seoTitle: document.querySelector('#page-seo-title')?.value || '',
      canonical: document.querySelector('#page-canonical-path')?.value || '',
      keywords: document.querySelector('#page-seo-keywords')?.value || '',
      jsonLd: document.querySelector('#page-json-ld')?.value || '',
      ogImage: document.querySelector('#page-og-image')?.value || '',
      noIndex: Array.from(document.querySelectorAll('#page-seo input[type="checkbox"]'))[0]?.checked ?? null,
      noFollow: Array.from(document.querySelectorAll('#page-seo input[type="checkbox"]'))[1]?.checked ?? null,
      templatePreviewCount: document.querySelectorAll('[data-testid^="page-template-preview-"]').length,
      activeTemplatePreview: document.querySelector('[data-testid="page-template-preview-about"]')?.getAttribute('data-active') || '',
      activeTemplateBlockCount: Number(document.querySelector('[data-testid="page-template-preview-about"]')?.getAttribute('data-block-count') || 0),
      selectedTemplatePreview: document.querySelector('[data-testid="page-selected-template-preview"]')?.getAttribute('data-template') || '',
      body: document.body?.innerText?.slice(0, 240) || '',
    }))()`);

    if (
      state.ready
      && state.nav
      && state.title === title
      && state.slug === slug
      && state.navPlacement === 'primary'
      && state.navLabel === navLabel
      && state.parentPageId === parentPageId
      && state.seoTitle === seo.title
      && state.canonical === seo.canonical
      && state.keywords === seo.keywords
      && state.jsonLd === seo.jsonLd
      && state.ogImage === seo.ogImage
      && state.noIndex === true
      && state.noFollow === true
      && state.templatePreviewCount === 7
      && state.activeTemplatePreview === 'true'
      && state.activeTemplateBlockCount > 0
      && state.selectedTemplatePreview === 'about'
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Page create route did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const navigateToPageCreate = async (client, slug, title, navLabel, seo, parentPageId) => {
  const query = new URLSearchParams({
    siteId: SITE_ID,
    template: 'about',
    title,
    slug,
    navLabel,
    parentPageId,
    seoTitle: seo.title,
    canonical: seo.canonical,
    keywords: seo.keywords,
    jsonLd: seo.jsonLd,
    ogImage: seo.ogImage,
    noIndex: 'true',
    noFollow: 'true',
  });
  const url = `${ADMIN_BASE_URL}/pages/new?${query.toString()}`;
  await client.send('Page.navigate', { url });
  return waitForPageCreateControls(client, slug, title, navLabel, seo, parentPageId, url);
};

const assertSlugCanSyncFromTitle = async (client) => {
  const title = 'Smoke Synced Route Title';
  const expectedSlug = 'smoke-synced-route-title';
  const changed = await evaluate(client, `(() => {
    const input = document.querySelector('#page-title');
    const button = document.querySelector('[data-testid="page-slug-use-title"]');
    if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: 'controls-missing', buttonTag: button?.tagName || null };
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(title)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      ok: true,
      title: input.value,
      buttonDisabled: button.disabled,
      slug: document.querySelector('#page-slug')?.value || '',
    };
  })()`);
  assert(changed.ok, `Slug sync controls were missing: ${JSON.stringify(changed)}`);

  let synced = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    synced = await evaluate(client, `(() => {
      const button = document.querySelector('[data-testid="page-slug-use-title"]');
      if (button instanceof HTMLButtonElement && !button.disabled) {
        button.click();
      }
      return {
        title: document.querySelector('#page-title')?.value || '',
        slug: document.querySelector('#page-slug')?.value || '',
        buttonDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
        routePreview: document.querySelector('#page-preview')?.textContent || '',
        search: window.location.search,
      };
    })()`);

    if (
      synced.title === title
      && synced.slug === expectedSlug
      && synced.routePreview.includes(`/${expectedSlug}`)
      && synced.search.includes(`slug=${expectedSlug}`)
    ) {
      return synced;
    }

    await sleep(250);
  }

  throw new Error(`Slug did not sync from title: ${JSON.stringify(synced)}`);
};

const waitForStarterTemplateCreateControls = async (client, testCase, slug, url) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const payload = JSON.parse(document.querySelector('#page-payload pre')?.textContent || '{}');
      const createButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').includes('Create Page')
      ));
      return {
        ready: Boolean(document.querySelector('[data-testid="page-creation-command-center"]')),
        title: document.querySelector('#page-title')?.value || '',
        slug: document.querySelector('#page-slug')?.value || '',
        selectedTemplatePreview: document.querySelector('[data-testid="page-selected-template-preview"]')?.getAttribute('data-template') || '',
        activeTemplatePreview: document.querySelector('[data-testid="page-template-preview-${testCase.template}"]')?.getAttribute('data-active') || '',
        activeTemplateBlockCount: Number(document.querySelector('[data-testid="page-template-preview-${testCase.template}"]')?.getAttribute('data-block-count') || 0),
        navPlacement: document.querySelector('#page-navigation-placement-select')?.value || '',
        payloadTemplate: payload.template || '',
        payloadSiteChrome: payload.siteChrome || '',
        payloadForms: payload.forms || '',
        payloadDynamicData: payload.dynamicData || '',
        createButtonDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
        body: document.body?.innerText?.slice(0, 260) || '',
      };
    })()`);

    if (
      state.ready
      && state.title === testCase.title
      && state.slug === slug
      && state.selectedTemplatePreview === testCase.template
      && state.activeTemplatePreview === 'true'
      && state.activeTemplateBlockCount > 0
      && state.navPlacement === testCase.expectedNavigationPlacement
      && state.payloadTemplate === testCase.template
      && state.createButtonDisabled === false
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Starter template create route did not render expected controls for ${testCase.template}: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const navigateToStarterTemplateCreate = async (client, testCase, slug) => {
  const query = new URLSearchParams({
    siteId: SITE_ID,
    template: testCase.template,
    title: testCase.title,
    slug,
    description: `Smoke coverage for the ${testCase.template} page starter.`,
  });
  const url = `${ADMIN_BASE_URL}/pages/new?${query.toString()}`;
  await client.send('Page.navigate', { url });
  return waitForStarterTemplateCreateControls(client, testCase, slug, url);
};

const waitForFrontendDesignTemplateCreateControls = async (client, slug, title, url) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const payload = JSON.parse(document.querySelector('#page-payload pre')?.textContent || '{}');
      const createButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').includes('Create Page')
      ));
      return {
        ready: Boolean(document.querySelector('[data-testid="page-creation-command-center"]')),
        frontendPanel: Boolean(document.querySelector('[data-testid="page-frontend-template-options"]')),
        frontendButtonActive: document.querySelector('[data-testid="page-frontend-template-${FRONTEND_DESIGN_TEMPLATE_ID}"]')?.getAttribute('data-active') || '',
        title: document.querySelector('#page-title')?.value || '',
        slug: document.querySelector('#page-slug')?.value || '',
        payloadTemplateId: payload.template?.id || '',
        payloadTemplateSource: payload.template?.source || '',
        payloadTemplateName: payload.template?.name || '',
        payloadContent: payload.content || '',
        payloadSiteChrome: payload.siteChrome || '',
        selectedTemplateName: Array.from(document.querySelectorAll('#page-preview dd')).map((node) => node.textContent?.trim() || '')[0] || '',
        createButtonDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
        body: document.body?.innerText?.slice(0, 300) || '',
      };
    })()`);

    if (
      state.ready
      && state.frontendPanel
      && state.frontendButtonActive === 'true'
      && state.title === title
      && state.slug === slug
      && state.payloadTemplateId === FRONTEND_DESIGN_TEMPLATE_ID
      && state.payloadTemplateSource === 'frontend-design'
      && state.payloadTemplateName === FRONTEND_DESIGN_TEMPLATE_NAME
      && state.payloadContent.includes('frontend contract seed')
      && state.payloadSiteChrome === 'captured from frontend design contract'
      && state.selectedTemplateName === `${FRONTEND_DESIGN_TEMPLATE_NAME} frontend template`
      && state.createButtonDisabled === false
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Frontend design template create route did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const navigateToFrontendDesignTemplateCreate = async (client, slug, title) => {
  const query = new URLSearchParams({
    siteId: SITE_ID,
    template: 'blank',
    designTemplate: FRONTEND_DESIGN_TEMPLATE_ID,
    title,
    slug,
    description: 'Smoke page seeded from a connected frontend design contract.',
  });
  const url = `${ADMIN_BASE_URL}/pages/new?${query.toString()}`;
  await client.send('Page.navigate', { url });
  return waitForFrontendDesignTemplateCreateControls(client, slug, title, url);
};

const waitForDatasetPageCreateControls = async (client, collection, mode, slug, title, url) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, `(() => {
      const payload = JSON.parse(document.querySelector('#page-payload pre')?.textContent || '{}');
      const createButton = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').includes('Create Page')
      ));
      const importPanel = document.querySelector('[data-testid="page-create-dataset-import"]');
      return {
        ready: Boolean(document.querySelector('[data-testid="page-creation-command-center"]')),
        importPanel: Boolean(importPanel),
        importText: importPanel?.textContent || '',
        title: document.querySelector('#page-title')?.value || '',
        slug: document.querySelector('#page-slug')?.value || '',
        payloadDynamicData: payload.dynamicData || '',
        payloadDatasetMode: payload.datasetImport?.mode || '',
        payloadCollectionId: payload.datasetImport?.collectionId || '',
        payloadTitleField: payload.datasetImport?.titleField || '',
        payloadDescriptionField: payload.datasetImport?.descriptionField || '',
        payloadImageField: payload.datasetImport?.imageField || '',
        createButtonDisabled: createButton instanceof HTMLButtonElement ? createButton.disabled : null,
        body: document.body?.innerText?.slice(0, 360) || '',
      };
    })()`);

    if (
      state.ready
      && state.importPanel
      && state.importText.includes(collection.name)
      && state.importText.includes(collection.id)
      && state.title === title
      && state.slug === slug
      && state.payloadDynamicData.includes(collection.name)
      && state.payloadDatasetMode === mode
      && state.payloadCollectionId === collection.id
      && state.payloadTitleField === 'title'
      && state.payloadDescriptionField === 'summary'
      && state.payloadImageField === 'image'
      && state.createButtonDisabled === false
    ) {
      return { url, state };
    }

    if (attempt === 99) {
      throw new Error(`Dataset page create route did not render expected controls: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  return null;
};

const navigateToDatasetPageCreate = async (client, collection, mode) => {
  const slug = `${collection.slug}-${mode}-page`;
  const title = `${collection.name} ${mode === 'item' ? 'Detail' : 'Directory'}`;
  const query = new URLSearchParams({
    siteId: SITE_ID,
    template: 'blank',
    collectionId: collection.id,
    datasetMode: mode,
    title,
    slug,
    description: `Smoke ${mode} page seeded from a collection dataset brief.`,
    nav: mode === 'list' ? 'primary' : 'none',
    navLabel: collection.name,
  });
  const url = `${ADMIN_BASE_URL}/pages/new?${query.toString()}`;
  await client.send('Page.navigate', { url });
  return waitForDatasetPageCreateControls(client, collection, mode, slug, title, url);
};

const assertAutosaveWritten = async (client, slug, title, navLabel, seo, parentPageId) => {
  let state = null;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    state = await evaluate(client, `(() => {
      const raw = localStorage.getItem('backy:page-new:draft:v1');
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        hasDraft: Boolean(parsed),
        title: parsed?.formData?.title || null,
        slug: parsed?.formData?.slug || null,
        template: parsed?.formData?.template || null,
        navigationPlacement: parsed?.formData?.navigationPlacement || null,
        navigationLabel: parsed?.formData?.navigationLabel || null,
        parentPageId: parsed?.formData?.parentPageId || null,
        seoTitle: parsed?.formData?.seoTitle || null,
        canonicalPath: parsed?.formData?.canonicalPath || null,
        keywords: parsed?.formData?.keywords || null,
        jsonLdText: parsed?.formData?.jsonLdText || null,
        ogImage: parsed?.formData?.ogImage || null,
        noIndex: parsed?.formData?.noIndex ?? null,
        noFollow: parsed?.formData?.noFollow ?? null,
        badge: Array.from(document.querySelectorAll('span')).map((node) => node.textContent || '').find((text) => /Autosaved|Saving draft|Autosave/.test(text)) || '',
      };
    })()`);

    if (state.hasDraft) {
      break;
    }

    await sleep(250);
  }

  assert(state.hasDraft, `Autosave draft was not written: ${JSON.stringify(state)}`);
  assert(state.title === title, `Autosave title mismatch: ${JSON.stringify(state)}`);
  assert(state.slug === slug, `Autosave slug mismatch: ${JSON.stringify(state)}`);
  assert(state.template === 'about', `Autosave template mismatch: ${JSON.stringify(state)}`);
  assert(state.navigationPlacement === 'primary', `Autosave navigation placement mismatch: ${JSON.stringify(state)}`);
  assert(state.navigationLabel === navLabel, `Autosave navigation label mismatch: ${JSON.stringify(state)}`);
  assert(state.parentPageId === parentPageId, `Autosave parent page mismatch: ${JSON.stringify(state)}`);
  assert(state.seoTitle === seo.title, `Autosave SEO title mismatch: ${JSON.stringify(state)}`);
  assert(state.canonicalPath === seo.canonical, `Autosave canonical mismatch: ${JSON.stringify(state)}`);
  assert(state.keywords === seo.keywords, `Autosave keywords mismatch: ${JSON.stringify(state)}`);
  assert(state.jsonLdText === seo.jsonLd, `Autosave JSON-LD mismatch: ${JSON.stringify(state)}`);
  assert(state.ogImage === seo.ogImage, `Autosave OG image mismatch: ${JSON.stringify(state)}`);
  assert(state.noIndex === true, `Autosave noIndex mismatch: ${JSON.stringify(state)}`);
  assert(state.noFollow === true, `Autosave noFollow mismatch: ${JSON.stringify(state)}`);
  return state;
};

const assertRecoveryRestore = async (client, slug, title, navLabel, seo, parentPageId) => {
  await client.send('Page.reload', { ignoreCache: true });
  await sleep(500);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      recovery: Boolean(document.querySelector('[data-testid="page-create-recovery"]')),
      restore: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Restore draft'),
      body: document.body?.innerText?.slice(0, 260) || '',
    }))()`);

    if (state.recovery && state.restore) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Autosave recovery banner did not render: ${JSON.stringify(state)}`);
    }

    await sleep(250);
  }

  const restored = await evaluate(client, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) => (candidate.textContent || '').trim() === 'Restore draft');
    if (!(button instanceof HTMLButtonElement)) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
  })()`);
  assert(restored.clicked, `Restore draft button was not clickable: ${JSON.stringify(restored)}`);
  await sleep(500);

  const state = await evaluate(client, `(() => ({
    title: document.querySelector('#page-title')?.value || '',
    slug: document.querySelector('#page-slug')?.value || '',
    navPlacement: document.querySelector('#page-navigation-placement-select')?.value || '',
    navLabel: document.querySelector('#page-navigation-label')?.value || '',
    parentPageId: document.querySelector('#page-parent-page')?.value || '',
    seoTitle: document.querySelector('#page-seo-title')?.value || '',
    canonical: document.querySelector('#page-canonical-path')?.value || '',
    keywords: document.querySelector('#page-seo-keywords')?.value || '',
    jsonLd: document.querySelector('#page-json-ld')?.value || '',
    ogImage: document.querySelector('#page-og-image')?.value || '',
    noIndex: Array.from(document.querySelectorAll('#page-seo input[type="checkbox"]'))[0]?.checked ?? null,
    noFollow: Array.from(document.querySelectorAll('#page-seo input[type="checkbox"]'))[1]?.checked ?? null,
    notice: document.body?.innerText?.includes('Recovered local page draft.') || false,
  }))()`);

  assert(state.title === title, `Recovered draft title mismatch: ${JSON.stringify(state)}`);
  assert(state.slug === slug, `Recovered draft slug mismatch: ${JSON.stringify(state)}`);
  assert(state.navPlacement === 'primary', `Recovered draft navigation placement mismatch: ${JSON.stringify(state)}`);
  assert(state.navLabel === navLabel, `Recovered draft navigation label mismatch: ${JSON.stringify(state)}`);
  assert(state.parentPageId === parentPageId, `Recovered draft parent page mismatch: ${JSON.stringify(state)}`);
  assert(state.seoTitle === seo.title, `Recovered draft SEO title mismatch: ${JSON.stringify(state)}`);
  assert(state.canonical === seo.canonical, `Recovered draft canonical mismatch: ${JSON.stringify(state)}`);
  assert(state.keywords === seo.keywords, `Recovered draft keywords mismatch: ${JSON.stringify(state)}`);
  assert(state.jsonLd === seo.jsonLd, `Recovered draft JSON-LD mismatch: ${JSON.stringify(state)}`);
  assert(state.ogImage === seo.ogImage, `Recovered draft OG image mismatch: ${JSON.stringify(state)}`);
  assert(state.noIndex === true, `Recovered draft noIndex mismatch: ${JSON.stringify(state)}`);
  assert(state.noFollow === true, `Recovered draft noFollow mismatch: ${JSON.stringify(state)}`);
  return state;
};

const normalizeCreatedContent = (content) => {
  if (typeof content === 'string') {
    return JSON.parse(content);
  }
  return content || {};
};

const flattenElements = (elements = []) => {
  const flattened = [];
  const walk = (nodes) => {
    for (const node of nodes || []) {
      flattened.push(node);
      if (Array.isArray(node.children)) {
        walk(node.children);
      }
    }
  };
  walk(elements);
  return flattened;
};

const assertCreatedPageSeo = async (pageId, seo, parentPage) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const page = payload.data?.page;

  assert(page, `Created page ${pageId} detail was not returned`);
  assert(page.parentId === parentPage.id, `Created page parentId mismatch: ${JSON.stringify({ parentId: page.parentId, meta: page.meta })}`);
  assert(page.meta?.title === seo.title, `Created page SEO title mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.canonical === seo.normalizedCanonical, `Created page canonical mismatch: ${JSON.stringify(page.meta)}`);
  assert(Array.isArray(page.meta?.keywords) && page.meta.keywords.join(',') === seo.expectedKeywords.join(','), `Created page keywords mismatch: ${JSON.stringify(page.meta)}`);
  assert(Array.isArray(page.meta?.jsonLd) && page.meta.jsonLd[0]?.['@type'] === 'AboutPage', `Created page JSON-LD mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.ogImage === seo.ogImage, `Created page OG image mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.noIndex === true, `Created page noIndex mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.noFollow === true, `Created page noFollow mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.parentPageId === parentPage.id, `Created page meta parent id mismatch: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.parentPageTitle === parentPage.title, `Created page meta parent title mismatch: ${JSON.stringify(page.meta)}`);

  const content = normalizeCreatedContent(page.content);
  const elements = Array.isArray(content.elements) ? content.elements : [];
  const allElements = flattenElements(elements);
  const byId = new Map(allElements.map((element) => [element.id, element]));
  const contentDocument = content.contentDocument || null;
  const canvasSize = content.canvasSize || contentDocument?.metadata?.canvasSize || {};
  const requiredElementIds = [
    'about-site-header',
    'about-site-navigation',
    'about-site-footer',
    'about-heading',
    'about-story-copy',
    'about-values-section',
    'about-value-0',
    'about-value-1',
    'about-value-2',
  ];
  const missingElementIds = requiredElementIds.filter((id) => !byId.has(id));
  const headerNavigation = byId.get('about-site-navigation');
  const footerNavigation = byId.get('about-footer-navigation');
  const heading = byId.get('about-heading');
  const valuesSection = byId.get('about-values-section');
  const valueCards = (valuesSection?.children || []).filter((element) => element.type === 'box');

  assert(elements.length >= 5, `Created about template should have root canvas elements: ${JSON.stringify({ rootCount: elements.length, ids: elements.map((element) => element.id) })}`);
  assert(allElements.length >= 16, `Created about template should include nested editable elements: ${JSON.stringify({ count: allElements.length, ids: allElements.map((element) => element.id).slice(0, 30) })}`);
  assert(missingElementIds.length === 0, `Created about template is missing expected editable elements: ${JSON.stringify({ missingElementIds, availableIds: allElements.map((element) => element.id).slice(0, 40) })}`);
  assert(canvasSize.width === 1200 && canvasSize.height >= 1000, `Created about canvas size mismatch: ${JSON.stringify(canvasSize)}`);
  assert(heading?.props?.content === page.title, `Created about heading does not use page title: ${JSON.stringify(heading?.props)}`);
  assert(Array.isArray(headerNavigation?.props?.navItems) && headerNavigation.props.navItems.includes('About'), `Created about header navigation missing About item: ${JSON.stringify(headerNavigation?.props)}`);
  assert(Array.isArray(footerNavigation?.props?.navItems) && footerNavigation.props.navItems.includes('Contact'), `Created about footer navigation missing Contact item: ${JSON.stringify(footerNavigation?.props)}`);
  assert(valueCards.length === 3, `Created about values section should contain 3 editable value cards: ${JSON.stringify(valuesSection)}`);
  assert(contentDocument?.kind === 'page', `Created about contentDocument kind mismatch: ${JSON.stringify(contentDocument)}`);
  assert(contentDocument?.slug === page.slug, `Created about contentDocument slug mismatch: ${JSON.stringify({ slug: page.slug, contentDocumentSlug: contentDocument?.slug })}`);
  assert(contentDocument?.status === page.status, `Created about contentDocument status mismatch: ${JSON.stringify({ status: page.status, contentDocumentStatus: contentDocument?.status })}`);
  assert(contentDocument?.metadata?.canvasSize?.height === canvasSize.height, `Created about contentDocument canvas size mismatch: ${JSON.stringify(contentDocument?.metadata)}`);

  return {
    parentId: page.parentId,
    meta: page.meta,
    content: {
      rootElementCount: elements.length,
      totalElementCount: allElements.length,
      canvasSize,
      requiredElementIds,
      contentDocument: {
        id: contentDocument?.id,
        kind: contentDocument?.kind,
        slug: contentDocument?.slug,
        status: contentDocument?.status,
      },
    },
  };
};

const assertStarterTemplatePageContent = async (pageId, testCase, slug) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const page = payload.data?.page;

  assert(page, `Created ${testCase.template} page ${pageId} detail was not returned`);
  assert(page.title === testCase.title, `Created ${testCase.template} title mismatch: ${JSON.stringify({ title: page.title, expected: testCase.title })}`);
  assert(page.slug === slug, `Created ${testCase.template} slug mismatch: ${JSON.stringify({ slug: page.slug, expected: slug })}`);

  const content = normalizeCreatedContent(page.content);
  const elements = Array.isArray(content.elements) ? content.elements : [];
  const allElements = flattenElements(elements);
  const byId = new Map(allElements.map((element) => [element.id, element]));
  const contentDocument = content.contentDocument || null;
  const canvasSize = content.canvasSize || contentDocument?.metadata?.canvasSize || {};
  const missingElementIds = testCase.requiredElementIds.filter((id) => !byId.has(id));
  const heading = byId.get(testCase.headingId);

  assert(elements.length >= testCase.minRootElementCount, `Created ${testCase.template} should have enough root canvas elements: ${JSON.stringify({ rootCount: elements.length, ids: elements.map((element) => element.id) })}`);
  assert(allElements.length >= testCase.minTotalElementCount, `Created ${testCase.template} should include nested editable elements: ${JSON.stringify({ count: allElements.length, ids: allElements.map((element) => element.id).slice(0, 40) })}`);
  assert(missingElementIds.length === 0, `Created ${testCase.template} is missing expected editable elements: ${JSON.stringify({ missingElementIds, availableIds: allElements.map((element) => element.id).slice(0, 50) })}`);
  assert(canvasSize.width === 1200 && canvasSize.height >= testCase.minCanvasHeight, `Created ${testCase.template} canvas size mismatch: ${JSON.stringify(canvasSize)}`);
  assert(heading?.props?.content === page.title, `Created ${testCase.template} heading does not use page title: ${JSON.stringify(heading?.props)}`);

  if (testCase.chromePrefix) {
    const headerNavigation = byId.get(`${testCase.chromePrefix}-site-navigation`);
    const footerNavigation = byId.get(`${testCase.chromePrefix}-footer-navigation`);
    assert(Array.isArray(headerNavigation?.props?.navItems) && headerNavigation.props.navItems.includes(testCase.navigationItem), `Created ${testCase.template} header navigation missing expected item: ${JSON.stringify(headerNavigation?.props)}`);
    assert(Array.isArray(footerNavigation?.props?.navItems) && footerNavigation.props.navItems.includes(testCase.navigationItem), `Created ${testCase.template} footer navigation missing expected item: ${JSON.stringify(footerNavigation?.props)}`);
  }

  for (const formElementId of testCase.formElementIds || []) {
    const element = byId.get(formElementId);
    assert(element?.type === 'form', `Created ${testCase.template} expected ${formElementId} to be a form: ${JSON.stringify(element)}`);
    assert(typeof element.props?.formId === 'string' && element.props.formId.includes(slug), `Created ${testCase.template} form id should include page slug: ${JSON.stringify(element.props)}`);
    assert(element.props?.formActive === true, `Created ${testCase.template} form should be active: ${JSON.stringify(element.props)}`);
  }

  for (const bindingElementId of testCase.dataBindingElementIds || []) {
    const element = byId.get(bindingElementId);
    assert(Array.isArray(element?.dataBindings) && element.dataBindings.length > 0, `Created ${testCase.template} expected data bindings on ${bindingElementId}: ${JSON.stringify(element)}`);
  }

  assert(contentDocument?.kind === 'page', `Created ${testCase.template} contentDocument kind mismatch: ${JSON.stringify(contentDocument)}`);
  assert(contentDocument?.slug === page.slug, `Created ${testCase.template} contentDocument slug mismatch: ${JSON.stringify({ slug: page.slug, contentDocumentSlug: contentDocument?.slug })}`);
  assert(contentDocument?.status === page.status, `Created ${testCase.template} contentDocument status mismatch: ${JSON.stringify({ status: page.status, contentDocumentStatus: contentDocument?.status })}`);

  return {
    template: testCase.template,
    pageId,
    slug: page.slug,
    meta: {
      title: page.meta?.title,
      canonical: page.meta?.canonical,
    },
    content: {
      rootElementCount: elements.length,
      totalElementCount: allElements.length,
      canvasSize,
      requiredElementIds: testCase.requiredElementIds,
      dataBindingElementIds: testCase.dataBindingElementIds || [],
      formElementIds: testCase.formElementIds || [],
      contentDocument: {
        id: contentDocument?.id,
        kind: contentDocument?.kind,
        slug: contentDocument?.slug,
        status: contentDocument?.status,
      },
    },
  };
};

const assertFrontendDesignTemplatePageContent = async (pageId, slug, title) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const page = payload.data?.page;

  assert(page, `Created frontend design page ${pageId} detail was not returned`);
  assert(page.title === title, `Created frontend design title mismatch: ${JSON.stringify({ title: page.title, expected: title })}`);
  assert(page.slug === slug, `Created frontend design slug mismatch: ${JSON.stringify({ slug: page.slug, expected: slug })}`);
  assert(page.meta?.frontendDesignTemplateId === FRONTEND_DESIGN_TEMPLATE_ID, `Created page did not store frontend template id: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.frontendDesignTemplateName === FRONTEND_DESIGN_TEMPLATE_NAME, `Created page did not store frontend template name: ${JSON.stringify(page.meta)}`);
  assert(page.meta?.frontendDesignSource?.type === 'custom-frontend', `Created page did not store frontend design source: ${JSON.stringify(page.meta)}`);
  assert(Array.isArray(page.meta?.frontendDesignBindingHints) && page.meta.frontendDesignBindingHints.length === 2, `Created page did not store frontend binding hints: ${JSON.stringify(page.meta)}`);

  const content = normalizeCreatedContent(page.content);
  const elements = Array.isArray(content.elements) ? content.elements : [];
  const allElements = flattenElements(elements);
  const byId = new Map(allElements.map((element) => [element.id, element]));
  const contentDocument = content.contentDocument || null;
  const canvasSize = content.canvasSize || contentDocument?.metadata?.canvasSize || {};
  const wrapper = byId.get(`frontend-template-${FRONTEND_DESIGN_TEMPLATE_ID}`);
  const heading = byId.get(`frontend-template-${FRONTEND_DESIGN_TEMPLATE_ID}-heading`);
  const editableRegion = byId.get(`frontend-template-${FRONTEND_DESIGN_TEMPLATE_ID}-editable-region`);

  assert(wrapper?.type === 'section', `Frontend template wrapper section missing: ${JSON.stringify({ ids: allElements.map((element) => element.id).slice(0, 40) })}`);
  assert(wrapper.props?.frontendTemplateId === FRONTEND_DESIGN_TEMPLATE_ID, `Frontend template wrapper metadata mismatch: ${JSON.stringify(wrapper)}`);
  assert(heading?.props?.content === title, `Frontend template heading does not use page title: ${JSON.stringify(heading?.props)}`);
  assert(Array.isArray(editableRegion?.props?.bindingHints) && editableRegion.props.bindingHints.length === 2, `Frontend template editable region missing binding hints: ${JSON.stringify(editableRegion?.props)}`);
  assert(canvasSize.width === 1280 && canvasSize.height >= 960, `Frontend template canvas size mismatch: ${JSON.stringify(canvasSize)}`);
  assert(contentDocument?.kind === 'page', `Frontend template contentDocument kind mismatch: ${JSON.stringify(contentDocument)}`);
  assert(contentDocument?.slug === page.slug, `Frontend template contentDocument slug mismatch: ${JSON.stringify({ slug: page.slug, contentDocumentSlug: contentDocument?.slug })}`);
  assert(typeof content.customCSS === 'string' && content.customCSS.includes('--backy-smoke-primary'), `Frontend template custom CSS was not persisted: ${JSON.stringify(content.customCSS)}`);

  return {
    pageId,
    slug: page.slug,
    meta: {
      frontendDesignTemplateId: page.meta?.frontendDesignTemplateId,
      frontendDesignTemplateName: page.meta?.frontendDesignTemplateName,
      frontendDesignSourceType: page.meta?.frontendDesignSource?.type,
      bindingHintCount: page.meta?.frontendDesignBindingHints?.length || 0,
    },
    content: {
      rootElementCount: elements.length,
      totalElementCount: allElements.length,
      canvasSize,
      wrapperId: wrapper.id,
      heading: heading?.props?.content,
      customCssStored: typeof content.customCSS === 'string',
    },
  };
};

const assertDatasetPageContent = async (pageId, collection, mode, slug, title) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/pages/${pageId}`);
  const page = payload.data?.page;

  assert(page, `Created dataset page ${pageId} detail was not returned`);
  assert(page.title === title, `Created dataset page title mismatch: ${JSON.stringify({ title: page.title, expected: title })}`);
  assert(page.slug === slug, `Created dataset page slug mismatch: ${JSON.stringify({ slug: page.slug, expected: slug })}`);

  const content = normalizeCreatedContent(page.content);
  const elements = Array.isArray(content.elements) ? content.elements : [];
  const allElements = flattenElements(elements);
  const byId = new Map(allElements.map((element) => [element.id, element]));
  const contentDocument = content.contentDocument || null;
  const canvasSize = content.canvasSize || contentDocument?.metadata?.canvasSize || {};
  const section = byId.get(`collection-${collection.id}-${mode === 'item' ? 'detail' : 'list'}-section`);
  const repeater = byId.get(`collection-${collection.id}-repeater`);
  const detailTitle = byId.get(`collection-${collection.id}-detail-title`);
  const detailSummary = byId.get(`collection-${collection.id}-detail-summary`);

  assert(section?.props?.datasetImport?.collectionId === collection.id, `Dataset page section missing dataset import metadata: ${JSON.stringify(section)}`);
  assert(section.props.datasetImport.mode === mode, `Dataset page section dataset mode mismatch: ${JSON.stringify(section.props.datasetImport)}`);

  if (mode === 'list') {
    assert(repeater?.type === 'repeater', `Dataset list page missing repeater: ${JSON.stringify({ ids: allElements.map((element) => element.id).slice(0, 60) })}`);
    assert(repeater.props?.collectionId === collection.id, `Dataset repeater collection mismatch: ${JSON.stringify(repeater.props)}`);
    assert(repeater.props?.datasetId === `dataset_${collection.id}`, `Dataset repeater dataset id mismatch: ${JSON.stringify(repeater.props)}`);
    assert(repeater.props?.titleField === 'title', `Dataset repeater title field mismatch: ${JSON.stringify(repeater.props)}`);
    assert(repeater.props?.descriptionField === 'summary', `Dataset repeater summary field mismatch: ${JSON.stringify(repeater.props)}`);
    assert(repeater.props?.imageField === 'image', `Dataset repeater image field mismatch: ${JSON.stringify(repeater.props)}`);
  } else {
    assert(Array.isArray(detailTitle?.dataBindings) && detailTitle.dataBindings[0]?.source?.collectionId === collection.id, `Dataset item title binding missing: ${JSON.stringify(detailTitle)}`);
    assert(Array.isArray(detailSummary?.dataBindings) && detailSummary.dataBindings[0]?.source?.field === 'summary', `Dataset item summary binding missing: ${JSON.stringify(detailSummary)}`);
  }

  assert(contentDocument?.kind === 'page', `Dataset page contentDocument kind mismatch: ${JSON.stringify(contentDocument)}`);
  assert(contentDocument?.slug === page.slug, `Dataset page contentDocument slug mismatch: ${JSON.stringify({ slug: page.slug, contentDocumentSlug: contentDocument?.slug })}`);
  assert(canvasSize.width === 1200 && canvasSize.height >= 1000, `Dataset page canvas size mismatch: ${JSON.stringify(canvasSize)}`);

  return {
    pageId,
    mode,
    slug: page.slug,
    metaTitle: page.meta?.title || null,
    content: {
      rootElementCount: elements.length,
      totalElementCount: allElements.length,
      canvasSize,
      sectionDatasetImport: section.props.datasetImport,
      repeaterProps: repeater?.props || null,
      detailBindingCount: (detailTitle?.dataBindings || []).length + (detailSummary?.dataBindings || []).length,
    },
  };
};

const assertStarterTemplateEditorRender = async (client, testCase) => {
  const requiredElementIds = testCase.requiredElementIds;
  let renderState = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await evaluate(client, `(() => {
      const canvas = document.querySelector('[data-testid="editor-canvas"]');
      if (canvas) {
        canvas.scrollIntoView({ block: 'start', inline: 'nearest' });
        let scroller = canvas.parentElement;
        while (scroller) {
          const style = window.getComputedStyle(scroller);
          const canScrollY = scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(style.overflowY);
          if (canScrollY) {
            const canvasRect = canvas.getBoundingClientRect();
            const scrollerRect = scroller.getBoundingClientRect();
            scroller.scrollTop += canvasRect.top - scrollerRect.top - 120;
          }
          scroller = scroller.parentElement;
        }
        const rect = canvas.getBoundingClientRect();
        window.scrollTo({
          top: Math.max(0, rect.top + window.scrollY - 120),
          left: 0,
          behavior: 'auto',
        });
      } else {
        document.querySelector('#page-editor-canvas')?.scrollIntoView({ block: 'start' });
      }
    })()`);
    await sleep(120);

    renderState = await evaluate(client, `(() => {
      const canvas = document.querySelector('[data-testid="editor-canvas"]');
      const elements = Array.from(canvas?.querySelectorAll('[data-element-id]') || []);
      const bodyText = document.body?.innerText || '';
      const requiredElementIds = ${JSON.stringify(requiredElementIds)};
      const byId = new Map(elements.map((element) => [element.getAttribute('data-element-id'), element]));
      const requiredRects = requiredElementIds.map((id) => {
        const element = byId.get(id);
        const rect = element?.getBoundingClientRect();
        return {
          id,
          present: Boolean(element),
          width: Math.round(rect?.width || 0),
          height: Math.round(rect?.height || 0),
          left: Math.round(rect?.left || 0),
          top: Math.round(rect?.top || 0),
        };
      });
      const canvasRect = canvas?.getBoundingClientRect();
      const clipLeft = Math.max(0, canvasRect?.left || 0);
      const clipTop = Math.max(0, canvasRect?.top || 0);
      const clipRight = Math.min(window.innerWidth, canvasRect?.right || 0);
      const clipBottom = Math.min(window.innerHeight, canvasRect?.bottom || 0);
      return {
        editorLoaded: document.body?.innerText?.includes('Page editor command center') || false,
        backendFallbackVisible: document.body?.innerText?.includes('Using the local page copy.') || false,
        canvasPresent: Boolean(canvas),
        canvasWidth: Math.round(canvasRect?.width || 0),
        canvasHeight: Math.round(canvasRect?.height || 0),
        canvasOffsetWidth: canvas?.clientWidth || 0,
        canvasOffsetHeight: canvas?.clientHeight || 0,
        renderedElementCount: elements.length,
        hasLayerTotalsMeta: /\\d+\\s+layers?\\s+\\/\\s+\\d+\\s+root/.test(bodyText),
        hasContainerMeta: /\\d+\\s+containers?/.test(bodyText),
        renderedElementIds: elements.map((element) => element.getAttribute('data-element-id')).filter(Boolean),
        missingElementIds: requiredRects.filter((rect) => !rect.present).map((rect) => rect.id),
        collapsedElementIds: requiredRects.filter((rect) => rect.present && (rect.width <= 0 || rect.height <= 0)).map((rect) => rect.id),
        requiredRects,
        canvasScreenshotClip: {
          x: Math.round(clipLeft),
          y: Math.round(clipTop),
          width: Math.round(Math.max(0, clipRight - clipLeft)),
          height: Math.round(Math.max(0, clipBottom - clipTop)),
        },
        emptyStateVisible: document.body?.innerText?.includes('Drop components onto the canvas') || false,
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        body: bodyText.slice(0, 260),
      };
    })()`);

    if (
      renderState.editorLoaded
      && renderState.canvasPresent
      && renderState.renderedElementCount >= testCase.minTotalElementCount
      && renderState.missingElementIds.length === 0
      && renderState.collapsedElementIds.length === 0
      && renderState.canvasScreenshotClip.width >= getEditorScreenshotThresholds(testCase.template).minClipWidth
      && renderState.canvasScreenshotClip.height >= getEditorScreenshotThresholds(testCase.template).minClipHeight
      && !renderState.backendFallbackVisible
      && !renderState.emptyStateVisible
    ) {
      break;
    }

    if (attempt === 79) {
      throw new Error(`Created ${testCase.template} editor canvas did not render expected saved elements: ${JSON.stringify(renderState)}`);
    }

    await sleep(250);
  }

  assert(renderState.canvasOffsetWidth === 1200, `Created ${testCase.template} editor canvas width mismatch: ${JSON.stringify(renderState)}`);
  assert(renderState.canvasOffsetHeight >= testCase.minCanvasHeight, `Created ${testCase.template} editor canvas height mismatch: ${JSON.stringify(renderState)}`);
  assert(renderState.hasLayerTotalsMeta, `Created ${testCase.template} editor missing total/root layer metadata: ${JSON.stringify(renderState)}`);
  assert(renderState.hasContainerMeta, `Created ${testCase.template} editor missing container layer metadata: ${JSON.stringify(renderState)}`);
  assert(renderState.horizontalOverflow <= 4, `Created ${testCase.template} editor route has horizontal page overflow: ${JSON.stringify(renderState)}`);

  const screenshotPath = path.join(EDITOR_TEMPLATE_SCREENSHOT_DIR, `backy-page-create-editor-${testCase.template}.png`);
  const screenshot = await captureScreenshotData(client, screenshotPath);
  const screenshotMetrics = await assertScreenshotPixelThresholds(
    client,
    `Created ${testCase.template} editor canvas`,
    screenshot.data,
    getEditorScreenshotThresholds(testCase.template),
    renderState.canvasScreenshotClip,
  );

  return {
    ...renderState,
    screenshotPath,
    screenshotMetrics,
  };
};

const assertPublicResponsivePageRender = async (parentClient, pageId, testCase) => {
  const preview = await requestPagePreview(pageId);
  const results = {};
  const renderLabel = testCase.label || testCase.template;
  const screenshotName = renderLabel.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();

  for (const viewport of PUBLIC_TEMPLATE_RESPONSIVE_VIEWPORTS) {
    let publicClient = null;
    try {
      publicClient = await openPublicPreviewTab(parentClient, preview.hostedUrl, viewport);
      let renderState = null;

      for (let attempt = 0; attempt < 100; attempt += 1) {
        renderState = await evaluate(publicClient, `(() => {
          const root = document.querySelector('[data-backy-render-breakpoint]');
          const canvas = document.querySelector('.backy-canvas');
          const elements = Array.from(document.querySelectorAll('[data-element-id]'));
          const requiredElementIds = ${JSON.stringify(testCase.requiredElementIds)};
          const byId = new Map(elements.map((element) => [element.getAttribute('data-element-id'), element]));
          const requiredRects = requiredElementIds.map((id) => {
            const element = byId.get(id);
            const rect = element?.getBoundingClientRect();
            return {
              id,
              present: Boolean(element),
              width: Math.round(rect?.width || 0),
              height: Math.round(rect?.height || 0),
              left: Math.round(rect?.left || 0),
              top: Math.round(rect?.top || 0),
            };
          });
          const rootRect = root?.getBoundingClientRect();
          const canvasRect = canvas?.getBoundingClientRect();
          return {
            url: window.location.href,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            breakpoint: root?.getAttribute('data-backy-render-breakpoint') || '',
            renderScale: Number(root?.getAttribute('data-backy-render-scale') || 0),
            canvasScale: Number(document.querySelector('[data-backy-canvas-scale]')?.getAttribute('data-backy-canvas-scale') || 0),
            canvasWidth: Math.round(canvasRect?.width || 0),
            canvasHeight: Math.round(canvasRect?.height || 0),
            rootWidth: Math.round(rootRect?.width || 0),
            renderedElementCount: elements.length,
            missingElementIds: requiredRects.filter((rect) => !rect.present).map((rect) => rect.id),
            collapsedElementIds: requiredRects.filter((rect) => rect.present && (rect.width <= 0 || rect.height <= 0)).map((rect) => rect.id),
            requiredRects,
            horizontalOverflow: (document.documentElement?.scrollWidth || window.innerWidth) - window.innerWidth,
            emptyStateVisible: document.body?.innerText?.includes('Drop components onto the canvas') || false,
            notFoundVisible: /not found|could not find|404/i.test(document.body?.innerText || ''),
            body: document.body?.innerText?.slice(0, 280) || '',
          };
        })()`);

        if (
          renderState.breakpoint === viewport.expectedBreakpoint
          && renderState.renderedElementCount >= testCase.minTotalElementCount
          && renderState.missingElementIds.length === 0
          && renderState.collapsedElementIds.length === 0
          && renderState.canvasWidth > 0
          && renderState.canvasHeight > 0
          && renderState.renderScale > 0
          && renderState.canvasScale > 0
          && renderState.horizontalOverflow <= 4
          && !renderState.emptyStateVisible
          && !renderState.notFoundVisible
        ) {
          break;
        }

        if (attempt === 99) {
          throw new Error(`Created ${renderLabel} public ${viewport.key} render did not reach a complete responsive state: ${JSON.stringify(renderState)}`);
        }

        await sleep(200);
      }

      assert(renderState.breakpoint === viewport.expectedBreakpoint, `Created ${renderLabel} public ${viewport.key} breakpoint mismatch: ${JSON.stringify(renderState)}`);
      assert(renderState.renderScale > 0 && renderState.renderScale <= 1, `Created ${renderLabel} public ${viewport.key} scale mismatch: ${JSON.stringify(renderState)}`);
      assert(renderState.horizontalOverflow <= 4, `Created ${renderLabel} public ${viewport.key} route has horizontal overflow: ${JSON.stringify(renderState)}`);

      const screenshotPath = path.join(EDITOR_TEMPLATE_SCREENSHOT_DIR, `backy-page-create-public-${screenshotName}-${viewport.key}.png`);
      const screenshot = await captureScreenshotData(publicClient, screenshotPath);
      const screenshotMetrics = await assertScreenshotPixelThresholds(
        publicClient,
        `Created ${renderLabel} public ${viewport.key} render`,
        screenshot.data,
        getPublicTemplateScreenshotThresholds(testCase.template),
        { x: 0, y: 0, width: viewport.width, height: viewport.height },
      );

      results[viewport.key] = {
        ...renderState,
        screenshotPath,
        screenshotMetrics,
      };
    } finally {
      if (publicClient) {
        try {
          await publicClient.send('Page.close');
        } catch {
          // The target may already be closed by Chrome during cleanup.
        }
        publicClient.close();
      }
    }
  }

  return {
    preview: {
      hostedUrl: preview.hostedUrl,
      renderUrl: preview.renderUrl,
      expiresAt: preview.expiresAt,
    },
    results,
  };
};

const datasetResponsiveRenderCase = (collection, mode) => {
  const requiredElementIds = mode === 'list'
    ? [
        `collection-${collection.id}-list-section`,
        `collection-${collection.id}-list-route`,
        `collection-${collection.id}-list-title`,
        `collection-${collection.id}-list-intro`,
        `collection-${collection.id}-repeater`,
      ]
    : [
        `collection-${collection.id}-detail-section`,
        `collection-${collection.id}-route-label`,
        `collection-${collection.id}-detail-title`,
        `collection-${collection.id}-detail-summary`,
        `collection-${collection.id}-detail-card`,
        `collection-${collection.id}-detail-fields`,
      ];

  return {
    template: `dataset-${mode}`,
    label: `dataset ${mode} page`,
    // Empty dataset list pages render chrome, the section, and an empty repeater message.
    // Required element IDs below still guard the actual dataset contract surface.
    minTotalElementCount: mode === 'list' ? 13 : 14,
    requiredElementIds,
  };
};

const frontendDesignResponsiveRenderCase = () => ({
  template: 'frontend-design',
  label: 'frontend design template page',
  minTotalElementCount: 3,
  requiredElementIds: [
    `frontend-template-${FRONTEND_DESIGN_TEMPLATE_ID}`,
    `frontend-template-${FRONTEND_DESIGN_TEMPLATE_ID}-heading`,
    `frontend-template-${FRONTEND_DESIGN_TEMPLATE_ID}-editable-region`,
  ],
});

const createStarterTemplateBackends = async (client, createdPageIds) => {
  const summaries = [];

  for (const [index, testCase] of STARTER_TEMPLATE_BACKEND_CASES.entries()) {
    const slug = `${testCase.slugBase}-${Date.now().toString(36)}-${index}`;
    const routeState = await navigateToStarterTemplateCreate(client, testCase, slug);
    const editState = await createPageFromUi(client);
    const pageId = editState.path.split('/').filter(Boolean).at(-2);
    createdPageIds.push(pageId);
    const editorRender = await assertStarterTemplateEditorRender(client, testCase);
    const content = await assertStarterTemplatePageContent(pageId, testCase, slug);
    const publicResponsiveRender = await assertPublicResponsivePageRender(client, pageId, testCase);

    summaries.push({
      template: testCase.template,
      routeState: routeState.state,
      editState,
      editorRender,
      publicResponsiveRender,
      pageId,
      content,
    });
  }

  return summaries;
};

const createFrontendDesignTemplateBackend = async (client, createdPageIds) => {
  const slug = `smoke-frontend-design-template-${Date.now().toString(36)}`;
  const title = 'Smoke Frontend Contract Page';
  const routeState = await navigateToFrontendDesignTemplateCreate(client, slug, title);
  const editState = await createPageFromUi(client);
  const pageId = editState.path.split('/').filter(Boolean).at(-2);
  createdPageIds.push(pageId);
  const content = await assertFrontendDesignTemplatePageContent(pageId, slug, title);
  const publicResponsiveRender = await assertPublicResponsivePageRender(
    client,
    pageId,
    frontendDesignResponsiveRenderCase(),
  );

  return {
    routeState: routeState.state,
    editState,
    pageId,
    publicResponsiveRender,
    content,
  };
};

const createDatasetPageBackend = async (client, createdPageIds, collection, mode = 'list') => {
  const routeState = await navigateToDatasetPageCreate(client, collection, mode);
  const editState = await createPageFromUi(client);
  const pageId = editState.path.split('/').filter(Boolean).at(-2);
  createdPageIds.push(pageId);
  const slug = routeState.state.slug;
  const title = routeState.state.title;
  const content = await assertDatasetPageContent(pageId, collection, mode, slug, title);
  const publicResponsiveRender = await assertPublicResponsivePageRender(
    client,
    pageId,
    datasetResponsiveRenderCase(collection, mode),
  );

  return {
    routeState: routeState.state,
    editState,
    pageId,
    publicResponsiveRender,
    content,
  };
};

const createPageFromUi = async (client) => {
  let clicked = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').includes('Create Page')
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true, label: button.textContent || '' };
    })()`);

    if (clicked.ok) {
      break;
    }

    await sleep(250);
  }
  assert(clicked.ok, `Create Page button was not ready: ${JSON.stringify(clicked)}`);

  let editState = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    editState = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      storedDraft: localStorage.getItem('backy:page-new:draft:v1'),
      editorLoaded: document.body?.innerText?.includes('Page editor command center') || false,
      backendFallbackVisible: document.body?.innerText?.includes('Using the local page copy.') || false,
      body: document.body?.innerText?.slice(0, 260) || '',
    }))()`);

    if (editState.path.startsWith('/pages/') && editState.path.endsWith('/edit') && editState.editorLoaded && !editState.backendFallbackVisible) {
      assert(editState.storedDraft === null, `Autosave draft was not cleared after create: ${JSON.stringify(editState)}`);
      return editState;
    }

    if (attempt === 119) {
      throw new Error(`Page create did not navigate into the editor: ${JSON.stringify(editState)}`);
    }

    await sleep(300);
  }

  return editState;
};

const assertPageEditorFocusMode = async (client) => {
  let clicked = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    clicked = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').trim() === 'Focus canvas'
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);

    if (clicked.ok) {
      break;
    }

    await sleep(200);
  }
  assert(clicked.ok, `Page editor Focus canvas button was not ready: ${JSON.stringify(clicked)}`);

  let focused = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    focused = await evaluate(client, `(() => ({
      path: window.location.pathname,
      search: window.location.search,
      banner: Boolean(document.querySelector('[data-testid="page-editor-focus-banner"]')),
      commandCenter: Boolean(document.querySelector('[data-testid="page-editor-command-center"]')),
      publishPanel: Boolean(document.querySelector('#page-editor-publish')),
      canvas: Boolean(document.querySelector('[data-testid="editor-canvas"]')),
      adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
      adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
      showPanels: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').trim() === 'Show panels'),
    }))()`);

    if (focused.banner && focused.canvas && focused.showPanels && !focused.commandCenter && !focused.publishPanel && !focused.adminSidebar && !focused.adminHeader && focused.search.includes('focus=canvas')) {
      break;
    }

    if (attempt === 59) {
      throw new Error(`Page editor focus mode did not hide management panels: ${JSON.stringify(focused)}`);
    }

    await sleep(200);
  }

  let restored = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    restored = await evaluate(client, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').trim() === 'Show panels'
      ));
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return { ok: false, label: button?.textContent || null, disabled: button instanceof HTMLButtonElement ? button.disabled : null };
      }
      button.click();
      return { ok: true };
    })()`);

    if (restored.ok) {
      break;
    }

    await sleep(200);
  }
  assert(restored.ok, `Page editor Show panels button was not ready: ${JSON.stringify(restored)}`);

  let normal = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    normal = await evaluate(client, `(() => ({
      search: window.location.search,
      banner: Boolean(document.querySelector('[data-testid="page-editor-focus-banner"]')),
      commandCenter: Boolean(document.querySelector('[data-testid="page-editor-command-center"]')),
      publishPanel: Boolean(document.querySelector('#page-editor-publish')),
      adminSidebar: Boolean(document.querySelector('[data-testid="admin-sidebar-shell"]')),
      adminHeader: Boolean(document.querySelector('[data-testid="admin-header-shell"]')),
    }))()`);

    if (!normal.banner && normal.commandCenter && normal.publishPanel && normal.adminSidebar && normal.adminHeader && !normal.search.includes('focus=canvas')) {
      break;
    }

    if (attempt === 59) {
      throw new Error(`Page editor Show panels did not restore management panels: ${JSON.stringify(normal)}`);
    }

    await sleep(200);
  }

  return {
    focused,
    normal,
  };
};

const findNavigationItem = (items, predicate) => {
  for (const item of items || []) {
    if (predicate(item)) return item;
    const child = findNavigationItem(item.children || [], predicate);
    if (child) return child;
  }
  return null;
};

const assertNavigationContainsPage = async (pageId, navLabel, parentPageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/navigation`);
  const primary = payload.data?.navigation?.settings?.primary || [];
  const parentItem = findNavigationItem(primary, (candidate) => candidate.pageId === parentPageId);
  const item = findNavigationItem(parentItem?.children || [], (candidate) => candidate.pageId === pageId);

  assert(parentItem, `Parent page ${parentPageId} was not available in primary navigation: ${JSON.stringify(primary)}`);
  assert(item, `Created page ${pageId} was not nested under parent ${parentPageId}: ${JSON.stringify(parentItem)}`);
  assert(item.label === navLabel, `Created page navigation label mismatch: ${JSON.stringify(item)}`);

  return { parentItem, item };
};

const removePageFromNavigation = async (pageId) => {
  const payload = await requestApi(`/api/admin/sites/${SITE_ID}/navigation`);
  const navigation = payload.data?.navigation?.settings;
  if (!navigation) return null;

  const strip = (items = []) => items
    .filter((item) => item.pageId !== pageId)
    .map((item) => ({ ...item, children: strip(item.children || []) }));
  const nextNavigation = {
    ...navigation,
    primary: strip(navigation.primary || []),
    footer: strip(navigation.footer || []),
  };

  await requestApi(`/api/admin/sites/${SITE_ID}/navigation`, {
    method: 'PATCH',
    body: JSON.stringify({ navigation: nextNavigation }),
  });

  return nextNavigation;
};

const launchChrome = () => {
  assert(fs.existsSync(CHROME_BIN), `Chrome binary not found at ${CHROME_BIN}. Set CHROME_BIN to override.`);

  const userDataDir = path.join(os.tmpdir(), `backy-page-create-${Date.now()}`);
  const childProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1100',
    'about:blank',
  ], { stdio: 'ignore' });

  return { childProcess, userDataDir };
};

const cleanup = async ({ client, childProcess, userDataDir, pageIds = [], pageId, parentPageId, collectionIds = [] }) => {
  const uniquePageIds = Array.from(new Set([...pageIds, pageId].filter(Boolean)));

  for (const createdPageId of uniquePageIds) {
    try {
      await removePageFromNavigation(createdPageId);
    } catch (error) {
      console.warn(`Unable to remove smoke page ${createdPageId} from navigation:`, error instanceof Error ? error.message : error);
    }

    try {
      await requestApi(`/api/admin/sites/${SITE_ID}/pages/${createdPageId}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke page ${createdPageId}:`, error instanceof Error ? error.message : error);
    }
  }

  if (parentPageId) {
    try {
      await removePageFromNavigation(parentPageId);
    } catch (error) {
      console.warn(`Unable to remove smoke parent page ${parentPageId} from navigation:`, error instanceof Error ? error.message : error);
    }

    try {
      await requestApi(`/api/admin/sites/${SITE_ID}/pages/${parentPageId}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke parent page ${parentPageId}:`, error instanceof Error ? error.message : error);
    }
  }

  for (const collectionId of collectionIds.filter(Boolean)) {
    try {
      await requestApi(`/api/admin/sites/${SITE_ID}/collections/${collectionId}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`Unable to delete smoke collection ${collectionId}:`, error instanceof Error ? error.message : error);
    }
  }

  if (client) {
    try {
      await client.send('Browser.close');
    } catch {
      // Chrome may already be closing.
    }
    client.close();
  }

  if (childProcess.exitCode === null && childProcess.signalCode === null) {
    childProcess.kill('SIGTERM');
    const exited = await waitForExit(childProcess);
    if (!exited) {
      childProcess.kill('SIGKILL');
      await waitForExit(childProcess, 500);
    }
  }

  fs.rmSync(userDataDir, { recursive: true, force: true });
};

const main = async () => {
  assertPageCreateSourceContracts();
  if (process.env.BACKY_PAGE_CREATE_SOURCE_ONLY === '1') {
    console.log(JSON.stringify({ ok: true, guard: 'page-create-source' }));
    return;
  }
  await loginAdminApi();
  const slug = `page-create-smoke-${Date.now().toString(36)}`;
  const title = 'Smoke Page Create';
  const navLabel = 'Smoke Nav Page';
  const seo = {
    title: 'Smoke Page SEO Title',
    canonical: `https://example.com/${slug}`,
    normalizedCanonical: `/${slug}`,
    keywords: 'smoke page, page builder, structured data',
    expectedKeywords: ['smoke page', 'page builder', 'structured data'],
    jsonLd: JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'Smoke Page SEO Title',
      },
    ], null, 2),
    ogImage: 'https://example.com/smoke-page-og.jpg',
  };
  const { childProcess, userDataDir } = launchChrome();
  let client;
  let pageId = null;
  const createdPageIds = [];
  const createdCollectionIds = [];
  let parentPage = null;
  let datasetCollection = null;
  let originalFrontendDesign = null;

  try {
    originalFrontendDesign = await getFrontendDesign();
    await patchFrontendDesign(smokeFrontendDesignContract());
    parentPage = await createParentPage();
    datasetCollection = await createDatasetCollection();
    createdCollectionIds.push(datasetCollection.id);
    await waitForCdp();
    const page = (await fetchJson('/json/list')).find((candidate) => candidate.type === 'page');
    assert(page?.webSocketDebuggerUrl, 'No Chrome page target found');

    client = connectCdp(page.webSocketDebuggerUrl);
    await client.opened;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');
    await seedBrowserSessionCookie(client);
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: authStorageScript(apiAdminSessionToken),
    });

    await setViewport(client, { width: 1440, height: 1100 });
    const initialRender = await navigateToPageCreate(client, slug, title, navLabel, seo, parentPage.id);
    const slugSync = await assertSlugCanSyncFromTitle(client);
    await navigateToPageCreate(client, slug, title, navLabel, seo, parentPage.id);
    const desktopTemplateVisual = await assertTemplatePreviewVisualState(
      client,
      'desktop template preview',
      TEMPLATE_DESKTOP_SCREENSHOT_PATH,
    );
    const templateSwitching = await assertTemplateSwitching(client);
    await setViewport(client, { width: 390, height: 900, mobile: true, deviceScaleFactor: 2 });
    await waitForPageCreateControls(client, slug, title, navLabel, seo, parentPage.id, initialRender.url);
    const mobileTemplateVisual = await assertTemplatePreviewVisualState(
      client,
      'mobile template preview',
      TEMPLATE_MOBILE_SCREENSHOT_PATH,
    );
    await setViewport(client, { width: 1440, height: 1100 });
    await waitForPageCreateControls(client, slug, title, navLabel, seo, parentPage.id, initialRender.url);
    const autosave = await assertAutosaveWritten(client, slug, title, navLabel, seo, parentPage.id);
    const recovery = await assertRecoveryRestore(client, slug, title, navLabel, seo, parentPage.id);
    const editState = await createPageFromUi(client);
    pageId = editState.path.split('/').filter(Boolean).at(-2);
    createdPageIds.push(pageId);
    const pageEditorFocus = await assertPageEditorFocusMode(client);
    const navigationItem = await assertNavigationContainsPage(pageId, navLabel, parentPage.id);
    const pageMeta = await assertCreatedPageSeo(pageId, seo, parentPage);
    const frontendDesignTemplateBackend = await createFrontendDesignTemplateBackend(client, createdPageIds);
    const datasetListPageBackend = await createDatasetPageBackend(client, createdPageIds, datasetCollection, 'list');
    const datasetItemPageBackend = await createDatasetPageBackend(client, createdPageIds, datasetCollection, 'item');
    const starterTemplateBackends = await createStarterTemplateBackends(client, createdPageIds);

    await captureScreenshot(client, SCREENSHOT_PATH);

    const browserErrors = client.events
      .filter((event) => (
        event.method === 'Runtime.exceptionThrown'
        || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error' && !isIgnorableBrowserLogError(event))
      ))
      .map((event) => event.params);

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors.slice(0, 3))}`);

    console.log(JSON.stringify({
      ok: true,
      url: initialRender.url,
      initialRender: initialRender.state,
      slugSync,
      templateVisuals: {
        desktop: desktopTemplateVisual,
        mobile: mobileTemplateVisual,
      },
      templateSwitching,
      autosave,
      recovery,
      editState,
      pageEditorFocus,
      pageId,
      parentPageId: parentPage.id,
      navigationItem,
      pageMeta,
      frontendDesignTemplateBackend,
      datasetPageBackend: datasetListPageBackend,
      datasetPageBackends: {
        list: datasetListPageBackend,
        item: datasetItemPageBackend,
      },
      starterTemplateBackends,
      screenshotPath: SCREENSHOT_PATH,
    }, null, 2));
  } finally {
    if (originalFrontendDesign) {
      try {
        await patchFrontendDesign(originalFrontendDesign);
      } catch (error) {
        console.warn('Unable to restore original frontend design contract:', error instanceof Error ? error.message : error);
      }
    }
    await cleanup({
      client,
      childProcess,
      userDataDir,
      pageIds: createdPageIds,
      pageId,
      parentPageId: parentPage?.id || null,
      collectionIds: createdCollectionIds,
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
