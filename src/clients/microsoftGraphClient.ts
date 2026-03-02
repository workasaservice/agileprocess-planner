import axios, { AxiosInstance } from "axios";
import fs from "fs";
import path from "path";

type MicrosoftGraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  scope: string;
};

type ConfigFileShape = {
  microsoftGraph?: Partial<MicrosoftGraphConfig>;
};

type User = {
  displayName: string;
  userPrincipalName: string;
  mailNickname: string;
  accountEnabled: boolean;
  passwordProfile?: {
    forceChangePasswordNextSignIn: boolean;
    password: string;
  };
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  usageLocation?: string;
};

type Group = {
  id: string;
  displayName: string;
  description?: string;
};

function loadConfigFile(): ConfigFileShape {
  const configPath = process.env.OPS360_CONFIG_PATH
    ? path.resolve(process.cwd(), process.env.OPS360_CONFIG_PATH)
    : path.resolve(process.cwd(), "config", "default-config.json");

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw) as ConfigFileShape;
  } catch {
    return {};
  }
}

function resolveMicrosoftGraphConfig(): MicrosoftGraphConfig {
  const fileConfig = loadConfigFile();
  const graphConfig = fileConfig.microsoftGraph || {};

  return {
    tenantId: process.env.AZURE_TENANT_ID || graphConfig.tenantId || "",
    clientId: process.env.AZURE_CLIENT_ID || graphConfig.clientId || "",
    clientSecret: process.env.AZURE_CLIENT_SECRET || graphConfig.clientSecret || "",
    scope: process.env.AZURE_GRAPH_SCOPE || graphConfig.scope || "https://graph.microsoft.com/.default"
  };
}

async function getAccessToken(config: MicrosoftGraphConfig): Promise<string> {
  if (!config.tenantId || !config.clientId || !config.clientSecret) {
    throw new Error(
      "Microsoft Graph authentication is not properly configured. Please set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET."
    );
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams();
  params.append("client_id", config.clientId);
  params.append("client_secret", config.clientSecret);
  params.append("scope", config.scope);
  params.append("grant_type", "client_credentials");

  try {
    const response = await axios.post(tokenEndpoint, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    return response.data.access_token;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to acquire access token: ${error.response?.data?.error_description || error.message}`
      );
    }
    throw error;
  }
}

async function createClient(config: MicrosoftGraphConfig): Promise<AxiosInstance> {
  const accessToken = await getAccessToken(config);

  return axios.create({
    baseURL: "https://graph.microsoft.com/v1.0",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    timeout: 30000
  });
}

export const microsoftGraphClient = {
  isConfigured(): boolean {
    const config = resolveMicrosoftGraphConfig();
    return Boolean(config.tenantId && config.clientId && config.clientSecret);
  },

  async createUser(userData: User): Promise<any> {
    const config = resolveMicrosoftGraphConfig();
    const client = await createClient(config);

    try {
      const response = await client.post("/users", userData);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to create user: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  },

  async getUser(userPrincipalName: string): Promise<any> {
    const config = resolveMicrosoftGraphConfig();
    const client = await createClient(config);

    try {
      const response = await client.get(`/users/${userPrincipalName}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return null;
        }
        throw new Error(
          `Failed to get user: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  },

  async listGroups(): Promise<Group[]> {
    const config = resolveMicrosoftGraphConfig();
    const client = await createClient(config);

    try {
      const response = await client.get("/groups");
      return response.data.value || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to list groups: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  },

  async getGroupByName(groupName: string): Promise<Group | null> {
    const config = resolveMicrosoftGraphConfig();
    const client = await createClient(config);

    try {
      const response = await client.get(`/groups?$filter=displayName eq '${groupName}'`);
      const groups = response.data.value || [];
      return groups.length > 0 ? groups[0] : null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to get group: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  },

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    const config = resolveMicrosoftGraphConfig();
    const client = await createClient(config);

    try {
      await client.post(`/groups/${groupId}/members/$ref`, {
        "@odata.id": `https://graph.microsoft.com/v1.0/users/${userId}`
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // If the user is already a member, don't throw an error
        if (error.response?.status === 400 && 
            error.response?.data?.error?.message?.includes("already exist")) {
          return;
        }
        throw new Error(
          `Failed to add user to group: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  },

  async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
    const config = resolveMicrosoftGraphConfig();
    const client = await createClient(config);

    try {
      await client.delete(`/groups/${groupId}/members/${userId}/$ref`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to remove user from group: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  },

  async getUserGroups(userId: string): Promise<Group[]> {
    const config = resolveMicrosoftGraphConfig();
    const client = await createClient(config);

    try {
      const response = await client.get(`/users/${userId}/memberOf`);
      return response.data.value || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to get user groups: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  }
};
