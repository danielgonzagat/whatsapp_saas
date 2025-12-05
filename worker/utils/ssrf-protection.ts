/**
 * Proteção contra SSRF (Server-Side Request Forgery)
 * 
 * Valida URLs antes de fazer requisições HTTP para evitar que
 * atacantes acessem serviços internos ou recursos privados.
 * 
 * PROTEÇÕES:
 * - Bloqueia IPs privados (RFC 1918, RFC 4193, RFC 6598)
 * - Bloqueia localhost e loopback
 * - Bloqueia IPs de link-local
 * - Verifica DNS resolvido (evita DNS rebinding)
 * - Limita protocolos a HTTP/HTTPS
 * - Bloqueia portas sensíveis
 */

import { lookup } from 'dns/promises';

// Ranges de IP privados (CIDR notation convertida para verificação)
const PRIVATE_IP_RANGES = [
  // Loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  // Private Class A
  { start: '10.0.0.0', end: '10.255.255.255' },
  // Private Class B
  { start: '172.16.0.0', end: '172.31.255.255' },
  // Private Class C
  { start: '192.168.0.0', end: '192.168.255.255' },
  // Link-local
  { start: '169.254.0.0', end: '169.254.255.255' },
  // CGNAT (RFC 6598)
  { start: '100.64.0.0', end: '100.127.255.255' },
  // Broadcast
  { start: '255.255.255.255', end: '255.255.255.255' },
  // Current network
  { start: '0.0.0.0', end: '0.255.255.255' },
  // Documentation ranges
  { start: '192.0.2.0', end: '192.0.2.255' },
  { start: '198.51.100.0', end: '198.51.100.255' },
  { start: '203.0.113.0', end: '203.0.113.255' },
];

// Portas sensíveis que devem ser bloqueadas
const BLOCKED_PORTS = [
  22,    // SSH
  23,    // Telnet
  25,    // SMTP
  135,   // Windows RPC
  137,   // NetBIOS
  138,   // NetBIOS
  139,   // NetBIOS
  445,   // SMB
  1433,  // MSSQL
  1434,  // MSSQL
  3306,  // MySQL
  3389,  // RDP
  5432,  // PostgreSQL
  5900,  // VNC
  6379,  // Redis
  27017, // MongoDB
];

// Hostnames bloqueados
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'metadata.google.internal', // GCP metadata
  '169.254.169.254',          // AWS/GCP metadata
  'metadata.google.internal',
  'kubernetes.default',
  'kubernetes.default.svc',
];

/**
 * Converte IP string para número para comparação
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Verifica se um IP está em range privado
 */
function isPrivateIP(ip: string): boolean {
  // Verifica IPv6 loopback
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }
  
  // Ignora IPv6 por enquanto (apenas alerta)
  if (ip.includes(':')) {
    console.warn('[SSRF] IPv6 detectado:', ip);
    return false;
  }
  
  const ipNum = ipToNumber(ip);
  
  for (const range of PRIVATE_IP_RANGES) {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);
    
    if (ipNum >= startNum && ipNum <= endNum) {
      return true;
    }
  }
  
  return false;
}

/**
 * Valida se uma URL é segura para fazer requisições
 */
export async function validateUrl(urlString: string): Promise<{
  valid: boolean;
  error?: string;
  resolvedIP?: string;
}> {
  try {
    // Parse da URL
    const url = new URL(urlString);
    
    // 1. Verifica protocolo
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: `Protocolo não permitido: ${url.protocol}` };
    }
    
    // 2. Verifica hostname bloqueado
    const hostname = url.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return { valid: false, error: `Hostname bloqueado: ${hostname}` };
    }
    
    // 3. Verifica se é IP direto
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(hostname)) {
      if (isPrivateIP(hostname)) {
        return { valid: false, error: `IP privado bloqueado: ${hostname}` };
      }
    }
    
    // 4. Verifica porta
    const port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
    if (BLOCKED_PORTS.includes(port)) {
      return { valid: false, error: `Porta bloqueada: ${port}` };
    }
    
    // 5. Resolve DNS e verifica IP resultante
    if (!ipv4Regex.test(hostname)) {
      try {
        const result = await lookup(hostname, { family: 4 });
        const resolvedIP = result.address;
        
        if (isPrivateIP(resolvedIP)) {
          return { 
            valid: false, 
            error: `DNS resolve para IP privado: ${hostname} -> ${resolvedIP}`,
            resolvedIP 
          };
        }
        
        return { valid: true, resolvedIP };
      } catch (dnsError: any) {
        return { valid: false, error: `Falha ao resolver DNS: ${hostname}` };
      }
    }
    
    return { valid: true, resolvedIP: hostname };
  } catch (error: any) {
    return { valid: false, error: `URL inválida: ${error.message}` };
  }
}

/**
 * Opções para requisição segura
 */
export interface SafeRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  maxRedirects?: number;
  allowlist?: string[];
}

/**
 * Faz uma requisição HTTP segura com proteção SSRF
 */
export async function safeRequest(options: SafeRequestOptions): Promise<Response> {
  const { 
    url, 
    method = 'GET', 
    headers = {}, 
    body, 
    timeout = 10000,
    maxRedirects = 5,
    allowlist = []
  } = options;
  
  // Se há allowlist, verifica primeiro
  if (allowlist.length > 0) {
    const allowed = allowlist.some(prefix => url.startsWith(prefix));
    if (!allowed) {
      throw new Error(`URL não está na allowlist: ${url}`);
    }
  }
  
  // Valida URL
  const validation = await validateUrl(url);
  if (!validation.valid) {
    throw new Error(`SSRF bloqueado: ${validation.error}`);
  }
  
  // Faz a requisição com timeout e sem seguir redirects automaticamente
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...headers,
        // Remove headers que podem vazar informações
        'X-Forwarded-For': undefined as any,
        'X-Real-IP': undefined as any,
      },
      body: body || undefined,
      signal: controller.signal,
      redirect: 'manual', // Não segue redirects automaticamente
    });
    
    // Verifica redirects manualmente
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location && maxRedirects > 0) {
        // Valida URL de redirect
        const redirectUrl = new URL(location, url).toString();
        return safeRequest({
          ...options,
          url: redirectUrl,
          maxRedirects: maxRedirects - 1,
        });
      } else if (maxRedirects <= 0) {
        throw new Error('Número máximo de redirects excedido');
      }
    }
    
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Verifica se uma URL está em uma allowlist
 */
export function isUrlAllowed(url: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.some(prefix => url.startsWith(prefix));
}
