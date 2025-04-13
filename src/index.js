import api, { route } from "@forge/api";
import fs from "fs/promises";
import path from "path";

const EMAIL = "rithigasri.b@cprime.com";
const API_TOKEN = "****";
const WORKSPACE_ID = "9639f74b-a7d7-4189-9acb-9a493cbfe46f";
 // ✅ Replace with your actual spaceId (not key)

const BASE_URL = `https://api.atlassian.com/jsm/assets/workspace/${WORKSPACE_ID}/v1`;
const CONFLUENCE_BASE_URL = "https://one-atlas-onki.atlassian.net/wiki/rest/api";
const CONFLUENCE_SPACE_KEY = "JSMROVO";

const EMP_DATA_FILE = path.join(__dirname, "emp_data.json");
const OBJECT_TYPE_ID = 166; // ObjectType ID for "People"
const OBJECT_SCHEMA_ID = 14; // ObjectSchema ID

function getHeaders() {
  const authHeader = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64");
  return {
    "Authorization": `Basic ${authHeader}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

// Debugging helper function
function logDebugInfo(message, data) {
  console.log(`DEBUG: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Helper function to write employee data to the JSON file
async function writeEmployeeData(data) {
  try {
    await fs.writeFile(EMP_DATA_FILE, JSON.stringify(data, null, 2));
    console.log("Employee data saved successfully to emp_data.json.");
  } catch (error) {
    console.error("Error writing employee data:", error);
    throw error;
  }
}

// Helper function to read employee data from the JSON file
async function readEmployeeData() {
  try {
    const data = await fs.readFile(EMP_DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      // File doesn't exist, return an empty array
      return [];
    }
    console.error("Error reading employee data:", error);
    throw error;
  }
}

// 1. Add Employee
export async function addEmployee(payload) {
  console.log("Payload received:", payload);

  if (payload.userId && payload.username) {
    // Read existing employee data
    const employeeData = await readEmployeeData();

    // Check if the employee already exists based on emp_id
    const existingEmployee = employeeData.find((emp) => emp.emp_id === payload.userId);

    if (existingEmployee) {
      console.log(`Employee already exists: ${existingEmployee.name} (ID: ${existingEmployee.emp_id}).`);
      return;
    }

    console.log(`Adding new employee: ${payload.userId}, ${payload.username}`);
    const data = {
      objectTypeId: "166",
      attributes: [
        {
          objectTypeAttributeId: "1552",
          objectAttributeValues: [{ value: payload.username }],
        },
        {
          objectTypeAttributeId: "1561",
          objectAttributeValues: [{ value: payload.userId }],
        },
      ],
    };

    try {
      const response = await fetch(`${BASE_URL}/object/create`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Employee added successfully:", result);

        // Add the new employee to emp_data.json
        employeeData.push({
          objectKey: result.objectKey,
          name: payload.username,
          emp_id: payload.userId,
        });
        await fs.writeFile(EMP_DATA_FILE, JSON.stringify(employeeData, null, 2));
        console.log("Employee data updated in emp_data.json.");
      } else {
        console.error("Failed to add employee:", response.status, await response.text());
      }
    } catch (error) {
      console.error("Error while adding employee:", error);
    }
  } else {
    console.error("Invalid payload. Ensure userId and username are provided.");
  }
}

// 2. Confluence Sync

export async function syncToConfluence() {
  const objectSchemaId = 14;
  console.log("🔄 Starting sync to Confluence for object schema:", objectSchemaId);

  const getAllObjectTypes = async () => {
    const url = `${BASE_URL}/objectschema/${objectSchemaId}/objecttypes`;
    const response = await fetch(url, { headers: getHeaders() });
    if (!response.ok) {
      console.error("❌ Failed to fetch object types:", response.status);
      return [];
    }
    const types = await response.json();
    return types.map(type => ({ id: type.id, name: type.name }));
  };

  const getAttributes = async (objectTypeId) => {
    const url = `${BASE_URL}/objecttype/${objectTypeId}/attributes`;
    const response = await fetch(url, { headers: getHeaders() });
    if (!response.ok) {
      console.error(`❌ Failed to fetch attributes for type ${objectTypeId}:`, response.status);
      return [];
    }
    const attrs = await response.json();
    return attrs.map(attr => ({ id: attr.id, name: attr.name }));
  };

  const getObjects = async (objectTypeId, objectTypeName, attributeMap) => {
    const url = `${BASE_URL}/object/aql?startAt=0&maxResults=100&includeAttributes=true`;
    const payload = { qlQuery: `objectType = "${objectTypeName}"` };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error(`❌ Failed to fetch objects for ${objectTypeName}:`, response.status);
        return [];
      }
      const data = await response.json();
      const objects = data.values || [];

      return objects.map(obj => {
        const attributes = {};
        obj.attributes.forEach(attr => {
          const name = attributeMap[attr.objectTypeAttributeId];
          if (name && attr.objectAttributeValues?.[0]?.value) {
            attributes[name] = attr.objectAttributeValues[0].value;
          }
        });
        return { id: obj.id, name: obj.name, attributes };
      });
    } catch (error) {
      console.error("❌ Error while fetching objects:", error);
      return [];
    }
  };

  const createConfluencePage = async (title, content) => {
    const url = `${CONFLUENCE_BASE_URL}/content`;
    const payload = {
      type: "page",
      title:`Assets - ${new Date().toLocaleString()}`,
      space: { key: CONFLUENCE_SPACE_KEY },
      body: {
        storage: {
          value: `<pre>${content}</pre>`,
          representation: "storage",
        },
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const result = await response.json();
        console.log("✅ Confluence page created:", result._links.base + result._links.webui);
      } else {
        console.error("❌ Failed to create Confluence page:", response.status, await response.text());
      }
    } catch (error) {
      console.error("❌ Error while creating Confluence page:", error);
    }
  };

  try {
    const objectTypes = await getAllObjectTypes();
    const allObjects = [];

    for (const objectType of objectTypes) {
      console.log("🔍 Processing object type:", objectType.name);
      const attributes = await getAttributes(objectType.id);
      const attributeMap = Object.fromEntries(attributes.map(attr => [attr.id, attr.name]));
      const objects = await getObjects(objectType.id, objectType.name, attributeMap);
      allObjects.push({ objectType: objectType.name, objects });
    }

    const jsonContent = JSON.stringify(allObjects, null, 2);
    await fs.writeFile("response.json", jsonContent);
    console.log("📁 JSON written to file: response.json");

    const title = `Asset Export - ${new Date().toLocaleString()}`;
    await createConfluencePage(title, jsonContent);
  } catch (error) {
    console.error("❌ Error in syncToConfluence:", error);
  }
}

