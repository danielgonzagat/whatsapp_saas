import { BadRequestException } from '@nestjs/common';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Input shape for file validation — mirrors the Multer-like uploaded file used by KYC service. */
export interface KycUploadedFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

/** Options for validating a KYC file upload. */
export interface KycFileValidationOptions {
  maxSizeBytes: number;
  maxSizeLabel: string;
  allowedMimes: string[];
  allowedMimesLabel: string;
}

/** Input for deriveDisplayAccount — the subset of UpdateBankDto fields we need. */
export interface BankDtoPick {
  account?: string;
  pixKey?: string;
}

/** Input shapes for computeKycCompletion. Mirrors what getCompletion selects. */
export interface KycAgentProfile {
  name?: string | null;
  phone?: string | null;
  birthDate?: unknown;
}

export interface KycFiscalData {
  type?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  fullName?: string | null;
  razaoSocial?: string | null;
  cep?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface KycSection {
  name: string;
  complete: boolean;
  weight: number;
}

export interface KycCompletionResult {
  percentage: number;
  sections: Array<{ name: string; complete: boolean; percentage: number }>;
  canSubmit: boolean;
} // ─── Constants ──────────────────────────────────────────────────────────────

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_LABEL = '5MB';
const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_MIMES_LABEL = 'JPG, PNG, and WebP';

const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_LABEL = '10MB';
const DOCUMENT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const DOCUMENT_MIMES_LABEL = 'JPG, PNG, WebP, and PDF';

const ALLOWED_DOC_TYPES = new Set([
  'DOCUMENT_FRONT',
  'DOCUMENT_BACK',
  'PROOF_OF_ADDRESS',
  'COMPANY_DOCUMENT',
]); /**
 * Validates a KYC file upload — checks presence, size, and mime type.
 * Throws BadRequestException on any validation failure.
 */
export function validateKycUploadFile(
  file: KycUploadedFile | undefined | null,
  options: KycFileValidationOptions,
): void {
  if (!file) {
    throw new BadRequestException('No file provided');
  }
  if ((file.size ?? 0) > options.maxSizeBytes) {
    throw new BadRequestException(`File too large (max ${options.maxSizeLabel})`);
  }
  if (!options.allowedMimes.includes(file.mimetype ?? '')) {
    throw new BadRequestException(`Only ${options.allowedMimesLabel} files are allowed`);
  }
} /** Pre-configured avatar file validator. */
export function validateKycAvatarFile(file: KycUploadedFile | undefined | null): void {
  validateKycUploadFile(file, {
    maxSizeBytes: AVATAR_MAX_BYTES,
    maxSizeLabel: AVATAR_LABEL,
    allowedMimes: AVATAR_MIMES,
    allowedMimesLabel: AVATAR_MIMES_LABEL,
  });
} /** Pre-configured document file validator. */
export function validateKycDocumentFile(file: KycUploadedFile | undefined | null): void {
  validateKycUploadFile(file, {
    maxSizeBytes: DOCUMENT_MAX_BYTES,
    maxSizeLabel: DOCUMENT_LABEL,
    allowedMimes: DOCUMENT_MIMES,
    allowedMimesLabel: DOCUMENT_MIMES_LABEL,
  });
} /** Validates the KYC document type string. */
export function validateKycDocumentType(type: string): void {
  if (!ALLOWED_DOC_TYPES.has(type)) {
    const allowed = [...ALLOWED_DOC_TYPES].join(', ');
    throw new BadRequestException(`Invalid document type. Allowed: ${allowed}`);
  }
} /**
 * Generates a deterministic storage filename for KYC uploads.
 * Pattern: `kyc/{category}/{prefix}_{agentId}_{timestamp}.{ext}`
 */
export function generateStorageFilename(
  category: 'avatars' | 'documents',
  prefix: string,
  agentId: string,
  ext: string,
): string {
  return `kyc/${category}/${prefix}_${agentId}_${Date.now()}.${ext}`;
} /** Extracts the file extension from an original filename, defaulting to `jpg`. */
export function extractExtension(originalname?: string, fallback = 'jpg'): string {
  return originalname?.split('.').pop() || fallback;
} /**
 * Derives a display string for a bank account from the update DTO.
 * Returns last 4 digits and a masked display like `****1234`.
 */
export function deriveDisplayAccount(dto: BankDtoPick): {
  last4: string;
  displayAccount: string | null;
} {
  const last4 = dto.account?.slice(-4) || dto.pixKey?.slice(-4) || '';
  const displayAccount = last4 ? `****${last4}` : null;
  return { last4, displayAccount };
} /**
 * Computes KYC completion sections and percentage from the raw data.
 * Pure function — no database access, no side effects.
 */
export function computeKycCompletion(
  agent: KycAgentProfile | null,
  fiscal: KycFiscalData | null,
  documentTypes: Set<string>,
  hasBankAccount: boolean,
): KycCompletionResult {
  const sections: KycSection[] = [
    {
      name: 'profile',
      complete: !!(agent?.name && agent?.phone && agent?.birthDate),
      weight: 25,
    },
    {
      name: 'fiscal',
      complete: !!(
        fiscal?.type &&
        ((fiscal.type === 'PF' && fiscal.cpf && fiscal.fullName) ||
          (fiscal.type === 'PJ' && fiscal.cnpj && fiscal.razaoSocial)) &&
        fiscal.cep &&
        fiscal.city &&
        fiscal.state
      ),
      weight: 25,
    },
    {
      name: 'documents',
      complete:
        documentTypes.has('DOCUMENT_FRONT') &&
        (fiscal?.type === 'PJ'
          ? documentTypes.has('COMPANY_DOCUMENT')
          : documentTypes.has('PROOF_OF_ADDRESS')),
      weight: 25,
    },
    { name: 'bank', complete: hasBankAccount, weight: 25 },
  ];

  const percentage = sections.reduce((sum, s) => sum + (s.complete ? s.weight : 0), 0);

  return {
    percentage,
    sections: sections.map((s) => ({
      name: s.name,
      complete: s.complete,
      percentage: s.complete ? s.weight : 0,
    })),
    canSubmit: percentage >= 100,
  };
}
