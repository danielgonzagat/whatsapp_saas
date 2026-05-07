'use client';
import { kloelT } from '@/lib/i18n/t';
import {
  AGE_RANGES,
  BUYING_POWER,
  GENDERS,
  KNOWLEDGE_LEVELS,
  LIFE_MOMENTS,
  PROBLEMS,
} from './PlanAIConfig.data';
import {
  CheckboxItem,
  PLAN_AI_CARD_STYLE,
  PLAN_AI_INPUT_STYLE,
  PLAN_AI_LABEL_STYLE,
  PLAN_AI_SELECT_CLASS,
} from './PlanAIConfig.shared';

interface CustomerProfileSectionProps {
  uid: string;
  fid: string;
  genders: string[];
  ages: string[];
  moments: string[];
  knowledge: string;
  buyingPower: string;
  problem: string;
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
  toggleList,
  setGenders,
  setAges,
  setMoments,
  setKnowledge,
  setBuyingPower,
  setProblem,
}: CustomerProfileSectionProps) {
  return (
    <div className="rounded-xl p-5" style={PLAN_AI_CARD_STYLE}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block" style={PLAN_AI_LABEL_STYLE}>
            {kloelT(`Gênero`)}
          </label>
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g) => (
              <CheckboxItem
                key={g}
                id={`${uid}-gender-${g}`}
                checked={genders.includes(g)}
                onChange={() => toggleList(genders, g, setGenders)}
                label={g}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block" style={PLAN_AI_LABEL_STYLE}>
            {kloelT(`Faixa etária`)}
          </label>
          <div className="flex flex-wrap gap-2">
            {AGE_RANGES.map((a) => (
              <CheckboxItem
                key={a}
                id={`${uid}-age-${a}`}
                checked={ages.includes(a)}
                onChange={() => toggleList(ages, a, setAges)}
                label={a}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block" style={PLAN_AI_LABEL_STYLE}>
            {kloelT(`Momento de vida`)}
          </label>
          <div className="space-y-1">
            {LIFE_MOMENTS.map((m) => (
              <CheckboxItem
                key={m}
                id={`${uid}-moment-${m}`}
                checked={moments.includes(m)}
                onChange={() => toggleList(moments, m, setMoments)}
                label={m}
              />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block" style={PLAN_AI_LABEL_STYLE}>
              {kloelT(`Nível de conhecimento`)}
            </label>
            {KNOWLEDGE_LEVELS.map((k) => (
              <CheckboxItem
                key={k.v}
                id={`${uid}-knowledge-${k.v}`}
                type="radio"
                name={`${uid}-knowledge`}
                checked={knowledge === k.v}
                onChange={() => setKnowledge(k.v)}
                label={k.l}
              />
            ))}
          </div>
          <div>
            <label className="mb-2 block" style={PLAN_AI_LABEL_STYLE}>
              {kloelT(`Poder aquisitivo`)}
            </label>
            {BUYING_POWER.map((b) => (
              <CheckboxItem
                key={b.v}
                id={`${uid}-buying-${b.v}`}
                type="radio"
                name={`${uid}-buying`}
                checked={buyingPower === b.v}
                onChange={() => setBuyingPower(b.v)}
                label={b.l}
              />
            ))}
          </div>
          <div>
            <label className="mb-2 block" style={PLAN_AI_LABEL_STYLE} htmlFor={`${fid}-problema`}>
              {kloelT(`Problema principal`)}
            </label>
            <select
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              className={PLAN_AI_SELECT_CLASS}
              style={PLAN_AI_INPUT_STYLE}
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
