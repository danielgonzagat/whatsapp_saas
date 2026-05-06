'use client';

import HomeView from '@/components/kloel/home/HomeView';
import { useDashboardPostPayment } from '@/hooks/useDashboardHome';
import { kloelT } from '@/lib/i18n/t';
import { radius } from '@/lib/design-tokens';
import { KLOEL_THEME } from '@/lib/kloel-theme';

const FONT_SANS = "'Sora', sans-serif";

const formatCurrency = (amountInCents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    (Number(amountInCents || 0) || 0) / 100,
  );

const formatInteger = (value: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value || 0) || 0);

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return 'Agora';
  }
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 60_000) {
    return 'Agora';
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `há ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `há ${hours} h` : `há ${Math.floor(hours / 24)} d`;
}

/** Dashboard page. */
export default function DashboardPage() {
  return (
    <>
      <HomeView />
      <DashboardPostPaymentPanel />
    </>
  );
}

function DashboardPostPaymentPanel() {
  const { postPayment, isLoading, error } = useDashboardPostPayment();
  const notificationTotal =
    (postPayment?.notifications.purchaseEmailsSent || 0) +
    (postPayment?.notifications.whatsappEnqueued || 0);
  const cards = [
    {
      label: 'Pagamentos aprovados',
      value: formatInteger(postPayment?.payments.approved || 0),
      meta: `${formatInteger(postPayment?.payments.failed || 0)} falha${postPayment?.payments.failed === 1 ? '' : 's'}`,
      tone: KLOEL_THEME.success,
    },
    {
      label: 'Acessos liberados',
      value: formatInteger(postPayment?.memberAccess.activeEnrollments || 0),
      meta: `${formatInteger(postPayment?.memberAccess.grants || 0)} evento${postPayment?.memberAccess.grants === 1 ? '' : 's'} auditado${postPayment?.memberAccess.grants === 1 ? '' : 's'}`,
      tone: KLOEL_THEME.accent,
    },
    {
      label: 'Notificações',
      value: formatInteger(notificationTotal),
      meta: `${formatInteger(postPayment?.notifications.whatsappSkipped || 0)} WhatsApp pulado${postPayment?.notifications.whatsappSkipped === 1 ? '' : 's'}`,
      tone: KLOEL_THEME.textPrimary,
    },
    {
      label: 'Comissões afiliadas',
      value: formatCurrency(postPayment?.affiliateCommissions.totalInCents || 0),
      meta: `${formatInteger(postPayment?.affiliateCommissions.created || 0)} criada${postPayment?.affiliateCommissions.created === 1 ? '' : 's'}`,
      tone: KLOEL_THEME.warning,
    },
  ];

  return (
    <section style={{ maxWidth: 1240, margin: '0 auto 40px', padding: '0 24px' }}>
      <div
        style={{
          borderRadius: 8,
          border: `1px solid ${KLOEL_THEME.borderPrimary}`,
          background: KLOEL_THEME.bgCard,
          boxShadow: KLOEL_THEME.shadowSm,
          padding: 18,
          color: KLOEL_THEME.textPrimary,
          fontFamily: FONT_SANS,
        }}
      >
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: KLOEL_THEME.textTertiary,
                marginBottom: 6,
              }}
            >
              {kloelT(`Pós-pagamento`)}
            </div>
            <div style={{ fontSize: 13, color: KLOEL_THEME.textSecondary }}>
              {kloelT(`Efeitos reais gerados por webhooks e pedidos pagos.`)}
            </div>
          </div>
          <span
            style={{
              borderRadius: radius.full,
              border: `1px solid ${KLOEL_THEME.borderPrimary}`,
              padding: '6px 10px',
              color: error ? KLOEL_THEME.warning : KLOEL_THEME.success,
              fontSize: 11,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {error
              ? kloelT(`Erro ao sincronizar`)
              : isLoading
                ? kloelT(`Sincronizando`)
                : kloelT(`Webhook auditado`)}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
            marginTop: 16,
          }}
        >
          {cards.map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: 6,
                border: `1px solid ${KLOEL_THEME.borderPrimary}`,
                background: KLOEL_THEME.bgSecondary,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 10, color: KLOEL_THEME.textTertiary, marginBottom: 6 }}>
                {kloelT(item.label)}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: item.tone }}>
                {isLoading ? '...' : item.value}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: KLOEL_THEME.textSecondary }}>
                {item.meta}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
            marginTop: 12,
          }}
        >
          <div
            style={{
              borderRadius: 6,
              border: `1px solid ${KLOEL_THEME.borderPrimary}`,
              background: KLOEL_THEME.bgSecondary,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 10, color: KLOEL_THEME.textTertiary, marginBottom: 10 }}>
              {kloelT(`Tracking e CRM`)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: KLOEL_THEME.accent }}>
                  {formatInteger(postPayment?.tracking.convertedSocialLeads || 0)}
                </div>
                <div style={{ fontSize: 11, color: KLOEL_THEME.textSecondary }}>
                  {kloelT(`leads convertidos`)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: KLOEL_THEME.success }}>
                  {formatInteger(postPayment?.tracking.facebookCapiPurchases || 0)}
                </div>
                <div style={{ fontSize: 11, color: KLOEL_THEME.textSecondary }}>
                  {kloelT(`CAPI Purchase`)}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: 6,
              border: `1px solid ${KLOEL_THEME.borderPrimary}`,
              background: KLOEL_THEME.bgSecondary,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 10, color: KLOEL_THEME.textTertiary, marginBottom: 10 }}>
              {kloelT(`Eventos recentes`)}
            </div>
            {postPayment?.recentEvents?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {postPayment.recentEvents.slice(0, 4).map((event) => (
                  <div
                    key={event.id}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {event.action}
                      </div>
                      <div style={{ fontSize: 10, color: KLOEL_THEME.textTertiary }}>
                        {event.resource}
                      </div>
                    </div>
                    <div style={{ color: KLOEL_THEME.textSecondary, fontSize: 10 }}>
                      {formatRelativeTime(event.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: KLOEL_THEME.textSecondary }}>
                {error
                  ? kloelT(`Não foi possível carregar os eventos agora.`)
                  : kloelT(`Nenhum evento pós-pagamento registrado neste workspace.`)}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
