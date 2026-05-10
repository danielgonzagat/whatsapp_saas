'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import React, { useState } from 'react';
import { IC, SORA, MONO, EMBER, TEXT, TEXT_DIM, TEXT_MUTED, BORDER, BG_ELEVATED } from './SitesViewIcons';
import { Card, Badge, SectionLabel } from './SitesViewAtoms';
import { ProgressBar, Toggle } from './SitesViewControls';

export function Protecao() {
  const [sslEnabled, setSslEnabled] = useState(true);
  const [ddosProtection, setDdosProtection] = useState(true);
  const [firewallEnabled, setFirewallEnabled] = useState(true);
  const [autoBackups, setAutoBackups] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.shield(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Protecao & Seguranca`)}</span>
        <Badge color={colors.semantic.success}>{kloelT(`Seguro`)}</Badge>
      </div>

      <Card style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: SORA, fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 8 }}>{kloelT(`Pontuacao de Seguranca`)}</div>
        <div style={{ fontFamily: MONO, fontSize: 48, color: colors.semantic.success, fontWeight: 700 }}>96</div>
        <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>{kloelT(`de 100 pontos`)}</div>
        <div style={{ marginTop: 12, maxWidth: 300, margin: '12px auto 0' }}><ProgressBar value={96} color={colors.semantic.success} /></div>
      </Card>

      <Card>
        <SectionLabel>{kloelT(`Configuracoes de Seguranca`)}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { icon: IC.lock, iconColor: colors.semantic.success, title: 'SSL/TLS (HTTPS)', desc: 'Criptografia de dados em transito', checked: sslEnabled, onChange: setSslEnabled },
            { icon: IC.shield, iconColor: colors.semantic.info, title: 'Protecao DDoS', desc: 'Mitigacao de ataques distribuidos', checked: ddosProtection, onChange: setDdosProtection },
            { icon: IC.key, iconColor: colors.semantic.warning, title: 'Firewall (WAF)', desc: 'Bloqueio de requisicoes maliciosas', checked: firewallEnabled, onChange: setFirewallEnabled },
            { icon: IC.cloud, iconColor: EMBER, title: 'Backups Automaticos', desc: 'Backup diario com 7 dias de retencao', checked: autoBackups, onChange: setAutoBackups },
          ].map((item, i, arr) => (
            <React.Fragment key={item.title}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: item.iconColor }}>{item.icon(18)}</span>
                  <div>
                    <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>{kloelT(item.title)}</div>
                    <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{kloelT(item.desc)}</div>
                  </div>
                </div>
                <Toggle checked={item.checked} onChange={item.onChange} />
              </div>
              {i < arr.length - 1 && <div style={{ height: 1, background: BORDER }} />}
            </React.Fragment>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>{kloelT(`Certificados SSL`)}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { domain: 'meusite.com.br', issuer: "Let's Encrypt", expires: '2026-09-15', status: 'valido' },
            { domain: 'vendas.meusite.com.br', issuer: "Let's Encrypt", expires: '2026-09-15', status: 'valido' },
            { domain: 'blog.meusite.com.br', issuer: '--', expires: '--', status: 'pendente' },
          ].map((cert) => (
            <div key={cert.domain} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: BG_ELEVATED, borderRadius: 6 }}>
              <span style={{ color: cert.status === 'valido' ? colors.semantic.success : colors.semantic.warning }}>{IC.lock(14)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT }}>{cert.domain}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>{cert.issuer}</div>
              </div>
              <Badge color={cert.status === 'valido' ? colors.semantic.success : colors.semantic.warning}>{cert.status}</Badge>
              <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>{cert.expires}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>{kloelT(`Atividade Recente`)}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { time: '2 min', event: 'Requisicao bloqueada (SQL injection)', severity: 'alta' },
            { time: '15 min', event: 'Rate limit atingido - IP 192.168.1.45', severity: 'media' },
            { time: '1h', event: 'Certificado SSL renovado automaticamente', severity: 'info' },
            { time: '3h', event: 'Backup automatico concluido', severity: 'info' },
            { time: '6h', event: 'Bot crawler bloqueado', severity: 'baixa' },
          ].map((item) => {
            const sevColor =
              item.severity === 'alta' ? colors.semantic.error
              : item.severity === 'media' ? colors.semantic.warning
              : item.severity === 'baixa' ? colors.semantic.info
              : TEXT_DIM;
            return (
              <div key={item.event} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: BG_ELEVATED, borderRadius: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, width: 50 }}>{item.time}</span>
                <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT, flex: 1 }}>{item.event}</span>
                <Badge color={sevColor}>{item.severity}</Badge>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
