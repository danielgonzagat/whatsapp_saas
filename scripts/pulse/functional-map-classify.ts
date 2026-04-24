import type {
  UIElement,
  APICall,
  BackendRoute,
  ServiceTrace,
  ProxyRoute,
  FacadeEntry,
} from './types';
import type { HookRegistry } from './parsers/hook-registry';
import type { InteractionStatus, InteractionChain } from './functional-map-types';
import type { PageEntry } from './functional-map-types';
import { normalizeForMatch, matchApiCallToRoute, resolveRouteModels, type RouteKey } from './graph';
import { findApiCallForElement } from './functional-map.helpers';

export function traceInteractionChain(
  element: UIElement,
  page: PageEntry,
  apiCalls: APICall[],
  routeLookup: Map<RouteKey, BackendRoute>,
  proxyRoutes: ProxyRoute[],
  serviceModelMap: Map<string, string[]>,
  serviceTraces: ServiceTrace[],
  hookRegistry: HookRegistry,
  apiModuleMap: Map<string, { endpoint: string; method: string }>,
  fileContentCache: Map<string, string>,
): InteractionChain {
  const chain: InteractionChain = {
    pageRoute: page.route,
    pageFile: page.relFile,
    componentFile: element.file,
    elementType: element.type,
    elementLabel: element.label,
    elementLine: element.line,
    handler: element.handler,
    handlerType: element.handlerType,
    apiCall: null,
    proxyRoute: null,
    backendRoute: null,
    serviceMethod: null,
    prismaModels: [],
    status: 'AUSENTE',
    statusReason: '',
    facadeEvidence: [],
  };

  // Skip navigation-only elements
  if (element.handlerType === 'navigation') {
    chain.status = 'FUNCIONA';
    chain.statusReason = 'Navigation handler (router.push/link)';
    return chain;
  }

  // AUSENTE: no handler or noop
  if (!element.handler || element.handlerType === 'noop') {
    chain.status = 'AUSENTE';
    chain.statusReason =
      element.handlerType === 'noop' ? 'Noop handler (empty function)' : 'No handler attached';
    return chain;
  }

  if (element.handlerType === 'dead') {
    chain.status = 'AUSENTE';
    chain.statusReason = 'Dead handler (function exists but does nothing useful)';
    return chain;
  }

  const fileContent = fileContentCache.get(element.file) || '';

  // Try to find the API call
  const apiCallInfo = findApiCallForElement(
    element,
    apiCalls,
    hookRegistry,
    apiModuleMap,
    fileContent,
  );

  if (apiCallInfo) {
    chain.apiCall = apiCallInfo;

    // Check if it goes through a proxy route
    const proxy = proxyRoutes.find(
      (p) => normalizeForMatch(p.frontendPath) === normalizeForMatch(apiCallInfo.endpoint),
    );
    if (proxy) {
      chain.proxyRoute = { frontendPath: proxy.frontendPath, backendPath: proxy.backendPath };
    }

    // Match to backend route
    const mockApiCall: APICall = {
      file: apiCallInfo.file,
      line: apiCallInfo.line,
      endpoint: apiCallInfo.endpoint,
      normalizedPath: apiCallInfo.endpoint,
      method: apiCallInfo.method,
      callPattern: 'apiFetch',
      isProxy: !!proxy,
      proxyTarget: proxy?.backendPath || null,
      callerFunction: null,
    };

    const backendRoute = matchApiCallToRoute(mockApiCall, routeLookup, proxyRoutes);
    if (backendRoute) {
      chain.backendRoute = {
        fullPath: backendRoute.fullPath,
        httpMethod: backendRoute.httpMethod,
        methodName: backendRoute.methodName,
        file: backendRoute.file,
        guards: backendRoute.guards,
      };

      // Resolve service methods
      for (const svcCall of backendRoute.serviceCalls) {
        const [svcName, methodName] = svcCall.split('.');
        if (methodName) {
          chain.serviceMethod = {
            serviceName: svcName,
            methodName,
            file: backendRoute.file,
          };

          // Resolve Prisma models
          const models = resolveRouteModels(backendRoute, serviceModelMap, serviceTraces);
          chain.prismaModels = models;
          break; // Take the first service call
        }
      }
    }
  }

  return chain;
}

