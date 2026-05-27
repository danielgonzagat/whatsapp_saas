/**
 * @deprecated Moved to backend/src/marketing/channels/whatsapp/providers/provider-registry-contacts.ts
 * as part of the omnicore canonicalization. Import from the new location instead.
 * This stub re-exports the public API for backwards compatibility and will be
 * removed in a future cleanup wave.
 */
export {
  isRegistered,
  getClientInfo,
  getContacts,
  upsertContactProfile,
  getChats,
  getChatMessages,
  readChatMessages,
  setPresence,
  sendTyping,
  stopTyping,
  sendSeen,
  healthCheck,
  getSessionDiagnostics,
  listLidMappings,
  type ContactsDeps,
} from '../../marketing/channels/whatsapp/providers/provider-registry-contacts';
