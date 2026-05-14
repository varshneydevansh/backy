const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeContactEmail = (value: string | null | undefined) => (
  value?.trim().toLowerCase() || null
);

export const validateOptionalContactEmail = (value: string | null | undefined) => {
  const email = normalizeContactEmail(value);
  if (!email || CONTACT_EMAIL_PATTERN.test(email)) {
    return {
      ok: true as const,
      email,
    };
  }

  return {
    ok: false as const,
    email,
    message: 'Contact email must be a valid email address.',
  };
};
