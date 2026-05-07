'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import {
  DOWNSELL_ARGUMENTS,
  DOWNSELL_WHEN,
  UPSELL_ARGUMENTS,
  UPSELL_WHEN,
} from './PlanAIConfig.data';
import {
  CheckboxItem,
  PLAN_AI_CARD_STYLE,
  PLAN_AI_INPUT_STYLE,
  PLAN_AI_LABEL_STYLE,
  PLAN_AI_SELECT_CLASS,
} from './PlanAIConfig.shared';
import { Toggle } from './PlanAIConfig.toggle';

interface UpsellSectionProps {
  uid: string;
  fid: string;
  upsellEnabled: boolean;
  upsellTargetPlan: string;
  upsellWhen: string[];
  upsellArgument: string;
  downsellEnabled: boolean;
  downsellTargetPlan: string;
  downsellWhen: string[];
  downsellArgument: string;
  siblingPlans: { id: string; name: string }[];
  toggleList: (list: string[], item: string, setter: (v: string[]) => void) => void;
  setUpsellEnabled: (v: boolean) => void;
  setUpsellTargetPlan: (v: string) => void;
  setUpsellWhen: (v: string[]) => void;
  setUpsellArgument: (v: string) => void;
  setDownsellEnabled: (v: boolean) => void;
  setDownsellTargetPlan: (v: string) => void;
  setDownsellWhen: (v: string[]) => void;
  setDownsellArgument: (v: string) => void;
}

export function UpsellSection({
  uid,
  fid,
  upsellEnabled,
  upsellTargetPlan,
  upsellWhen,
  upsellArgument,
  downsellEnabled,
  downsellTargetPlan,
  downsellWhen,
  downsellArgument,
  siblingPlans,
  toggleList,
  setUpsellEnabled,
  setUpsellTargetPlan,
  setUpsellWhen,
  setUpsellArgument,
  setDownsellEnabled,
  setDownsellTargetPlan,
  setDownsellWhen,
  setDownsellArgument,
}: UpsellSectionProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Upsell */}
      <div className="rounded-xl p-5" style={PLAN_AI_CARD_STYLE}>
        <Toggle
          checked={upsellEnabled}
          onChange={setUpsellEnabled}
          label={kloelT(`Fazer upsell?`)}
        />
        {upsellEnabled && (
          <div
            className="mt-4 space-y-4 pl-2"
            style={{ borderLeft: `2px solid ${colors.accent.webb}30` }}
          >
            <div>
              <label
                className="mb-1.5 block"
                style={PLAN_AI_LABEL_STYLE}
                htmlFor={`${fid}-plano-alvo-1`}
              >
                {kloelT(`Plano alvo`)}
              </label>
              <select
                value={upsellTargetPlan}
                onChange={(e) => setUpsellTargetPlan(e.target.value)}
                className={PLAN_AI_SELECT_CLASS}
                style={PLAN_AI_INPUT_STYLE}
                id={`${fid}-plano-alvo-1`}
              >
                <option value="">{kloelT(`Selecione o plano`)}</option>
                {siblingPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block" style={PLAN_AI_LABEL_STYLE}>
                {kloelT(`Quando oferecer`)}
              </label>
              <div className="space-y-1">
                {UPSELL_WHEN.map((w) => (
                  <CheckboxItem
                    key={w}
                    id={`${uid}-upsellwhen-${w}`}
                    checked={upsellWhen.includes(w)}
                    onChange={() => toggleList(upsellWhen, w, setUpsellWhen)}
                    label={w}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block" style={PLAN_AI_LABEL_STYLE}>
                {kloelT(`Argumento principal`)}
              </label>
              {UPSELL_ARGUMENTS.map((a) => (
                <CheckboxItem
                  key={a}
                  id={`${uid}-upsellarg-${a}`}
                  type="radio"
                  name={`${uid}-upsell_arg`}
                  checked={upsellArgument === a}
                  onChange={() => setUpsellArgument(a)}
                  label={a}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Downsell */}
      <div className="rounded-xl p-5" style={PLAN_AI_CARD_STYLE}>
        <Toggle
          checked={downsellEnabled}
          onChange={setDownsellEnabled}
          label={kloelT(`Fazer downsell?`)}
        />
        {downsellEnabled && (
          <div
            className="mt-4 space-y-4 pl-2"
            style={{ borderLeft: `2px solid ${colors.accent.gold}30` }}
          >
            <div>
              <label
                className="mb-1.5 block"
                style={PLAN_AI_LABEL_STYLE}
                htmlFor={`${fid}-plano-alvo-2`}
              >
                {kloelT(`Plano alvo`)}
              </label>
              <select
                value={downsellTargetPlan}
                onChange={(e) => setDownsellTargetPlan(e.target.value)}
                className={PLAN_AI_SELECT_CLASS}
                style={PLAN_AI_INPUT_STYLE}
                id={`${fid}-plano-alvo-2`}
              >
                <option value="">{kloelT(`Selecione o plano`)}</option>
                {siblingPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block" style={PLAN_AI_LABEL_STYLE}>
                {kloelT(`Quando oferecer`)}
              </label>
              <div className="space-y-1">
                {DOWNSELL_WHEN.map((w) => (
                  <CheckboxItem
                    key={w}
                    id={`${uid}-downsellwhen-${w}`}
                    checked={downsellWhen.includes(w)}
                    onChange={() => toggleList(downsellWhen, w, setDownsellWhen)}
                    label={w}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block" style={PLAN_AI_LABEL_STYLE}>
                {kloelT(`Argumento principal`)}
              </label>
              {DOWNSELL_ARGUMENTS.map((a) => (
                <CheckboxItem
                  key={a}
                  id={`${uid}-downsellarg-${a}`}
                  type="radio"
                  name={`${uid}-downsell_arg`}
                  checked={downsellArgument === a}
                  onChange={() => setDownsellArgument(a)}
                  label={a}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
