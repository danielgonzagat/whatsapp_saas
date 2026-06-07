import { getServerApiBase } from '@/app/(checkout)/server-api-base';

const SITE_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function siteHtmlResponse(html: string, status: number, cacheControl: string) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheControl,
    },
  });
}

function siteErrorPage(title: string, message: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#0A0A0C;color:#E5E5E5;font-family:Sora,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px"><main style="max-width:520px"><p style="color:#E85D30;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Kloel Sites</p><h1 style="font-size:28px;margin:0 0 12px">${title}</h1><p style="line-height:1.6;color:#B8B8B8">${message}</p></main></body></html>`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const normalizedSlug = slug.trim();

  if (!SITE_SLUG_PATTERN.test(normalizedSlug)) {
    return siteHtmlResponse(
      siteErrorPage('Pagina nao encontrada', 'O endereco publicado nao corresponde a um site valido.'),
      404,
      'no-store',
    );
  }

  try {
    const upstream = await fetch(`${getServerApiBase()}/s/${encodeURIComponent(normalizedSlug)}`, {
      cache: 'no-store',
    });
    const html = await upstream.text();
    return siteHtmlResponse(
      html,
      upstream.status,
      upstream.ok ? 'public, max-age=60, s-maxage=60' : 'no-store',
    );
  } catch {
    return siteHtmlResponse(
      siteErrorPage(
        'Site temporariamente indisponivel',
        'Nao foi possivel carregar este site publicado agora. Tente novamente em instantes.',
      ),
      502,
      'no-store',
    );
  }
}
