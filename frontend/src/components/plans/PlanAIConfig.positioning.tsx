'use client';
import { kloelT } from '@/lib/i18n/t';
import { DIFFERENTIATORS, SCARCITY, TIERS, WHEN_TO_OFFER } from './PlanAIConfig.data';
import {
  CheckboxItem,
  PLAN_AI_CARD_STYLE,
  PLAN_AI_INPUT_STYLE,
  PLAN_AI_LABEL_STYLE,
  PLAN_AI_SELECT_CLASS,
} from './PlanAIConfig.shared';

interface PositioningSectionProps {
  /** Unique id prefix used to scope per-instance DOM ids. */
  uid: string;
  /** Form id prefix used by nested labels and inputs. */
  fid: string;
  /** Selected pricing tier identifier. */
  tier: string;
  /** Currently checked offer-timing options. */
  whenOffer: string[];
  /** Currently checked differentiators. */
  differentiators: string[];
  /** Selected scarcity strategy id. */
  scarcity: string;
  /** Generic toggle helper used by checkbox lists. */
  toggleList: (list: string[], item: string, setter: (v: string[]) => void) => void;
  /** Setter for the selected tier. */
  setTier: (v: string) => void;
  /** Setter for the offer-timing array. */
  setWhenOffer: (v: string[]) => void;
  /** Setter for the differentiators array. */
  setDifferentiators: (v: string[]) => void;
  /** Setter for the scarcity selection. */
  setScarcity: (v: string) => void;
}

export const PositioningSection = ({
  uid,
  fid,
  tier,
  whenOffer,
  differentiators,
  scarcity,
  toggleList,
  setTier,
  setWhenOffer,
  setDifferentiators,
  setScarcity,
}: PositioningSectionProps) => {
  return (
    <div className="rounded-xl p-5" style={PLAN_AI_CARD_STYLE}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block" style={PLAN_AI_LABEL_STYLE}>
            {kloelT(`Este plano é o quê?`)}
          </label>
          {TIERS.map((t) => (
            <CheckboxItem
              key={t.v}
              id={`${uid}-tier-${t.v}`}
              type="radio"
              name={`${uid}-tier`}
              checked={tier === t.v}
              onChange={() => setTier(t.v)}
              label={t.l}
            />
          ))}
        </div>
        <div>
          <label className="mb-2 block" style={PLAN_AI_LABEL_STYLE}>
            {kloelT(`Quando a IA deve oferecer?`)}
          </label>
          <div className="space-y-1">
            {WHEN_TO_OFFER.map((w) => (
              <CheckboxItem
                key={w}
                id={`${uid}-whenoffer-${w}`}
                checked={whenOffer.includes(w)}
                onChange={() => toggleList(whenOffer, w, setWhenOffer)}
                label={w}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block" style={PLAN_AI_LABEL_STYLE}>
            {kloelT(`O que diferencia?`)}
          </label>
          <div className="space-y-1">
            {DIFFERENTIATORS.map((d) => (
              <CheckboxItem
                key={d}
                id={`${uid}-diff-${d}`}
                checked={differentiators.includes(d)}
                onChange={() => toggleList(differentiators, d, setDifferentiators)}
                label={d}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block" style={PLAN_AI_LABEL_STYLE} htmlFor={`${fid}-escassez`}>
            {kloelT(`Escassez/Urgência`)}
          </label>
          <select
            value={scarcity}
            onChange={(e) => setScarcity(e.target.value)}
            className={PLAN_AI_SELECT_CLASS}
            style={PLAN_AI_INPUT_STYLE}
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
};
