'use client';
import { kloelT } from '@/lib/i18n/t';
import {
  Bt,
  Fd,
  Modal,
  PanelLoadingState,
  Tg,
  V,
  is,
  type JsonRecord,
  type JsonValue,
} from './product-nerve-center.shared';

export function CheckoutConfigLoading() {
  return (
    <PanelLoadingState
      compact
      label={kloelT(`Sincronizando checkout`)}
      description={kloelT(
        `O shell do produto permanece montado enquanto a configuração comercial é carregada.`,
      )}
    />
  );
}

export function CheckoutConfigInfo() {
  return (
    <div
      style={{
        padding: '12px 14px',
        marginBottom: 16,
        background: V.e,
        border: `1px solid ${V.b}`,
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 12, color: V.t2, lineHeight: 1.7 }}>
        {kloelT(`Configure o checkout por preenchimento manual: nome comercial, meios de pagamento,
        cupom, urgência e planos vinculados. Ao voltar, o painel pergunta se deseja salvar as
        alterações desta edição.`)}
      </div>
    </div>
  );
}

interface PaymentCheckboxesProps {
  ckLocal: JsonRecord;
  patch: (key: string, value: JsonValue) => void;
}

export function PaymentCheckboxes({ ckLocal, patch }: PaymentCheckboxesProps) {
  return (
    <>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
        {kloelT(`Pagamento`)}
      </h4>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        {(
          [
            ['enableCreditCard', `Cartão de crédito`],
            ['enablePix', `Pix`],
            ['enableBoleto', `Boleto`],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: V.t2,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={key === 'enableBoleto' ? Boolean(ckLocal[key]) : ckLocal[key] !== false}
              onChange={(event) => patch(key, event.target.checked)}
              style={{ accentColor: V.em, width: 16, height: 16 }}
            />
            {kloelT(label)}
          </label>
        ))}
      </div>
    </>
  );
}

interface CouponSelectorProps {
  ckLocal: JsonRecord;
  patch: (key: string, value: JsonValue) => void;
  coupons: Array<{ id: string; code?: string; type?: string; val?: number | string }>;
}

export function CouponSelector({ ckLocal, patch, coupons }: CouponSelectorProps) {
  return (
    <>
      <Tg
        label={kloelT(`Cupom de desconto?`)}
        checked={ckLocal.enableCoupon !== false}
        onChange={(value) => patch('enableCoupon', value)}
      />
      {ckLocal.enableCoupon !== false ? (
        <Fd label={kloelT(`Cupom automático`)}>
          <select
            style={is}
            value={String(ckLocal.autoCouponCode ?? '')}
            onChange={(event) => patch('autoCouponCode', event.target.value)}
          >
            <option value="">{kloelT(`Selecione um cupom...`)}</option>
            {coupons.map((coupon) => (
              <option key={coupon.id} value={String(coupon.code ?? '')}>
                {coupon.code} ({coupon.type}
                {coupon.type === '%'
                  ? `${coupon.val}% OFF`
                  : 'R$ ' +
                    Number(coupon.val || 0).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }) +
                    ' OFF'}
                )
              </option>
            ))}
          </select>
        </Fd>
      ) : null}
    </>
  );
}

interface TimerConfigProps {
  ckLocal: JsonRecord;
  patch: (key: string, value: JsonValue) => void;
  isMobile: boolean;
}

export function TimerConfig({ ckLocal, patch, isMobile }: TimerConfigProps) {
  return (
    <>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
        {kloelT(`Contador`)}
      </h4>
      <Tg
        label={kloelT(`Usar contador?`)}
        checked={Boolean(ckLocal.enableTimer)}
        onChange={(value) => patch('enableTimer', value)}
      />
      {ckLocal.enableTimer ? (
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
          <Fd
            label={kloelT(`Minutos`)}
            value={String(ckLocal.timerMinutes || 15)}
            onChange={(value) => patch('timerMinutes', Number.parseInt(value, 10) || 15)}
          />
          <Fd
            label={kloelT(`Mensagem`)}
            value={String(ckLocal.timerMessage ?? '')}
            onChange={(value) => patch('timerMessage', value)}
          />
        </div>
      ) : null}
    </>
  );
}

interface ColorPickerFieldProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

export function ColorPickerField({ label, value, placeholder, onChange }: ColorPickerFieldProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: V.t3,
          marginBottom: 4,
          display: 'block',
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            border: `1px solid ${V.b}`,
            borderRadius: 6,
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            background: V.e,
            border: `1px solid ${V.b}`,
            borderRadius: 6,
            padding: '8px 10px',
            color: V.t,
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
          }}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

interface SocialProofSectionProps {
  ckLocal: JsonRecord;
  patch: (key: string, value: JsonValue) => void;
}

export function SocialProofSection({ ckLocal, patch }: SocialProofSectionProps) {
  return (
    <>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
        {kloelT(`Social Proof`)}
      </h4>
      <Tg
        label={kloelT(`Depoimentos?`)}
        checked={ckLocal.enableTestimonials !== false}
        onChange={(value) => patch('enableTestimonials', value)}
      />
      <Tg
        label={kloelT(`Garantia?`)}
        checked={ckLocal.enableGuarantee !== false}
        onChange={(value) => patch('enableGuarantee', value)}
      />
    </>
  );
}

interface ExitConfirmModalProps {
  isMobile: boolean;
  onClose: () => void;
  onStay: () => void;
  onDiscard: () => void;
}

export function ExitConfirmModal({ isMobile, onClose, onStay, onDiscard }: ExitConfirmModalProps) {
  return (
    <Modal title={kloelT(`Salvar alterações?`)} onClose={onClose}>
      <div style={{ fontSize: 12, color: V.t2, lineHeight: 1.7 }}>
        {kloelT(`Se voce sair agora sem salvar, as alteracoes desta edicao serao descartadas.`)}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column-reverse' : 'row',
          gap: 10,
          marginTop: 18,
          justifyContent: 'flex-end',
        }}
      >
        <Bt onClick={() => void onStay()}>{kloelT(`Nao`)}</Bt>
        <Bt primary onClick={() => void onDiscard()}>
          {kloelT(`Sim`)}
        </Bt>
      </div>
    </Modal>
  );
}
