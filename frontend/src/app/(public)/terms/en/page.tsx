import { LegalDocumentPage } from '@/components/legal/legal-document-page';
import { buildLegalMetadata } from '@/lib/legal-constants';
import { getTermsDocument } from '@/lib/legal-documents';

export const metadata = buildLegalMetadata({
  title: 'Terms of Service | Kloel',
  description:
    'Kloel contractual terms covering eligibility, billing, acceptable use, third-party integrations, and governing venue.',
  path: '/terms/en',
  locale: 'en_US',
  alternateLanguagePath: '/terms',
  alternateLanguageCode: 'pt-BR',
});

export default function TermsPageEn() {
  return <LegalDocumentPage {...getTermsDocument('en')} />;
}
