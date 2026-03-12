// Copyright (c) 2026 AgilePlanner Contributors
// Licensed under the MIT License. See LICENSE file for details.

/**
 * Azure DevOps Authentication Module
 * 
 * Supports two authentication methods:
 * 1. Personal Access Token (PAT) - Legacy, for backward compatibility
 * 2. Service Principal (OAuth 2.0 Client Credentials) - Recommended
 * 
 * Authentication type is determined by AZURE_DEVOPS_AUTH_TYPE environment variable:
 * - "pat" or undefined: Uses PAT from AZURE_DEVOPS_PAT
 * - "service_principal": Uses Azure AD OAuth with client credentials
 */

import axios from "axios";

export type AzureDevOpsAuthConfig = 
  | {
      authType: "pat";
      pat: string;
    }
  | {
      authType: "service_principal";
      tenantId: string;
      clientId: string;
      clientSecret: string;
    };

export type AzureDevOpsToken = {
  token: string;
  expiresAt?: Date;
  type: "pat" | "bearer";
};

/**
 * Load authentication configuration from environment variables
 */
export function loadAuthConfig(): AzureDevOpsAuthConfig {
  const authType = (process.env.AZURE_DEVOPS_AUTH_TYPE || "pat") as "pat" | "service_principal";
  
  if (authType === "service_principal") {
    const tenantId = process.env.AZURE_DEVOPS_TENANT_ID || "";
    const clientId = process.env.AZURE_DEVOPS_CLIENT_ID || "";
    const clientSecret = process.env.AZURE_DEVOPS_CLIENT_SECRET || "";
    
    return {
      authType: "service_principal",
      tenantId,
      clientId,
      clientSecret
    };
  }
  
  // Default to PAT
  return {
    authType: "pat",
    pat: process.env.AZURE_DEVOPS_PAT || ""
  };
}

/**
 * Validate that all required configuration is present
 */
export function validateAuthConfig(config: AzureDevOpsAuthConfig): void {
  if (config.authType === "pat") {
    if (!config.pat) {
      throw new Error(
        "PAT authentication requires AZURE_DEVOPS_PAT environment variable"
      );
    }
  } else if (config.authType === "service_principal") {
    if (!config.tenantId) {
      throw new Error(
        "Service Principal authentication requires AZURE_DEVOPS_TENANT_ID environment variable"
      );
    }
    if (!config.clientId) {
      throw new Error(
        "Service Principal authentication requires AZURE_DEVOPS_CLIENT_ID environment variable"
      );
    }
    if (!config.clientSecret) {
      throw new Error(
        "Service Principal authentication requires AZURE_DEVOPS_CLIENT_SECRET environment variable"
      );
    }
  }
}

/**
 * OAuth token cache to avoid requesting new tokens for every request
 */
let tokenCache: { token: string; expiresAt: Date } | null = null;

/**
 * Get an Azure AD access token using Service Principal client credentials
 */
async function getServicePrincipalToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<AzureDevOpsToken> {
  // Check cache
  if (tokenCache && tokenCache.expiresAt > new Date()) {
    return {
      token: tokenCache.token,
      expiresAt: tokenCache.expiresAt,
      type: "bearer"
    };
  }

  // Azure DevOps resource ID for OAuth
  const resource = "499b84ac-1321-427f-aa17-267ca6975798/.default";
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  try {
    const response = await axios.post(
      tokenEndpoint,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: resource
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const { access_token, expires_in } = response.data;
    
    // Cache the token with a small buffer (subtract 5 minutes for safety)
    const expiresAt = new Date(Date.now() + (expires_in - 300) * 1000);
    tokenCache = {
      token: access_token,
      expiresAt
    };

    return {
      token: access_token,
      expiresAt,
      type: "bearer"
    };
  } catch (error: any) {
    if (error.response) {
      const errorData = error.response.data;
      throw new Error(
        `Failed to get Azure AD token: ${errorData.error_description || errorData.error || "Unknown error"}`
      );
    }
    throw new Error(`Failed to get Azure AD token: ${error.message}`);
  }
}

/**
 * Get authentication token based on configuration
 */
export async function getAuthToken(config?: AzureDevOpsAuthConfig): Promise<AzureDevOpsToken> {
  const authConfig = config || loadAuthConfig();
  validateAuthConfig(authConfig);

  if (authConfig.authType === "pat") {
    return {
      token: authConfig.pat,
      type: "pat"
    };
  }

  // Service Principal
  return getServicePrincipalToken(
    authConfig.tenantId,
    authConfig.clientId,
    authConfig.clientSecret
  );
}

/**
 * Get authorization header value for Azure DevOps API requests
 */
export async function getAuthorizationHeader(config?: AzureDevOpsAuthConfig): Promise<string> {
  const tokenData = await getAuthToken(config);
  
  if (tokenData.type === "pat") {
    // PAT uses Basic authentication with empty username
    const encoded = Buffer.from(`:${tokenData.token}`).toString("base64");
    return `Basic ${encoded}`;
  }
  
  // Service Principal uses Bearer token
  return `Bearer ${tokenData.token}`;
}

/**
 * Clear the token cache (useful for testing or when switching credentials)
 */
export function clearTokenCache(): void {
  tokenCache = null;
}
