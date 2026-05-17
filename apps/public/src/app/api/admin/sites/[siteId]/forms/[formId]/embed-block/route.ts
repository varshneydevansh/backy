import { NextRequest, NextResponse } from "next/server";
import type {
  BackyJsonObject,
  BackyJsonValue,
  FormDefinition,
  FormFieldDefinition,
  Site,
  SiteSettings,
} from "@backy-cms/core";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  createReusableSection,
  getFormById,
  getReusableSectionByIdOrSlug,
  getSiteByIdOrSlug,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { buildInitialReusableSectionMetadata } from "@/lib/reusableSectionVersions";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
  }>;
}

type JsonRecord = Record<string, BackyJsonValue>;

interface EmbedCanvasElement {
  id: string;
  type: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  props: JsonRecord;
  styles?: JsonRecord;
  children?: EmbedCanvasElement[];
}

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  NextResponse.json(
    {
      success: false,
      requestId,
      error: { code, message },
      errorMessage: message,
    },
    { status },
  );

const parseJsonBody = async (
  request: NextRequest,
): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const textValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const recordValue = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeSlug = (value: unknown): string =>
  textValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const uniqueSlug = async (
  siteId: string,
  baseSlug: string,
  exists: (slug: string) => Promise<boolean> | boolean,
): Promise<string> => {
  const normalizedBase =
    normalizeSlug(baseSlug) || `form-embed-${Date.now().toString(36)}`;
  for (let index = 0; index < 50; index += 1) {
    const slug =
      index === 0 ? normalizedBase : `${normalizedBase}-${index + 1}`;
    if (!(await exists(slug))) return slug;
  }
  return `${normalizedBase}-${Date.now().toString(36)}`;
};

const fieldElementType = (field: FormFieldDefinition): string => {
  if (field.type === "textarea") return "textarea";
  if (field.type === "select") return "select";
  if (field.type === "checkbox") return "checkbox";
  if (field.type === "radio") return "radio";
  return "input";
};

const fieldHeight = (field: FormFieldDefinition): number =>
  field.type === "textarea" ? 96 : field.type === "radio" ? 72 : 52;

const fieldProps = (field: FormFieldDefinition): JsonRecord => {
  const props: JsonRecord = {
    name: field.key,
    label: field.label,
    required: Boolean(field.required),
    placeholder: field.placeholder || "",
  };
  if (fieldElementType(field) === "input") props.type = field.type;
  if (field.options?.length) props.options = field.options;
  if (field.helpText) props.helpText = field.helpText;
  if (field.defaultValue) props.defaultValue = field.defaultValue;
  if (field.validation?.length)
    props.validation = field.validation as unknown as BackyJsonValue;
  return props;
};

const formTitle = (form: FormDefinition): string =>
  form.title?.trim() || form.name.trim() || form.id;

const siteFrontendDesign = (
  settings: SiteSettings | undefined,
): NonNullable<SiteSettings["frontendDesign"]> | undefined =>
  settings?.frontendDesign && settings.frontendDesign.status !== "unconfigured"
    ? settings.frontendDesign
    : undefined;

const settingRecord = (
  form: FormDefinition,
  key: string,
): Record<string, unknown> | undefined => {
  const settings = recordValue(form.settings);
  return recordValue(settings?.[key]);
};

const settingText = (form: FormDefinition, key: string): string =>
  textValue(recordValue(form.settings)?.[key]);

