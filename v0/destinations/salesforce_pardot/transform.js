const get = require("get-value");
const axios = require("axios");
const { EventType } = require("../../../constants");
const {
  SF_API_VERSION,
  SF_TOKEN_REQUEST_URL,
  SF_CONTACT_OWNER_ID,
  identifyMappingJson,
  ignoredTraits
} = require("./config");
const {
  removeUndefinedValues,
  defaultRequestConfig,
  defaultPostRequestConfig,
  getFieldValueFromMessage,
  constructPayload,
  getFirstAndLastName,
  getSuccessRespEvents,
  getErrorRespEvents,
  CustomError
} = require("../../util");
const logger = require("../../../logger");

// Utility method to construct the header to be used for SFDC API calls
// The "Authorization: Bearer <token>" header element needs to be passed for
// authentication for all SFDC REST API calls
async function getSFPardotHeader(destination) {
  const tempURL =`${SF_TOKEN_REQUEST_URL}`;
  logger.info(tempURL);
  const authUrl = `${SF_TOKEN_REQUEST_URL}?username=${
    destination.Config.userName
  }&password=${encodeURIComponent(
    destination.Config.password
  )}&client_id=${
    destination.Config.consumerKey
  }&client_secret=${destination.Config.consumerSecret}&grant_type=password`;


  let response;
  try {
    response = await axios.post(authUrl, {});
  } catch (error) {
    throw new CustomError(
      `SALESFORCE AUTH FAILED: ${error.message}`,
      error.status || 400
    );
  }

  return {
    token: `Bearer ${response.data.access_token}`,
    instanceUrl: response.data.instance_url,
    businessUnitId: destination.Config.businessUnitId
  };
}

