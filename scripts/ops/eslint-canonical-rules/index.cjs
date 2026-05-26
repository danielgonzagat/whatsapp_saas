"use strict";

const noRogueUnknownRecord = require("./rules/no-rogue-unknown-record.cjs");
const noRoguePhoneNormalizer = require("./rules/no-rogue-phone-normalizer.cjs");
const noRogueClamp = require("./rules/no-rogue-clamp.cjs");

module.exports = {
  rules: {
    "no-rogue-unknown-record": noRogueUnknownRecord,
    "no-rogue-phone-normalizer": noRoguePhoneNormalizer,
    "no-rogue-clamp": noRogueClamp,
  },
};
