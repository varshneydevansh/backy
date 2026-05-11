# Plan: Phase C — Form Engine Completeness and Submission Pipeline

**Generated**: 2026-02-26  
**Estimated Complexity**: High

## Overview
Make forms production-safe for self-hosted and external-frontend consumers: strict field validation, robust parser compatibility, moderation queues, anti-spam, and reliable admin review operations.

## Prerequisites
- Shared element/contracts in `packages/core` for form field definitions and statuses.
- Phase A persistence boundaries active.

## Sprint 1: Submission correctness
**Goal**: Ensure all inbound form payloads are normalized and validated consistently.

### Task 1.1: Canonical form schema lock
- **Location**: `packages/core/src/types/index.ts`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`
- **Description**:
  - Finalize `FormFieldDefinition` and validation rule types (type, required, regex, min/max, options, file/allowedTypes).
  - Accept legacy payload aliases while normalizing internal record.
- **Complexity**: 8
- **Dependencies**: Phase A
- **Acceptance Criteria**:
  - Payloads with alias keys normalize to same internal map.
- **Validation**:
  - Matrix tests for `text/email/url/file/select/checkbox/radio/list`.
- **Progress**:
  - Public submission parsing now accepts `values`, `fields`, `data`, `submission`, and direct field-key payloads while preserving reserved transport metadata.
  - OpenAPI exposes `FormSubmissionRequest` with those aliases and direct field-key support; `test:forms` asserts the contract.

### Task 1.2: Form pipeline strict validation
- **Location**: `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `apps/public/src/lib/backyStore.ts`
- **Description**:
  - Implement deterministic field-level validation and typed error output.
  - Include per-field `field`, `code`, `message`.
- **Complexity**: 8
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Invalid payloads return 400 with machine-readable errors and no persistence mutation.
- **Validation**:
  - API call suite for required fields, pattern validation, and type mismatch.
- **Progress**:
  - Invalid submissions now return a typed `VALIDATION_ERROR` envelope with `validation: [{ field, code, message, label? }]`.
  - Public validation currently uses HTTP `422` for semantic field/spam rejection and keeps `400` for malformed submit payloads.
  - OpenAPI exposes `FormSubmissionValidationErrorEnvelope`, and the SDK preserves validation details on `BackyApiError.validation`.

### Task 1.3: Moderation lifecycle and admin controls
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `apps/public/src/lib/backyStore.ts`
- **Description**:
  - Complete status transitions for `pending`, `approved`, `rejected`, `spam`.
  - Add admin notes and reviewer actor tracking.
- **Complexity**: 7
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Admin status updates are persisted and auditable.
- **Validation**:
  - Status matrix by role and endpoint.

### Task 1.4: Contact-share interoperability
- **Location**: `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `apps/public/src/lib/backyStore.ts`
- **Description**:
  - Implement deterministic dedupe and optional webhook/email pipeline metadata.
- **Complexity**: 7
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Duplicate contact submit honors `dedupeByEmail`.
- **Validation**:
  - Repeat submit same identity with dedupe enabled.
- **Progress**:
  - Form builder now exposes per-form notification email and webhook URL controls.
  - Public form submissions now record per-form notification email delivery events. In production, `BACKY_EMAIL_PROVIDER=resend` with `BACKY_RESEND_API_KEY` sends through Resend, `BACKY_EMAIL_PROVIDER=smtp` with `BACKY_SMTP_HOST`/`BACKY_SMTP_PORT` sends through SMTP, `BACKY_EMAIL_DELIVERY_ENDPOINT` or `BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL` can receive the generic transactional email payload, and no provider records a local outbox handoff event for auditability.
  - Public form submissions deliver configured webhooks for form submissions and contact-share events in demo and repository modes, with queued/succeeded/failed delivery events queryable through the interaction events API.
  - Admins can retry a form submission webhook through `POST /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId/webhook-retry`, which records retry queued/succeeded/failed events.
  - Admins can retry a failed form notification email through `POST /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId/email-retry`, which records retry queued/succeeded/failed email-channel events.
  - `/forms` now persists per-form spam controls for minimum fill time, rate window, maximum submissions, duplicate window, and blocked terms; public submissions apply those settings before persistence or delivery.
  - Captcha-enabled public forms now verify provider tokens before persistence or delivery. Runtime supports Turnstile, hCaptcha, reCAPTCHA, and a development mock provider; OpenAPI advertises the token aliases used by generated and custom frontends.
  - The form repository now persists spam and consent settings into the durable form settings JSON for direct database-mode consumers, and `supabase/migrations/002_forms_contacts_persistence.sql` creates durable Supabase/Postgres form definition, submission, and contact tables with RLS policies and query indexes.
  - `GET /api/admin/sites/:siteId/forms/contact-segments` now returns backend contact segment analytics for all forms or a selected form, including lifecycle counts, missing identity fields, source-value retention, ready-to-promote leads, duplicate-email records, contact IDs, and source form IDs in demo and repository modes.
  - `GET/POST/DELETE /api/admin/sites/:siteId/forms/contact-lists` now persists saved contact filter lists under site settings in demo and repository modes, returns matched contact counts and IDs, and records create/update/delete audit events.
  - `POST /api/admin/sites/:siteId/forms/:formId/contacts/:contactId/promote` now promotes qualified contacts into invited or active Backy users, reuses existing users by email, can generate invite links, stores promotion metadata on the contact, and records contact/user audit events.
  - `POST /api/admin/sites/:siteId/forms/:formId/contacts/:contactId/promote-customer` now promotes qualified contacts into private customer collection records, creates or extends the `customers` collection when needed, upserts by email, stores customer promotion metadata on the contact, and records contact/customer audit events.
  - `test:forms` starts local webhook and Resend-compatible receivers, configures the rendered form builder, verifies configured email delivery events, verifies webhook headers/payload delivery, forces initial failed deliveries, refreshes the rendered Forms delivery panel, retries failed email and webhook deliveries from the UI, and asserts failed plus retry queued/succeeded event history.

### Task 1.5: Export/filter and analytics hooks
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`
- **Description**:
  - Add requestId/status export filters and paginated list stability.
- **Complexity**: 6
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Admin export includes status + actor + timestamps.
  - `/forms` detects consent-like checkbox fields, summarizes granted/missing consent records, and exports a dedicated consent CSV with status, submitted timestamp, request ID, source page/post, IP hash, and user-agent provenance.
  - `/forms` persists per-form consent export/retention policy settings for policy label, retention days, deletion days, privacy request email, and whether consent exports include IP/user-agent provenance.
  - `/forms` can apply the deletion policy to due submissions, anonymizing consent checkbox values and IP/user-agent provenance while retaining non-consent submission fields.
  - Admin automation can run site-wide consent retention across all forms through `POST /api/admin/sites/:siteId/forms/consent-retention`.
- **Validation**:
  - Export two status slices and compare deterministic ordering.
  - `test:forms` verifies the rendered consent export panel, retention policy summary, export metadata, export action, per-form dry run, and site-wide retention anonymization for the registration template consent field.

## Testing Strategy
- 4-layer verification:
  - submit API validation
  - moderation UI action
  - store mutation persistence
  - public fetch with filters

## Risks & Gotchas
- Legacy submit shape could bypass strict validation unintentionally.
- **Mitigation**: allow compatibility mode with deprecation log flag.

## Rollback
- Disable strict validation by endpoint flag to permissive legacy mode only.
