import {
  LooseObject,
  coerceArray,
  coerceObject,
  coerceString,
  pickFirstDefined,
} from '../common.helpers';

const CUSTOMER_PROFILE_ALIAS_FIELDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['whobuys', ['whobuys', 'idealCustomer']],
  ['pains', ['pains', 'painPoints']],
  ['promise', ['promise', 'promisedResult']],
  ['idealCustomer', ['idealCustomer', 'whobuys']],
  ['painPoints', ['painPoints', 'pains']],
  ['promisedResult', ['promisedResult', 'promise']],
] as const;

const CUSTOMER_PROFILE_STRING_FIELDS = ['knowledge', 'buyingPower', 'problem'] as const;
const CUSTOMER_PROFILE_ARRAY_FIELDS = ['genders', 'ages', 'moments'] as const;

export function flattenCustomerProfile(customerProfile: LooseObject): LooseObject {
  const result: LooseObject = {};
  for (const [field, candidates] of CUSTOMER_PROFILE_ALIAS_FIELDS) {
    result[field] = pickFirstDefined(customerProfile, candidates, '');
  }
  for (const field of CUSTOMER_PROFILE_ARRAY_FIELDS) {
    result[field] = coerceArray(customerProfile[field]);
  }
  for (const field of CUSTOMER_PROFILE_STRING_FIELDS) {
    result[field] = coerceString(customerProfile[field]);
  }
  return result;
}

export function flattenPositioning(positioning: LooseObject) {
  return {
    tier: positioning.tier || '',
    whenOffer: positioning.whenOffer || [],
    differentiators: positioning.differentiators || [],
    scarcity: positioning.scarcity || [],
    objectionStates: positioning.objectionStates || {},
  };
}

const SALES_ARGUMENTS_ARRAY_FIELDS = [
  'socialProof',
  'guarantee',
  'benefits',
  'urgencyArgs',
] as const;

const SALES_ARGUMENTS_OBJECT_FIELDS = [
  'socialProofValues',
  'guaranteeValues',
  'benefitsValues',
  'urgencyValues',
] as const;

const SALES_ARGUMENTS_BOOLEAN_FALLBACK_FIELDS = [
  'autoCheckoutLink',
  'offerDiscount',
  'useUrgency',
] as const;

export function flattenSalesArguments(
  salesArguments: LooseObject,
  followUpConfig: LooseObject,
): LooseObject {
  const result: LooseObject = {};
  for (const field of SALES_ARGUMENTS_ARRAY_FIELDS) {
    result[field] = coerceArray(salesArguments[field]);
  }
  for (const field of SALES_ARGUMENTS_OBJECT_FIELDS) {
    result[field] = coerceObject(salesArguments[field]);
  }
  for (const field of SALES_ARGUMENTS_BOOLEAN_FALLBACK_FIELDS) {
    result[field] = pickFirstDefined(
      { primary: salesArguments[field], secondary: followUpConfig[field] },
      ['primary', 'secondary'],
      true,
    );
  }
  return result;
}

export function flattenUpsellDownsell(upsellConfig: LooseObject, downsellConfig: LooseObject) {
  return {
    upsellEnabled: Boolean(upsellConfig.enabled),
    upsellTargetPlan: upsellConfig.targetPlan || '',
    upsellWhen: upsellConfig.when || '',
    upsellArgument: upsellConfig.argument || '',
    downsellEnabled: Boolean(downsellConfig.enabled),
    downsellTargetPlan: downsellConfig.targetPlan || '',
    downsellWhen: downsellConfig.when || '',
    downsellArgument: downsellConfig.argument || '',
  };
}

export function flattenFollowUpTechnical(
  config: LooseObject,
  followUpConfig: LooseObject,
  technicalInfo: LooseObject,
) {
  return {
    persistence: config.persistenceLevel ?? 3,
    followUp: followUpConfig.schedule || '',
    followUpHours: followUpConfig.hours ?? null,
    followUpMax: followUpConfig.maxFollowUps ?? null,
    hasTechInfo: Boolean(technicalInfo.hasTechInfo),
    usageMode: technicalInfo.usageMode || '',
    duration: technicalInfo.duration || '',
    contraindications: technicalInfo.contraindications || [],
    expectedResults: technicalInfo.expectedResults || [],
  };
}
