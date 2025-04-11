import fetch from "node-fetch";

// --- Configuration and constants ---
const EMAIL = "rithigasri.b@cprime.com";
const API_TOKEN = "******";
const WORKSPACE_ID = "9639f74b-a7d7-4189-9acb-9a493cbfe46f";
const BASE_URL = `https://api.atlassian.com/jsm/assets/workspace/${WORKSPACE_ID}/v1`;

// --- Helper to create HTTP headers ---
function getHeaders() {
  const authHeader = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64");
  return {
    "Authorization": `Basic ${authHeader}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

/**
 * Fetches the attributes for a given object (by its key) and extracts the value for
 * attribute id 1567 ("Assigned_to").
 * 
 * @param {string} objectKey - The key of the object, e.g., "EM-1953".
 * @returns {Promise<null|string>} - Returns the current assigned employee ID if set, else null.
 */
async function fetchAssignedToAttribute(objectKey) {
  const url = `${BASE_URL}/object/${objectKey}/attributes`;

  try {
    console.log(`Fetching attributes for object ${objectKey}...`);
    const response = await fetch(url, {
      method: "GET",
      headers: getHeaders(),
    });

    if (response.ok) {
      const attributes = await response.json();

      // Locate the "Assigned_to" attribute by its attribute id (1567)
      const assignedToAttribute = attributes.find(attr => attr.objectTypeAttributeId === 1567);

      // Set value to null if no values exist; otherwise, read the value.
      let value = null;
      if (assignedToAttribute && assignedToAttribute.objectAttributeValues.length > 0) {
        value = assignedToAttribute.objectAttributeValues[0].value;
      }
      
      // Debugging: Log the fetched value, explicitly showing "null" if appropriate.
      console.log(`Fetched "Assigned_to" attribute value: ${value === null ? "null" : value}`);
      return value;
    } else {
      console.error("❌ Failed to fetch attributes:", response.status, await response.text());
      return null;
    }
  } catch (error) {
    console.error("❌ Error while fetching attributes:", error);
    return null;
  }
}

/**
 * Updates the object with a new value for the "Assigned_to" attribute.
 *
 * @param {string} objectKey - The object key, e.g., "EM-1953".
 * @param {string} employeeId - The new employee ID to assign, e.g., "E077".
 */
async function updateAssignedTo(objectKey, employeeId) {
  const url = `${BASE_URL}/object/${objectKey}`;
  const payload = {
    attributes: [
      {
        objectTypeAttributeId: "1567", // Attribute ID for "Assigned_to"
        objectAttributeValues: [
          {
            value: employeeId, // New employee ID to assign
          },
        ],
      },
    ],
    objectTypeId: 167, // Object Type ID as provided
    avatarUUID: "",
    hasAvatar: false,
  };

  try {
    console.log(`Updating object ${objectKey} with employee ID ${employeeId}...`);
    const response = await fetch(url, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("✅ Update successful:", result);
    } else {
      console.error("❌ Update failed:", response.status, await response.text());
    }
  } catch (error) {
    console.error("❌ Error during update:", error);
  }
}

/**
 * Checks the current value of the "Assigned_to" attribute.
 * If it's either null or the string "null", updates it to the provided employee ID.
 * Otherwise, logs that an employee is already assigned.
 *
 * @param {string} objectKey - The object key, e.g., "EM-1953".
 * @param {string} employeeId - The employee ID to assign if the attribute is null or "null", e.g., "E077".
 */
async function assignIfNull(objectKey, employeeId) {
  const currentValue = await fetchAssignedToAttribute(objectKey);

  // Debugging: explicitly log the fetched attribute value.
  console.log(`Debug: Fetched "Assigned_to" attribute value: ${currentValue === null ? "null" : currentValue}`);

  // Check if the value is either null or the string "null"
  if (currentValue === null || currentValue === "null") {
    console.log(`"Assigned_to" is ${currentValue}. Proceeding with update...`);
    await updateAssignedTo(objectKey, employeeId);
  } else {
    console.log(`Employee already assigned with value: ${currentValue}. No update performed.`);
  }
}

// --- Testing the function ---
const testObjectKey = "EM-1953"; // Object key provided
const testEmployeeId = "E077";   // New employee ID to assign
assignIfNull(testObjectKey, testEmployeeId);
