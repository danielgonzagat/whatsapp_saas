'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { DIFFERENTIATORS, SCARCITY, TIERS, WHEN_TO_OFFER } from './PlanAIConfig.data';

interface PositioningSectionProps {
  uid: string;
  fid: string;
  tier: string;
  whenOffer: string[];
  differentiators: string[];
  scarcity: string;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  selectClass: string;
  cardStyle: React.CSSProperties;
  toggleList: (list: string[], item: string, setter: (v: string[]) => void) => void;
  setTier: (v: string) => void;
  setWhenOffer: (v: string[]) => void;
  setDifferentiators: (v: string[]) => void;
  setScarcity: (v: string) => void;
}

export function PositioningSection({
  uid,
  fid,
  tier,
  whenOffer,
  differentiators,
  scarcity,
  labelStyle,
  inputStyle,
  selectClass,
  cardStyle,
  toggleList,
  setTier,
  setWhenOffer,
  setDifferentiators,
  setScarcity,
}: PositioningSectionProps) {
  return (
    <div className="rounded-xl p-5" style={cardStyle}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block" style={labelStyle}>
            {kloelT(`Este plano é o quê?`)}
          </label>
          {TIERS.map((t) => (
            <label
              key={t.v}
              htmlFor={`${uid}-tier-${t.v}`}
              className="flex items-center gap-1.5 text-sm cursor-pointer"
              style={{ color: colors.text.starlight }}
            >
              <input
                id={`${uid}-tier-${t.v}`}
                type="radio"
                name={`${uid}-tier`}
                checked={tier === t.v}
                onChange={() => setTier(t.v)}
                style={{ accentColor: colors.accent.webb }}
              />
              {t.l}
            </label>
          ))}
        </div>
        <div>
          <label className="mb-2 block" style={labelStyle}>
            {kloelT(`Quando a IA deve oferecer?`)}
          </label>
          <div className="space-y-1">
            {WHEN_TO_OFFER.map((w) => (
              <label
                key={w}
                htmlFor={`${uid}-whenoffer-${w}`}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  id={`${uid}-whenoffer-${w}`}
                  type="checkbox"
                  checked={whenOffer.includes(w)}
                  onChange={() => toggleList(whenOffer, w, setWhenOffer)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {w}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block" style={labelStyle}>
            {kloelT(`O que diferencia?`)}
          </label>
          <div className="space-y-1">
            {DIFFERENTIATORS.map((d) => (
              <label
                key={d}
                htmlFor={`${uid}-diff-${d}`}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  id={`${uid}-diff-${d}`}
                  type="checkbox"
                  checked={differentiators.includes(d)}
                  onChange={() => toggleList(differentiators, d, setDifferentiators)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {d}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block" style={labelStyle} htmlFor={`${fid}-escassez`}>
            {kloelT(`Escassez/Urgência`)}
          </label>
          <select
            value={scarcity}
            onChange={(e) => setScarcity(e.target.value)}
            className={selectClass}
            style={inputStyle}
            id={`${fid}-escassez`}
          >
            {SCARCITY.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
