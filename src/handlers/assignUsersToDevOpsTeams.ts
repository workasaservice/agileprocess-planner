import fs from "fs";
import path from "path";
import { azureDevOpsMcpClient } from "../clients/azureDevOpsMcpClient";

type TeamAssignmentResult = {
  userPrincipalName: string;
  status: "blocked" | "skipped";
  reason: string;
};

/**
 * ❌ BLOCKED: Azure DevOps Team Member Assignment
 * 
 * Per Azure DevOps API limitations (discovered in investigation), the team members
 * endpoint (/_apis/projects/{id}/teams/{id}/members) is READ-ONLY and does not support:
 * - POST (create new member)
 * - PUT (update member)
 * - PATCH (modify member)
 * 
 * All attempts return HTTP 405 Method Not Allowed.
 * 
 * Current Workaround:
 * - Team members can only be added via Azure DevOps UI manually
 * - Capacity can be assigned instead (see capacity management tools)
 * - Consider using project entitlements for broader access control
 * 
 * This handler is kept as a stub with clear error messaging for MCP-only compliance.
 * Future: Monitor Azure DevOps API updates for team member management capability.
 */

export async function assignUsersToDevOpsTeams(args: Record<string, any>): Promise<any> {
  return {
    success: false,
    error: "Team member assignment is blocked due to Azure DevOps API limitations",
    details: {
      issue: "Azure DevOps team members endpoint is read-only (HTTP 405)",
      affectedEndpoint: "/_apis/projects/{id}/teams/{id}/members",
      supportedMethods: ["GET"],
      unsupportedMethods: ["POST", "PUT", "PATCH", "DELETE"],
      workaround: [
        "1. Assign team members manually via Azure DevOps UI",
        "2. Use capacity management API instead (see /create-sprints, capacity tools)",
        "3. Use project-level entitlements for access control"
      ]
    },
    mcp_only_compliance: true,
    rationale: "Stub replaces direct axios API calls with MCP-only architecture. No operational code uses raw HTTP clients."
  };
}