const buildEmbedMetadata = (
  form: FormDefinition,
  siteSettings: SiteSettings | undefined,
  input: {
    definitionUrl: string;
    submitUrl: string;
    sectionSlug: string;
  },
): BackyJsonObject => {
  const frontendDesign = siteFrontendDesign(siteSettings);
  const templateId =
    settingText(form, "frontendDesignTemplateId") || `form-embed-${form.id}`;
  const templateName =
    settingText(form, "frontendDesignTemplateName") ||
    `${formTitle(form)} embed block`;
  const frontendDesignTokens =
    settingRecord(form, "frontendDesignTokens") || frontendDesign?.tokens;
  const frontendDesignChrome =
    settingRecord(form, "frontendDesignChrome") || frontendDesign?.chrome;
  const frontendDesignSource =
    settingRecord(form, "frontendDesignSource") || frontendDesign?.source;
  const frontendDesignCustomCss =
    settingText(form, "frontendDesignCustomCss") ||
    frontendDesign?.tokens?.customCss ||
    "";
  const bindingHints = Array.isArray(
    recordValue(form.settings)?.frontendDesignBindingHints,
  )
    ? recordValue(form.settings)?.frontendDesignBindingHints
    : form.fields.map((field) => ({
        role: `form.field.${field.key}`,
        binding: `submission.${field.key}`,
        label: field.label,
      }));

  return {
    frontendDesignTemplateId: templateId,
    frontendDesignTemplateName: templateName,
    frontendDesignSource: frontendDesignSource
      ? (cloneJson(frontendDesignSource) as BackyJsonValue)
      : null,
    frontendDesignTokens: frontendDesignTokens
      ? (cloneJson(frontendDesignTokens) as BackyJsonValue)
      : null,
    frontendDesignChrome: frontendDesignChrome
      ? (cloneJson(frontendDesignChrome) as BackyJsonValue)
      : null,
    frontendDesignCustomCss,
    frontendDesignBindingHints: cloneJson(bindingHints || []) as BackyJsonValue,
    formEmbedBlock: {
      schemaVersion: "backy.form-embed-block.v1",
      formId: form.id,
      formName: form.name,
      formTitle: formTitle(form),
      definitionUrl: input.definitionUrl,
      submitUrl: input.submitUrl,
      sectionSlug: input.sectionSlug,
      fieldKeys: form.fields.map((field) => field.key),
      successMessage: form.successMessage || null,
      successRedirectUrl: form.successRedirectUrl || null,
    },
  };
};

const buildFormEmbedContent = (
  form: FormDefinition,
  siteSettings: SiteSettings | undefined,
  input: {
    definitionUrl: string;
    submitUrl: string;
  },
): BackyJsonObject => {
  const frontendDesign = siteFrontendDesign(siteSettings);
  const colors = frontendDesign?.tokens?.colors || {};
  const fonts = frontendDesign?.tokens?.fonts || {};
  const primaryColor = textValue(colors.primary) || "#0f766e";
  const textColor = textValue(colors.text) || "#111827";
  const surfaceColor = textValue(colors.surface) || "#ffffff";
  const mutedColor = textValue(colors.muted) || "#64748b";
  const bodyFont = textValue(fonts.body) || "Inter, system-ui, sans-serif";
  let cursorY = 92;

  const children: EmbedCanvasElement[] = form.fields.map((field, index) => {
    const height = fieldHeight(field);
    const element: EmbedCanvasElement = {
      id: `embed-${form.id}-${field.key}`,
      type: fieldElementType(field),
      name: field.label,
      x: 32,
      y: cursorY,
      width: 576,
      height,
      zIndex: index + 2,
      props: fieldProps(field),
      styles: {
        borderColor: "#cbd5e1",
        borderRadius: 8,
        color: textColor,
        fontFamily: bodyFont,
      },
    };
    cursorY += height + 16;
    return element;
  });

  children.push({
    id: `embed-${form.id}-submit`,
    type: "button",
    name: "Submit button",
    x: 32,
    y: cursorY,
    width: 190,
    height: 48,
    zIndex: children.length + 2,
    props: {
      content: "Submit",
      type: "submit",
    },
    styles: {
      backgroundColor: primaryColor,
      color: "#ffffff",
      borderRadius: 8,
      fontFamily: bodyFont,
      fontWeight: 700,
    },
  });

  const canvasHeight = Math.max(420, cursorY + 96);
  const formElement: EmbedCanvasElement = {
    id: `embed-form-${form.id}`,
    type: "form",
    name: `${formTitle(form)} form`,
    x: 0,
    y: 0,
    width: 672,
    height: canvasHeight,
    zIndex: 1,
    props: {
      formId: form.id,
      formName: form.name,
      formTitle: formTitle(form),
      formDescription: form.description || "",
      definitionUrl: input.definitionUrl,
      actionUrl: input.submitUrl,
      method: "POST",
      successMessage:
        form.successMessage || "Thanks. We received your submission.",
      successRedirectUrl: form.successRedirectUrl || "",
      audience: form.audience,
      moderationMode: form.moderationMode || "manual",
      frontendDesignTemplateId:
        settingText(form, "frontendDesignTemplateId") || "",
      contactShare: form.contactShare
        ? (cloneJson(form.contactShare) as BackyJsonValue)
        : null,
      collectionTarget: form.collectionTarget
        ? (cloneJson(form.collectionTarget) as BackyJsonValue)
        : null,
    },
    styles: {
      backgroundColor: surfaceColor,
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      color: textColor,
      fontFamily: bodyFont,
      padding: 24,
    },
    children,
  };

  return {
    elements: [formElement as unknown as BackyJsonValue],
    canvasSize: {
      width: 672,
      height: canvasHeight,
    },
    customCSS: frontendDesign?.tokens?.customCss || "",
    formEmbed: {
      formId: form.id,
      definitionUrl: input.definitionUrl,
      submitUrl: input.submitUrl,
      mutedColor,
    },
  };
};

