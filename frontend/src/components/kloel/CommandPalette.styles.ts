/**
 * Inline CSS for the CommandPalette modal.
 *
 * Extracted from CommandPalette.tsx to reduce module size.
 * Preserved verbatim — visual contract is unchanged.
 */
export const COMMAND_PALETTE_STYLES = `
        .kloel-search-shell {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 72px 16px 24px;
          background: var(--app-bg-overlay);
        }

        .kloel-search-modal {
          width: min(680px, 100%);
          background: var(--app-bg-card);
          border: 1px solid var(--app-border-primary);
          border-radius: 16px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--app-border-primary) 28%, transparent),
            var(--app-shadow-lg),
            var(--app-shadow-md);
          animation: kloel-search-enter 180ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes kloel-search-enter {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .kloel-search-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 15px 18px;
          border-bottom: 1px solid var(--app-border-subtle);
        }

        .kloel-search-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          font-family: 'Sora', sans-serif;
          font-size: 15px;
          font-weight: 400;
          color: var(--app-text-primary);
          caret-color: var(--app-accent);
          letter-spacing: -0.01em;
        }

        .kloel-search-input::placeholder {
          color: var(--app-text-placeholder);
        }

        .kloel-search-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          height: 28px;
          padding: 0 10px;
          border: 1px solid var(--app-border-primary);
          border-radius: 8px;
          background: var(--app-bg-primary);
          color: var(--app-text-secondary);
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
        }

        button.kloel-search-pill {
          cursor: pointer;
        }

        button.kloel-search-pill:hover {
          background: var(--app-bg-hover);
          border-color: var(--app-border-secondary);
          color: var(--app-text-primary);
        }

        .kloel-search-progress {
          position: relative;
          height: 1px;
          overflow: hidden;
          background: var(--app-border-subtle);
        }

        .kloel-search-progress::after {
          content: '';
          position: absolute;
          inset: 0 auto 0 -120px;
          width: 120px;
          background: var(--app-accent);
          animation: kloel-search-progress 900ms ease-in-out infinite;
        }

        @keyframes kloel-search-progress {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(calc(100vw + 240px));
          }
        }

        .kloel-search-body {
          max-height: min(56vh, 480px);
          overflow-y: auto;
          padding: 8px 8px 10px;
          scrollbar-width: thin;
          scrollbar-color: var(--app-border-primary) transparent;
        }

        .kloel-search-body::-webkit-scrollbar {
          width: 6px;
        }

        .kloel-search-body::-webkit-scrollbar-thumb {
          background: var(--app-border-primary);
          border-radius: 16px;
        }

        .kloel-search-group {
          position: sticky;
          top: 0;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          padding: 10px 10px 6px;
          background: color-mix(in srgb, var(--app-bg-card) 96%, transparent);
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: var(--app-text-placeholder);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .kloel-search-result {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) auto;
          gap: 12px;
          width: 100%;
          margin: 0 0 2px;
          padding: 12px;
          border: none;
          border-radius: 12px;
          background: transparent;
          text-align: left;
          cursor: pointer;
          transition: background 120ms ease, box-shadow 120ms ease;
        }

        .kloel-search-result:hover,
        .kloel-search-result[data-selected='true'] {
          background: var(--app-bg-hover);
        }

        .kloel-search-result[data-selected='true'] {
          box-shadow: inset 0 0 0 1px var(--app-accent-medium);
          background: var(--app-accent-light);
        }

        .kloel-search-result mark,
        .kloel-search-result-title mark {
          color: var(--app-accent);
          background: transparent;
          font-weight: 600;
        }

        .kloel-search-result-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: var(--app-accent-light);
          color: var(--app-accent);
        }

        .kloel-search-result-title {
          margin: 0 0 4px;
          font-family: 'Sora', sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          color: var(--app-text-primary);
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .kloel-search-result-preview {
          margin: 0;
          font-family: 'Sora', sans-serif;
          font-size: 12.5px;
          font-weight: 400;
          color: var(--app-text-secondary);
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .kloel-search-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .kloel-search-tag {
          display: inline-flex;
          align-items: center;
          min-height: 20px;
          padding: 0 7px;
          border-radius: 16px;
          background: var(--app-accent-light);
          color: var(--app-accent);
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          line-height: 1;
        }

        .kloel-search-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--app-text-placeholder);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          white-space: nowrap;
        }

        .kloel-search-arrow {
          opacity: 0;
          transition: opacity 120ms ease, transform 120ms ease;
          transform: translateX(-2px);
        }

        .kloel-search-result[data-selected='true'] .kloel-search-arrow,
        .kloel-search-result:hover .kloel-search-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        .kloel-search-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 52px 20px;
          text-align: center;
        }

        .kloel-search-empty-title {
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: var(--app-text-primary);
        }

        .kloel-search-empty-copy {
          max-width: 320px;
          font-family: 'Sora', sans-serif;
          font-size: 12.5px;
          line-height: 1.5;
          color: var(--app-text-secondary);
        }

        .kloel-search-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 18px;
          border-top: 1px solid var(--app-border-subtle);
        }

        .kloel-search-hints {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .kloel-search-hint {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: var(--app-text-placeholder);
        }

        @media (max-width: 768px) {
          .kloel-search-shell {
            padding-top: 56px;
          }

          .kloel-search-modal {
            width: 100%;
          }

          .kloel-search-result {
            grid-template-columns: 34px minmax(0, 1fr);
          }

          .kloel-search-meta {
            display: none;
          }

          .kloel-search-footer {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `;
