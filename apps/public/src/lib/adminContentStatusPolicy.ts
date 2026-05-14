export type AdminContentStatus = 'draft' | 'published' | 'scheduled' | 'archived';

export const statusRequiresPublishPermission = (status: AdminContentStatus) => (
  status === 'published' || status === 'scheduled'
);

export const normalizeScheduledAtInput = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const validateScheduledContentStatus = (
  status: AdminContentStatus,
  scheduledAt: string | null | undefined,
) => {
  if (status !== 'scheduled') {
    return { ok: true as const };
  }

  if (!scheduledAt) {
    return {
      ok: false as const,
      code: 'SCHEDULED_AT_REQUIRED',
      message: 'scheduledAt is required when status is scheduled.',
    };
  }

  if (Number.isNaN(Date.parse(scheduledAt))) {
    return {
      ok: false as const,
      code: 'SCHEDULED_AT_INVALID',
      message: 'scheduledAt must be a valid date-time string.',
    };
  }

  return { ok: true as const };
};
