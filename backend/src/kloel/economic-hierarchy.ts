export type HierarchyLevel =
  | 'compliance'
  | 'margin'
  | 'conversion'
  | 'retention'
  | 'ux'
  | 'learning'
  | 'exploration';

export type HierarchyDecision = {
  type: string;
  chosen: string;
  context: Record<string, unknown>;
  channelConfig?: Record<string, unknown>;
};

export type HierarchyJustification = {
  level: HierarchyLevel;
  reason: string;
};

export function attributeHierarchy(decision: HierarchyDecision): HierarchyJustification {
  const deferred = (...rules: Array<HierarchyJustification | null>): HierarchyJustification | null =>
    rules.find((r) => r !== null) ?? null;

  const formatLevel = (raw: string): HierarchyLevel => {
    if ((HIERARCHY_LEVELS as readonly string[]).includes(raw)) return raw as HierarchyLevel;
    return 'conversion';
  };

  return (
    deferred(
      ruleHumanTransferUx(decision),
      ruleDiscountComplianceMargin(decision),
      ruleProactiveOutboundCompliance(decision),
      ruleRefundLegitimacy(decision),
      ruleChurnRetention(decision),
      ruleAntiRemorseRetention(decision),
      rulePostSaleSatisfactionRetention(decision),
      ruleAggressivenessCeilingUx(decision),
      ruleAudioPreferenceUx(decision),
      ruleHighestMarginOffer(decision),
      ruleTopSellerConversion(decision),
      ruleAggressivenessEscalationConversion(decision),
      ruleExploratoryLearning(decision),
    ) ?? { level: formatLevel('conversion'), reason: 'default: unclassified' }
  );
}

const HIERARCHY_LEVELS = [
  'compliance',
  'margin',
  'conversion',
  'retention',
  'ux',
  'learning',
  'exploration',
] as const;

// R1 — human_transfer with trust_objection or fatigue_risk → ux (lead experience)
function ruleHumanTransferUx(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'human_transfer') return null;
  const concepts = extractConcepts(decision.context);
  if (concepts.has('trust_objection') || concepts.has('fatigue_risk')) {
    const conceptName = concepts.has('trust_objection') ? 'trust_objection' : 'fatigue_risk';
    return {
      level: 'ux',
      reason: `human_transfer triggered by ${conceptName}: prioritizes lead experience over insistence`,
    };
  }
  return null;
}

// R2 — apply_discount with discountPercent > channelMaxDiscount → blocked compliance;
//       if within bounds and product margin still positive → margin
function ruleDiscountComplianceMargin(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'coupon_offer' && decision.type !== 'apply_discount') return null;
  const discountPercent = Number(decision.context.discountPercent ?? 0);
  const channelMaxDiscount = Number(decision.context.channelMaxDiscount ?? 100);
  const marginRemaining = Number(decision.context.marginRemaining ?? decision.context.productMargin ?? -1);

  if (discountPercent > channelMaxDiscount) {
    return {
      level: 'compliance',
      reason: `discount ${discountPercent}% exceeds channel maximum ${channelMaxDiscount}% — blocked by compliance/margin boundary`,
    };
  }
  if (marginRemaining >= 0 && marginRemaining > 0) {
    return {
      level: 'margin',
      reason: `discount ${discountPercent}% within channel limit (${channelMaxDiscount}%), margin remains positive — incremental margin favored`,
    };
  }
  if (discountPercent > 0 && marginRemaining <= 0 && discountPercent <= channelMaxDiscount) {
    return {
      level: 'compliance',
      reason: `discount ${discountPercent}% would erase margin (margin remaining ${marginRemaining}) — compliance prohibits loss-making discount`,
    };
  }
  return null;
}

// R3 — proactive_outbound past daily limit → blocked compliance
function ruleProactiveOutboundCompliance(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'proactive_outbound' && decision.type !== 'channel_choice') return null;
  const dailySent = Number(decision.context.dailySent ?? 0);
  const dailyLimit = Number(decision.context.dailyLimit ?? -1);
  if (dailyLimit >= 0 && dailySent >= dailyLimit) {
    return {
      level: 'compliance',
      reason: `proactive outbound at ${dailySent}/${dailyLimit} daily messages — blocked by compliance ceiling`,
    };
  }
  return null;
}

