import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from './spine-emitter.service';

/**
 * Canonical B17 surface → expected event name prefixes as defined by PCI.6.
 *
 * Each surface declares the set of event prefixes that correspond to
 * the transitions in its PCI.6 table. The auditor counts how many of
 * those prefixes have been observed in the spine buffer.
 */
const B17_SURFACE_EVENT_PREFIXES: ReadonlyMap<string, readonly string[]> = new Map([
  [
    'checkout_wallet_billing',
    [
      'commerce.cart.',
      'commerce.payment.',
    ],
  ],
  [
    'crm',
    [
      'commerce.crm.',
      'commerce.lead.objection_raised',
    ],
  ],
  [
    'whatsapp_inbox',
    [
      'commerce.whatsapp.',
    ],
  ],
  [
    'campaigns_ads',
    [
      'commerce.campaign.',
    ],
  ],
  [
    'member_area_affiliate',
    [
      'commerce.member_area.',
      'commerce.affiliate.',
    ],
  ],
  [
    'kyc_auth',
    [
      'commerce.kyc.',
    ],
  ],
  [
    'post_sale_ltv',
    [
      'commerce.post_sale.',
    ],
  ],
]);

/**
 * Canonical event name → B17 transition label (PCI.6).
 *
 * Every canonical event named in the PCI.6 transitions table has a row
 * here so the auditor can report which specific transitions were observed.
 */
const EVENT_TO_TRANSITION: ReadonlyMap<string, string> = new Map([
  ['commerce.cart.created', 'cart_created'],
  ['commerce.cart.abandoned', 'cart_abandoned'],
  ['commerce.cart.checkout_initiated', 'checkout_initiated'],
  ['commerce.payment.initiated', 'payment_initiated'],
  ['commerce.payment.approved', 'payment_approved'],
  ['commerce.payment.declined', 'payment_declined'],
  ['commerce.payment.refunded', 'payment_refunded'],
  ['commerce.payment.charged_back', 'payment_charged_back'],
  ['commerce.crm.stage_changed', 'stage_changed'],
  ['commerce.crm.owner_assigned', 'owner_assigned'],
  ['commerce.crm.next_step_defined', 'next_step_defined'],
  ['commerce.crm.deal_won', 'deal_won'],
  ['commerce.crm.deal_lost', 'deal_lost'],
  ['commerce.lead.objection_raised', 'objection_raised'],
  ['commerce.whatsapp.message_received', 'message_received'],
  ['commerce.whatsapp.message_read', 'message_read'],
  ['commerce.whatsapp.message_replied', 'message_replied'],
  ['commerce.whatsapp.handoff_to_human', 'handoff_to_human'],
  ['commerce.whatsapp.conversation_resumed', 'conversation_resumed'],
  ['commerce.whatsapp.session_lifecycle', 'session_lifecycle'],
  ['commerce.campaign.clicked', 'campaign_clicked'],
  ['commerce.campaign.conversion_associated', 'conversion_associated'],
  ['commerce.campaign.audience_reached', 'audience_reached'],
  ['commerce.campaign.creative_swapped', 'creative_swapped'],
  ['commerce.campaign.performance_drop_detected', 'performance_drop_detected'],
  ['commerce.member_area.enrolled', 'member_enrolled'],
  ['commerce.member_area.progressed', 'member_progressed'],
  ['commerce.member_area.dropped_out', 'member_dropped_out'],
  ['commerce.affiliate.performance_measured', 'affiliate_performance_measured'],
  ['commerce.affiliate.commission_calculated', 'affiliate_commission_calculated'],
  ['commerce.kyc.document_submitted', 'kyc_document_submitted'],
  ['commerce.kyc.approved', 'kyc_approved'],
  ['commerce.kyc.rejected', 'kyc_rejected'],
  ['commerce.post_sale.delivery_completed', 'delivery_completed'],
  ['commerce.post_sale.activation_started', 'activation_started'],
  ['commerce.post_sale.first_value_obtained', 'first_value_obtained'],
  ['commerce.post_sale.satisfaction_signal_observed', 'satisfaction_signal_observed'],
  ['commerce.post_sale.testimonial_requested', 'testimonial_requested'],
  ['commerce.post_sale.repurchase_window_opened', 'repurchase_window_opened'],
  ['commerce.post_sale.churn_risk_detected', 'churn_risk_detected'],
  ['commerce.post_sale.win_back_window_opened', 'win_back_window_opened'],
]);

export interface SurfaceCoverage {
  readonly surfaceId: string;
  readonly observedCanonicalEventNames: readonly string[];
  readonly observedTransitionCount: number;
  readonly totalCanonicalTransitions: number;
  readonly coverageRatio: number;
  readonly transitionsObserved: readonly string[];
}

export interface CoverageReport {
  readonly scannedEventCount: number;
  readonly scannedWindowN: number;
  readonly surfaces: readonly SurfaceCoverage[];
}

/**
 * SpineCoverageAuditorService — scans the in-memory spine ring buffer and
 * reports per-surface event coverage as defined by PCI.6.
 *
 * Does NOT emit events itself. The event-emit-audit-emitter wraps this
 * auditor and emits pulse.gate_passed / pulse.gate_failed based on the
 * coverage report.
 */
@Injectable()
export class SpineCoverageAuditorService {
  private readonly logger = new Logger(SpineCoverageAuditorService.name);

  public constructor(private readonly spineEmitter: SpineEmitterService) {}

  /**
   * Audit the most recent N events in the spine buffer.
   *
   * Returns a CoverageReport with per-surface ratios:
   *   coverageRatio = observedCanonicalEventNames.length / totalCanonicalTransitions
   *
   * A surface with zero canonical transitions in PCI.6 is excluded (ratio
   * would be NaN).
   */
  public audit(windowN: number = 1000): CoverageReport {
    const events = this.spineEmitter.recentEvents(windowN);
    const scannedEventCount = events.length;

    const eventNameSet = new Set(events.map((e) => e.eventName));

    const surfaces: SurfaceCoverage[] = [];

    for (const [surfaceId, prefixes] of B17_SURFACE_EVENT_PREFIXES) {
      const canonicalForSurface = this.canonicalEventNamesForSurface(prefixes);
      const totalCanonicalTransitions = canonicalForSurface.length;

      const observedCanonicalEventNames = canonicalForSurface.filter((name) =>
        eventNameSet.has(name),
      );

      if (totalCanonicalTransitions === 0) {
        this.logger.warn(`surface ${surfaceId} has zero canonical transitions — skipping`);
        continue;
      }

      const coverageRatio = observedCanonicalEventNames.length / totalCanonicalTransitions;

      const transitionsObserved = observedCanonicalEventNames
        .map((name) => EVENT_TO_TRANSITION.get(name))
        .filter((t): t is string => t !== undefined);

      surfaces.push({
        surfaceId,
        observedCanonicalEventNames: [...observedCanonicalEventNames].sort(),
        observedTransitionCount: observedCanonicalEventNames.length,
        totalCanonicalTransitions,
        coverageRatio,
        transitionsObserved: [...transitionsObserved].sort(),
      });
    }

    return {
      scannedEventCount,
      scannedWindowN: windowN,
      surfaces,
    };
  }

  /**
   * Return every canonical event name from PCI.6 that matches any of the
   * given prefixes for a surface.
   */
  private canonicalEventNamesForSurface(prefixes: readonly string[]): string[] {
    const names: string[] = [];
    for (const [eventName] of EVENT_TO_TRANSITION) {
      for (const prefix of prefixes) {
        if (eventName.startsWith(prefix)) {
          names.push(eventName);
          break;
        }
      }
    }
    return names;
  }
}
