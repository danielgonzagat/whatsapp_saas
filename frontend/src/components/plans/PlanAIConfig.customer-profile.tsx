'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import {
  AGE_RANGES,
  BUYING_POWER,
  GENDERS,
  KNOWLEDGE_LEVELS,
  LIFE_MOMENTS,
  PROBLEMS,
} from './PlanAIConfig.data';

interface CustomerProfileSectionProps {
  uid: string;
  fid: string;
  genders: string[];
  ages: string[];
  moments: string[];
  knowledge: string;
  buyingPower: string;
  problem: string;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  selectClass: string;
  cardStyle: React.CSSProperties;
  toggleList: (list: string[], item: string, setter: (v: string[]) => void) => void;
  setGenders: (v: string[]) => void;
  setAges: (v: string[]) => void;
  setMoments: (v: string[]) => void;
  setKnowledge: (v: string) => void;
  setBuyingPower: (v: string) => void;
  setProblem: (v: string) => void;
}

export function CustomerProfileSection({
  uid,
  fid,
  genders,
  ages,
  moments,
  knowledge,
  buyingPower,
  problem,
  labelStyle,
  inputStyle,
  selectClass,
  cardStyle,
  toggleList,
  setGenders,
  setAges,
  setMoments,
  setKnowledge,
  setBuyingPower,
  setProblem,
}: CustomerProfileSectionProps) {
  return (
    <div className="rounded-xl p-5" style={cardStyle}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block" style={labelStyle}>
            {kloelT(`Gênero`)}
          </label>
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g) => (
              <label
                key={g}
                htmlFor={`${uid}-gender-${g}`}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  id={`${uid}-gender-${g}`}
                  type="checkbox"
                  checked={genders.includes(g)}
                  onChange={() => toggleList(genders, g, setGenders)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {g}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block" style={labelStyle}>
            {kloelT(`Faixa etária`)}
          </label>
          <div className="flex flex-wrap gap-2">
            {AGE_RANGES.map((a) => (
              <label
                key={a}
                htmlFor={`${uid}-age-${a}`}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  id={`${uid}-age-${a}`}
                  type="checkbox"
                  checked={ages.includes(a)}
                  onChange={() => toggleList(ages, a, setAges)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {a}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block" style={labelStyle}>
            {kloelT(`Momento de vida`)}
          </label>
          <div className="space-y-1">
            {LIFE_MOMENTS.map((m) => (
              <label
                key={m}
                htmlFor={`${uid}-moment-${m}`}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  id={`${uid}-moment-${m}`}
                  type="checkbox"
                  checked={moments.includes(m)}
                  onChange={() => toggleList(moments, m, setMoments)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {m}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block" style={labelStyle}>
              {kloelT(`Nível de conhecimento`)}
            </label>
            {KNOWLEDGE_LEVELS.map((k) => (
              <label
                key={k.v}
                htmlFor={`${uid}-knowledge-${k.v}`}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  id={`${uid}-knowledge-${k.v}`}
                  type="radio"
                  name={`${uid}-knowledge`}
                  checked={knowledge === k.v}
                  onChange={() => setKnowledge(k.v)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {k.l}
              </label>
            ))}
          </div>
          <div>
            <label className="mb-2 block" style={labelStyle}>
              {kloelT(`Poder aquisitivo`)}
            </label>
            {BUYING_POWER.map((b) => (
              <label
                key={b.v}
                htmlFor={`${uid}-buying-${b.v}`}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
                style={{ color: colors.text.starlight }}
              >
                <input
                  id={`${uid}-buying-${b.v}`}
                  type="radio"
                  name={`${uid}-buying`}
                  checked={buyingPower === b.v}
                  onChange={() => setBuyingPower(b.v)}
                  style={{ accentColor: colors.accent.webb }}
                />
                {b.l}
              </label>
            ))}
          </div>
          <div>
            <label className="mb-2 block" style={labelStyle} htmlFor={`${fid}-problema`}>
              {kloelT(`Problema principal`)}
            </label>
            <select
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              className={selectClass}
              style={inputStyle}
              id={`${fid}-problema`}
            >
              <option value="">{kloelT(`Selecione`)}</option>
              {PROBLEMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
