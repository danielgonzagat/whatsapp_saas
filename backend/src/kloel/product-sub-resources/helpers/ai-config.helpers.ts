import {
  LooseObject,
  parseNumber,
  parseObject,
  pickDefined,
  pickRenamed,
  removeUndefined,
  safeStr,
} from './common.helpers';
import {
  flattenCustomerProfile,
  flattenPositioning,
  flattenSalesArguments,
  flattenUpsellDownsell,
  flattenFollowUpTechnical,
} from './__companions__/ai-config.helpers.companion';

function normalizeAiTone(value: unknown): string | undefined {
  const normalized = safeStr(value).trim();
  if (!normalized) {
    return undefined;
  }

  const map: Record<string, string> = {
    consultive: 'CONSULTIVE',
    consultivo: 'CONSULTIVE',
    aggressive: 'AGGRESSIVE',
    agressivo: 'AGGRESSIVE',
    direct: 'DIRECT',
    direto: 'DIRECT',
    friendly: 'FRIENDLY',
    amigavel: 'FRIENDLY',
    amigável: 'FRIENDLY',
    empathetic: 'EMPATHETIC',
    empatico: 'EMPATHETIC',
    empático: 'EMPATHETIC',
    educative: 'EDUCATIVE',
    educativo: 'EDUCATIVE',
    urgent: 'URGENT',
    urgente: 'URGENT',
    technical: 'TECHNICAL',
    tecnico: 'TECHNICAL',
    técnico: 'TECHNICAL',
    casual: 'CASUAL',
    auto: 'AUTO',
  };

  return map[normalized.toLowerCase()] || normalized.toUpperCase();
}

function normalizeAiObjections(value: unknown): LooseObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      const objection = parseObject(entry);
      const label = safeStr(
        objection.label || objection.id || objection.q || objection.question,
        `Objeção ${index + 1}`,
      ).trim();
      const response = safeStr(objection.response || objection.a || objection.answer).trim();

      if (!label && !response) {
        return null;
      }

      return {
        id: safeStr(objection.id, `objection-${index + 1}`),
        label,
        response,
        q: label,
        a: response,
        enabled: objection.enabled !== false,
      };
    })
    .filter(Boolean);
}

const CUSTOMER_PROFILE_KEYS = [
  'whobuys',
  'pains',
  'promise',
  'idealCustomer',
  'painPoints',
  'promisedResult',
  'genders',
  'ages',
  'moments',
  'knowledge',
  'buyingPower',
  'problem',
] as const;

const POSITIONING_KEYS = [
  'tier',
  'whenOffer',
  'differentiators',
  'scarcity',
  'objectionStates',
] as const;

const SALES_ARGUMENT_SHARED_KEYS = ['autoCheckoutLink', 'offerDiscount', 'useUrgency'] as const;

const SALES_ARGUMENT_EXTRA_KEYS = [
  'socialProof',
  'socialProofValues',
  'guarantee',
  'guaranteeValues',
  'benefits',
  'benefitsValues',
  'urgencyArgs',
  'urgencyValues',
] as const;

const UPSELL_BODY_MAP = [
  ['upsellEnabled', 'enabled'],
  ['upsellTargetPlan', 'targetPlan'],
  ['upsellWhen', 'when'],
  ['upsellArgument', 'argument'],
] as const;

const DOWNSELL_BODY_MAP = [
  ['downsellEnabled', 'enabled'],
  ['downsellTargetPlan', 'targetPlan'],
  ['downsellWhen', 'when'],
  ['downsellArgument', 'argument'],
] as const;

const TECHNICAL_INFO_KEYS = [
  'hasTechInfo',
  'usageMode',
  'duration',
  'contraindications',
  'expectedResults',
] as const;

function buildCustomerProfilePatch(body: LooseObject, current: LooseObject, input: LooseObject) {
  return removeUndefined({
    ...current,
    ...input,
    ...pickDefined(body, CUSTOMER_PROFILE_KEYS),
  });
}

function buildPositioningPatch(body: LooseObject, current: LooseObject) {
  return removeUndefined({
    ...current,
    ...pickDefined(body, POSITIONING_KEYS),
  });
}