const formEmbedSectionWebhookSnapshot = (section: {
  id: string;
  name: string;
  slug: string;
  status: string;
  category?: string | null;
  tags?: string[];
  sourceElementId?: string | null;
  updatedAt?: string;
}): BackyJsonObject => ({
  id: section.id,
  name: section.name,
  slug: section.slug,
  status: section.status,
  category: section.category || null,
  tags: Array.isArray(section.tags) ? section.tags : [],
  sourceElementId: section.sourceElementId || null,
  updatedAt: section.updatedAt || null,
});

const formEmbedWebhookSnapshot = (form: FormDefinition): BackyJsonObject => ({
  formId: form.id,
  name: form.name,
  title: formTitle(form),
  active: form.isActive,
  fieldCount: form.fields.length,
  audience: form.audience,
  moderationMode: form.moderationMode || "manual",
});

const deliverFormEmbedBlockWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  form: FormDefinition;
  section: Parameters<typeof formEmbedSectionWebhookSnapshot>[0];
  definitionUrl: string;
  submitUrl: string;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "form.embedBlock.created",
    data: {
      resourceType: "reusableSection",
      form: formEmbedWebhookSnapshot(params.form),
      after: formEmbedSectionWebhookSnapshot(params.section),
      embed: {
        definitionUrl: params.definitionUrl,
        submitUrl: params.submitUrl,
      },
    },
    metadata: {
      action: "form.embedBlock.created",
      changedKeys: ["content", "forms"],
      source: "admin-form-embed-block-api",
      resourceType: "reusableSection",
      resourceId: params.section.id,
      formId: params.form.id,
      formName: params.form.name,
      slug: params.section.slug,
      status: params.section.status,
      fieldCount: params.form.fields.length,
    },
  });

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "forms.edit",
  });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, formId } = await params;
    const body = await parseJsonBody(request);
    const actor = textValue(body.actor) || "admin";
    const publicBaseUrl =
      textValue(body.publicBaseUrl) || new URL(request.url).origin;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site =
        (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId));
      if (!site) {
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );
      }

      const form = await repositories.forms.getById(site.id, formId);
      if (!form) {
        return errorResponse(
          404,
          "FORM_NOT_FOUND",
          "Form not found",
          requestId,
        );
      }

      const sectionSlug = await uniqueSlug(
        site.id,
        textValue(body.slug) || `${formTitle(form)} form embed`,
        (slug) =>
          repositories.reusableSections.getBySlug(site.id, slug).then(Boolean),
      );
      const definitionUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(site.id)}/forms/${encodeURIComponent(form.id)}/definition`;
      const submitUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(site.id)}/forms/${encodeURIComponent(form.id)}/submissions`;
      const rawMetadata = buildEmbedMetadata(form, site.settings, {
        definitionUrl,
        submitUrl,
        sectionSlug,
      });
      const metadata = buildInitialReusableSectionMetadata(rawMetadata, {
        actor,
        requestId,
      }) as BackyJsonObject;
      const section = (
        await repositories.reusableSections.create({
          siteId: site.id,
          name: textValue(body.name) || `${formTitle(form)} embed block`,
          slug: sectionSlug,
          description:
            textValue(body.description) ||
            `Reusable frontend embed block for ${formTitle(form)}.`,
          category: textValue(body.category) || "forms",
          status: "active",
          tags: ["form", "embed", form.name].filter(Boolean),
          content: buildFormEmbedContent(form, site.settings, {
            definitionUrl,
            submitUrl,
          }),
          metadata,
          sourceElementId: form.id,
          createdBy: actor,
          updatedBy: actor,
        })
      ).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "reusableSection",
          entityId: section.id,
          reason: "form-embed-block-created",
          requestId,
        },
      );
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: "reusableSection",
        entityId: section.id,
        action: "reusableSection.create",
        after: section,
        metadata: {
          formId: form.id,
          source: "form-embed-block",
          slug: section.slug,
        },
        requestId,
      });
      await deliverFormEmbedBlockWebhook({
        repositories,
        site,
        form,
        section,
        definitionUrl,
        submitUrl,
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          data: {
            section,
            cacheInvalidation,
            embed: { definitionUrl, submitUrl },
          },
        },
        { status: 201 },
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return errorResponse(404, "FORM_NOT_FOUND", "Form not found", requestId);
    }

    const sectionSlug = await uniqueSlug(
      site.id,
      textValue(body.slug) || `${formTitle(form)} form embed`,
      (slug) => Boolean(getReusableSectionByIdOrSlug(site.id, slug)),
    );
    const definitionUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(site.id)}/forms/${encodeURIComponent(form.id)}/definition`;
    const submitUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(site.id)}/forms/${encodeURIComponent(form.id)}/submissions`;
    const rawMetadata = buildEmbedMetadata(form, site.settings, {
      definitionUrl,
      submitUrl,
      sectionSlug,
    });
    const section = createReusableSection(site.id, {
      name: textValue(body.name) || `${formTitle(form)} embed block`,
      slug: sectionSlug,
      description:
        textValue(body.description) ||
        `Reusable frontend embed block for ${formTitle(form)}.`,
      category: textValue(body.category) || "forms",
      status: "active",
      tags: ["form", "embed", form.name].filter(Boolean),
      content: buildFormEmbedContent(form, site.settings, {
        definitionUrl,
        submitUrl,
      }),
      metadata: buildInitialReusableSectionMetadata(rawMetadata, {
        actor,
        requestId,
      }),
      sourceElementId: form.id,
      createdBy: actor,
      updatedBy: actor,
    });
    await recordAdminAudit({
      siteId: site.id,
      entity: "reusableSection",
      entityId: section.id,
      action: "reusableSection.create",
      after: section,
      metadata: {
        formId: form.id,
        source: "form-embed-block",
        slug: section.slug,
      },
      requestId,
    });
    await deliverFormEmbedBlockWebhook({
      site: site as unknown as Site,
      form,
      section,
      definitionUrl,
      submitUrl,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        data: { section, embed: { definitionUrl, submitUrl } },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Admin form embed block API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
