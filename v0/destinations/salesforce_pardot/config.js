const { getMappingConfig } = require("../../util");

const ConfigCategory = {
  IDENTIFY: {
    name: "SFPardotIdentifyConfig"
  },
  IGNORE: {
    name: "SFPardotIgnoreConfig"
  }
};

const SFPARDOT_API_VERSION = "4";
const SF_TOKEN_REQUEST_URL = process.env.SF_TOKEN_REQUEST_URL
  ?  process.env.SF_TOKEN_REQUEST_URL: "https://login.salesforce.com/services/oauth2/token";

const SFPARDOT_API_REQUEST_URL = process.env.SFPARDOT_API_REQUEST_URL
    ?  process.env.SFPARDOT_API_REQUEST_URL: "https://pi.demo.pardot.com/api";


const SF_CONTACT_OWNER_ID = process.env.SF_CONTACT_OWNER_ID
  ? process.env.SF_CONTACT_OWNER_ID:"00554000008kLjBAAU"; //API User

const mappingConfig = getMappingConfig(ConfigCategory, __dirname);

module.exports = {
  SFPARDOT_API_VERSION,
  SF_TOKEN_REQUEST_URL,
  SFPARDOT_API_REQUEST_URL,
  SF_CONTACT_OWNER_ID,
  identifyMappingJson: mappingConfig[ConfigCategory.IDENTIFY.name],
  ignoredTraits: mappingConfig[ConfigCategory.IGNORE.name]
};
