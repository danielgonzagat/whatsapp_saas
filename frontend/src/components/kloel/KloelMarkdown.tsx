'use client';

import { sanitizeAssistantVisibleContent } from '@/lib/kloel-message-ui';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import type { HTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

const HTTPS_RE = /^https?:\/\//i;

const TEXT = KLOEL_THEME.textPrimary;
const MUTED = KLOEL_THEME.textSecondary;
const BORDER = KLOEL_THEME.borderPrimary;
const SUBTLE = KLOEL_THEME.bgSecondary;
const CODE_BG = KLOEL_THEME.bgSecondary;
const EMBER = KLOEL_THEME.accent;
const FONT = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";

/** Kloel markdown. */
export function KloelMarkdown({ content }: { content: string }) {
  const sanitizedContent = sanitizeAssistantVisibleContent(String(content || ''));

  return (
    <div
      className="kloel-markdown"
      style={{
        fontSize: 14.5,
        lineHeight: 1.68,
        color: TEXT,
        fontFamily: FONT,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: KLOEL_THEME.textPrimary,
                margin: '16px 0 8px',
                letterSpacing: 0,
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: 14.5,
                fontWeight: 600,
                color: KLOEL_THEME.textPrimary,
                margin: '14px 0 7px',
                letterSpacing: 0,
              }}
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p
              style={{
                margin: '8px 0',
                color: TEXT,
                lineHeight: 1.68,
              }}
            >
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong style={{ color: KLOEL_THEME.textPrimary, fontWeight: 600 }}>{children}</strong>
          ),
          a: ({ href, children }) => {
            const external = typeof href === 'string' && HTTPS_RE.test(href);
            return (
              <a
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                style={{
                  color: EMBER,
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                {children}
              </a>
            );
          },
          ul: ({ children }) => (
            <ul style={{ margin: '8px 0 8px 17px', padding: 0, color: TEXT }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: '8px 0 8px 17px', padding: 0, color: TEXT }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: '5px 0', lineHeight: 1.62 }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: '16px 0',
                padding: '10px 14px',
                borderLeft: `3px solid ${KLOEL_THEME.accent}`,
                borderRadius: '0 6px 6px 0',
                background: SUBTLE,
                color: KLOEL_THEME.textPrimary,
              }}
            >
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr
              style={{
                border: 'none',
                borderTop: `1px solid ${BORDER}`,
                margin: '22px 0',
              }}
            />
          ),
          code: ({ className, children, ...props }: HTMLAttributes<HTMLElement>) => {
            const inline = !className;

            if (inline) {
              return (
                <code
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    background: CODE_BG,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    padding: '2px 6px',
                    color: KLOEL_THEME.textPrimary,
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <code
                className={className}
                style={{
                  display: 'block',
                  fontFamily: MONO,
                  fontSize: 13,
                  whiteSpace: 'pre',
                }}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              style={{
                margin: '14px 0',
                padding: '14px 16px',
                background: KLOEL_THEME.bgSecondary,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                overflowX: 'auto',
                color: KLOEL_THEME.textPrimary,
              }}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div
              style={{
                margin: '16px 0',
                overflowX: 'auto',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
              }}
            >
              <table
                style={{
                  width: '100%',
                  minWidth: 420,
                  borderCollapse: 'collapse',
                  fontSize: 13,
                }}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ background: KLOEL_THEME.bgSecondary }}>{children}</thead>
          ),
          th: ({ children }) => (
            <th
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderBottom: `1px solid ${BORDER}`,
                color: MUTED,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontFamily: MONO,
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: '10px 12px',
                borderBottom: `1px solid ${BORDER}`,
                verticalAlign: 'top',
              }}
            >
              {children}
            </td>
          ),
        }}
      >
        {sanitizedContent}
      </ReactMarkdown>
    </div>
  );
}
