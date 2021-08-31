const SFPARDOT_API_VERSION = "4";
const SF_TOKEN_REQUEST_URL = process.env.SF_TOKEN_REQUEST_URL
  ?  process.env.SF_TOKEN_REQUEST_URL: "https://login.salesforce.com/services/oauth2/token";

const SFPARDOT_API_REQUEST_URL = process.env.SFPARDOT_API_REQUEST_URL
    ?  process.env.SFPARDOT_API_REQUEST_URL: "https://pi.demo.pardot.com/api";

module.exports = {
  SFPARDOT_API_VERSION,
  SF_TOKEN_REQUEST_URL,
  SFPARDOT_API_REQUEST_URL
};
