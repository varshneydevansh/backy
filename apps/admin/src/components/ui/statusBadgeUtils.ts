export type StatusType = 'success' | 'warning' | 'error' | 'neutral' | 'info';

export const UNKNOWN_STATUS = 'unknown';

const EMPTY_STATUS_VALUES = new Set([
  '',
  '-',
  'null',
  'undefined',
  'n/a',
  'na',
  'none',
  UNKNOWN_STATUS,
]);

export const STATUS_TYPE_MAP: Record<string, StatusType> = {
  published: 'success',
  active: 'success',
  online: 'success',
  public: 'success',
  clean: 'success',
  ready: 'success',
  success: 'success',
  approved: 'success',
  draft: 'warning',
  pending: 'warning',
  'not-scanned': 'warning',
  warning: 'warning',
  scheduled: 'info',
  invited: 'info',
  info: 'info',
  archived: 'neutral',
  inactive: 'neutral',
  private: 'neutral',
  clear: 'neutral',
  unknown: 'neutral',
  suspended: 'error',
  deleted: 'error',
  error: 'error',
  blocked: 'error',
  quarantined: 'error',
  rejected: 'error',
  spam: 'error',
};

export const normalizeStatus = (value?: string | null) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');

  return EMPTY_STATUS_VALUES.has(normalized) ? UNKNOWN_STATUS : normalized;
};

export const getStatusLabel = (status?: string | null) => {
  const normalizedStatus = normalizeStatus(status);

  return normalizedStatus
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ') || 'Unknown';
};

export const getStatusType = (status?: string | null, override?: StatusType) => {
  if (override) return override;
  return STATUS_TYPE_MAP[normalizeStatus(status)] || 'neutral';
};
