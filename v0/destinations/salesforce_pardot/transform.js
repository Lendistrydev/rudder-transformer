const axios = require("axios");
const {EventType} = require("../../../constants");
const {
    SF_TOKEN_REQUEST_URL,
    SFPARDOT_API_REQUEST_URL,
    ignoredTraits, SFPARDOT_API_VERSION
} = require("./config");
const {
    defaultRequestConfig,
    defaultPostRequestConfig,
    getFieldValueFromMessage,
    getSuccessRespEvents,
    getErrorRespEvents,
    CustomError
} = require("../../util");
const logger = require("../../../logger");

// Utility method to construct the header to be used for SFDC API calls
// The "Authorization: Bearer <token>" header element needs to be passed for
// authentication for all SFDC REST API calls
async function getSFPardotHeader(destination) {

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
    prospectMap,
    authorizationData
) {

    let pardotCreateEndPointURL = `${SFPARDOT_API_REQUEST_URL}/prospect/version/4/do/create?format=json`;
    let pardotUpdateEndPointURL = `${SFPARDOT_API_REQUEST_URL}/prospect/version/4/do/update/id/`;
    const response = defaultRequestConfig();

    const header = {
        Authorization: authorizationData.token,
        "Pardot-Business-Unit-Id": authorizationData.businessUnitId,
        "Content-Type": "application/x-www-form-urlencoded"
    };

    response.method = defaultPostRequestConfig.requestMethod;
    response.headers = header;

    if( prospectMap) {
        // Update existing Prospect REQUEST
        logger.info('Update Prospect request for: ' + traits.email + ' with TenantId: ' + traits.tenantId);
        pardotEndPointURL = pardotUpdateEndPointURL + prospectMap.prospectId + `?format=json`;

    } else {
        // Create New Prospect
        logger.info('Create Prospect request for: ' + traits.email + ' with TenantId: ' + traits.tenantId);
        pardotEndPointURL = pardotCreateEndPointURL;
    }

    response.body.FORM = {
        email: traits.email,
        first_name: traits.first_name,
        last_name: traits.last_name,
        tenantID: traits.tenantId
    };
    response.endpoint = pardotEndPointURL;
    response.statusCode = 200;

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
async function getPardotProspectsFromPayload(message, authorizationData) {
    // define default map
    const prospectsMaps = [];

    const email = getFieldValueFromMessage(message, "email");
    //const tenantId = getFieldValueFromMessage(message, "tenantID");
    const traits = getFieldValueFromMessage(message, "traits");
    let requestTenantId = traits.tenantId;

    if (!email || !requestTenantId) {
        throw new CustomError("Missing Email address and/or TenantID for Prospect Objet", 400);
    }

    const prospectQueryURL = `${SFPARDOT_API_REQUEST_URL}/prospect/version/${SFPARDOT_API_VERSION}/do/read/email/${encodeURIComponent(email)}&format=json`;
    const prospectQueryResponse = await axios.get(prospectQueryURL, {
        headers: {
            Authorization: authorizationData.token,
            "Pardot-Business-Unit-Id": authorizationData.businessUnitId,
        }
    }).catch(function(error) {
        logger.info('Prospect: ' + email + ' with tenantId: ' + requestTenantId + ' does not exist in Pardot');
    });

    if (
        prospectQueryResponse &&
        prospectQueryResponse.data
    ) {
        // if count is greater than zero, it means that multiple prospects exists in Pardot with same tenant ID
        // this case can happen if such prospects are created manually in Pardot
        if (prospectQueryResponse.data.prospect && Array.isArray(prospectQueryResponse.data.prospect)) {
            prospectQueryResponse.data.prospect.forEach(p => {
                const {tenantID, id} = p;
                if(tenantID == requestTenantId) {
                    // Add a Prospect to the be updated
                    prospectsMaps.push({prospectId: id});
                }
            });
        } else if (prospectQueryResponse.data.prospect && typeof prospectQueryResponse.data.prospect == 'object') {
            // Only 1 prospect exists and is returned from Pardot
            if(prospectQueryResponse.data.prospect.tenantID == requestTenantId) {
                prospectsMaps.push({prospectId: prospectQueryResponse.data.prospect.id});
            }
        }
    }

    return prospectsMaps;
}


// Function for handling identify events
async function processIdentify(message, authorizationData, mapProperty) {
    // check the traits before hand
    const traits = getFieldValueFromMessage(message, "traits");
    if (!traits) {
        throw new CustomError("Invalid traits for Salesforce request", 400);
    }

    // get Pardot Users based on email and tenant ID from payload
    // TODO: Replace message with traits?
    const prospectMaps = await getPardotProspectsFromPayload(
        message,
        authorizationData
    );

    // if traits is correct, start processing
    const responseData = [];

    if (prospectMaps.length > 0) {
        prospectMaps.forEach(prospectMap => {
        responseData.push(
            responseBuilderSimple(
                traits,
                prospectMap,
                authorizationData
            )
        );
        })
    } else {
        responseData.push(
            responseBuilderSimple(
                traits,
                undefined,
                authorizationData
            )
        );
    }

    return responseData;
}

// Generic process function which invokes specific handler functions depending on message type
// and event type where applicable. Currently, this Pardot transformer only handles IDENTIFY events.
async function processSingleMessage(message, authorizationData, mapProperty) {

    let response;
    if (message.type === EventType.IDENTIFY) {
        response = await processIdentify(message, authorizationData, mapProperty);
    } else {
        throw new CustomError(`message type ${message.type} is not supported`, 400);
    }
    return response;
}

async function process(event) {
    // Get the authorization header
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
