import { LegalDocumentPage } from '@/components/legal/legal-document-page';
import { buildLegalMetadata } from '@/lib/legal-constants';
import { getDataDeletionDocument } from '@/lib/legal-documents';

export const metadata = buildLegalMetadata({
  title: 'Data Deletion | Kloel',
  description:
    'How to request data deletion in Kloel through self-service, Facebook, or email, including timelines and legal retention.',
  path: '/data-deletion/en',
  locale: 'en_US',
  alternateLanguagePath: '/data-deletion',
  alternateLanguageCode: 'pt-BR',
});

export default function DataDeletionPageEn() {
  return <LegalDocumentPage {...getDataDeletionDocument('en')} />;
}
