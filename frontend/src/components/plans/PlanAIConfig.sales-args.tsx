'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { B_X_B_RE, BENEFITS, GUARANTEE, SOCIAL_PROOF, URGENCY } from './PlanAIConfig.data';

interface SalesArgsSectionProps {
  inputStyle: React.CSSProperties;
  cardStyle: React.CSSProperties;
  socialProof: string[];
  socialProofValues: Record<string, string>;
  guarantee: string[];
  guaranteeValues: Record<string, string>;
  benefits: string[];
  benefitsValues: Record<string, string>;
  urgencyArgs: string[];
  urgencyValues: Record<string, string>;
  toggleList: (list: string[], item: string, setter: (v: string[]) => void) => void;
  setSocialProof: (v: string[]) => void;
  setSocialProofValues: (v: Record<string, string>) => void;
  setGuarantee: (v: string[]) => void;
  setGuaranteeValues: (v: Record<string, string>) => void;
  setBenefits: (v: string[]) => void;
  setBenefitsValues: (v: Record<string, string>) => void;
  setUrgencyArgs: (v: string[]) => void;
  setUrgencyValues: (v: Record<string, string>) => void;
}

function hasNumericPlaceholder(arg: string) {
  return B_X_B_RE.test(arg);
}

export function SalesArgsSection({
  inputStyle,
  cardStyle,
  socialProof,
  socialProofValues,
  guarantee,
  guaranteeValues,
  benefits,
  benefitsValues,
  urgencyArgs,
  urgencyValues,
  toggleList,
  setSocialProof,
  setSocialProofValues,
  setGuarantee,
  setGuaranteeValues,
  setBenefits,
  setBenefitsValues,
  setUrgencyArgs,
  setUrgencyValues,
}: SalesArgsSectionProps) {
  return (
    <div className="rounded-xl p-5" style={cardStyle}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold" style={{ color: colors.accent.webb }}>
            {kloelT(`Prova Social`)}
          </p>
          {SOCIAL_PROOF.map((s) => (
            <div key={s} className="flex items-center gap-1.5 py-0.5">
              <label
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  type="checkbox"
                  checked={socialProof.includes(s)}
                  onChange={() => toggleList(socialProof, s, setSocialProof)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {s}
              </label>
              {socialProof.includes(s) && hasNumericPlaceholder(s) && (
                <input
                  aria-label={`Quantidade: ${s}`}
                  type="number"
                  placeholder="X"
                  value={socialProofValues[s] || ''}
                  onChange={(e) =>
                    setSocialProofValues({ ...socialProofValues, [s]: e.target.value })
                  }
                  className="ml-2 w-20 rounded px-2 py-0.5 text-xs focus:outline-none"
                  style={inputStyle}
                />
              )}
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold" style={{ color: colors.accent.webb }}>
            {kloelT(`Garantia e Segurança`)}
          </p>
          {GUARANTEE.map((g) => (
            <div key={g} className="flex items-center gap-1.5 py-0.5">
              <label
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  type="checkbox"
                  checked={guarantee.includes(g)}
                  onChange={() => toggleList(guarantee, g, setGuarantee)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {g}
              </label>
              {guarantee.includes(g) && hasNumericPlaceholder(g) && (
                <input
                  aria-label={`Quantidade: ${g}`}
                  type="number"
                  placeholder="X"
                  value={guaranteeValues[g] || ''}
                  onChange={(e) => setGuaranteeValues({ ...guaranteeValues, [g]: e.target.value })}
                  className="ml-2 w-20 rounded px-2 py-0.5 text-xs focus:outline-none"
                  style={inputStyle}
                />
              )}
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold" style={{ color: colors.accent.webb }}>
            {kloelT(`Benefícios do Plano`)}
          </p>
          {BENEFITS.map((b) => (
            <div key={b} className="flex items-center gap-1.5 py-0.5">
              <label
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  type="checkbox"
                  checked={benefits.includes(b)}
                  onChange={() => toggleList(benefits, b, setBenefits)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {b}
              </label>
              {benefits.includes(b) && hasNumericPlaceholder(b) && (
                <input
                  aria-label={`Quantidade: ${b}`}
                  type="number"
                  placeholder="X"
                  value={benefitsValues[b] || ''}
                  onChange={(e) => setBenefitsValues({ ...benefitsValues, [b]: e.target.value })}
                  className="ml-2 w-20 rounded px-2 py-0.5 text-xs focus:outline-none"
                  style={inputStyle}
                />
              )}
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold" style={{ color: colors.accent.webb }}>
            {kloelT(`Urgência`)}
          </p>
          {URGENCY.map((u) => (
            <div key={u} className="flex items-center gap-1.5 py-0.5">
              <label
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  type="checkbox"
                  checked={urgencyArgs.includes(u)}
                  onChange={() => toggleList(urgencyArgs, u, setUrgencyArgs)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {u}
              </label>
              {urgencyArgs.includes(u) && hasNumericPlaceholder(u) && (
                <input
                  aria-label={`Quantidade: ${u}`}
                  type="number"
                  placeholder="X"
                  value={urgencyValues[u] || ''}
                  onChange={(e) => setUrgencyValues({ ...urgencyValues, [u]: e.target.value })}
                  className="ml-2 w-20 rounded px-2 py-0.5 text-xs focus:outline-none"
                  style={inputStyle}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
