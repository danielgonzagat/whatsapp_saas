import { LegalDocumentPage } from '@/components/legal/legal-document-page';
import { buildLegalMetadata } from '@/lib/legal-constants';
import { getDataDeletionDocument } from '@/lib/legal-documents';

export const metadata = buildLegalMetadata({
  title: 'Exclusão de Dados | Kloel',
  description:
    'Como solicitar exclusão de dados na Kloel, inclusive por autoatendimento, Facebook e email, com prazos e retenções legais.',
  path: '/data-deletion',
  locale: 'pt_BR',
  alternateLanguagePath: '/data-deletion/en',
  alternateLanguageCode: 'en-US',
});

export default function DataDeletionPage() {
  return <LegalDocumentPage {...getDataDeletionDocument('pt')} />;
}
