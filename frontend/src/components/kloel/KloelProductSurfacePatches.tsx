'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const QUICK_ACTION_LABELS = new Set([
  'Criar Anúncio',
  'Escrever Copy',
  'Estratégia de Vendas',
  'Analisar Produto',
  'Criar Página',
]);

const META_OAUTH_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'business.facebook.com',
  'instagram.com',
  'www.instagram.com',
  'api.instagram.com',
]);

function textOf(node: Element): string {
  return String(node.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTrustedMetaUrl(value: string): boolean {
  try {
    const target = new URL(value);
    return target.protocol === 'https:' && META_OAUTH_HOSTS.has(target.hostname);
  } catch {
    return false;
  }
}

function paintAuthIcons() {
  for (const button of Array.from(document.querySelectorAll('button, [role="button"], div'))) {
    const text = textOf(button);
    const svg = button.querySelector('svg');
    if (!svg) {
      continue;
    }
    if (text === 'Facebook') {
      for (const path of Array.from(svg.querySelectorAll('path'))) {
        path.setAttribute('fill', '#1877F2');
      }
    }
    if (text === 'Apple') {
      for (const path of Array.from(svg.querySelectorAll('path'))) {
        path.setAttribute('fill', '#A3AAAE');
      }
    }
    if (text === 'TikTok') {
      svg.setAttribute('data-kloel-brand-painted', 'true');
      for (const path of Array.from(svg.querySelectorAll('path'))) {
        path.setAttribute('fill', '#E0DDD8');
      }
      svg.style.filter = 'drop-shadow(-1px 1px 0 #25F4EE) drop-shadow(1px -1px 0 #FE2C55)';
    }
  }
}

function removeChatQuickActions() {
  for (const button of Array.from(document.querySelectorAll('button'))) {
    if (QUICK_ACTION_LABELS.has(textOf(button))) {
      const group = button.parentElement;
      if (
        group &&
        Array.from(group.querySelectorAll('button')).every((item) =>
          QUICK_ACTION_LABELS.has(textOf(item)),
        )
      ) {
        group.remove();
      } else {
        button.remove();
      }
    }
  }
}

function removeComingSoonChrome() {
  for (const node of Array.from(document.querySelectorAll('span, div'))) {
    const text = textOf(node);
    if (text === 'soon') {
      node.remove();
    }
    if (
      text === 'Em breveInstagram Marketing esta sendo finalizado.' ||
      text === 'Em breveTikTok Marketing esta sendo finalizado.' ||
      text === 'Em breveFacebook Messenger esta sendo finalizado.' ||
      text === 'Em breveEmail Marketing esta sendo finalizado.'
    ) {
      node.remove();
    }
  }
}

async function replaceWahaHintWithMetaConnect() {
  const hint = Array.from(document.querySelectorAll('div')).find((node) =>
    textOf(node).includes('O provider ativo deste workspace nao esta em WAHA'),
  );
  if (!hint || hint.getAttribute('data-kloel-meta-connect') === 'true') {
    return;
  }

  hint.setAttribute('data-kloel-meta-connect', 'true');
  hint.replaceChildren();
  Object.assign((hint as HTMLElement).style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    textAlign: 'center',
  });

  const title = document.createElement('strong');
  title.textContent = 'Conectar via Meta oficial';
  title.style.color = '#E0DDD8';

  const copy = document.createElement('span');
  copy.textContent =
    'Abra o Embedded Signup oficial da Meta para vincular seu WABA, seu número e seus ativos do workspace.';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Abrir Meta oficial';
  Object.assign(button.style, {
    border: '0',
    borderRadius: '6px',
    padding: '12px 18px',
    background: '#1877F2',
    color: '#fff',
    fontWeight: '700',
    cursor: 'pointer',
  });
  button.onclick = async () => {
    button.textContent = 'Abrindo Meta...';
    try {
      const response = await fetch('/api/marketing/connect/status', { credentials: 'include' });
      const payload = await response.json();
      const url = String(payload?.channels?.whatsapp?.authUrl || '').trim();
      if (!url || !isTrustedMetaUrl(url)) {
        throw new Error('URL oficial da Meta indisponivel.');
      }
      window.location.assign(url);
    } catch (error) {
      button.textContent = error instanceof Error ? error.message : 'Falha ao abrir Meta';
      button.style.background = '#B42318';
    }
  };

  hint.append(title, copy, button);
}

function patchMarketingSurfaces() {
  removeComingSoonChrome();
  void replaceWahaHintWithMetaConnect();
}

export function KloelProductSurfacePatches() {
  const pathname = usePathname();

  useEffect(() => {
    const run = () => {
      paintAuthIcons();
      removeChatQuickActions();
      patchMarketingSurfaces();
    };

    const timeoutId = window.setTimeout(run, 1200);
    const observer = new MutationObserver(run);
    const observerTimeoutId = window.setTimeout(() => {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }, 1400);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(observerTimeoutId);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
