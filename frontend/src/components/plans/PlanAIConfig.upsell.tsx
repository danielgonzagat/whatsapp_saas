'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import {
  DOWNSELL_ARGUMENTS,
  DOWNSELL_WHEN,
  UPSELL_ARGUMENTS,
  UPSELL_WHEN,
} from './PlanAIConfig.data';
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
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  selectClass: string;
  cardStyle: React.CSSProperties;
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
  labelStyle,
  inputStyle,
  selectClass,
  cardStyle,
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
      <div className="rounded-xl p-5" style={cardStyle}>
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
              <label className="mb-1.5 block" style={labelStyle} htmlFor={`${fid}-plano-alvo-1`}>
                {kloelT(`Plano alvo`)}
              </label>
              <select
                value={upsellTargetPlan}
                onChange={(e) => setUpsellTargetPlan(e.target.value)}
                className={selectClass}
                style={inputStyle}
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
              <label className="mb-1.5 block" style={labelStyle}>
                {kloelT(`Quando oferecer`)}
              </label>
              <div className="space-y-1">
                {UPSELL_WHEN.map((w) => (
                  <label
                    key={w}
                    htmlFor={`${uid}-upsellwhen-${w}`}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                    style={{ color: colors.text.starlight }}
                  >
                    <input
                      id={`${uid}-upsellwhen-${w}`}
                      type="checkbox"
                      checked={upsellWhen.includes(w)}
                      onChange={() => toggleList(upsellWhen, w, setUpsellWhen)}
                      style={{ accentColor: colors.accent.webb }}
                    />
                    {w}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block" style={labelStyle}>
                {kloelT(`Argumento principal`)}
              </label>
              {UPSELL_ARGUMENTS.map((a) => (
                <label
                  key={a}
                  htmlFor={`${uid}-upsellarg-${a}`}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    id={`${uid}-upsellarg-${a}`}
                    type="radio"
                    name={`${uid}-upsell_arg`}
                    checked={upsellArgument === a}
                    onChange={() => setUpsellArgument(a)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {a}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Downsell */}
      <div className="rounded-xl p-5" style={cardStyle}>
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
              <label className="mb-1.5 block" style={labelStyle} htmlFor={`${fid}-plano-alvo-2`}>
                {kloelT(`Plano alvo`)}
              </label>
              <select
                value={downsellTargetPlan}
                onChange={(e) => setDownsellTargetPlan(e.target.value)}
                className={selectClass}
                style={inputStyle}
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
              <label className="mb-1.5 block" style={labelStyle}>
                {kloelT(`Quando oferecer`)}
              </label>
              <div className="space-y-1">
                {DOWNSELL_WHEN.map((w) => (
                  <label
                    key={w}
                    htmlFor={`${uid}-downsellwhen-${w}`}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                    style={{ color: colors.text.starlight }}
                  >
                    <input
                      id={`${uid}-downsellwhen-${w}`}
                      type="checkbox"
                      checked={downsellWhen.includes(w)}
                      onChange={() => toggleList(downsellWhen, w, setDownsellWhen)}
                      style={{ accentColor: colors.accent.webb }}
                    />
                    {w}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block" style={labelStyle}>
                {kloelT(`Argumento principal`)}
              </label>
              {DOWNSELL_ARGUMENTS.map((a) => (
                <label
                  key={a}
                  htmlFor={`${uid}-downsellarg-${a}`}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    id={`${uid}-downsellarg-${a}`}
                    type="radio"
                    name={`${uid}-downsell_arg`}
                    checked={downsellArgument === a}
                    onChange={() => setDownsellArgument(a)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {a}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
