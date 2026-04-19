import { LegalDocumentPage } from '@/components/legal/legal-document-page';
import { buildLegalMetadata } from '@/lib/legal-constants';
import { getTermsDocument } from '@/lib/legal-documents';

export const metadata = buildLegalMetadata({
  title: 'Termos de Serviço | Kloel',
  description:
    'Regras contratuais de uso da Kloel, incluindo elegibilidade, cobrança, uso aceitável, integrações de terceiros e foro aplicável.',
  path: '/terms',
  locale: 'pt_BR',
  alternateLanguagePath: '/terms/en',
  alternateLanguageCode: 'en-US',
});

export default function TermsPage() {
  return <LegalDocumentPage {...getTermsDocument('pt')} />;
}
