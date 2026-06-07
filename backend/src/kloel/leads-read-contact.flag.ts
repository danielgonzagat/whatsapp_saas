/**
 * Feature flag for the canonical `Contact` READER cut-over in `LeadsService`.
 *
 * Lead–Contact duplication family (contact-identity, MIGRATION_PLAYBOOK.md):
 * `Contact` (`RAC_Contact`) is the declared canonical person entity and already
 * carries the lead funnel snapshot (`leadStatus`/`leadStage`/`lastMessage`/
 * `lastIntent`/`totalMessages`) plus the provenance bridge `kloelLeadId`. It is
 * fed additively by `LeadMindCoordinator.syncCanonicalContact` (live dual-write)
 * and historically by the idempotent KloelLead→Contact backfill, but the
 * dashboard lead list (`LeadsService.listLeads`) still reads from the legacy
 * `RAC_KloelLead` table — Contact is canonical-but-dead on this read path while
 * `RAC_KloelLead` stays authoritative.
 *
 * When this flag is set to `'true'`, `LeadsService.listLeads` reads from
 * `prisma.contact.findMany` (joined on the canonical `workspaceId_phone` shape,
 * mapping the funnel snapshot onto the existing `LeadOutput`) instead of the
 * legacy `prisma.kloelLead.findMany`. This is the SEPARATE read flag the
 * playbook requires (STEP 6) so reads can revert instantly while the legacy
 * store keeps being written:
 *   - on an EMPTY canonical result the reader FALLS BACK to the legacy
 *     `RAC_KloelLead` read (so a workspace whose Contacts are not yet backfilled
 *     never surfaces an empty lead list);
 *   - flag OFF (default) is BYTE-IDENTICAL to today — the legacy KloelLead read
 *     only, with no Contact query issued at all.
 *
 * Kept deliberately separate from the `lead-contact-dualwrite` WRITE flag so the
 * reader can flip back without touching dual-write soak. DEFAULT OFF. Performs
 * no backfill.
 *
 * @see backend/src/kloel/leads.service.ts
 * @see backend/src/prisma/backfills/person-kloel-lead-to-contact.backfill.core.ts
 * @see docs/architecture/MIGRATION_PLAYBOOK.md (Lead–Contact duplication family, STEP 6)
 */
export function isLeadsReadContactEnabled(): boolean {
  return process.env.KLOEL_LEADS_READ_CONTACT === 'true';
}
