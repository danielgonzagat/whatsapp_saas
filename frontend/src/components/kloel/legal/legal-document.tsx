import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { legalConstants } from '@/lib/legal-constants';
import type React from 'react';

type TocItem = {
  id: string;
  label: string;
};

type LegalDocumentProps = {
  title: string;
  description: string;
  lastUpdatedLabel: string;
  alternateHref: string;
  alternateLabel: string;
  toc: TocItem[];
  schemaType: 'PrivacyPolicy' | 'TermsOfService' | 'WebPage';
  path: string;
  inLanguage: 'pt-BR' | 'en-US';
  children: React.ReactNode;
};

const sora = "var(--font-sora), 'Sora', sans-serif";
const mono = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/** Legal document. */
export function LegalDocument({
  title,
  description,
  lastUpdatedLabel,
  alternateHref,
  alternateLabel,
  toc,
  schemaType,
  path,
  inLanguage,
  children,
}: LegalDocumentProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: title,
    description,
    url: `${legalConstants.siteUrl}${path}`,
    inLanguage,
    dateModified: legalConstants.lastUpdated,
    publisher: {
      '@type': 'Organization',
      name: legalConstants.company.legalName,
      email: legalConstants.company.emailDpo,
      url: legalConstants.urls.home,
    },
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        color: colors.text.primary,
        padding: '48px 20px 72px',
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
        }}
      >
        <header style={{ marginBottom: 28 }}>
          <p
            style={{
              margin: 0,
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: colors.ember.primary,
            }}
          >
            
            {kloelT(`Kloel Compliance`)}
          </p>
          <h1
            style={{
              margin: '14px 0 10px',
              fontFamily: sora,
              fontSize: 32,
              lineHeight: 1.15,
              fontWeight: 500,
              color: colors.text.primary,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: sora,
              fontSize: 16,
              lineHeight: 1.7,
              color: colors.text.secondary,
            }}
          >
            {description}
          </p>
          <p
            style={{
              margin: '14px 0 0',
              fontFamily: sora,
              fontSize: 14,
              lineHeight: 1.7,
              color: colors.text.secondary,
            }}
          >
            
            {kloelT(`Última atualização:`)} {lastUpdatedLabel}
          </p>
        </header>

        <nav
          aria-label="Table of contents"
          style={{
            position: 'sticky',
            top: 16,
            zIndex: 10,
            marginBottom: 28,
            padding: '16px 18px',
            border: `1px solid ${colors.background.border}`,
            borderRadius: 6,
            background: colors.background.surface,
          }}
        >
          <p
            style={{
              margin: '0 0 12px',
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: colors.text.secondary,
            }}
          >
            
            {kloelT(`Índice`)}
          </p>
          <div
            style={{
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                style={{
                  color: colors.text.primary,
                  textDecoration: 'none',
                  fontFamily: sora,
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <article
          style={{
            display: 'grid',
            gap: 24,
            fontFamily: sora,
            fontSize: 16,
            lineHeight: 1.7,
            color: colors.text.primary,
          }}
        >
          {children}
        </article>

        <footer
          style={{
            marginTop: 40,
            paddingTop: 20,
            borderTop: `1px solid ${colors.background.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            fontFamily: sora,
            fontSize: 14,
            color: colors.text.secondary,
          }}
        >
          <span>{legalConstants.company.legalName}</span>
          <a
            href={alternateHref}
            style={{
              color: colors.ember.primary,
              textDecoration: 'none',
            }}
          >
            {alternateLabel}
          </a>
        </footer>
      </div>
    </main>
  );
}

/** Legal section. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 96 }}>
      <h2
        style={{
          margin: '0 0 12px',
          fontFamily: sora,
          fontSize: 20,
          lineHeight: 1.3,
          fontWeight: 500,
          color: colors.text.primary,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          display: 'grid',
          gap: 12,
          color: colors.text.secondary,
        }}
      >
        {children}
      </div>
    </section>
  );
}

/** Legal table. */
export function LegalTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReadonlyArray<ReadonlyArray<string>>;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          minWidth: 560,
          border: `1px solid ${colors.background.border}`,
        }}
      >
        <thead style={{ background: colors.background.surface }}>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                style={{
                  padding: '12px 14px',
                  borderBottom: `1px solid ${colors.background.border}`,
                  textAlign: 'left',
                  fontFamily: sora,
                  fontSize: 14,
                  lineHeight: 1.6,
                  fontWeight: 500,
                  color: colors.text.primary,
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${row[0]}-${cellIndex}`}
                  style={{
                    padding: '12px 14px',
                    borderTop: index === 0 ? 'none' : `1px solid ${colors.background.border}`,
                    verticalAlign: 'top',
                    fontFamily: sora,
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: colors.text.secondary,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Legal list. */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