function responseBuilderSimple(
  traits,
  authorizationData,
  mapProperty
) {

  // if id is valid, do update else create the object
  // POST for create, PATCH for update
  // let targetEndpoint = `${authorizationData.instanceUrl}/services/data/v${SF_API_VERSION}/sobjects/${salesforceType}`;
  let pardotEndPointURL = `https://pi.demo.pardot.com/api/prospect/version/4/do/create?format=json`;

  // const tenantId = '';
  // const userId = '';
  //
  // if (tenantId && userId) {
  //   // pardotEndPointURL += `/${salesforceId}?_HttpMethod=PATCH`;
  //   logger.info('t + u = ' + tenantId + ' ' + userId);
  //   pardotEndPointURL = 'https://pi.demo.pardot.com/api/prospect/version/4/do/update/id/${userId}?format=json';
  // }

  // First name and last name need to be extracted from the name field
  // get traits from the message
  let rawPayload = traits;
  // map using the config only if the type is Lead

    rawPayload = constructPayload(
      { ...traits, ...getFirstAndLastName(traits, "n/a") },
      identifyMappingJson
    );

  logger.info('rawPayload  = ' + rawPayload);

  const response = defaultRequestConfig();
  const header = {
    Authorization: authorizationData.token,
    "Pardot-Business-Unit-Id": authorizationData.businessUnitId,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  response.method = defaultPostRequestConfig.requestMethod;
  response.headers = header;
  response.body.FORM = removeUndefinedValues(rawPayload);
  response.endpoint = pardotEndPointURL;

  logger.info('^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^')
  return response;
}

// Check for externalId field under context and look for probable Salesforce objects
// We'll make separate requests for every Salesforce Object types present under externalIds
//
// Expected externalId map for Contact object:
//
// ------------------------
// {
//   "type": "Salesforce-Contact",
//   "id": "0035g000001FaHfAAK"
// }
// ------------------------
//
// We'll use the Salesforce Object names by removing "Salesforce-" string from the type field
//
// Default Object type will be "Lead" for backward compatibility
async function getSalesforceIdFromPayload(message, authorizationData) {
  // define default map
  const salesforceMaps = [];

  const contactId = get(message, "properties.contactId");
  const salesforceTrue = get(message, "properties.salesforce", { default: false });
  if (contactId && salesforceTrue) {
	  salesforceMaps.push({salesforceType: "Event"})
  }

  // get externalId
  const externalIds = get(message, "context.externalId");

  // if externalIds are present look for type `Salesforce-`
  if (externalIds && Array.isArray(externalIds)) {
    externalIds.forEach(extIdMap => {
      const { type, id } = extIdMap;
      if (type.includes("Salesforce")) {
        salesforceMaps.push({
          salesforceType: type.replace("Salesforce-", ""),
          salesforceId: id
        });
      }
    });
  }

  // if nothing is present consider it as a Lead Object
  // BACKWORD COMPATIBILITY
  if (salesforceMaps.length === 0 && message.type === EventType.IDENTIFY) {
    // its a lead object. try to get lead object id using search query
    // check if the lead exists
    // need to perform a parameterized search for this using email
    const email = getFieldValueFromMessage(message, "email");

    if (!email) {
      throw new CustomError("Invalid Email address for Lead Objet", 400);
    }

    const leadQueryUrl = `${authorizationData.instanceUrl}/services/data/v${SF_API_VERSION}/parameterizedSearch/?q=${email}&sobject=Lead&Lead.fields=id`;

    // request configuration will be conditional
    const leadQueryResponse = await axios.get(leadQueryUrl, {
      headers: { Authorization: authorizationData.token }
    });

    let leadObjectId;
    if (
      leadQueryResponse &&
      leadQueryResponse.data &&
      leadQueryResponse.data.searchRecords
    ) {
      // if count is greater than zero, it means that lead exists, then only update it
      // else the original endpoint, which is the one for creation - can be used
      if (leadQueryResponse.data.searchRecords.length > 0) {
        leadObjectId = leadQueryResponse.data.searchRecords[0].Id;
      }
    }

    // add a Lead Object to the response
    salesforceMaps.push({ salesforceType: "Lead", salesforceId: leadObjectId });
  }

  return salesforceMaps;
}

// Function for handling identify events
async function processIdentify(message, authorizationData, mapProperty) {
  // check the traits before hand
  const traits = getFieldValueFromMessage(message, "traits");
  if (!traits) {
    throw new CustomError("Invalid traits for Salesforce request", 400);
  }

  // if traits is correct, start processing
  const responseData = [];


  logger.info('--------------------------------- Start ----------------------------------------');
  responseData.push(
      responseBuilderSimple(
          traits,
          authorizationData,
          mapProperty
      )
  );
  logger.info('--------------------------------- End ----------------------------------------');

  return responseData;
}
//
// Function for handling track events
async function processTrack(message, authorizationData, mapProperty) {


  const traits = {
	"Who": {
        "attributes": {"type": "Contact"},
        "ID__c": get(message, "properties.contactId")
        },
        "Subject": get(message, "event"),
        "StartDateTime": get(message, "originalTimestamp"),
        "EndDateTime": get(message, "originalTimestamp"),
        "OwnerId": SF_CONTACT_OWNER_ID
    }

  const responseData = [];

  // get salesforce object map
  const salesforceMaps = await getSalesforceIdFromPayload(
    message,
    authorizationData
  );

  // iterate over the object types found
  salesforceMaps.forEach(salesforceMap => {
    // finally build the response and push to the list
    responseData.push(
      responseBuilderSimple(
        traits,
        salesforceMap,
        authorizationData,
        mapProperty
      )
    );
  });

  return responseData;
}

// Generic process function which invokes specific handler functions depending on message type
// and event type where applicable
async function processSingleMessage(message, authorizationData, mapProperty) {

  let response;
  if (message.type === EventType.IDENTIFY) {
    response = await processIdentify(message, authorizationData, mapProperty);
  } else if (message.type === EventType.TRACK) {
    response = await processTrack(message, authorizationData, mapProperty);
  } else {
    throw new CustomError(`message type ${message.type} is not supported`, 400);
  }
  return response;
}

async function process(event) {
  // Get the authorization header if not available

  const authorizationData = await getSFPardotHeader(event.destination);
  const response = await processSingleMessage(
    event.message,
    authorizationData,
    event.destination.Config.mapProperty === undefined
      ? true
      : event.destination.Config.mapProperty
  );
  return response;
}

const processRouterDest = async inputs => {
  if (!Array.isArray(inputs) || inputs.length <= 0) {
    const respEvents = getErrorRespEvents(null, 400, "Invalid event array");
    return [respEvents];
  }

  let authorizationData;
  try {
    authorizationData = await getSFDCHeader(inputs[0].destination);
  } catch (error) {
    const respEvents = getErrorRespEvents(
      inputs.map(input => input.metadata),
      400,
      "Authorisation failed"
    );
    return [respEvents];
  }

  if (!authorizationData) {
    const respEvents = getErrorRespEvents(
      inputs.map(input => input.metadata),
      400,
      "Authorisation failed"
    );
    return [respEvents];
  }

  const respList = await Promise.all(
    inputs.map(async input => {
      try {
        if (input.message.statusCode) {
          // already transformed event
          return getSuccessRespEvents(
            input.message,
            [input.metadata],
            input.destination
          );
        }

        // unprocessed payload
        return getSuccessRespEvents(
          await processSingleMessage(
            input.message,
            authorizationData,
            input.destination.Config.mapProperty === undefined
              ? true
              : input.destination.Config.mapProperty
          ),
          [input.metadata],
          input.destination
        );
      } catch (error) {
        return getErrorRespEvents(
          [input.metadata],
          error.response ? error.response.status : 500, // default to retryable
          error.message || "Error occurred while processing payload."
        );
      }
    })
  );
  return respList;
};

module.exports = { process, processRouterDest };
