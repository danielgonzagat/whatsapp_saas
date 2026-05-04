'use client';
import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import { colors } from '@/lib/design-tokens';
import { TONES } from './PlanAIConfig.data';
import {
  PLAN_AI_CARD_STYLE,
  PLAN_AI_INPUT_STYLE,
  PLAN_AI_LABEL_STYLE,
  PLAN_AI_SELECT_CLASS,
} from './PlanAIConfig.shared';

interface BehaviorSectionProps {
  uid: string;
  fid: string;
  tone: string;
  persistence: number;
  messageLimit: number;
  followUpHours: string;
  followUpMax: string;
  setTone: (v: string) => void;
  setPersistence: (v: number) => void;
  setMessageLimit: (v: number) => void;
  setFollowUpHours: (v: string) => void;
  setFollowUpMax: (v: string) => void;
}

export function BehaviorSection({
  uid,
  fid,
  tone,
  persistence,
  messageLimit,
  followUpHours,
  followUpMax,
  setTone,
  setPersistence,
  setMessageLimit,
  setFollowUpHours,
  setFollowUpMax,
}: BehaviorSectionProps) {
  return (
    <div className="rounded-xl p-5" style={PLAN_AI_CARD_STYLE}>
      <span className="mb-3 block" style={PLAN_AI_LABEL_STYLE}>
        {kloelT(`Tom da conversa`)}
      </span>
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6 mb-6">
        {TONES.map((t) => {
          const Icon = t.icon;
          const isSelected = tone === t.v;
          return (
            <button
              key={t.v}
              type="button"
              onClick={() => setTone(t.v)}
              className="flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-all"
              style={{
                background: isSelected ? `${colors.accent.webb}15` : colors.background.nebula,
                border: `2px solid ${isSelected ? colors.accent.webb : colors.border.space}`,
                boxShadow: 'none',
              }}
            >
              <Icon
                className="h-6 w-6"
                style={{ color: isSelected ? colors.accent.webb : colors.text.dust }}
              />
              <span
                className="text-xs font-semibold"
                style={{ color: isSelected ? colors.accent.webb : colors.text.starlight }}
              >
                {t.l}
              </span>
              <span className="text-[10px] leading-tight" style={{ color: colors.text.moonlight }}>
                {t.desc}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <label
            htmlFor={`${uid}-persistence`}
            className="mb-1.5 block"
            style={PLAN_AI_LABEL_STYLE}
          >
            {kloelT(`Insistência (`)}
            {persistence}/5)
          </label>
          <div className="relative mt-2">
            <input
              id={`${uid}-persistence`}
              type="range"
              min={1}
              max={5}
              value={persistence}
              onChange={(e) => setPersistence(Number(e.target.value))}
              aria-label={`Insistência: ${persistence} de 5`}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: UI.accent,
                accentColor: colors.accent.webb,
              }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px]" style={{ color: colors.text.dust }}>
                {kloelT(`Passivo`)}
              </span>
              <span className="text-[10px]" style={{ color: colors.text.dust }}>
                {kloelT(`Agressivo`)}
              </span>
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block" style={PLAN_AI_LABEL_STYLE} htmlFor={`${fid}-msg-limit`}>
            {kloelT(`Limite de mensagens`)}
          </label>
          <select
            value={messageLimit}
            onChange={(e) => setMessageLimit(Number(e.target.value))}
            className={PLAN_AI_SELECT_CLASS}
            style={PLAN_AI_INPUT_STYLE}
            id={`${fid}-msg-limit`}
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={0}>{kloelT(`Sem limite`)}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-followup`} className="mb-1.5 block" style={PLAN_AI_LABEL_STYLE}>
            {kloelT(`Follow-up`)}
          </label>
          <select
            id={`${uid}-followup`}
            value={followUpHours}
            onChange={(e) => setFollowUpHours(e.target.value)}
            className={PLAN_AI_SELECT_CLASS}
            style={PLAN_AI_INPUT_STYLE}
          >
            <option value="24">{kloelT(`24h`)}</option>
            <option value="48">{kloelT(`48h`)}</option>
            <option value="72">{kloelT(`72h`)}</option>
            <option value="168">{kloelT(`1 semana`)}</option>
            <option value="0">{kloelT(`Nunca`)}</option>
          </select>
          <select
            value={followUpMax}
            onChange={(e) => setFollowUpMax(e.target.value)}
            className={`${PLAN_AI_SELECT_CLASS} mt-2`}
            style={PLAN_AI_INPUT_STYLE}
          >
            <option value="1">{kloelT(`1 tentativa`)}</option>
            <option value="2">{kloelT(`2 tentativas`)}</option>
            <option value="3">{kloelT(`3 tentativas`)}</option>
            <option value="5">{kloelT(`5 tentativas`)}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
