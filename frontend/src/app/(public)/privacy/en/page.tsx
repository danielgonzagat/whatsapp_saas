import { kloelT } from '@/lib/i18n/t';
import {
  LegalDocument,
  LegalList,
  LegalSection,
  LegalTable,
} from '@/components/kloel/legal/legal-document';
import {
  buildLegalMetadata,
  formatLastUpdated,
  legalConstants,
  legalContentTables,
} from '@/lib/legal-constants';

/** Metadata. */
export const metadata = buildLegalMetadata({
  title: 'Privacy Policy | Kloel',
  description:
    'Privacy Policy of Kloel Tecnologia LTDA covering LGPD, GDPR, CCPA, Google API Services User Data Policy, and Meta Platform Terms.',
  path: '/privacy/en',
  locale: 'en_US',
});

const toc = [
  { id: 'who-we-are', label: '1. Who we are' },
  { id: 'data-we-collect', label: '2. Data we collect' },
  { id: 'purposes-bases', label: '3. Purposes and legal bases' },
  { id: 'sharing', label: '4. Sharing with third parties' },
  { id: 'cookies', label: '5. Cookies' },
  { id: 'retention', label: '6. Retention' },
  { id: 'security', label: '7. Security' },
  { id: 'rights', label: '8. Data subject rights' },
  { id: 'transfers', label: '9. International transfers' },
  { id: 'children', label: '10. Children' },
  { id: 'changes', label: '11. Changes to this policy' },
  { id: 'contact', label: '12. Contact and supervisory channels' },
  { id: 'google-use', label: '13. Google information use' },
  { id: 'meta-use', label: '14. Meta information use' },
];

