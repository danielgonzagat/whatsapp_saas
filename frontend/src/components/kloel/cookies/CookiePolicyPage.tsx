'use client';

import { KloelBrandLockup } from '@/components/kloel/KloelBrand';
import { buildAuthUrl, buildMarketingUrl } from '@/lib/subdomains';
import {
  COOKIE_BROWSER_LINKS,
  COOKIE_DATA,
  COOKIE_POLICY_UPDATED_AT,
  COOKIE_TOKENS,
} from './cookie-data';

function Section({ children }: { children: React.ReactNode }) {
  return <section style={{ marginBottom: 40 }}>{children}</section>;
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: COOKIE_TOKENS.font,
        fontSize: 22,
        fontWeight: 700,
        color: COOKIE_TOKENS.silver,
        margin: '0 0 16px',
        letterSpacing: '-0.02em',
      }}
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: COOKIE_TOKENS.font,
        fontSize: 14,
        color: COOKIE_TOKENS.muted,
        lineHeight: 1.8,
        margin: '0 0 14px',
      }}
    >
      {children}
    </p>
  );
}

function InlineLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      style={{
        color: COOKIE_TOKENS.silver,
        textDecoration: 'underline',
        textUnderlineOffset: 2,
      }}
    >
      {children}
      {external ? <span style={{ fontSize: 10, marginLeft: 3 }}>↗</span> : null}
    </a>
  );
}

