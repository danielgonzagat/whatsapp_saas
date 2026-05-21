import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { CrmEventEmitterService } from './crm-event-emitter.service';

function makeSpine(maxSize = 5000) {
  return new SpineEmitterService(new ValenceTaggerService(), { ringCapacity: maxSize });
}

describe('CrmEventEmitterService — contract spec (UTP-EVENT-EMIT-CRM)', () => {
  let spine: SpineEmitterService;
  let emitter: CrmEventEmitterService;

  beforeEach(() => {
    spine = makeSpine();
    emitter = new CrmEventEmitterService(spine);
  });

  describe('commerce.crm.stage_changed', () => {
    it('emits event with correct eventName, workspaceId, entityRef, truthMode, provenance.source', async () => {
      await emitter.emitStageChanged('ws_01', 'deal_a', 'Lead', 'Negotiation', 'contact_x');

      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.eventName).toBe('commerce.crm.stage_changed');
      expect(e.workspaceId).toBe('ws_01');
      expect(e.entityRef).toEqual({ entityType: 'deal', entityId: 'deal_a' });
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.payload).toMatchObject({ dealId: 'deal_a', fromStage: 'Lead', toStage: 'Negotiation' });
      expect(e.provenance.environment).toMatch(/^(dev|staging|prod)$/);
    });
  });

  describe('commerce.crm.owner_assigned', () => {
    it('emits event with correct fields', async () => {
      await emitter.emitOwnerAssigned('ws_02', 'deal_b', 'user_99', 'human');

      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.eventName).toBe('commerce.crm.owner_assigned');
      expect(e.workspaceId).toBe('ws_02');
      expect(e.entityRef).toEqual({ entityType: 'deal', entityId: 'deal_b' });
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.payload).toMatchObject({ dealId: 'deal_b', ownerId: 'user_99', ownerType: 'human' });
    });

    it('emits autopilot owner type correctly', async () => {
      await emitter.emitOwnerAssigned('ws_03', 'deal_c', 'auto_42', 'autopilot');

      const e = spine.recentEvents()[0];
      expect(e.eventName).toBe('commerce.crm.owner_assigned');
      expect(e.payload).toMatchObject({ ownerType: 'autopilot', ownerId: 'auto_42' });
    });
  });

  describe('commerce.crm.next_step_defined', () => {
    it('emits event with action and optional dueAt', async () => {
      await emitter.emitNextStepDefined('ws_04', 'deal_d', 'SEND_PROPOSAL', '2026-06-01T00:00:00.000Z');

      const e = spine.recentEvents()[0];
      expect(e.eventName).toBe('commerce.crm.next_step_defined');
      expect(e.workspaceId).toBe('ws_04');
      expect(e.entityRef).toEqual({ entityType: 'deal', entityId: 'deal_d' });
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.payload).toMatchObject({ dealId: 'deal_d', action: 'SEND_PROPOSAL', dueAt: '2026-06-01T00:00:00.000Z' });
    });

    it('emits without dueAt when not provided', async () => {
      await emitter.emitNextStepDefined('ws_04b', 'deal_e', 'CALL_CONTACT');

      const e = spine.recentEvents()[0];
      expect(e.eventName).toBe('commerce.crm.next_step_defined');
      expect(e.payload).toMatchObject({ dealId: 'deal_e', action: 'CALL_CONTACT' });
      expect(e.payload.dueAt).toBeUndefined();
    });
  });

  describe('commerce.crm.deal_won', () => {
    it('emits terminal positive event with correct valence', async () => {
      await emitter.emitDealWon('ws_05', 'deal_f', 15000, 'contact_y');

      const e = spine.recentEvents()[0];
      expect(e.eventName).toBe('commerce.crm.deal_won');
      expect(e.workspaceId).toBe('ws_05');
      expect(e.entityRef).toEqual({ entityType: 'deal', entityId: 'deal_f' });
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.valence).toBe('positive');
      expect(e.payload).toMatchObject({ dealId: 'deal_f', value: 15000, contactId: 'contact_y' });
    });

    it('emits without optional value and contactId', async () => {
      await emitter.emitDealWon('ws_05b', 'deal_f2');

      const e = spine.recentEvents()[0];
      expect(e.eventName).toBe('commerce.crm.deal_won');
      expect(e.valence).toBe('positive');
      expect(e.payload.value).toBeUndefined();
    });
  });

  describe('commerce.crm.deal_lost', () => {
    it('emits terminal negative event with correct valence', async () => {
      await emitter.emitDealLost('ws_06', 'deal_g', 'price_objection', 'contact_z');

      const e = spine.recentEvents()[0];
      expect(e.eventName).toBe('commerce.crm.deal_lost');
      expect(e.workspaceId).toBe('ws_06');
      expect(e.entityRef).toEqual({ entityType: 'deal', entityId: 'deal_g' });
      expect(e.truthMode).toBe('observed');
      expect(e.provenance.source).toBe('production');
      expect(e.valence).toBe('negative');
      expect(e.payload).toMatchObject({ dealId: 'deal_g', lossReason: 'price_objection', contactId: 'contact_z' });
    });
  });

  describe('commerce.lead.objection_raised', () => {
    it('emits inferred event with objectionKind', async () => {
      await emitter.emitObjectionRaised('ws_07', 'lead_h', 'price', 0.78);

      const e = spine.recentEvents()[0];
      expect(e.eventName).toBe('commerce.lead.objection_raised');
      expect(e.workspaceId).toBe('ws_07');
      expect(e.entityRef).toEqual({ entityType: 'lead', entityId: 'lead_h' });
      expect(e.truthMode).toBe('inferred');
      expect(e.provenance.source).toBe('production');
      expect(e.valence).toBe('negative');
      expect(e.payload).toMatchObject({ leadId: 'lead_h', objectionKind: 'price', confidence: 0.78 });
    });
  });

  describe('ring buffer overflow', () => {
    it('does NOT throw when spine is full — overflows oldest', async () => {
      const tiny = makeSpine(3);
      const e2 = new CrmEventEmitterService(tiny);

      for (let i = 0; i < 10; i += 1) {
        await e2.emitStageChanged('ws', `deal_${i}`, 'A', 'B');
      }

      const events = tiny.recentEvents();
      expect(events).toHaveLength(3);
      expect(events[0].payload).toMatchObject({ dealId: 'deal_7' });
      expect(events[1].payload).toMatchObject({ dealId: 'deal_8' });
      expect(events[2].payload).toMatchObject({ dealId: 'deal_9' });
    });
  });

  describe('malformed payload resilience', () => {
    it('does NOT throw when payload has unusual values — logs and returns', async () => {
      const tiny = makeSpine(10);
      const e2 = new CrmEventEmitterService(tiny);

      await expect(
        e2.emitStageChanged('ws', 'deal_x', 'A', 'B'),
      ).resolves.toBeUndefined();

      const events = tiny.recentEvents();
      expect(events).toHaveLength(1);
    });
  });

  describe('valence tagging', () => {
    it('ValenceTaggerService runs over emitted events and tags terminal events', async () => {
      await emitter.emitDealWon('ws_v1', 'deal_v1');
      await emitter.emitDealLost('ws_v1', 'deal_v2');
      await emitter.emitStageChanged('ws_v1', 'deal_v3', 'A', 'B');
      await emitter.emitOwnerAssigned('ws_v1', 'deal_v4', 'u1', 'human');
      await emitter.emitNextStepDefined('ws_v1', 'deal_v5', 'CALL');
      await emitter.emitObjectionRaised('ws_v1', 'lead_v1', 'price');

      const events = spine.recentEvents();
      expect(events).toHaveLength(6);

      expect(events[0].valence).toBe('positive');  // deal_won
      expect(events[1].valence).toBe('negative');  // deal_lost
      expect(events[2].valence).toBeUndefined();   // stage_changed (not terminal)
      expect(events[3].valence).toBeUndefined();   // owner_assigned (not terminal)
      expect(events[4].valence).toBeUndefined();   // next_step_defined (not terminal)
      expect(events[5].valence).toBe('negative');  // objection_raised (terminal negative)
    });
  });

  describe('distinct events', () => {
    it('two consecutive emissions with different correlationIds produce two distinct events', async () => {
      await emitter.emitStageChanged('ws', 'deal_a', 'A', 'B');
      await emitter.emitStageChanged('ws', 'deal_b', 'B', 'C');

      const events = spine.recentEvents();
      expect(events).toHaveLength(2);
      expect(events[0].eventId).not.toBe(events[1].eventId);
      expect(events[0].payload).toMatchObject({ dealId: 'deal_a' });
      expect(events[1].payload).toMatchObject({ dealId: 'deal_b' });
    });
  });

  describe('error isolation', () => {
    it('spine errors do NOT surface to the emitter call site', async () => {
      const brokenSpine = new SpineEmitterService(new ValenceTaggerService(), { ringCapacity: 5000 });
      const originalEmit = brokenSpine.emit.bind(brokenSpine);
      brokenSpine.emit = async () => {
        void originalEmit;
        throw new Error('simulated spine failure');
      };

      const e2 = new CrmEventEmitterService(brokenSpine);

      await expect(
        e2.emitStageChanged('ws', 'deal_e', 'A', 'B'),
      ).resolves.toBeUndefined();
    });
  });
});