function buildSalesArgumentsPatch(
  body: LooseObject,
  current: LooseObject,
  input: LooseObject,
  followUpInput: LooseObject,
) {
  return removeUndefined({
    ...current,
    ...input,
    ...pickDefined(body, SALES_ARGUMENT_SHARED_KEYS),
    ...pickDefined(followUpInput, SALES_ARGUMENT_SHARED_KEYS),
    ...pickDefined(body, SALES_ARGUMENT_EXTRA_KEYS),
  });
}

function buildUpsellPatch(body: LooseObject, current: LooseObject) {
  return removeUndefined({
    ...current,
    ...pickRenamed(body, UPSELL_BODY_MAP),
  });
}

function buildDownsellPatch(body: LooseObject, current: LooseObject) {
  return removeUndefined({
    ...current,
    ...pickRenamed(body, DOWNSELL_BODY_MAP),
  });
}

function buildFollowUpPatch(body: LooseObject, current: LooseObject, input: LooseObject) {
  const patch: LooseObject = {
    ...current,
    ...input,
    ...pickDefined(body, SALES_ARGUMENT_SHARED_KEYS),
  };
  if (body.followUp !== undefined) {
    patch.schedule = body.followUp;
  }
  if (body.followUpHours !== undefined) {
    patch.hours = parseNumber(body.followUpHours);
  }
  if (body.followUpMax !== undefined) {
    patch.maxFollowUps = parseNumber(body.followUpMax);
  }
  return removeUndefined(patch);
}

function buildTechnicalInfoPatch(body: LooseObject, current: LooseObject) {
  return removeUndefined({
    ...current,
    ...pickDefined(body, TECHNICAL_INFO_KEYS),
  });
}

export function normalizeProductAiConfigInput(body: LooseObject, current?: LooseObject | null) {
  const currentCustomerProfile = parseObject(current?.customerProfile);
  const currentPositioning = parseObject(current?.positioning);
  const currentSalesArguments = parseObject(current?.salesArguments);
  const currentUpsellConfig = parseObject(current?.upsellConfig);
  const currentDownsellConfig = parseObject(current?.downsellConfig);
  const currentFollowUpConfig = parseObject(current?.followUpConfig);
  const currentTechnicalInfo = parseObject(current?.technicalInfo);

  const customerProfileInput = parseObject(body.customerProfile);
  const salesArgumentsInput = parseObject(body.salesArguments);
  const followUpConfigInput = parseObject(body.followUpConfig);

  return removeUndefined({
    customerProfile: buildCustomerProfilePatch(body, currentCustomerProfile, customerProfileInput),
    positioning: buildPositioningPatch(body, currentPositioning),
    objections: normalizeAiObjections(body.objections ?? current?.objections),
    salesArguments: buildSalesArgumentsPatch(
      body,
      currentSalesArguments,
      salesArgumentsInput,
      followUpConfigInput,
    ),
    upsellConfig: buildUpsellPatch(body, currentUpsellConfig),
    downsellConfig: buildDownsellPatch(body, currentDownsellConfig),
    tone: normalizeAiTone(body.tone ?? current?.tone),
    persistenceLevel: parseNumber(body.persistenceLevel) ?? parseNumber(body.persistence),
    messageLimit: parseNumber(body.messageLimit),
    followUpConfig: buildFollowUpPatch(body, currentFollowUpConfig, followUpConfigInput),
    technicalInfo: buildTechnicalInfoPatch(body, currentTechnicalInfo),
  });
}

export function serializeProductAiConfig(config: LooseObject | null | undefined) {
  if (!config) {
    return null;
  }

  const customerProfile = parseObject(config.customerProfile);
  const positioning = parseObject(config.positioning);
  const salesArguments = parseObject(config.salesArguments);
  const upsellConfig = parseObject(config.upsellConfig);
  const downsellConfig = parseObject(config.downsellConfig);
  const technicalInfo = parseObject(config.technicalInfo);
  const followUpConfig = parseObject(config.followUpConfig);
  const objections = normalizeAiObjections(config.objections);

  return {
    ...config,
    customerProfile,
    positioning,
    objections,
    salesArguments,
    upsellConfig,
    downsellConfig,
    technicalInfo,
    followUpConfig,
    ...flattenCustomerProfile(customerProfile),
    ...flattenPositioning(positioning),
    ...flattenSalesArguments(salesArguments, followUpConfig),
    ...flattenUpsellDownsell(upsellConfig, downsellConfig),
    ...flattenFollowUpTechnical(config, followUpConfig, technicalInfo),
  };
}