/** Privacy page en. */
export default function PrivacyPageEn() {
  const company = legalConstants.company;

  return (
    <LegalDocument
      title={kloelT(`Privacy Policy`)}
      description={kloelT(
        `This document explains how Kloel Tecnologia LTDA collects, uses, shares, protects, and deletes personal data related to account holders, buyers, leads, and visitors using our services.`,
      )}
      lastUpdatedLabel={formatLastUpdated(legalConstants.lastUpdated, 'en-US')}
      alternateHref="/privacy"
      alternateLabel={kloelT(`Portuguese version`)}
      toc={toc}
      schemaType={kloelT(`PrivacyPolicy`)}
      path="/privacy/en"
      inLanguage={kloelT(`en-US`)}
    >
      <LegalSection id="who-we-are" title={kloelT(`1. Who we are`)}>
        <p>
          {kloelT(`The data controller for the personal data covered by this policy is`)}{' '}
          <strong>{company.legalName}</strong>
          {kloelT(`, trade name`)} <strong>{company.tradeName}</strong>
          {kloelT(`,
          registered under Brazilian CNPJ`)}{' '}
          <strong>{company.cnpj}</strong>
          {kloelT(`, located at`)} {company.addressLine1}, {company.addressLine2}.
        </p>
        <p>
          {kloelT(`Our primary privacy contact is`)} <strong>{company.emailDpo}</strong>
          {kloelT(`. Operational support
          requests may be sent to`)}{' '}
          <strong>{company.emailSupport}</strong>.
        </p>
      </LegalSection>

      <LegalSection id="data-we-collect" title={kloelT(`2. Data we collect`)}>
        <p>
          {kloelT(`We collect data directly from users, automatically through our sites and apps, and from
          approved integrations.`)}
        </p>
        <LegalList
          items={[
            'Directly provided data: account details, billing information, support content, checkout details, and workspace configuration.',
            'Automatically collected data: cookies, logs, IP address, session metadata, antifraud events, and performance telemetry.',
            'Google OAuth data: name, email, profile photo, language preference, and account identifier via openid, email, and profile. Optional phone/address scopes are only requested through a separate gated flow and explicit consent.',
            'Meta/Facebook OAuth data: name, email, profile image, user identifier, and business asset metadata when the customer connects official Meta channels.',
            'Apple Sign in data: name and email when Apple login is enabled.',
            'End-customer data processed for our customers: leads, conversations, tags, order context, funnel events, and campaign data, where Kloel typically acts as processor/operator.',
          ]}
        />
      </LegalSection>

      <LegalSection id="purposes-bases" title={kloelT(`3. Purposes and legal bases`)}>
        <LegalTable
          headers={['Processing activity', 'Purpose', 'Legal basis']}
          rows={legalContentTables.legalBases}
        />
      </LegalSection>

      <LegalSection id="sharing" title={kloelT(`4. Sharing with third parties`)}>
        <LegalTable
          headers={['Third party', 'Purpose', 'Region', 'Transfer basis']}
          rows={legalContentTables.thirdParties}
        />
        <p>
          {kloelT(`We do not sell personal data. We only share personal data with service providers,
          regulated payment processors, and public authorities when lawfully required.`)}
        </p>
      </LegalSection>

      <LegalSection id="cookies" title={kloelT(`5. Cookies`)}>
        <p>
          {kloelT(`We use essential cookies for session continuity, security, fraud prevention, and user
          preferences. Optional analytics and marketing cookies depend on configuration and, where
          applicable, consent. See`)}{' '}
          <a href={legalConstants.urls.cookies}>/cookies</a>.
        </p>
      </LegalSection>

      <LegalSection id="retention" title={kloelT(`6. Retention`)}>
        <LegalTable
          headers={['Category', 'Retention period', 'Reason']}
          rows={legalContentTables.retention}
        />
      </LegalSection>

      <LegalSection id="security" title={kloelT(`7. Security`)}>
        <LegalList
          items={[
            'TLS in transit and encryption at rest for databases, backups, and secrets.',
            'Least-privilege access, audit trails, rate limiting, and incident response procedures.',
            'Optional 2FA and session/token revocation flows for compromised accounts or revoked integrations.',
          ]}
        />
      </LegalSection>

      <LegalSection id="rights" title={kloelT(`8. Data subject rights`)}>
        <p>
          {kloelT(`You may request access, correction, deletion, portability, restriction, revocation of
          consent, and additional information on sharing, subject to the applicable law. We aim to
          respond within 15 days unless a different legal timeline applies.`)}
        </p>
      </LegalSection>

      <LegalSection id="transfers" title={kloelT(`9. International transfers`)}>
        <p>
          {kloelT(`Some of our infrastructure and subprocessors are located outside Brazil. We rely on
          contractual and organizational safeguards, including standard contractual clauses where
          appropriate.`)}
        </p>
      </LegalSection>

      <LegalSection id="children" title={kloelT(`10. Children`)}>
        <p>
          {kloelT(`Kloel is not directed to children under 18. If we detect incompatible use, we may suspend
          the account and delete non-required data.`)}
        </p>
      </LegalSection>

      <LegalSection id="changes" title={kloelT(`11. Changes to this policy`)}>
        <p>
          {kloelT(`We may update this policy to reflect product, legal, security, or infrastructure changes.
          Material updates may be announced by email, in-product notice, or another reasonable
          channel.`)}
        </p>
      </LegalSection>

      <LegalSection id="contact" title={kloelT(`12. Contact and supervisory channels`)}>
        <p>
          {kloelT(`Privacy matters:`)} <strong>{company.emailDpo}</strong>
          {kloelT(`. Support matters:`)} <strong>{company.emailSupport}</strong>
          {kloelT(`. You may also contact the ANPD or your local
          supervisory authority if needed.`)}
        </p>
      </LegalSection>

      <LegalSection id="google-use" title={kloelT(`13. Google information use`)}>
        <p>
          {kloelT(`Kloel&apos;s use and transfer of information received from Google APIs will adhere to the
          Google API Services User Data Policy, including the Limited Use requirements.`)}
        </p>
        <LegalTable
          headers={['Scope', 'Data accessed', 'Purpose', 'Storage']}
          rows={legalContentTables.googleScopes}
        />
        <p>
          {kloelT(`We do not use Google API data to train AI models, we do not sell Google API data, and we
          do not allow human access except with explicit consent, for security/operations, or when
          legally required.`)}
        </p>
      </LegalSection>

      <LegalSection id="meta-use" title={kloelT(`14. Meta information use`)}>
        <LegalTable headers={['Permission', 'Purpose']} rows={legalContentTables.metaPermissions} />
        <p>
          {kloelT(`Meta data is retained only for as long as necessary to operate the service. Users may
          revoke access in Facebook settings or through`)}{' '}
          <a href={legalConstants.urls.dataDeletionEn}>{legalConstants.urls.dataDeletionEn}</a>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
