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
  const columns = ['Origem', 'Nome do cookie', 'Duracao', 'Finalidade', 'Dominio'];

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
  const loginHref = buildAuthUrl('/login');
  const activateHref = buildAuthUrl('/register');
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
          Ultima atualizacao: {COOKIE_POLICY_UPDATED_AT}
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
          Politica de cookies
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
              Gerenciar preferencias de cookies
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: 48 }} />
        )}

        <Section>
          <P>
            Esta Politica de Cookies descreve quais tipos de cookies e tecnologias semelhantes o
            Kloel utiliza em conexao com nossos Servicos, e como voce pode gerencia-los. Esta
            Politica de Cookies nao aborda como processamos suas informacoes pessoais fora do uso de
            cookies. Para saber mais sobre como processamos suas informacoes pessoais, leia nossa{' '}
            <InlineLink href={privacyHref}>Politica de Privacidade</InlineLink>.
          </P>
        </Section>

        <Section>
          <H2>Tipos de cookies</H2>
          <P>
            Cookies sao pequenos arquivos de texto que podem ser colocados em seu dispositivo quando
            voce interage com servicos online. Eles podem ajudar sites a lembrar detalhes sobre sua
            visita, como seu idioma preferido ou quando voce fez login, o que pode melhorar sua
            experiencia em visitas subsequentes. Cookies tambem podem ser usados para outros
            propositos, como solucao de problemas, melhor compreensao do uso do servico e apoio a
            esforcos de marketing.
          </P>
          <P>
            Cookies definidos diretamente por nos sao chamados de cookies primarios. Tambem usamos
            cookies de terceiros, que se originam de um dominio diferente daquele que voce esta
            visitando. Tecnologias semelhantes, como pixels, web beacons, compartilhamento de IDs de
            dispositivos e outros identificadores via APIs ou armazenamento local, tambem podem ser
            usadas para esses fins. Para simplificar, tambem nos referimos a essas tecnologias como
            cookies nesta Politica de Cookies.
          </P>
        </Section>

        <Section>
          <H2>Cookies necessarios</H2>
          <P>
            Estes cookies sao necessarios para operar nossos Servicos. Por exemplo, eles nos
            permitem autenticar usuarios ou habilitar recursos especificos dentro dos Servicos,
            incluindo para fins de seguranca.
          </P>
          <CookieTable data={COOKIE_DATA.necessary} />
        </Section>

        <Section>
          <H2>Cookies de analise</H2>
          <P>
            Estes cookies nos ajudam a entender como nossos Servicos funcionam e sao utilizados,
            como o numero de usuarios e como eles interagem com nossos Servicos.
          </P>
          <CookieTable data={COOKIE_DATA.analytics} />
        </Section>

        <Section>
          <H2>Cookies de medicao de marketing</H2>
          <P>
            Estes cookies nos ajudam a apoiar e entender a eficacia de nossos esforcos de marketing,
            como medir o desempenho de campanhas de marketing para melhorar a visibilidade dos
            Servicos.
          </P>
          <CookieTable data={COOKIE_DATA.marketing} />
        </Section>

        <Section>
          <H2>Gerenciando cookies</H2>
          <P>
            Dependendo da lei aplicavel, voce pode escolher quais cookies sao usados ao utilizar
            nossos Servicos. Se voce estiver em uma jurisdicao que permite esse controle, podera
            acessar suas configuracoes de cookies diretamente em nossos sites. Seu navegador tambem
            pode permitir que voce gerencie suas preferencias de cookies, inclusive para excluir e
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
            Observe que alteracoes nas suas configuracoes de cookies podem afetar a disponibilidade
            ou funcionalidade dos Servicos. Cookies listados como necessarios sao obrigatorios para
            o funcionamento dos Servicos e nao podem ser desativados.
          </P>
          <P>
            As configuracoes de cookies sao especificas do dispositivo e do navegador, portanto voce
            precisara definir as preferencias de cookies para o navegador de cada dispositivo.
          </P>
        </Section>

        <Section>
          <H2>Informacoes adicionais</H2>
          <P>
            Para informacoes adicionais sobre cookies, incluindo como ver quais cookies foram
            definidos em seu dispositivo e como gerencia-los e exclui-los, visite{' '}
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
            Voce pode enviar qualquer duvida para{' '}
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
