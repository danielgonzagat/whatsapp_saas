export {
  normalizeCatalogPhone,
  expandComparablePhoneVariants,
  resolveWorkspaceSelfIdentity,
  isWorkspaceSelfPhone,
  isWorkspaceSelfTarget,
  buildLidMap,
  resolveCanonicalChatId,
  resolveCatalogPhoneFromChatId,
  resolveLastMessageFromMe,
  isIndividualWahaChatId,
  resolveCatalogChatActivityTimestamp,
} from './identity-resolve';

export {
  extractCatalogChatName,
  isPlaceholderCatalogName,
  resolveTrustedCatalogName,
  extractTrustedNameFromRemoteMessage,
  extractTrustedNameFromMessageText,
  extractRemoteMessageText,
  buildConversationLedger,
} from './identity-names';
