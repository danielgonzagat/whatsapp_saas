'use client';
import { kloelT } from '@/lib/i18n/t';
import { BENEFITS, GUARANTEE, SOCIAL_PROOF, URGENCY } from './PlanAIConfig.data';
import { CheckboxArgSection, PLAN_AI_CARD_STYLE, PLAN_AI_INPUT_STYLE } from './PlanAIConfig.shared';

interface SalesArgsSectionProps {
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

export function SalesArgsSection({
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
    <div className="rounded-xl p-5" style={PLAN_AI_CARD_STYLE}>
      <div className="grid gap-6 md:grid-cols-2">
        <CheckboxArgSection
          title={kloelT(`Prova Social`)}
          items={SOCIAL_PROOF}
          selected={socialProof}
          values={socialProofValues}
          inputStyle={PLAN_AI_INPUT_STYLE}
          onToggle={(item) => toggleList(socialProof, item, setSocialProof)}
          onValueChange={(item, v) => setSocialProofValues({ ...socialProofValues, [item]: v })}
        />
        <CheckboxArgSection
          title={kloelT(`Garantia e Segurança`)}
          items={GUARANTEE}
          selected={guarantee}
          values={guaranteeValues}
          inputStyle={PLAN_AI_INPUT_STYLE}
          onToggle={(item) => toggleList(guarantee, item, setGuarantee)}
          onValueChange={(item, v) => setGuaranteeValues({ ...guaranteeValues, [item]: v })}
        />
        <CheckboxArgSection
          title={kloelT(`Benefícios do Plano`)}
          items={BENEFITS}
          selected={benefits}
          values={benefitsValues}
          inputStyle={PLAN_AI_INPUT_STYLE}
          onToggle={(item) => toggleList(benefits, item, setBenefits)}
          onValueChange={(item, v) => setBenefitsValues({ ...benefitsValues, [item]: v })}
        />
        <CheckboxArgSection
          title={kloelT(`Urgência`)}
          items={URGENCY}
          selected={urgencyArgs}
          values={urgencyValues}
          inputStyle={PLAN_AI_INPUT_STYLE}
          onToggle={(item) => toggleList(urgencyArgs, item, setUrgencyArgs)}
          onValueChange={(item, v) => setUrgencyValues({ ...urgencyValues, [item]: v })}
        />
      </div>
    </div>
  );
}