// R10 — refund_request with legitimate reason → compliance (legitimacy before conversion)
function ruleRefundLegitimacy(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'refund_request') return null;
  const concepts = extractConcepts(decision.context);
  const legitimateReasons = [
    'defective_product',
    'not_as_described',
    'never_received',
    'duplicate_charge',
    'cancelled_within_window',
  ];
  for (const reason of legitimateReasons) {
    if (concepts.has(reason)) {
      return {
        level: 'compliance',
        reason: `refund requested with legitimate reason "${reason}" — compliance/legitimacy requires honoring before any conversion attempt`,
      };
    }
  }
  return null;
}

// R11 — churn_signal detected → retention (anti-churn: don't poison with new conversion offers)
function ruleChurnRetention(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'churn_signal') return null;
  const churnRisk = Number(decision.context.churnRisk ?? 0);
  const satisfactionScore = Number(decision.context.satisfactionScore ?? 1);

  if (churnRisk >= 0.5 || satisfactionScore < 0.4) {
    return {
      level: 'retention',
      reason: `churn risk ${churnRisk} / satisfaction ${satisfactionScore} — retention priority blocks poisonous conversion`,
    };
  }
  return null;
}

// R12 — buyer_remorse detected within 7d of purchase → retention (anti-remorse before conversion)
function ruleAntiRemorseRetention(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'buyer_remorse') return null;
  const daysSincePurchase = Number(decision.context.daysSincePurchase ?? -1);
  const remorseScore = Number(decision.context.remorseScore ?? -1);

  const withinWindow = daysSincePurchase >= 0 && daysSincePurchase <= 7;
  const highRemorse = remorseScore >= 0 && remorseScore >= 0.6;

  if (withinWindow || highRemorse) {
    return {
      level: 'retention',
      reason: `buyer remorse detected (${daysSincePurchase >= 0 ? `${daysSincePurchase}d post-purchase` : 'unknown timing'}, score ${remorseScore >= 0 ? remorseScore : 'N/A'}) — retention/anti-remorse must precede any conversion attempt`,
    };
  }
  return null;
}

// R13 — post_sale_offer with low satisfaction/NPS → retention (don't cross-sell unhappy customers)
function rulePostSaleSatisfactionRetention(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'post_sale_offer') return null;
  const nps = Number(decision.context.nps ?? 10);
  const satisfaction = Number(decision.context.satisfaction ?? 1);
  const concepts = extractConcepts(decision.context);

  if (nps < 6 || satisfaction < 0.5 || concepts.has('unresolved_complaint')) {
    return {
      level: 'retention',
      reason: `post-sale offer blocked — NPS ${nps} / satisfaction ${satisfaction} below threshold, retention/legitimacy gates before conversion`,
    };
  }
  return null;
}

// R4 — chosen aggressiveness was upper-bound (within ceiling) → bounded by ux (ceiling = ux-driven cap)
function ruleAggressivenessCeilingUx(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'cia_aggressiveness') return null;
  const ceiling = String(decision.context.aggressivenessCeiling ?? '').toLowerCase();
  const brainAggressiveness = String(decision.context.brainAggressiveness ?? '').toLowerCase();
  const effective = String(decision.chosen).toLowerCase();

  if (!ceiling && !brainAggressiveness) return null;

  const rank = (label: string): number => {
    if (label.includes('alta') || label.includes('agress') || label.includes('high')) return 3;
    if (label.includes('normal') || label.includes('moder') || label.includes('medium')) return 2;
    if (label.includes('baixa') || label.includes('low')) return 1;
    return 2;
  };

  const brainRank = rank(brainAggressiveness);
  const ceilingRank = rank(ceiling);
  const effectiveRank = rank(effective);

  if (ceiling && brainRank >= ceilingRank && effectiveRank <= ceilingRank) {
    return {
      level: 'ux',
      reason: `aggressiveness "${effective}" respects operator ceiling "${ceiling}" — ux-driven cap enforced`,
    };
  }
  return null;
}

