'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { CONTRAINDICATIONS, DURATIONS, RESULTS, USAGE_MODES } from './PlanAIConfig.data';
import { Toggle } from './PlanAIConfig.toggle';

interface TechInfoSectionProps {
  uid: string;
  fid: string;
  hasTechInfo: boolean;
  usageMode: string;
  duration: string;
  contraindications: string[];
  expectedResults: string;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  selectClass: string;
  cardStyle: React.CSSProperties;
  toggleList: (list: string[], item: string, setter: (v: string[]) => void) => void;
  setHasTechInfo: (v: boolean) => void;
  setUsageMode: (v: string) => void;
  setDuration: (v: string) => void;
  setContraindications: (v: string[]) => void;
  setExpectedResults: (v: string) => void;
}

export function TechInfoSection({
  uid,
  fid,
  hasTechInfo,
  usageMode,
  duration,
  contraindications,
  expectedResults,
  labelStyle,
  inputStyle,
  selectClass,
  cardStyle,
  toggleList,
  setHasTechInfo,
  setUsageMode,
  setDuration,
  setContraindications,
  setExpectedResults,
}: TechInfoSectionProps) {
  return (
    <div className="rounded-xl p-5" style={cardStyle}>
      <Toggle
        checked={hasTechInfo}
        onChange={setHasTechInfo}
        label={kloelT(`Este plano tem informações técnicas?`)}
      />
      {hasTechInfo && (
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <div>
            <label className="mb-1 block" style={labelStyle} htmlFor={`${fid}-modo-uso`}>
              {kloelT(`Modo de uso`)}
            </label>
            <select
              value={usageMode}
              onChange={(e) => setUsageMode(e.target.value)}
              className={selectClass}
              style={inputStyle}
              id={`${fid}-modo-uso`}
            >
              <option value="">{kloelT(`Selecione`)}</option>
              {USAGE_MODES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block" style={labelStyle} htmlFor={`${fid}-duracao`}>
              {kloelT(`Duração`)}
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={selectClass}
              style={inputStyle}
              id={`${fid}-duracao`}
            >
              <option value="">{kloelT(`Selecione`)}</option>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block" style={labelStyle}>
              {kloelT(`Contraindicações`)}
            </label>
            <div className="space-y-1">
              {CONTRAINDICATIONS.map((c) => (
                <label
                  key={c}
                  htmlFor={`${uid}-contra-${c}`}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                  style={{ color: colors.text.starlight }}
                >
                  <input
                    id={`${uid}-contra-${c}`}
                    type="checkbox"
                    checked={contraindications.includes(c)}
                    onChange={() => toggleList(contraindications, c, setContraindications)}
                    style={{ accentColor: colors.accent.webb }}
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block" style={labelStyle} htmlFor={`${fid}-resultados`}>
              {kloelT(`Resultados esperados em`)}
            </label>
            <select
              value={expectedResults}
              onChange={(e) => setExpectedResults(e.target.value)}
              className={selectClass}
              style={inputStyle}
              id={`${fid}-resultados`}
            >
              <option value="">{kloelT(`Selecione`)}</option>
              {RESULTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