function CookieTable({
  data,
}: {
  data: ReadonlyArray<{
    origin: string;
    name: string;
    duration: string;
    purpose: string;
    domain: string;
  }>;
}) {
  const columns = ['Origem', 'Nome do cookie', 'Duração', 'Finalidade', 'Domínio'];

  return (
    <div
      style={{
        overflowX: 'auto',
        border: `1px solid ${COOKIE_TOKENS.border}`,
        borderRadius: COOKIE_TOKENS.radius,
        marginTop: 20,
      }}
    >
      <table
        style={{
          width: '100%',
          minWidth: 600,
          borderCollapse: 'collapse',
          fontFamily: COOKIE_TOKENS.font,
          fontSize: 12,
        }}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  fontWeight: 600,
                  fontSize: 11,
                  color: COOKIE_TOKENS.muted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  borderBottom: `1px solid ${COOKIE_TOKENS.border}`,
                  background: COOKIE_TOKENS.elevated,
                  whiteSpace: 'nowrap',
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={`${row.name}-${row.domain}`}
              style={{
                borderBottom:
                  index < data.length - 1 ? `1px solid ${COOKIE_TOKENS.border}` : 'none',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = COOKIE_TOKENS.emberBg;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent';
              }}
            >
              <td
                style={{ padding: '10px 16px', color: COOKIE_TOKENS.muted, whiteSpace: 'nowrap' }}
              >
                {row.origin}
              </td>
              <td
                style={{
                  padding: '10px 16px',
                  color: COOKIE_TOKENS.silver,
                  fontFamily: COOKIE_TOKENS.mono,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                }}
              >
                {row.name}
              </td>
              <td
                style={{ padding: '10px 16px', color: COOKIE_TOKENS.muted, whiteSpace: 'nowrap' }}
              >
                {row.duration}
              </td>
              <td style={{ padding: '10px 16px', color: COOKIE_TOKENS.muted }}>{row.purpose}</td>
              <td
                style={{
                  padding: '10px 16px',
                  color: COOKIE_TOKENS.dim,
                  fontFamily: COOKIE_TOKENS.mono,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                }}
              >
                {row.domain}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CookiePolicyPage({ onOpenPreferences }: { onOpenPreferences?: () => void }) {
  const loginHref = buildAuthUrl('/login?forceAuth=1');
  const activateHref = buildAuthUrl('/register?forceAuth=1');
  const privacyHref = buildMarketingUrl('/privacy');
  const termsHref = buildMarketingUrl('/terms');
  const cookiesHref = buildMarketingUrl('/cookies');

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COOKIE_TOKENS.void,
        color: COOKIE_TOKENS.silver,
        fontFamily: COOKIE_TOKENS.font,
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: COOKIE_TOKENS.void,
          borderBottom: `1px solid ${COOKIE_TOKENS.border}`,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <a href={buildMarketingUrl('/')} style={{ textDecoration: 'none' }}>
            <KloelBrandLockup markSize={18} fontSize={16} fontWeight={700} />
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <a
              href={loginHref}
              style={{
                fontFamily: COOKIE_TOKENS.font,
                fontSize: 13,
                color: COOKIE_TOKENS.muted,
                textDecoration: 'none',
              }}
            >
              Entrar
            </a>
            <a
              href={activateHref}
              style={{
                fontFamily: COOKIE_TOKENS.font,
                fontSize: 13,
                fontWeight: 500,
                color: '#FFFFFF',
                background: COOKIE_TOKENS.ember,
                border: 'none',
                borderRadius: COOKIE_TOKENS.radius,
                padding: '8px 18px',
                textDecoration: 'none',
              }}
            >
              Ativar minha IA
            </a>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '60px 24px 100px' }}>
        <p
          style={{
            fontSize: 12,
            color: COOKIE_TOKENS.dim,
            textAlign: 'center',
            margin: '0 0 12px',
            letterSpacing: '0.02em',
          }}
        >
          Última atualização: {COOKIE_POLICY_UPDATED_AT}
        </p>

        <h1
          style={{
            fontSize: 36,
            fontWeight: 700,
            textAlign: 'center',
            margin: '0 0 24px',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          Política de cookies
        </h1>

        {onOpenPreferences ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 48 }}>
            <button
              type="button"
              onClick={onOpenPreferences}
              style={{
                fontFamily: COOKIE_TOKENS.font,
                fontSize: 13,
                fontWeight: 500,
                color: COOKIE_TOKENS.silver,
                background: COOKIE_TOKENS.elevated,
                border: `1px solid ${COOKIE_TOKENS.border}`,
                borderRadius: 999,
                padding: '10px 18px',
                cursor: 'pointer',
              }}
            >
              Gerenciar preferências de cookies
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: 48 }} />
        )}

        <Section>
          <P>
            Esta Política de Cookies descreve quais tipos de cookies e tecnologias semelhantes o
            Kloel utiliza em conexão com nossos Serviços, e como você pode gerenciá-los. Esta
            Política de Cookies não aborda como processamos suas informações pessoais fora do uso de
            cookies. Para saber mais sobre como processamos suas informações pessoais, leia nossa{' '}
            <InlineLink href={privacyHref}>Política de Privacidade</InlineLink>.
          </P>
        </Section>

        <Section>
          <H2>Tipos de cookies</H2>
          <P>
            Cookies são pequenos arquivos de texto que podem ser colocados em seu dispositivo quando
            você interage com serviços online. Eles podem ajudar sites a lembrar detalhes sobre sua
            visita, como seu idioma preferido ou quando você fez login, o que pode melhorar sua
            experiência em visitas subsequentes. Cookies também podem ser usados para outros
            propósitos, como solução de problemas, melhor compreensão do uso do serviço e apoio a
            esforços de marketing.
          </P>
          <P>
            Cookies definidos diretamente por nós são chamados de cookies primários. Também usamos
            cookies de terceiros, que se originam de um domínio diferente daquele que você está
            visitando. Tecnologias semelhantes, como pixels, web beacons, compartilhamento de IDs de
            dispositivos e outros identificadores via APIs ou armazenamento local, também podem ser
            usadas para esses fins. Para simplificar, também nos referimos a essas tecnologias como
            cookies nesta Política de Cookies.
          </P>
        </Section>

        <Section>
          <H2>Cookies necessários</H2>
          <P>
            Estes cookies são necessários para operar nossos Serviços. Por exemplo, eles nos
            permitem autenticar usuários ou habilitar recursos específicos dentro dos Serviços,
            incluindo para fins de segurança.
          </P>
          <CookieTable data={COOKIE_DATA.necessary} />
        </Section>

        <Section>
          <H2>Cookies de análise</H2>
          <P>
            Estes cookies nos ajudam a entender como nossos Serviços funcionam e são utilizados,
            como o número de usuários e como eles interagem com nossos Serviços.
          </P>
          <CookieTable data={COOKIE_DATA.analytics} />
        </Section>

        <Section>
          <H2>Cookies de medição de marketing</H2>
          <P>
            Estes cookies nos ajudam a apoiar e entender a eficácia de nossos esforços de marketing,
            como medir o desempenho de campanhas de marketing para melhorar a visibilidade dos
            Serviços.
          </P>
          <CookieTable data={COOKIE_DATA.marketing} />
        </Section>

        <Section>
          <H2>Gerenciando cookies</H2>
          <P>
            Dependendo da lei aplicável, você pode escolher quais cookies são usados ao utilizar
            nossos Serviços. Se você estiver em uma jurisdição que permite esse controle, poderá
            acessar suas configurações de cookies diretamente em nossos sites. Seu navegador também
            pode permitir que você gerencie suas preferências de cookies, inclusive para excluir e
            desativar cookies.
          </P>
          <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {COOKIE_BROWSER_LINKS.map((browser) => (
              <a
                key={browser.name}
                href={browser.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: COOKIE_TOKENS.font,
                  fontSize: 12,
                  fontWeight: 500,
                  color: COOKIE_TOKENS.silver,
                  background: COOKIE_TOKENS.elevated,
                  border: `1px solid ${COOKIE_TOKENS.border}`,
                  borderRadius: COOKIE_TOKENS.radius,
                  padding: '8px 16px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {browser.name}
                <span style={{ fontSize: 10, color: COOKIE_TOKENS.dim }}>↗</span>
              </a>
            ))}
          </div>
          <P>
            Observe que alterações nas suas configurações de cookies podem afetar a disponibilidade
            ou funcionalidade dos Serviços. Cookies listados como necessários são obrigatórios para
            o funcionamento dos Serviços e não podem ser desativados.
          </P>
          <P>
            As configurações de cookies são específicas do dispositivo e do navegador, portanto você
            precisará definir as preferências de cookies para o navegador de cada dispositivo.
          </P>
        </Section>

        <Section>
          <H2>Informacoes adicionais</H2>
          <P>
            Para informações adicionais sobre cookies, incluindo como ver quais cookies foram
            definidos em seu dispositivo e como gerenciá-los e excluí-los, visite{' '}
            <InlineLink href="https://www.allaboutcookies.org" external>
              www.allaboutcookies.org
            </InlineLink>{' '}
            e{' '}
            <InlineLink href="https://www.youronlinechoices.eu" external>
              www.youronlinechoices.eu
            </InlineLink>
            .
          </P>
          <P>
            Você pode enviar qualquer dúvida para{' '}
            <InlineLink href="mailto:privacidade@kloel.com">privacidade@kloel.com</InlineLink>.
          </P>
        </Section>

        <footer
          style={{ borderTop: `1px solid ${COOKIE_TOKENS.border}`, marginTop: 64, paddingTop: 32 }}
        >
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Kloel</span>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 20 }}>
              <a
                href={termsHref}
                style={{ fontSize: 11, color: COOKIE_TOKENS.dim, textDecoration: 'none' }}
              >
                Termos
              </a>
              <a
                href={privacyHref}
                style={{ fontSize: 11, color: COOKIE_TOKENS.dim, textDecoration: 'none' }}
              >
                Privacidade
              </a>
              <a
                href={cookiesHref}
                style={{
                  fontSize: 11,
                  color: COOKIE_TOKENS.ember,
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                Cookies
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
