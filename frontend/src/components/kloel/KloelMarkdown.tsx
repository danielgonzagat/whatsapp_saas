'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

const TEXT = '#E0DDD8';
const MUTED = '#A1A1AA';
const BORDER = 'rgba(255,255,255,0.08)';
const SUBTLE = 'rgba(255,255,255,0.04)';
const CODE_BG = 'rgba(255,255,255,0.06)';
const EMBER = '#E85D30';
const FONT = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";

export function KloelMarkdown({ content }: { content: string }) {
  return (
    <div
      className="kloel-markdown"
      style={{
        fontSize: 15,
        lineHeight: 1.78,
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
                fontSize: 18,
                fontWeight: 700,
                color: '#FFFFFF',
                margin: '20px 0 10px',
                paddingBottom: 6,
                borderBottom: `1px solid ${BORDER}`,
                letterSpacing: '-0.02em',
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#FFFFFF',
                margin: '18px 0 8px',
                letterSpacing: '-0.02em',
              }}
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p
              style={{
                margin: '10px 0',
                color: TEXT,
                lineHeight: 1.78,
              }}
            >
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong style={{ color: '#FFFFFF', fontWeight: 700 }}>{children}</strong>
          ),
          a: ({ href, children }) => {
            const external = typeof href === 'string' && /^https?:\/\//i.test(href);
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
            <ul style={{ margin: '10px 0 10px 18px', padding: 0, color: TEXT }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: '10px 0 10px 18px', padding: 0, color: TEXT }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: '6px 0', lineHeight: 1.7 }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: '16px 0',
                padding: '10px 14px',
                borderLeft: '3px solid rgba(255,255,255,0.24)',
                borderRadius: '0 6px 6px 0',
                background: SUBTLE,
                color: 'rgba(255,255,255,0.9)',
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
          code: ({ className, children, ...props }: any) => {
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
                    color: '#F5F5F5',
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
                background: 'var(--app-bg-primary)',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                overflowX: 'auto',
                color: '#F5F5F5',
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
            <thead style={{ background: 'var(--app-bg-secondary)' }}>{children}</thead>
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
        {String(content || '')}
      </ReactMarkdown>
    </div>
  );
}
