/* eslint-disable radix */
const fs = require("fs");
const path = require("path");
const util = require("util");
const _ = require("lodash");
const set = require("set-value");
const get = require("get-value");

const whDefaultConfigJson = require("../../util/warehouse/WHDefaultConfig.json");
const whTrackConfigJson = require("../../util/warehouse/WHTrackConfig.json");
const whPageConfigJson = require("../../util/warehouse/WHPageConfig.json");
const whScreenConfigJson = require("../../util/warehouse/WHScreenConfig.json");
const whGroupConfigJson = require("../../util/warehouse/WHGroupConfig.json");
const whAliasConfigJson = require("../../util/warehouse/WHAliasConfig.json");
const reservedANSIKeywordsMap = require("../../util/warehouse/ReservedKeywords.json");

const fixIP = (payload, message, key) => {
  payload[key] = message.context
    ? message.context.ip
      ? message.context.ip
      : message.request_ip
    : message.request_ip;
};

const getMappingConfig = (config, dir) => {
  const mappingConfig = {};
  const categoryKeys = Object.keys(config);
  categoryKeys.forEach(categoryKey => {
    const category = config[categoryKey];
    mappingConfig[category.name] = JSON.parse(
      fs.readFileSync(path.resolve(dir, `./data/${category.name}.json`))
    );
  });
  return mappingConfig;
};

const isPrimitive = arg => {
  var type = typeof arg;
  return arg == null || (type != "object" && type != "function");
};

const isDefined = x => !_.isUndefined(x);
const isNotNull = x => x != null;
const isDefinedAndNotNull = x => isDefined(x) && isNotNull(x);

const toStringValues = obj => {
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === "object") {
      return toString(obj[key]);
    }

    obj[key] = "" + obj[key];
  });

  return obj;
};

const getDateInFormat = date => {
  var x = new Date(date);
  var y = x.getFullYear().toString();
  var m = (x.getMonth() + 1).toString();
  var d = x.getDate().toString();
  d.length == 1 && (d = "0" + d);
  m.length == 1 && (m = "0" + m);
  var yyyymmdd = y + m + d;
  return yyyymmdd;
};

const removeUndefinedValues = obj => _.pickBy(obj, isDefined);
const removeNullValues = obj => _.pickBy(obj, isNotNull);
const removeUndefinedAndNullValues = obj => _.pickBy(obj, isDefinedAndNotNull);

const updatePayload = (currentKey, eventMappingArr, value, payload) => {
  eventMappingArr.map(obj => {
    if (obj.rudderKey === currentKey) {
      set(payload, obj.expectedKey, value);
    }
  });
  return payload;
};

const toSnakeCase = str => {
  if (!str) return "";
  return String(str)
    .replace(/^[^A-Za-z0-9]*|[^A-Za-z0-9]*$/g, "")
    .replace(/([a-z])([A-Z])/g, (m, a, b) => a + "_" + b.toLowerCase())
    .replace(/[^A-Za-z0-9]+|_+/g, "_")
    .toLowerCase();
};

const isObject = value => {
  var type = typeof value;
  return (
    value != null &&
    (type == "object" || type == "function") &&
    !Array.isArray(value)
  );
};

const defaultGetRequestConfig = {
  requestFormat: "PARAMS",
  requestMethod: "GET"
};

const defaultPostRequestConfig = {
  requestFormat: "JSON",
  requestMethod: "POST"
};

const defaultDeleteRequestConfig = {
  requestFormat: "JSON",
  requestMethod: "DELETE"
};
const defaultPutRequestConfig = {
  requestFormat: "JSON",
  requestMethod: "PUT"
};

const defaultRequestConfig = () => {
  return {
    version: "1",
    type: "REST",
    method: "POST",
    endpoint: "",
    headers: {},
    params: {},
    body: {
      JSON: {},
      XML: {},
      FORM: {}
    },
    files: {}
  };
};

// Start of warehouse specific utils

