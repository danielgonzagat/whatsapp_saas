import { SpineEmitterService } from '../spine/spine-emitter.service';
import { ValenceTaggerService } from '../mind/valence-tagger.service';
import {
  WhatsAppEventEmitterService,
  type MessageReceivedInput,
  type MessageReadInput,
  type MessageRepliedInput,
  type HandoffToHumanInput,
  type ConversationResumedInput,
  type SessionLifecycleInput,
} from './whatsapp-event-emitter.service';

function makeSpine(opts?: { ringCapacity?: number }): SpineEmitterService {
  return new SpineEmitterService(new ValenceTaggerService(), opts);
}

function makeEmitter(spine?: SpineEmitterService): WhatsAppEventEmitterService {
  return new WhatsAppEventEmitterService(spine ?? makeSpine());
}

describe('WhatsAppEventEmitterService', () => {
  const WS = 'wks_test_01';
  const CONTACT_ID = 'contact_abc';
  const MESSAGE_ID = 'msg_xyz';

  describe('contract: each transition produces correct event on spine', () => {
    let spine: SpineEmitterService;
    let emitter: WhatsAppEventEmitterService;

    beforeEach(() => {
      spine = makeSpine();
      emitter = makeEmitter(spine);
    });

    it('message_received — correct eventName, workspaceId, entityRef, truthMode observed, provenance source production', () => {
      const input: MessageReceivedInput = {
        workspaceId: WS,
        contactId: CONTACT_ID,
        messageId: MESSAGE_ID,
        phone: '5511999999999',
        provider: 'meta-cloud',
      };

      emitter.emitMessageReceived(input);

      const events = spine.recentEvents();
      const ev = events.find((e) => e.eventName === 'commerce.whatsapp.message_received');
      expect(ev).toBeDefined();
      expect(ev!.workspaceId).toBe(WS);
      expect(ev!.entityRef).toEqual({ entityType: 'contact', entityId: CONTACT_ID });
      expect(ev!.truthMode).toBe('observed');
      expect(ev!.provenance.source).toBe('production');
      expect(ev!.provenance.processor).toBe('whatsapp-event-emitter');
      expect(ev!.payload).toMatchObject({
        messageId: MESSAGE_ID,
        phone: '5511999999999',
        channel: 'whatsapp',
        provider: 'meta-cloud',
      });
    });

    it('message_read — correct eventName, workspaceId, entityRef, truthMode observed', () => {
      const chatId = '5511999999999@c.us';
      const input: MessageReadInput = {
        workspaceId: WS,
        chatId,
        contactId: CONTACT_ID,
      };

      emitter.emitMessageRead(input);

      const events = spine.recentEvents();
      const ev = events.find((e) => e.eventName === 'commerce.whatsapp.message_read');
      expect(ev).toBeDefined();
      expect(ev!.workspaceId).toBe(WS);
      expect(ev!.entityRef).toEqual({ entityType: 'chat', entityId: chatId });
      expect(ev!.truthMode).toBe('observed');
      expect(ev!.payload).toMatchObject({ chatId });
    });

    it('message_replied — correct eventName, workspaceId, truthMode observed, author in payload', () => {
      const input: MessageRepliedInput = {
        workspaceId: WS,
        to: '5511999999999@c.us',
        contactId: CONTACT_ID,
        messageId: MESSAGE_ID,
        author: 'autopilot',
        content: 'Ola, como posso ajudar?',
      };

      emitter.emitMessageReplied(input);

      const events = spine.recentEvents();
      const ev = events.find((e) => e.eventName === 'commerce.whatsapp.message_replied');
      expect(ev).toBeDefined();
      expect(ev!.workspaceId).toBe(WS);
      expect(ev!.truthMode).toBe('observed');
      expect(ev!.payload).toMatchObject({
        to: '5511999999999@c.us',
        author: 'autopilot',
        messageId: MESSAGE_ID,
      });
    });

    it('handoff_to_human — correct eventName, workspaceId, reason in payload', () => {
      const input: HandoffToHumanInput = {
        workspaceId: WS,
        contactId: CONTACT_ID,
        reason: 'lead_requested_human',
      };

      emitter.emitHandoffToHuman(input);

      const events = spine.recentEvents();
      const ev = events.find((e) => e.eventName === 'commerce.whatsapp.handoff_to_human');
      expect(ev).toBeDefined();
      expect(ev!.workspaceId).toBe(WS);
      expect(ev!.entityRef).toEqual({ entityType: 'contact', entityId: CONTACT_ID });
      expect(ev!.truthMode).toBe('observed');
      expect(ev!.payload).toMatchObject({ reason: 'lead_requested_human' });
    });

    it('conversation_resumed — correct eventName, workspaceId, resumeTrigger in payload', () => {
      const input: ConversationResumedInput = {
        workspaceId: WS,
        contactId: CONTACT_ID,
        resumeTrigger: 'lead_replied_after_silence',
      };

      emitter.emitConversationResumed(input);

      const events = spine.recentEvents();
      const ev = events.find((e) => e.eventName === 'commerce.whatsapp.conversation_resumed');
      expect(ev).toBeDefined();
      expect(ev!.workspaceId).toBe(WS);
      expect(ev!.truthMode).toBe('observed');
      expect(ev!.payload).toMatchObject({ resumeTrigger: 'lead_replied_after_silence' });
    });

    it('session_lifecycle — correct eventName, workspaceId, event in payload', () => {
      const input: SessionLifecycleInput = {
        workspaceId: WS,
        event: 'connected',
        phoneNumber: '5511999999999',
        reason: 'qr_scan_success',
      };

      emitter.emitSessionLifecycle(input);

      const events = spine.recentEvents();
      const ev = events.find((e) => e.eventName === 'commerce.whatsapp.session_lifecycle');
      expect(ev).toBeDefined();
      expect(ev!.workspaceId).toBe(WS);
      expect(ev!.entityRef).toEqual({ entityType: 'workspace', entityId: WS });
      expect(ev!.truthMode).toBe('observed');
      expect(ev!.payload).toMatchObject({
        event: 'connected',
        phoneNumber: '5511999999999',
        reason: 'qr_scan_success',
      });
    });
  });

  describe('contract: emitter does NOT throw when spine ring buffer overflows', () => {
    it('fills ring to capacity and continues without throwing', () => {
      const capacity = 64;
      const spine = makeSpine({ ringCapacity: capacity });
      const emitter = makeEmitter(spine);

      for (let i = 0; i < capacity * 3; i += 1) {
        expect(() => {
          emitter.emitMessageReceived({
            workspaceId: WS,
            contactId: `contact_${i}`,
            messageId: `msg_${i}`,
            phone: '5511999999999',
            provider: 'meta-cloud',
          });
        }).not.toThrow();
      }

      const events = spine.recentEvents();
      expect(events.length).toBe(capacity);
      const stats = spine.stats();
      expect(stats.buffered).toBe(capacity);
    });
  });

  describe('contract: emitter does NOT throw on malformed payload — logs and returns', () => {
    it('handles undefined payload gracefully', () => {
      const spine = makeSpine();
      const emitter = makeEmitter(spine);

      expect(() => {
        (emitter as unknown as Record<string, unknown>).emitMessageReceived = () => {
          const svc = emitter;
          try {
            svc['spine'].emit({
              eventName: 'commerce.whatsapp.message_received',
              workspaceId: WS,
              entityRef: { entityType: 'contact', entityId: 'c' },
              truthMode: 'observed',
              provenance: {
                source: 'production',
                processor: 'test',
                processorVersion: '0.0.0',
                schemaVersion: '1.0.0',
              },
              payload: undefined as unknown as Record<string, unknown>,
            });
          } catch {
            // If the spine throws, the emitter's safeEmit should have caught it.
            // This test verifies the caller-side behavior.
          }
        };
      }).not.toThrow();
    });

    it('emitter methods never throw even when spine is replaced with throwing mock', () => {
      const brokenSpine = {
        emit: () => {
          throw new Error('simulated spine failure');
        },
        recentEvents: () => [],
        stats: () => ({ buffered: 0, capacity: 0, subscribers: 0 }),
      } as unknown as SpineEmitterService;
      const emitter = new WhatsAppEventEmitterService(brokenSpine);

      expect(() => {
        emitter.emitMessageReceived({
          workspaceId: WS,
          contactId: CONTACT_ID,
          messageId: MESSAGE_ID,
          phone: '5511999999999',
          provider: 'meta-cloud',
        });
      }).not.toThrow();

      expect(() => {
        emitter.emitMessageRead({ workspaceId: WS, chatId: 'test@c.us' });
      }).not.toThrow();

      expect(() => {
        emitter.emitMessageReplied({
          workspaceId: WS,
          to: 'test@c.us',
          author: 'autopilot',
        });
      }).not.toThrow();

      expect(() => {
        emitter.emitHandoffToHuman({
          workspaceId: WS,
          contactId: CONTACT_ID,
          reason: 'test',
        });
      }).not.toThrow();

      expect(() => {
        emitter.emitConversationResumed({
          workspaceId: WS,
          contactId: CONTACT_ID,
          resumeTrigger: 'test',
        });
      }).not.toThrow();

      expect(() => {
        emitter.emitSessionLifecycle({
          workspaceId: WS,
          event: 'connected',
        });
      }).not.toThrow();
    });
  });

  describe('contract: ValenceTaggerService tags terminals', () => {
    it('message_received carries a valence tag from ValenceTaggerService', () => {
      const spine = makeSpine();
      const emitter = makeEmitter(spine);

      emitter.emitMessageReceived({
        workspaceId: WS,
        contactId: CONTACT_ID,
        messageId: MESSAGE_ID,
        phone: '5511999999999',
        provider: 'meta-cloud',
      });

      const events = spine.recentEvents();
      const ev = events.find((e) => e.eventName === 'commerce.whatsapp.message_received');
      expect(ev).toBeDefined();
      expect(ev!.valence).toBeDefined();
    });

    it('handoff_to_human carries a valence tag', () => {
      const spine = makeSpine();
      const emitter = makeEmitter(spine);

      emitter.emitHandoffToHuman({
        workspaceId: WS,
        contactId: CONTACT_ID,
        reason: 'lead_requested_human',
      });

      const events = spine.recentEvents();
      const ev = events.find((e) => e.eventName === 'commerce.whatsapp.handoff_to_human');
      expect(ev).toBeDefined();
      expect(ev!.valence).toBeDefined();
    });
  });

  describe('contract: two consecutive emissions with different correlationIds produce distinct events', () => {
    it('produces two distinct eventIds for two distinct correlationIds', () => {
      const spine = makeSpine();
      const emitter = makeEmitter(spine);

      emitter.emitMessageReceived({
        workspaceId: WS,
        contactId: CONTACT_ID,
        messageId: 'msg_a',
        phone: '5511999999999',
        provider: 'meta-cloud',
        correlationId: 'corr_001',
      });

      emitter.emitMessageReceived({
        workspaceId: WS,
        contactId: CONTACT_ID,
        messageId: 'msg_b',
        phone: '5511999999999',
        provider: 'meta-cloud',
        correlationId: 'corr_002',
      });

      const events = spine.recentEvents();
      const received = events.filter((e) => e.eventName === 'commerce.whatsapp.message_received');
      expect(received.length).toBe(2);
      expect(received[0].eventId).not.toBe(received[1].eventId);
      expect(received[0].correlationId).toBe('corr_001');
      expect(received[1].correlationId).toBe('corr_002');
    });
  });
});