// R5 — audio chosen because arsenal exists AND audioRatio prior says lead prefers audio → ux
function ruleAudioPreferenceUx(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'audio_vs_text') return null;
  const chosen = String(decision.chosen).toLowerCase();
  if (chosen !== 'audio') return null;
  const audioRatio = Number(decision.context.audioRatio ?? 0);
  const arsenalCount = Number(decision.context.arsenalCount ?? 0);
  const hasAudioPreference = hasConceptInContext(decision.context, 'audio_preference');

  if (arsenalCount > 0 && (hasAudioPreference || audioRatio >= 0.2)) {
    return {
      level: 'ux',
      reason: `audio chosen — arsenal (${arsenalCount} assets) exists and lead prefers audio (ratio ${audioRatio})`,
    };
  }
  return null;
}

// R6 — product_offer is highest_margin variant chosen → margin
function ruleHighestMarginOffer(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'product_offer') return null;
  const chosen = String(decision.chosen).toLowerCase();
  if (chosen === 'highest_margin') {
    return {
      level: 'margin',
      reason: `product offer "${chosen}" — highest-margin variant selected, incremental margin > vanity conversion`,
    };
  }
  return null;
}

// R7 — 'top_seller' chosen due to high replied_rate prior → conversion
function ruleTopSellerConversion(decision: HierarchyDecision): HierarchyJustification | null {
  if (decision.type !== 'product_offer') return null;
  const chosen = String(decision.chosen).toLowerCase();
  if (chosen !== 'top_seller') return null;
  const repliedRate = Number(decision.context.repliedRate ?? 0);
  if (repliedRate >= 0.4) {
    return {
      level: 'conversion',
      reason: `top_seller chosen — replied_rate prior (${repliedRate}) indicates conversion opportunity`,
    };
  }
  return null;
}

// R8 — aggressiveness escalated (within ceiling) due to imminent_purchase concept → conversion
function ruleAggressivenessEscalationConversion(
  decision: HierarchyDecision,
): HierarchyJustification | null {
  if (decision.type !== 'cia_aggressiveness') return null;
  const concepts = extractConcepts(decision.context);
  if (!concepts.has('imminent_purchase') && !concepts.has('hot_lead')) return null;

  const chosen = String(decision.chosen).toLowerCase();
  const rank = (label: string): number => {
    if (label.includes('alta') || label.includes('agress') || label.includes('high')) return 3;
    if (label.includes('normal') || label.includes('moder') || label.includes('medium')) return 2;
    if (label.includes('baixa') || label.includes('low')) return 1;
    return 2;
  };

  if (rank(chosen) >= 2) {
    return {
      level: 'conversion',
      reason: `aggressiveness "${chosen}" escalated — imminent purchase intent detected, incremental conversion > message volume`,
    };
  }
  return null;
}

// R9 — chosen variant has confidence < 0.5 but baseline was equal → learning
function ruleExploratoryLearning(decision: HierarchyDecision): HierarchyJustification | null {
  const confidence = Number(decision.context.confidence ?? 1);
  const baselineConfidence = Number(decision.context.baselineConfidence ?? 1);

  if (confidence < 0.5 && baselineConfidence < 0.5) {
    return {
      level: 'learning',
      reason: `confidence ${confidence} below 0.5 — exploring within low-risk window, baseline equally uncertain`,
    };
  }
  return null;
}

function extractConcepts(context: Record<string, unknown>): Set<string> {
  const concepts = new Set<string>();
  const concept = context.concept;
  if (typeof concept === 'string' && concept.length > 0) {
    concepts.add(concept);
  }
  const conceptsArr = context.concepts;
  if (Array.isArray(conceptsArr)) {
    for (const c of conceptsArr) {
      if (typeof c === 'string' && c.length > 0) concepts.add(c);
    }
  }
  return concepts;
}

function hasConceptInContext(context: Record<string, unknown>, target: string): boolean {
  return extractConcepts(context).has(target);
}