// https://www.myintervals.com/blog/2009/05/20/iso-8601-date-validation-that-doesnt-suck/
// make sure to disable prettier for regex expression
// prettier-ignore
const timestampRegex = new RegExp(
  // eslint-disable-next-line no-useless-escape
  /^([\+-]?\d{4})((-)((0[1-9]|1[0-2])(-([12]\d|0[1-9]|3[01])))([T\s]((([01]\d|2[0-3])((:)[0-5]\d))([\:]\d+)?)?(:[0-5]\d([\.]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)$/
);

function validTimestamp(input) {
  return timestampRegex.test(input);
}

// // older implementation with fallback to new Date()
// function validTimestamp(input) {
//   // eslint-disable-next-line no-restricted-globals
//   if (!isNaN(input)) return false;
//   return new Date(input).getTime() > 0;
// }

const getDataType = val => {
  const type = typeof val;
  switch (type) {
    case "number":
      return Number.isInteger(val) ? "int" : "float";
    case "boolean":
      return "boolean";
    default:
      break;
  }
  if (validTimestamp(val)) {
    return "datetime";
  }
  return "string";
};

const toSafeDBString = str => {
  if (parseInt(str[0]) > 0) str = `_${str}`;
  str = str.replace(/[^a-zA-Z0-9_]+/g, "");
  return str.substr(0, 127);
};

function safeTableOld(provider, name = "") {
  let tableName = name;
  if (tableName === "") {
    tableName = "STRINGEMPTY";
  }
  if (provider === "snowflake") {
    tableName = tableName.toUpperCase();
  }
  if (provider === "postgres") {
    tableName = tableName.toLowerCase();
  }
  if (
    reservedANSIKeywordsMap[provider.toUpperCase()][tableName.toUpperCase()]
  ) {
    tableName = "_" + tableName;
  }
  return tableName;
}

function safeTable(provider, name = "") {
  let tableName = name;
  if (tableName === "") {
    throw new Error("Table name cannot be empty.");
  }
  if (provider === "snowflake") {
    tableName = tableName.toUpperCase();
  } else {
    tableName = tableName.toLowerCase();
  }
  if (
    reservedANSIKeywordsMap[provider.toUpperCase()][tableName.toUpperCase()]
  ) {
    tableName = "_" + tableName;
  }
  return tableName.substr(0, 127);
}

function safeColumnOld(provider, name = "") {
  let columnName = name;
  if (columnName === "") {
    columnName = "STRINGEMPTY";
  }
  if (provider === "snowflake") {
    columnName = columnName.toUpperCase();
  }
  if (provider === "postgres") {
    columnName = columnName.toLowerCase();
  }
  if (
    reservedANSIKeywordsMap[provider.toUpperCase()][columnName.toUpperCase()]
  ) {
    columnName = "_" + columnName;
  }
  return columnName;
}

function safeColumn(provider, name = "") {
  let columnName = name;
  if (columnName === "") {
    throw new Error("Column name cannot be empty.");
  }
  if (provider === "snowflake") {
    columnName = columnName.toUpperCase();
  } else {
    columnName = columnName.toLowerCase();
  }
  if (
    reservedANSIKeywordsMap[provider.toUpperCase()][columnName.toUpperCase()]
  ) {
    columnName = "_" + columnName;
  }
  return columnName.substr(0, 127);
}

/* transformColumnName convert keys like this &4yasdfa(84224_fs9##_____*3q to _4yasdfa_84224_fs9_3q
  it removes symbols and joins continuous letters and numbers with single underscore and if first char is a number will append a underscore before the first number
  few more examples
  omega     to omega
  omega v2  to omega_v2
  9mega     to _9mega
  mega&     to mega
  ome$ga    to ome_ga
  omega$    to omega
  ome_ ga   to ome_ga
  9mega________-________90 to _9mega_90
  it also handles char's where its ascii values are more than 127
  example:
  Cízǔ to C_z
  CamelCase123Key to camel_case123_key
  1CComega to _1_c_comega
  return an empty string if it couldn't find a char if its ascii value doesnt belong to numbers or english alphabets
*/
function transformName(name = "") {
  const extractedValues = [];
  let extractedValue = "";
  for (let i = 0; i < name.length; i++) {
    const c = name[i];
    const asciiValue = c.charCodeAt(0);
    if (
      (asciiValue >= 65 && asciiValue <= 90) ||
      (asciiValue >= 97 && asciiValue <= 122) ||
      (asciiValue >= 48 && asciiValue <= 57)
    ) {
      extractedValue += c;
    } else {
      if (extractedValue !== "") {
        extractedValues.push(extractedValue);
      }
      extractedValue = "";
    }
  }
  if (extractedValue !== "") {
    extractedValues.push(extractedValue);
  }
  let key = extractedValues.join("_");
  key = _.snakeCase(key);
  if (key !== "" && key.charCodeAt(0) >= 48 && key.charCodeAt(0) <= 57) {
    key = "_" + key;
  }
  return key;
}

function transformTableNameOld(name = "") {
  return toSnakeCase(name);
}

function transformColumnNameOld(name = "") {
  return toSafeDBString(name);
}

function transformColumnName(name = "", schemaVersion) {
  switch (schemaVersion) {
    case "v0":
      return transformColumnNameOld(name);
    default:
      return transformName(name);
  }
}

function transformTableName(name = "", schemaVersion) {
  switch (schemaVersion) {
    case "v0":
      return transformTableNameOld(name);
    default:
      return transformName(name);
  }
}

function safeColumnName(provider, schemaVersion, name = "") {
  switch (schemaVersion) {
    case "v0":
      return safeColumnOld(provider, name);
    default:
      return safeColumn(provider, name);
  }
}

function safeTableName(provider, schemaVersion, name = "") {
  switch (schemaVersion) {
    case "v0":
      return safeTableOld(provider, name);
    default:
      return safeTable(provider, name);
  }
}

const rudderCreatedTables = [
  "tracks",
  "users",
  "identifies",
  "pages",
  "screens",
  "aliases",
  "groups",
  "accounts"
];
function excludeRudderCreatedTableNames(name) {
  if (rudderCreatedTables.includes(name.toLowerCase())) {
    name = `_${name}`;
  }
  return name;
}

function setFromConfig(
  provider,
  schemaVersion,
  resp,
  input,
  configJson,
  columnTypes
) {
  Object.keys(configJson).forEach(key => {
    let val = get(input, key);
    if (val !== undefined || val !== null) {
      datatype = getDataType(val);
      if (datatype === "datetime") {
        val = new Date(val).toISOString();
      }
      const prop = configJson[key];
      const columnName = safeColumnName(provider, schemaVersion, prop);
      resp[columnName] = val;
      columnTypes[columnName] = datatype;
    }
  });
}

function setFromProperties(
  provider,
  schemaVersion,
  resp,
  input,
  columnTypes,
  prefix = ""
) {
  if (!input) return;
  Object.keys(input).forEach(key => {
    if (isObject(input[key])) {
      setFromProperties(
        provider,
        schemaVersion,
        resp,
        input[key],
        columnTypes,
        `${prefix + key}_`
      );
    } else {
      let val = input[key];
      if (val === null || val === undefined) {
        return;
      }
      datatype = getDataType(val);
      if (datatype === "datetime") {
        val = new Date(val).toISOString();
      }
      safeKey = transformColumnName(prefix + key, schemaVersion);
      if (safeKey != "") {
        safeKey = safeColumnName(provider, schemaVersion, safeKey);
        resp[safeKey] = val;
        columnTypes[safeKey] = datatype;
      }
    }
  });
}

function getColumns(provider, obj, columnTypes) {
  const columns = {};
  const uuidTS = provider === "snowflake" ? "UUID_TS" : "uuid_ts";
  columns[uuidTS] = "datetime";
  Object.keys(obj).forEach(key => {
    columns[key] = columnTypes[key] || getDataType(obj[key]);
  });
  return columns;
}

function processWarehouseMessage(provider, message, schemaVersion) {
  const responses = [];
  const eventType = message.type.toLowerCase();
  // store columnTypes as each column is set, so as not to call getDataType again
  const columnTypes = {};
  switch (eventType) {
    case "track": {
      const commonProps = {};
      setFromProperties(
        provider,
        schemaVersion,
        commonProps,
        message.context,
        columnTypes,
        "context_"
      );
      setFromConfig(
        provider,
        schemaVersion,
        commonProps,
        message,
        whTrackConfigJson,
        columnTypes
      );
      setFromConfig(
        provider,
        schemaVersion,
        commonProps,
        message,
        whDefaultConfigJson,
        columnTypes
      );

      // set event column based on event_text in the tracks table
      const eventColName = safeColumnName(provider, schemaVersion, "event");
      commonProps[eventColName] = transformTableName(
        commonProps[safeColumnName(provider, schemaVersion, "event_text")],
        schemaVersion
      );
      columnTypes[eventColName] = "string";

      // shallow copy is sufficient since it does not contains nested objects
      const tracksEvent = { ...commonProps };
      const tracksMetadata = {
        table: safeTableName(provider, schemaVersion, "tracks"),
        columns: getColumns(provider, tracksEvent, columnTypes),
        receivedAt: message.receivedAt
      };
      responses.push({
        metadata: tracksMetadata,
        data: tracksEvent
      });

      // do not create event table in case of empty event name (after transformColumnName)
      if (tracksEvent[eventColName] === "") {
        break;
      }

      const trackProps = {};
      setFromProperties(
        provider,
        schemaVersion,
        trackProps,
        message.properties,
        columnTypes
      );
      setFromProperties(
        provider,
        schemaVersion,
        trackProps,
        message.userProperties,
        columnTypes
      );

      // always set commonProps last so that they are not overwritten
      const trackEvent = { ...trackProps, ...commonProps };
      const trackEventMetadata = {
        table: excludeRudderCreatedTableNames(
          safeTableName(
            provider,
            schemaVersion,
            transformColumnName(trackEvent[eventColName], schemaVersion)
          )
        ),
        columns: getColumns(provider, trackEvent, columnTypes),
        receivedAt: message.receivedAt
      };
      responses.push({
        metadata: trackEventMetadata,
        data: trackEvent
      });
      break;
    }
    case "identify": {
      const commonProps = {};
      setFromProperties(
        provider,
        schemaVersion,
        commonProps,
        message.userProperties,
        columnTypes
      );
      setFromProperties(
        provider,
        schemaVersion,
        commonProps,
        message.context ? message.context.traits : {},
        columnTypes
      );
      setFromProperties(
        provider,
        schemaVersion,
        commonProps,
        message.traits,
        columnTypes,
        ""
      );

      // set context props
      setFromProperties(
        provider,
        schemaVersion,
        commonProps,
        message.context,
        columnTypes,
        "context_"
      );

      const usersEvent = { ...commonProps };
      usersEvent[safeColumnName(provider, schemaVersion, "id")] =
        message.userId;
      usersEvent[
        safeColumnName(provider, schemaVersion, "received_at")
      ] = message.receivedAt
        ? new Date(message.receivedAt).toISOString()
        : null;
      columnTypes[safeColumnName(provider, schemaVersion, "received_at")] =
        "datetime";
      const usersMetadata = {
        table: safeTableName(provider, schemaVersion, "users"),
        columns: getColumns(provider, usersEvent, columnTypes),
        receivedAt: message.receivedAt
      };
      responses.push({ metadata: usersMetadata, data: usersEvent });

      const identifiesEvent = { ...commonProps };
      setFromConfig(
        provider,
        schemaVersion,
        identifiesEvent,
        message,
        whDefaultConfigJson,
        columnTypes
      );
      const identifiesMetadata = {
        table: safeTableName(provider, schemaVersion, "identifies"),
        columns: getColumns(provider, identifiesEvent, columnTypes),
        receivedAt: message.receivedAt
      };
      responses.push({ metadata: identifiesMetadata, data: identifiesEvent });

      break;
    }
    case "page":
    case "screen": {
      const event = {};
      setFromProperties(
        provider,
        schemaVersion,
        event,
        message.properties,
        columnTypes
      );
      // set rudder properties after user set properties to prevent overwriting
      setFromProperties(
        provider,
        schemaVersion,
        event,
        message.context,
        columnTypes,
        "context_"
      );
      setFromConfig(
        provider,
        schemaVersion,
        event,
        message,
        whDefaultConfigJson,
        columnTypes
      );

      if (eventType === "page") {
        setFromConfig(
          provider,
          schemaVersion,
          event,
          message,
          whPageConfigJson,
          columnTypes
        );
      } else if (eventType === "screen") {
        setFromConfig(
          provider,
          schemaVersion,
          event,
          message,
          whScreenConfigJson,
          columnTypes
        );
      }

      const metadata = {
        table: safeTableName(provider, schemaVersion, `${eventType}s`),
        columns: getColumns(provider, event, columnTypes),
        receivedAt: message.receivedAt
      };
      responses.push({ metadata, data: event });
      break;
    }
    case "group": {
      const event = {};
      setFromProperties(provider, event, message.traits, columnTypes);
      setFromProperties(
        provider,
        schemaVersion,
        event,
        message.context,
        columnTypes,
        "context_"
      );
      setFromConfig(
        provider,
        schemaVersion,
        event,
        message,
        whDefaultConfigJson,
        columnTypes
      );
      setFromConfig(
        provider,
        schemaVersion,
        event,
        message,
        whGroupConfigJson,
        columnTypes
      );

      const metadata = {
        table: safeTableName(provider, schemaVersion, "groups"),
        columns: getColumns(provider, event, columnTypes),
        receivedAt: message.receivedAt
      };
      responses.push({ metadata, data: event });
      break;
    }
    case "alias": {
      const event = {};
      setFromProperties(provider, event, message.traits, columnTypes);
      setFromProperties(
        provider,
        schemaVersion,
        event,
        message.context,
        columnTypes,
        "context_"
      );
      setFromConfig(
        provider,
        schemaVersion,
        event,
        message,
        whDefaultConfigJson,
        columnTypes
      );
      setFromConfig(
        provider,
        schemaVersion,
        event,
        message,
        whAliasConfigJson,
        columnTypes
      );

      const metadata = {
        table: safeTableName(provider, schemaVersion, "aliases"),
        columns: getColumns(provider, event, columnTypes),
        receivedAt: message.receivedAt
      };
      responses.push({ metadata, data: event });
      break;
    }
    default:
      throw new Error("Unknown event type", eventType);
  }
  return responses;
}

// ref: https://stackoverflow.com/questions/5717093/check-if-a-javascript-string-is-a-url/49849482
function isURL(str) {
  var pattern = new RegExp(
    "^(https?:\\/\\/)?" + // protocol
    "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // domain name
    "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR ip (v4) address
    "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // port and path
    "(\\?[;&a-z\\d%_.~+=-]*)?" + // query string
      "(\\#[-a-z\\d_]*)?$",
    "i"
  ); // fragment locator
  return !!pattern.test(str);
}

// End of warehouse specific utils

module.exports = {
  getMappingConfig,
  toStringValues,
  getDateInFormat,
  removeUndefinedValues,
  removeNullValues,
  removeUndefinedAndNullValues,
  isObject,
  toSnakeCase,
  validTimestamp,
  getDataType,
  processWarehouseMessage,
  defaultGetRequestConfig,
  defaultPostRequestConfig,
  defaultDeleteRequestConfig,
  defaultPutRequestConfig,
  updatePayload,
  defaultRequestConfig,
  isPrimitive,
  fixIP,
  isURL
};
