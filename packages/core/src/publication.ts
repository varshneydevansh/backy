/** Matches the public delivery rule for pages and posts, including due schedules. */
export function isContentPublished(content: {
  status?: string;
  scheduledAt?: string | Date | null;
} | null | undefined, now = Date.now()): boolean {
  if (content?.status === 'published') return true;
  if (content?.status !== 'scheduled' || !content.scheduledAt) return false;
  const time = new Date(content.scheduledAt).getTime();
  return Number.isFinite(time) && time <= now;
}
