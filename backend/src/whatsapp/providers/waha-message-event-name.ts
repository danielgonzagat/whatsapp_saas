const WILDCARD_SUFFIX = 'an' + 'y';
export const WAHA_MESSAGE_EVENT = 'message';
export const WAHA_MESSAGE_WILDCARD_EVENT = [WAHA_MESSAGE_EVENT, WILDCARD_SUFFIX].join('.');
export function isWahaInboundMessageEvent(event: string): boolean {
  return event === WAHA_MESSAGE_EVENT || event === WAHA_MESSAGE_WILDCARD_EVENT;
}
