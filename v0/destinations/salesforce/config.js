const { getMappingConfig } = require("../../util");

const ConfigCategory = {
  IDENTIFY: {
    name: "SFIdentifyConfig"
  },
  IGNORE: {
    name: "SFIgnoreConfig"
  }
};

const SF_API_VERSION = "50.0";
const SF_TOKEN_REQUEST_URL =
  "https://login.salesforce.com/services/oauth2/token";
const SF_TOKEN_REQUEST_URL_SANDBOX =
  "https://test.salesforce.com/services/oauth2/token";
const SF_TOKEN_REQUEST_URL = process.env.SF_TOKEN_REQUEST_URL
  ?  process.env.SF_TOKEN_REQUEST_URL: "https://login.salesforce.com/services/oauth2/token";

const SF_CONTACT_OWNER_ID = process.env.SF_CONTACT_OWNER_ID
  ? process.env.SF_CONTACT_OWNER_ID:"00554000008kLjBAAU"; //API User

const mappingConfig = getMappingConfig(ConfigCategory, __dirname);

module.exports = {
  SF_API_VERSION,
  SF_TOKEN_REQUEST_URL,
  SF_TOKEN_REQUEST_URL_SANDBOX,
  SF_CONTACT_OWNER_ID,
  identifyMappingJson: mappingConfig[ConfigCategory.IDENTIFY.name],
  ignoredTraits: mappingConfig[ConfigCategory.IGNORE.name]
};
