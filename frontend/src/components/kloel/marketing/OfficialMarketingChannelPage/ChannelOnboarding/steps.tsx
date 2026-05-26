import { useRef } from 'react';
import type { OnboardingPalette } from './palette';
import { SORA, MONO, PILL_RADIUS, TONE_LABELS, EDGE_LABELS } from './palette';
import { CTA, Arrow, Back, Dial, Vinheta, NavRow } from './atoms';

export interface ProductRow {
  id: string;
  name: string;
  price?: number | null;
}

/** Passo 0 · Identidade */
export function StepConnect({
  sub,
  verb,
  busy,
  onConnect,
  C,
}: {
  sub: string;
  verb: string;
  busy: boolean;
  onConnect: () => void;
  C: OnboardingPalette;
}) {
  return (
    <Vinheta
      C={C}
      head={
        <>
          Dê um corpo
          <br />à inteligência
        </>
      }
      sub={sub}
      action={
        <CTA C={C} variant="ember" disabled={busy} onClick={onConnect}>
          {verb} <Arrow />
        </CTA>
      }
    />
  );
}

/** Passo 1 · Catálogo */
export function StepProducts({
  products,
  picked,
  onToggle,
  onBack,
  onContinue,
  C,
}: {
  products: ProductRow[];
  picked: string[];
  onToggle: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
  C: OnboardingPalette;
}) {
  return (
    <Vinheta
      C={C}
      head={
        <>
          O que ela
          <br />
          pode oferecer
        </>
      }
      sub={`${picked.length} de ${products.length} no catálogo`}
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {products.length === 0 ? (
            <p
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: C.muted,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                textAlign: 'center',
                margin: '12px 0',
              }}
            >
              Nenhum produto no catálogo ainda
            </p>
          ) : null}
          {products.map((p) => {
            const on = picked.includes(p.id);
            return (
              <button
                type="button"
                key={p.id}
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 14px',
                  borderRadius: 6,
                  background: on ? C.emberTint : 'transparent',
                  border: `1px solid ${on ? C.ember : C.border}`,
                  color: on ? C.silver : C.text,
                  fontFamily: SORA,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all .15s ease',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: PILL_RADIUS,
                    background: on ? C.ember : 'transparent',
                    border: `1.5px solid ${on ? C.ember : C.hi}`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{p.name}</span>
                {typeof p.price === 'number' && Number.isFinite(p.price) ? (
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 12,
                      color: on ? C.ember : C.dim,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    R$ {p.price}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      }
      action={
        <NavRow
          back={
            <CTA C={C} variant="ghost" small onClick={onBack}>
              <Back /> Voltar
            </CTA>
          }
          next={
            <CTA C={C} variant="ember" disabled={picked.length === 0} onClick={onContinue}>
              Salvar produtos <Arrow />
            </CTA>
          }
        />
      }
    />
  );
}

/** Passo 2 · Arsenal */
export function StepArsenal({
  count,
  onAddFiles,
  onBack,
  onContinue,
  C,
}: {
  count: number;
  onAddFiles: (files: FileList) => void;
  onBack: () => void;
  onContinue: () => void;
  C: OnboardingPalette;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sub =
    count === 0
      ? 'Arraste fotos, vídeos, áudios, depoimentos'
      : `${count} ${count === 1 ? 'prova carregada' : 'provas carregadas'}`;
  return (
    <Vinheta
      C={C}
      head={
        <>
          Munição
          <br />
          para convencer
        </>
      }
      sub={sub}
      footer={
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onAddFiles(e.target.files);
              }
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '26px 14px',
              borderRadius: 6,
              background: 'transparent',
              border: `1px dashed ${C.border}`,
              color: C.muted,
              fontSize: 13,
              fontFamily: SORA,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              transition: 'all .15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = C.ember;
              e.currentTarget.style.color = C.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = C.border;
              e.currentTarget.style.color = C.muted;
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Adicionar prova
          </button>
        </>
      }
      action={
        <NavRow
          back={
            <CTA C={C} variant="ghost" small onClick={onBack}>
              <Back /> Voltar
            </CTA>
          }
          next={
            <CTA C={C} variant="ember" onClick={onContinue}>
              {count === 0 ? 'Pular esta camada' : 'Avançar'} <Arrow />
            </CTA>
          }
        />
      }
    />
  );
}

/** Passo 3 · Voz / calibração */
export function StepVoice({
  tone,
  edge,
  onToneChange,
  onEdgeChange,
  onBack,
  onActivate,
  activating,
  C,
}: {
  tone: number;
  edge: number;
  onToneChange: (next: number) => void;
  onEdgeChange: (next: number) => void;
  onBack: () => void;
  onActivate: () => void;
  activating: boolean;
  C: OnboardingPalette;
}) {
  return (
    <Vinheta
      C={C}
      head={
        <>
          Calibre
          <br />
          sua voz
        </>
      }
      sub={`${TONE_LABELS[tone]} · ${EDGE_LABELS[edge]}`}
      footer={
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Dial
            C={C}
            label="Temperatura"
            value={tone}
            onChange={onToneChange}
            labels={TONE_LABELS}
          />
          <Dial C={C} label="Postura" value={edge} onChange={onEdgeChange} labels={EDGE_LABELS} />
        </div>
      }
      action={
        <NavRow
          back={
            <CTA C={C} variant="ghost" small onClick={onBack}>
              <Back /> Voltar
            </CTA>
          }
          next={
            <CTA C={C} variant="ember" disabled={activating} onClick={onActivate}>
              Despertar <Arrow />
            </CTA>
          }
        />
      }
    />
  );
}

/** Quinto estado · Despertou */
export function Done({
  awakeName,
  onReset,
  C,
}: {
  awakeName: string;
  onReset: () => void;
  C: OnboardingPalette;
}) {
  return (
    <Vinheta
      C={C}
      head={
        <>
          {awakeName}
          <br />
          acordou
        </>
      }
      sub="Operando · conversas chegam diretamente ao cérebro"
      action={
        <CTA C={C} variant="ghost" small onClick={onReset}>
          Recomeçar
        </CTA>
      }
    />
  );
}