function isDelegatedCallbackHandler(handler: string): boolean {
  const trimmed = handler.trim();
  return (
    /^on[A-Z]\w*$/.test(trimmed) ||
    /^(?:disabled\s*\?\s*undefined\s*:\s*)?on[A-Z]\w*$/.test(trimmed) ||
    /\b\w+\.on[A-Z]\w*\s*\(/.test(trimmed) ||
    /(?:^|=>|[;\s])(?:await\s+)?on[A-Z]\w*\s*\(/.test(trimmed)
  );
}

function isLocalStateOnlyHandler(handler: string, label: string): boolean {
  const trimmed = handler.trim();
  const hasStateSetter = /\bset[A-Z]\w*\s*\(/.test(trimmed);
  if (!hasStateSetter) {
    return false;
  }

  const hasExternalEffect =
    /(?:await\s+)?fetch\s*\(|apiFetch\s*\(|\.\s*(?:post|put|patch|delete)\s*\(/i.test(trimmed);
  if (hasExternalEffect) {
    return false;
  }

  const actionLabel =
    /\b(?:save|submit|send|connect|create|delete|publish|pay|sync|generate|salvar|enviar|conectar|criar|excluir|publicar|pagar|sincronizar|gerar)\b/i.test(
      label,
    );
  return !actionLabel;
}

export function classifyInteraction(
  chain: InteractionChain,
  facades: FacadeEntry[],
  componentHasSave: boolean,
): void {
  // Already classified as navigation/noop/dead
  if (chain.status !== 'AUSENTE' || chain.handlerType === 'navigation') {
    return;
  }

  // AUSENTE: no handler or dead
  if (!chain.handler || chain.handlerType === 'noop' || chain.handlerType === 'dead') {
    chain.status = 'AUSENTE';
    chain.statusReason =
      chain.handlerType === 'noop'
        ? 'Noop handler'
        : chain.handlerType === 'dead'
          ? 'Dead handler'
          : 'No handler';
    return;
  }

  // Check for facade indicators near this element
  const nearbyFacades = facades.filter(
    (f) => f.file === chain.componentFile && Math.abs(f.line - chain.elementLine) < 40,
  );

  if (nearbyFacades.length > 0) {
    chain.status = 'FACHADA';
    chain.statusReason = `Facade detected: ${nearbyFacades[0].type} — ${nearbyFacades[0].description}`;
    chain.facadeEvidence = nearbyFacades.map((f) => `[${f.type}] ${f.evidence}`);
    return;
  }

  // No API call found
  if (!chain.apiCall) {
    const handler = chain.handler || '';
    const isPureUIHandler =
      isDelegatedCallbackHandler(handler) ||
      /router\.back\s*\(|router\.push\s*\(|router\.replace\s*\(|window\.location|window\.open/.test(
        handler,
      ) ||
      /clipboard|handleCopy|copyToClipboard|navigator\.clipboard/.test(handler) ||
      /download|handleDownload|handleExport|URL\.createObjectURL|Blob\s*\(/.test(handler) ||
      /window\.print|handlePrint/.test(handler) ||
      /scrollTo|scrollIntoView/.test(handler) ||
      /^(?:\(\)\s*=>\s*)?(?:set(?:Show|Open|Visible|IsOpen|Modal|Drawer)|open|close|toggle(?:Modal|Drawer|Menu|Sidebar))/.test(
        handler,
      ) ||
      /^(?:\(\)\s*=>\s*)?(?:set(?:Active|Selected|Current)(?:Tab|Filter|Sort|View|Section|Page))/.test(
        handler,
      ) ||
      isLocalStateOnlyHandler(handler, chain.elementLabel || '');

    if (isPureUIHandler) {
      chain.status = 'FUNCIONA';
      chain.statusReason = 'Pure UI handler (navigation/callback/local state)';
      return;
    }

    if (componentHasSave && chain.handlerType === 'real') {
      chain.status = 'FUNCIONA';
      chain.statusReason = 'State handler in component with save handler';
      return;
    }

    chain.status = 'FACHADA';
    chain.statusReason = 'Handler exists but no API call detected — local state only';
    return;
  }

  // API call exists but no backend route found
  if (!chain.backendRoute) {
    chain.status = 'QUEBRADO';
    chain.statusReason = `API call to ${chain.apiCall.endpoint} has no matching backend route`;
    return;
  }

  // Backend route exists but no service method resolved
  if (!chain.serviceMethod) {
    chain.status = 'INCOMPLETO';
    chain.statusReason = `Route ${chain.backendRoute.fullPath} exists but no service method resolved`;
    return;
  }

  // Service exists but no Prisma models (could be legit for non-DB operations)
  if (chain.prismaModels.length === 0 && chain.serviceMethod) {
    chain.status = 'FUNCIONA';
    chain.statusReason = 'Complete chain (no Prisma — may use Redis/external API)';
    return;
  }

  // Complete chain: API -> route -> service -> Prisma
  if (chain.apiCall && chain.backendRoute) {
    chain.status = 'FUNCIONA';
    chain.statusReason =
      chain.prismaModels.length > 0
        ? `Complete chain -> ${chain.prismaModels.join(', ')}`
        : 'Complete chain (route matched)';
    return;
  }

  chain.status = 'INCOMPLETO';
  chain.statusReason = 'Partial chain — could not fully resolve';
}

export type { InteractionStatus };
