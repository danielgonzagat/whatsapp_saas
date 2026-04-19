// Pure helpers extracted from ProdutosView.tsx to reduce the host
// component's cyclomatic complexity. Each builder produces the exact
// payload shape the original inline code did — the refactor is purely
// positional; no behavioural change is intended.

export type StudentEditForm = {
  name: string;
  email: string;
  phone: string;
  status: string;
  progress: string;
};

export type UpdateStudentBody = {
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  status: string;
  progress: number;
};

/** Coerce the raw edit-student form into the backend `PUT` body. Pure. */
export const buildUpdateStudentBody = (form: StudentEditForm): UpdateStudentBody => ({
  studentName: form.name,
  studentEmail: form.email,
  studentPhone: form.phone || null,
  status: form.status,
  progress: Math.max(0, Math.min(100, Number(form.progress) || 0)),
});

export type AreaFormInput = {
  name: string;
  slug: string;
  description: string;
  type: string;
  productId: string;
  template: string;
  logoUrl: string;
  coverUrl: string;
  primaryColor: string;
  certificates: boolean;
  quizzes: boolean;
  community: boolean;
  gamification: boolean;
  progressTrack: boolean;
  downloads: boolean;
  comments: boolean;
  active: boolean;
};

export type CreateAreaBody = {
  name: string;
  slug: string | undefined;
  description: string | undefined;
  type: string;
  productId: string | undefined;
  template: string;
  logoUrl: string | undefined;
  coverUrl: string | undefined;
  primaryColor: string;
  certificates: boolean;
  quizzes: boolean;
  community: boolean;
  gamification: boolean;
  progressTrack: boolean;
  downloads: boolean;
  comments: boolean;
  active: boolean;
};

export type UpdateAreaBody = Omit<CreateAreaBody, 'productId'> & {
  productId: string | null;
};

const normalizeOptional = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const buildAreaBaseBody = (form: AreaFormInput) => ({
  name: form.name.trim(),
  slug: normalizeOptional(form.slug),
  description: normalizeOptional(form.description),
  type: form.type,
  template: form.template,
  logoUrl: normalizeOptional(form.logoUrl),
  coverUrl: normalizeOptional(form.coverUrl),
  primaryColor: form.primaryColor,
  certificates: form.certificates,
  quizzes: form.quizzes,
  community: form.community,
  gamification: form.gamification,
  progressTrack: form.progressTrack,
  downloads: form.downloads,
  comments: form.comments,
  active: form.active,
});

/**
 * Build the POST body for creating a member area. The productId defaults to
 * `undefined` so it is stripped from the JSON payload when empty.
 */
export const buildCreateAreaBody = (form: AreaFormInput): CreateAreaBody => ({
  ...buildAreaBaseBody(form),
  productId: form.productId || undefined,
});

/**
 * Build the PUT body for updating a member area. Uses `null` (not
 * `undefined`) so the caller can explicitly clear the product association.
 */
export const buildUpdateAreaBody = (form: AreaFormInput): UpdateAreaBody => ({
  ...buildAreaBaseBody(form),
  productId: form.productId || null,
});
