const CIA_CONTACT_CATALOG_LOOKBACK_DAYS = Math.max(
  7,
  Number.parseInt(process.env.CIA_CONTACT_CATALOG_LOOKBACK_DAYS || '30', 10) || 30,
);

const CIA_BOOTSTRAP_IMMEDIATE_LIMIT = Math.max(
  1,
  Math.min(20, Number.parseInt(process.env.CIA_BOOTSTRAP_IMMEDIATE_LIMIT || '5', 10) || 5),
);

const CIA_BOOTSTRAP_AUTO_CONTINUE =
  String(process.env.CIA_BOOTSTRAP_AUTO_CONTINUE || 'true').toLowerCase() !== 'false';
const CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT = Math.max(
  1,
  Math.min(
    2000,
    Number.parseInt(process.env.CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT || '500', 10) || 500,
  ),
);

export {
  CIA_CONTACT_CATALOG_LOOKBACK_DAYS,
  CIA_BOOTSTRAP_IMMEDIATE_LIMIT,
  CIA_BOOTSTRAP_AUTO_CONTINUE,
  CIA_BOOTSTRAP_AUTO_CONTINUE_LIMIT,
};
