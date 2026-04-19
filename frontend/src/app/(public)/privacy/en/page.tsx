import { LegalDocumentPage } from '@/components/legal/legal-document-page';
import { buildLegalMetadata } from '@/lib/legal-constants';
import { getPrivacyDocument } from '@/lib/legal-documents';

export const metadata = buildLegalMetadata({
  title: 'Privacy Policy | Kloel',
  description:
    'How Kloel collects, uses, shares, retains, and protects personal data under LGPD, GDPR, CCPA, the Google API Services User Data Policy, and the Meta Platform Terms.',
  path: '/privacy/en',
  locale: 'en_US',
  alternateLanguagePath: '/privacy',
  alternateLanguageCode: 'pt-BR',
});

export default function PrivacyPageEn() {
  return <LegalDocumentPage {...getPrivacyDocument('en')} />;
}
