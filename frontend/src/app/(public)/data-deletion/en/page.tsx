import { LegalDocument, LegalList, LegalSection } from '@/components/kloel/legal/legal-document';
import { buildLegalMetadata, formatLastUpdated, legalConstants } from '@/lib/legal-constants';

export const metadata = buildLegalMetadata({
  title: 'Data Deletion | Kloel',
  description:
    'How to request data deletion from Kloel, including self-service, Facebook/Meta callback flow, and email-based requests.',
  path: '/data-deletion/en',
  locale: 'en_US',
});

const toc = [
  { id: 'how-it-works', label: '1. How deletion works' },
  { id: 'self-service', label: '2. Self-service inside Kloel' },
  { id: 'facebook', label: '3. Facebook/Meta deletion flow' },
  { id: 'email', label: '4. Email request' },
  { id: 'retained', label: '5. What is deleted and what may be retained' },
];

export default function DataDeletionPageEn() {
  return (
    <LegalDocument
      title="Data Deletion"
      description="Kloel offers multiple channels for personal data deletion and integration revocation. This page explains the process, expected timeline, and legally required retention."
      lastUpdatedLabel={formatLastUpdated(legalConstants.lastUpdated, 'en-US')}
      alternateHref="/data-deletion"
      alternateLabel="Portuguese version"
      toc={toc}
      schemaType="WebPage"
      path="/data-deletion/en"
      inLanguage="en-US"
    >
      <LegalSection id="how-it-works" title="1. How deletion works">
        <p>
          Once we receive a valid deletion request, we create an internal record, revoke sessions
          and integrations, anonymize or delete non-required operational data, and retain only the
          minimum data required for legal, tax, antifraud, and security obligations.
        </p>
        <p>The target execution window is up to 30 days after request validation.</p>
      </LegalSection>
      <LegalSection id="self-service" title="2. Self-service inside Kloel">
        <p>
          When enabled for your account, you may request deletion at{' '}
          <strong>app.kloel.com → Settings → Privacy → Delete account</strong>.
        </p>
      </LegalSection>
      <LegalSection id="facebook" title="3. Facebook/Meta deletion flow">
        <p>
          If you used Facebook authentication or connected Meta assets, removing Kloel from your
          connected Facebook apps may trigger our deletion callback at{' '}
          <strong>{legalConstants.urls.facebookDeletion}</strong>.
        </p>
        <p>
          After the signed callback is received, Kloel creates a deletion request, generates a
          confirmation code, and exposes progress at{' '}
          <strong>/data-deletion/status/{'{code}'}</strong>.
        </p>
      </LegalSection>
      <LegalSection id="email" title="4. Email request">
        <p>
          You may also email <strong>{legalConstants.company.emailDpo}</strong> with the subject{' '}
          <strong>&quot;Data deletion request&quot;</strong>.
        </p>
      </LegalSection>
      <LegalSection id="retained" title="5. What is deleted and what may be retained">
        <LegalList
          items={[
            'Profile data, integration tokens, sessions, and non-required operational data are deleted or anonymized.',
            'Invoices, tax records, payment evidence, and security logs may be retained for the legally required period.',
            'Where Kloel acts as processor for a customer workspace, full deletion of end-customer data may also depend on controller instructions.',
          ]}
        />
      </LegalSection>
    </LegalDocument>
  );
}