export async function assignAsset(payload) {
  console.log("Payload received for assignAsset:", payload);

  if (payload.objectKey && payload.employeeId) {
    const objectKey = payload.objectKey;
    const employeeId = payload.employeeId;

    console.log(`Processing asset assignment: Object Key - ${objectKey}, Employee ID - ${employeeId}`);

    // Function to fetch the current value of the "Assigned_to" attribute
    const fetchAssignedToAttribute = async (objectKey) => {
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
    };

    // Function to update the "Assigned_to" attribute with the given employeeId
    const updateAssignedTo = async (objectKey, employeeId) => {
      const url = `${BASE_URL}/object/${objectKey}`;
      const payloadData = {
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
        objectTypeId: 167, // Object Type ID
        avatarUUID: "",
        hasAvatar: false,
      };

      try {
        console.log(`Updating object ${objectKey} with employee ID ${employeeId}...`);
        const response = await fetch(url, {
          method: "PUT",
          headers: getHeaders(),
          body: JSON.stringify(payloadData),
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
    };

    // Fetch the current "Assigned_to" attribute value
    const currentValue = await fetchAssignedToAttribute(objectKey);

    // Debug logging of the fetched value.
    console.log(`Debug: Fetched "Assigned_to" attribute value: ${currentValue === null ? "null" : currentValue}`);

    // Check if the attribute is either null (the actual null value) or the string "null"
    if (currentValue === null || currentValue === "null") {
      console.log(`"Assigned_to" is ${currentValue}. Proceeding with update...`);
      await updateAssignedTo(objectKey, employeeId);
    } else {
      console.log(`Employee already assigned with value: ${currentValue}. No update performed.`);
    }
  } else {
    console.error("❌ Missing required fields in payload. Ensure both objectKey and employeeId are provided.");
  }
}

// Function to fetch employee data from the REST API and save it locally
export async function updateData() {
  console.log("Fetching employee data from the REST API...");

  const url = `${BASE_URL}/object/navlist/aql`;
  const payload = {
    objectTypeId: OBJECT_TYPE_ID,
    attributesToDisplay: {
      attributesToDisplayIds: ["1551", "1552", "1561"], // Key, Name, Employee ID
    },
    page: 1,
    asc: 1,
    resultsPerPage: 100,
    includeAttributes: true,
    objectSchemaId: OBJECT_SCHEMA_ID,
    qlQuery: `objectType = "People"`, // Query to filter by object type
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("Failed to fetch employee data:", response.status, await response.text());
      return;
    }

    const data = await response.json();
    const employeeData = data.objectEntries.map((entry) => {
      const attributes = entry.attributes.reduce((acc, attr) => {
        if (attr.objectTypeAttributeId === "1551") acc.objectKey = attr.objectAttributeValues[0]?.value;
        if (attr.objectTypeAttributeId === "1552") acc.name = attr.objectAttributeValues[0]?.value;
        if (attr.objectTypeAttributeId === "1561") acc.emp_id = attr.objectAttributeValues[0]?.value;
        return acc;
      }, {});

      return {
        objectKey: attributes.objectKey,
        name: attributes.name,
        emp_id: attributes.emp_id,
      };
    });

    // Save the filtered employee data to a JSON file
    await writeEmployeeData(employeeData);
  } catch (error) {
    console.error("Error while fetching or saving employee data:", error);
  }
}
