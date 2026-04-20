import { kloelT } from '@/lib/i18n/t';
import { LegalDocument, LegalList, LegalSection } from '@/components/kloel/legal/legal-document';
import { buildLegalMetadata, formatLastUpdated, legalConstants } from '@/lib/legal-constants';

/** Metadata. */
export const metadata = buildLegalMetadata({
  title: 'Terms of Service | Kloel',
  description:
    'Terms of Service governing the use of Kloel, including SaaS access, official Meta integrations, AI-assisted workflows, and checkouts.',
  path: '/terms/en',
  locale: 'en_US',
});

const toc = [
  { id: 'acceptance', label: '1. Acceptance' },
  { id: 'service', label: '2. Service description' },
  { id: 'eligibility', label: '3. Eligibility' },
  { id: 'account-security', label: '4. Account and security' },
  { id: 'billing', label: '5. Plans, billing, cancellation, refunds' },
  { id: 'acceptable-use', label: '6. Acceptable use' },
  { id: 'user-content', label: '7. User content' },
  { id: 'ip', label: '8. Intellectual property' },
  { id: 'third-party', label: '9. Third-party APIs and services' },
  { id: 'liability', label: '10. Limitation of liability' },
  { id: 'indemnity', label: '11. Indemnity' },
  { id: 'changes', label: '12. Changes' },
  { id: 'termination', label: '13. Termination' },
  { id: 'law', label: '14. Governing law and venue' },
  { id: 'contact', label: '15. Contact' },
];

/** Terms page en. */
export default function TermsPageEn() {
  return (
    <LegalDocument
      title={kloelT(`Terms of Service`)}
      description={kloelT(
        `These Terms govern the use of Kloel, including authentication, official Meta channels, AI-assisted workflows, campaigns, unified inbox, and checkout experiences.`,
      )}
      lastUpdatedLabel={formatLastUpdated(legalConstants.lastUpdated, 'en-US')}
      alternateHref="/terms"
      alternateLabel={kloelT(`Portuguese version`)}
      toc={toc}
      schemaType={kloelT(`TermsOfService`)}
      path="/terms/en"
      inLanguage={kloelT(`en-US`)}
    >
      <LegalSection id="acceptance" title={kloelT(`1. Acceptance`)}>
        <p>
          {kloelT(`By using Kloel, you agree to these Terms of Service and our Privacy Policy. If you use
          Kloel on behalf of an entity, you represent that you have authority to bind that entity.`)}
        </p>
      </LegalSection>
      <LegalSection id="service" title={kloelT(`2. Service description`)}>
        <p>
          {kloelT(`Kloel is a SaaS platform for commercial automation, official channel operations, checkout
          acceleration, and AI-assisted marketing workflows.`)}
        </p>
      </LegalSection>
      <LegalSection id="eligibility" title={kloelT(`3. Eligibility`)}>
        <p>
          {kloelT(`Users must be at least 18 years old and legally capable, or be duly authorized
          representatives of an entity.`)}
        </p>
      </LegalSection>
      <LegalSection id="account-security" title={kloelT(`4. Account and security`)}>
        <p>
          {kloelT(`You are responsible for safeguarding your credentials and for all activity under your
          account. Kloel may suspend access when fraud, abuse, or account compromise is suspected.`)}
        </p>
      </LegalSection>
      <LegalSection id="billing" title={kloelT(`5. Plans, billing, cancellation, refunds`)}>
        <p>
          {kloelT(`Paid plans may be billed on a recurring or one-time basis depending on the selected offer.
          Cancellation stops future renewals but does not undo accrued charges or legally required
          retention.`)}
        </p>
      </LegalSection>
      <LegalSection id="acceptable-use" title={kloelT(`6. Acceptable use`)}>
        <LegalList
          items={[
            'No spam, unlawful outreach, abusive automation, phishing, or fraud.',
            'No copyright infringement, unauthorized scraping, reverse engineering, or bypass of technical restrictions.',
            'No prohibited content or messaging that violates WhatsApp Commerce Policy, Meta Platform Terms, or other partner rules.',
          ]}
        />
      </LegalSection>
      <LegalSection id="user-content" title={kloelT(`7. User content`)}>
        <p>
          {kloelT(`You retain ownership of the content you submit. You grant Kloel a limited license to host,
          process, transmit, and display that content solely to operate, secure, support, and
          improve the service.`)}
        </p>
      </LegalSection>
      <LegalSection id="ip" title={kloelT(`8. Intellectual property`)}>
        <p>
          {kloelT(`Kloel and its proprietary software, interfaces, branding, and documentation remain the
          property of Kloel Tecnologia LTDA or its licensors.`)}
        </p>
      </LegalSection>
      <LegalSection id="third-party" title={kloelT(`9. Third-party APIs and services`)}>
        <p>
          {kloelT(`Features involving Meta, Google, OpenAI, Anthropic, Stripe, Asaas, and other third parties
          are also subject to those providers&apos; terms, policies, scope limitations, and platform
          requirements.`)}
        </p>
      </LegalSection>
      <LegalSection id="liability" title={kloelT(`10. Limitation of liability`)}>
        <p>
          {kloelT(`To the extent permitted by law, Kloel is not liable for indirect, incidental,
          consequential, or platform-dependent damages, including outages or restrictions imposed by
          third-party providers.`)}
        </p>
      </LegalSection>
      <LegalSection id="indemnity" title={kloelT(`11. Indemnity`)}>
        <p>
          {kloelT(`You agree to indemnify Kloel against claims arising from misuse of the service, illegal
          messaging, policy violations, fraud, or breach of these Terms.`)}
        </p>
      </LegalSection>
      <LegalSection id="changes" title={kloelT(`12. Changes`)}>
        <p>
          {kloelT(`We may update these Terms from time to time and will provide notice of material changes
          when reasonably practicable.`)}
        </p>
      </LegalSection>
      <LegalSection id="termination" title={kloelT(`13. Termination`)}>
        <p>
          {kloelT(`You may stop using the service at any time. Kloel may suspend or terminate accounts that
          violate these Terms, create risk, or fail to pay amounts due.`)}
        </p>
      </LegalSection>
      <LegalSection id="law" title={kloelT(`14. Governing law and venue`)}>
        <p>
          {kloelT(`These Terms are governed by Brazilian law, with venue in the courts of Goiânia, Goiás,
          Brazil.`)}
        </p>
      </LegalSection>
      <LegalSection id="contact" title={kloelT(`15. Contact`)}>
        <p>
          {kloelT(`Operational contact:`)} <strong>{legalConstants.company.emailSupport}</strong>
          {kloelT(`. Privacy
          matters:`)}{' '}
          <strong>{legalConstants.company.emailDpo}</strong>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
