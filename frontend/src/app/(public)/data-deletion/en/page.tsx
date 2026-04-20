import { kloelT } from '@/lib/i18n/t';
import { LegalDocument, LegalList, LegalSection } from '@/components/kloel/legal/legal-document';
import { buildLegalMetadata, formatLastUpdated, legalConstants } from '@/lib/legal-constants';

/** Metadata. */
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

/** Data deletion page en. */
export default function DataDeletionPageEn() {
  return (
    <LegalDocument
      title={kloelT(`Data Deletion`)}
      description={kloelT(`Kloel offers multiple channels for personal data deletion and integration revocation. This page explains the process, expected timeline, and legally required retention.`)}
      lastUpdatedLabel={formatLastUpdated(legalConstants.lastUpdated, 'en-US')}
      alternateHref="/data-deletion"
      alternateLabel={kloelT(`Portuguese version`)}
      toc={toc}
      schemaType={kloelT(`WebPage`)}
      path="/data-deletion/en"
      inLanguage={kloelT(`en-US`)}
    >
      <LegalSection id="how-it-works" title={kloelT(`1. How deletion works`)}>
        <p>
          
          {kloelT(`Once we receive a valid deletion request, we create an internal record, revoke sessions
          and integrations, anonymize or delete non-required operational data, and retain only the
          minimum data required for legal, tax, antifraud, and security obligations.`)}
        </p>
        <p>{kloelT(`The target execution window is up to 30 days after request validation.`)}</p>
      </LegalSection>
      <LegalSection id="self-service" title={kloelT(`2. Self-service inside Kloel`)}>
        <p>
          
          {kloelT(`When enabled for your account, you may request deletion at`)}{' '}
          <strong>{kloelT(`app.kloel.com → Settings → Privacy → Delete account`)}</strong>.
        </p>
      </LegalSection>
      <LegalSection id="facebook" title={kloelT(`3. Facebook/Meta deletion flow`)}>
        <p>
          
          {kloelT(`If you used Facebook authentication or connected Meta assets, removing Kloel from your
          connected Facebook apps may trigger our deletion callback at`)}{' '}
          <strong>{legalConstants.urls.facebookDeletion}</strong>.
        </p>
        <p>
          
          {kloelT(`After the signed callback is received, Kloel creates a deletion request, generates a
          confirmation code, and exposes progress at`)}{' '}
          <strong>/data-deletion/status/{'{code}'}</strong>.
        </p>
      </LegalSection>
      <LegalSection id="email" title={kloelT(`4. Email request`)}>
        <p>
          
          {kloelT(`You may also email`)} <strong>{legalConstants.company.emailDpo}</strong>  {kloelT(`with the subject`)}{' '}
          <strong>{kloelT(`&quot;Data deletion request&quot;`)}</strong>.
        </p>
      </LegalSection>
      <LegalSection id="retained" title={kloelT(`5. What is deleted and what may be retained`)}>
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
