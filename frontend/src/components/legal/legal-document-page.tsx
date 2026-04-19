import { colors, radius } from '@/lib/design-tokens';
import Link from 'next/link';
import type { ReactNode } from 'react';

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalDocumentPageProps = {
  title: string;
  description: string;
  eyebrow: string;
  languageLabel: string;
  lastUpdatedLabel: string;
  lastUpdatedValue: string;
  sections: LegalSection[];
  versionHref: string;
  versionLabel: string;
  structuredData: Record<string, unknown>;
};

const styles = {
  page: {
    minHeight: '100vh',
    background: colors.background.void,
    color: colors.text.silver,
    padding: '40px 20px 72px',
  },
  shell: {
    width: '100%',
    maxWidth: '720px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  eyebrow: {
    fontSize: '12px',
    lineHeight: '1.4',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: colors.text.dim,
    margin: 0,
  },
  title: {
    margin: 0,
    fontSize: '32px',
    lineHeight: '1.15',
    fontWeight: 500,
    color: colors.text.silver,
  },
  description: {
    margin: 0,
    fontSize: '16px',
    lineHeight: 1.7,
    fontWeight: 400,
    color: colors.text.muted,
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '12px',
    alignItems: 'center',
  },
  metaChip: {
    border: `1px solid ${colors.border.space}`,
    background: colors.background.surface,
    color: colors.text.muted,
    borderRadius: radius.md,
    padding: '8px 12px',
    fontSize: '12px',
    lineHeight: 1.4,
  },
  toc: {
    position: 'sticky' as const,
    top: '24px',
    zIndex: 2,
    border: `1px solid ${colors.border.space}`,
    background: colors.background.surface,
    borderRadius: radius.lg,
    padding: '18px 18px 16px',
  },
  tocTitle: {
    margin: '0 0 10px',
    fontSize: '13px',
    lineHeight: 1.4,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colors.text.dim,
  },
  tocList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'grid',
    gap: '8px',
  },
  article: {
    display: 'grid',
    gap: '24px',
  },
  section: {
    border: `1px solid ${colors.border.void}`,
    background: colors.background.surface,
    borderRadius: radius.lg,
    padding: '24px',
    scrollMarginTop: '120px',
  },
  heading: {
    margin: '0 0 14px',
    fontSize: '20px',
    lineHeight: '1.3',
    fontWeight: 500,
    color: colors.text.silver,
  },
  paragraph: {
    margin: '0 0 14px',
    fontSize: '16px',
    lineHeight: 1.7,
    fontWeight: 400,
    color: colors.text.muted,
  },
  list: {
    margin: '0 0 14px',
    paddingLeft: '20px',
    color: colors.text.muted,
    fontSize: '16px',
    lineHeight: 1.7,
  },
  note: {
    border: `1px solid ${colors.border.space}`,
    background: colors.background.elevated,
    borderRadius: radius.md,
    padding: '16px',
    margin: '14px 0',
  },
  tableWrap: {
    width: '100%',
    overflowX: 'auto' as const,
    margin: '16px 0',
    border: `1px solid ${colors.border.space}`,
    borderRadius: radius.md,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    minWidth: '580px',
  },
  th: {
    textAlign: 'left' as const,
    fontSize: '13px',
    lineHeight: 1.5,
    fontWeight: 500,
    color: colors.text.silver,
    background: colors.background.elevated,
    padding: '12px 14px',
    borderBottom: `1px solid ${colors.border.space}`,
  },
  td: {
    verticalAlign: 'top' as const,
    fontSize: '15px',
    lineHeight: 1.65,
    color: colors.text.muted,
    padding: '12px 14px',
    borderBottom: `1px solid ${colors.border.void}`,
  },
  footer: {
    borderTop: `1px solid ${colors.border.void}`,
    paddingTop: '20px',
    fontSize: '14px',
    lineHeight: 1.6,
    color: colors.text.muted,
  },
} as const;

export function LegalDocumentPage({
  title,
  description,
  eyebrow,
  languageLabel,
  lastUpdatedLabel,
  lastUpdatedValue,
  sections,
  versionHref,
  versionLabel,
  structuredData,
}: LegalDocumentPageProps) {
  return (
    <main style={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <style>{`
        .legal-link {
          color: ${colors.ember.primary};
          text-decoration: none;
        }
        .legal-link:hover {
          text-decoration: underline;
        }
      `}</style>
      <div style={styles.shell}>
        <header style={{ display: 'grid', gap: '12px' }}>
          <p style={styles.eyebrow}>{eyebrow}</p>
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.description}>{description}</p>
          <div style={styles.metaRow}>
            <span style={styles.metaChip}>
              {lastUpdatedLabel}: {lastUpdatedValue}
            </span>
            <span style={styles.metaChip}>{languageLabel}</span>
          </div>
        </header>

        <nav aria-label="Table of contents" style={styles.toc}>
          <p style={styles.tocTitle}>Table of contents</p>
          <ol style={styles.tocList}>
            {sections.map((section) => (
              <li key={section.id}>
                <a className="legal-link" href={`#${section.id}`}>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article style={styles.article}>
          {sections.map((section) => (
            <section key={section.id} id={section.id} style={styles.section}>
              <h2 style={styles.heading}>{section.title}</h2>
              {section.content}
            </section>
          ))}
        </article>

        <footer style={styles.footer}>
          <Link href={versionHref} className="legal-link">
            {versionLabel}
          </Link>
        </footer>
      </div>
    </main>
  );
}

export function LegalParagraph({ children }: { children: ReactNode }) {
  return <p style={styles.paragraph}>{children}</p>;
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul style={styles.list}>
      {items.map((item, index) => (
        <li key={index} style={{ marginBottom: '8px' }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function LegalNote({ children }: { children: ReactNode }) {
  return <div style={styles.note}>{children}</div>;
}

export function LegalTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} style={styles.th}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={styles.td}>
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

export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const isExternal = /^https?:\/\//i.test(href);

  if (isExternal) {
    return (
      <a className="legal-link" href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }

  return (
    <Link className="legal-link" href={href}>
      {children}
    </Link>
  );
}
