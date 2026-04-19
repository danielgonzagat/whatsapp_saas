import { LegalDocumentPage } from '@/components/legal/legal-document-page';
import { buildLegalMetadata } from '@/lib/legal-constants';
import { getPrivacyDocument } from '@/lib/legal-documents';

export const metadata = buildLegalMetadata({
  title: 'Política de Privacidade | Kloel',
  description:
    'Como a Kloel coleta, usa, compartilha, retém e protege dados pessoais em conformidade com LGPD, GDPR, CCPA, Google API Services User Data Policy e Meta Platform Terms.',
  path: '/privacy',
  locale: 'pt_BR',
  alternateLanguagePath: '/privacy/en',
  alternateLanguageCode: 'en-US',
});

export default function PrivacyPage() {
  return <LegalDocumentPage {...getPrivacyDocument('pt')} />;
}
