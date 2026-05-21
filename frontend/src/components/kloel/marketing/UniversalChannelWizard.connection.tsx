import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { UI } from '@/lib/ui-tokens';
import type { ChannelSetupProduct } from '@/lib/api/channel-setup';
import type { channelWizardProfile } from './UniversalChannelWizard.helpers';
import { B, C, E, F, M, S } from './UniversalChannelWizard.styles';
import { PrimaryButton, SecondaryButton } from './UniversalChannelWizard.ui';

type Profile = ReturnType<typeof channelWizardProfile>;

export function ConnectionStep({
  profile,
  canConnect,
  connecting,
  onConnect,
  onNext,
}: {
  profile: Profile;
  canConnect: boolean;
  connecting: boolean;
  onConnect: () => void;
  onNext: () => void;
}) {
  return (
    <div className="fade-in" key="step-0">
      <p style={{ fontSize: 13, color: S, lineHeight: 1.7, marginBottom: 24 }}>
        {kloelT(profile.description)}
      </p>
      <div
        style={{
          background: C,
          borderRadius: UI.radiusMd,
          border: `1px solid ${B}`,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontFamily: M,
            fontSize: 9,
            color: E,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          {kloelT('Como funciona')}
        </div>
        <p style={{ fontSize: 13, color: KLOEL_THEME.textPrimary, lineHeight: 1.7, margin: 0 }}>
          {kloelT(profile.connectDescription)}
        </p>
      </div>
      <div
        style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontSize: 11, color: S, fontFamily: M }}>{kloelT('Passo 1 de 4')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryButton onClick={onConnect} disabled={!canConnect}>
            {connecting ? profile.connectingLabel : profile.connectionLabel}
          </PrimaryButton>
          <SecondaryButton onClick={onNext}>{kloelT('Proximo')}</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

export function ProductsStep({
  profile,
  products,
  saving,
  selectedProductIds,
  onToggleProduct,
  onSelectAll,
  onSave,
  onPrev,
}: {
  profile: Profile;
  products: ChannelSetupProduct[];
  saving: boolean;
  selectedProductIds: string[];
  onToggleProduct: (productId: string) => void;
  onSelectAll: () => void;
  onSave: () => void;
  onPrev: () => void;
}) {
  return (
    <div className="fade-in" key="step-1">
      <p style={{ fontSize: 13, color: S, lineHeight: 1.7, marginBottom: 20 }}>
        {kloelT('Escolha os produtos que este canal pode oferecer automaticamente.')}
      </p>
      <div
        style={{
          background: C,
          border: `1px solid ${B}`,
          borderRadius: UI.radiusSm,
          marginBottom: 16,
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            color: E,
            fontFamily: M,
            fontSize: 9,
            letterSpacing: '0.2em',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          {kloelT(profile.profileCards[0]?.label ?? 'Conta necessaria')}
        </div>
        <div style={{ color: KLOEL_THEME.textPrimary, fontFamily: F, fontSize: 13 }}>
          {kloelT(profile.profileCards[0]?.value ?? 'Canal conectado e autorizado')}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {products.length === 0 ? <EmptyState label="Nenhum produto cadastrado" /> : null}
        {products.map((product) => (
          <label
            key={product.id}
            style={{
              alignItems: 'center',
              background: C,
              border: `1px solid ${B}`,
              borderRadius: UI.radiusSm,
              cursor: 'pointer',
              display: 'flex',
              gap: 12,
              padding: '12px 14px',
            }}
          >
            <input
              checked={selectedProductIds.includes(product.id)}
              onChange={() => onToggleProduct(product.id)}
              type="checkbox"
            />
            <span style={{ color: KLOEL_THEME.textPrimary, flex: 1, fontFamily: F, fontSize: 13 }}>
              {product.name}
            </span>
            <span style={{ color: S, fontFamily: M, fontSize: 11 }}>
              {product.active === false ? kloelT('Inativo') : kloelT(product.status || 'Ativo')}
            </span>
          </label>
        ))}
      </div>
      <div
        style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontSize: 11, color: S, fontFamily: M }}>{kloelT('Passo 2 de 4')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <SecondaryButton onClick={onPrev}>{kloelT('Voltar')}</SecondaryButton>
          <SecondaryButton onClick={onSelectAll} disabled={products.length === 0}>
            {kloelT('Selecionar todos')}
          </SecondaryButton>
          <SecondaryButton onClick={onSave} disabled={saving}>
            {saving ? kloelT('Salvando...') : kloelT('Salvar e avancar')}
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        background: C,
        border: `1px solid ${B}`,
        borderRadius: UI.radiusSm,
        color: S,
        fontFamily: F,
        fontSize: 12,
        padding: '14px 16px',
      }}
    >
      {kloelT(label)}
    </div>
  );
}
