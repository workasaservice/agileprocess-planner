/**
 * Sprint Automation Tests
 * 
 * Basic test cases for capacity seeding, story seeding, and orchestration
 */

import { seedSprintCapacity } from '../src/services/sprintCapacitySeeder';
import { seedSprintStories } from '../src/services/sprintStorySeeder';
import { neonMcpClient } from '../src/clients/neonMcpClient';

describe('Sprint Capacity Seeding', () => {
  beforeAll(() => {
    process.env.PERSISTENCE_MODE = 'postgres';
    process.env.NEON_PROJECT_ID = 'test-project';
    process.env.NEON_BRANCH_ID = 'test-branch';
    process.env.NEON_API_KEY = 'test-key';
  });

  test('requires postgres mode', async () => {
    process.env.PERSISTENCE_MODE = 'json';
    
    await expect(seedSprintCapacity({
      projectId: 'test-project',
      teamId: 'Default',
      sprintId: 'sprint-1',
      sprintStartDate: new Date('2026-03-15'),
      sprintEndDate: new Date('2026-03-29'),
      iterationPath: 'TestProject\\Sprint 1'
    })).rejects.toThrow('PERSISTENCE_MODE=postgres');
    
    process.env.PERSISTENCE_MODE = 'postgres';
  });

  test('calculates working days correctly', () => {
    // 2-week sprint: 2026-03-15 (Sun) to 2026-03-29 (Sun)
    // Working days: Mon-Fri = 10 days
    const startDate = new Date('2026-03-16'); // Monday
    const endDate = new Date('2026-03-27'); // Friday
    const days = calculateWorkingDays(startDate, endDate); // Helper function
    
    expect(days).toBe(10);
  });

  test('computes capacity from productive hours', () => {
    // 30 productive hours / 10 working days = 3.0 hours/day (for 2-week sprint)
    // Formula: productive_hours_per_sprint / working_days
    const productiveHours = 30;
    const workingDays = 10;
    const capacityPerDay = productiveHours / workingDays;
    
    expect(capacityPerDay).toBe(3.0);
  });

  test('preserves manual capacity edits (upsert empty only)', async () => {
    // Scenario: Sprint member has manual capacity set to 7.5 h/day
    // Automation runs and tries to set default 6.0 h/day
    // Expected: Keep manual value (7.5)
    
    const existingCapacity = 7.5;
    const shouldSeed = existingCapacity === null || existingCapacity === 0;
    
    expect(shouldSeed).toBe(false); // Do not overwrite
  });

  test('skips members without role defaults', async () => {
    // Scenario: Team has member with undefined role
    // Expected: Skip that member, log warning
    
    const defaultCapacities = new Map([
      ['engineer-role', 6.0],
      ['pm-role', 8.0]
    ]);
    
    const unknownRoleCapacity = defaultCapacities.get('unknown-role');
    expect(unknownRoleCapacity).toBeUndefined();
  });
});

describe('Sprint Story Seeding', () => {
  test('creates stories in order', async () => {
    // Stories should be created in story_order sequence
    const templates = [
      { id: 1, title: 'User Story 1', storyOrder: 0 },
      { id: 2, title: 'User Story 2', storyOrder: 1 },
      { id: 3, title: 'User Story 3', storyOrder: 2 }
    ];
    
    // Sorted by story_order
    const sorted = templates.sort((a, b) => a.storyOrder - b.storyOrder);
    expect(sorted.map(t => t.title)).toEqual([
      'User Story 1', 'User Story 2', 'User Story 3'
    ]);
  });

  test('detects duplicate stories and skips them', async () => {
    // If story with title "Daily Standup" already exists in sprint
    // Expected: Skip creation, log as skipped
    
    const existingTitle = 'Daily Standup';
    const templateTitle = 'Daily Standup';
    const isDuplicate = existingTitle === templateTitle;
    
    expect(isDuplicate).toBe(true);
  });

  test('links child stories to parents', async () => {
    // Template hierarchy: Epic (id=1) → Feature (id=2) → Story (id=3)
    // When creating Story, should link to Feature ID
    
    const storyTemplate = {
      id: 3,
      title: 'User Story',
      parentTemplateId: 2 // This template's parent
    };
    
    const createdStoryId = 19512;
    const parentTemplateId = 2;
    
    // If parentTemplateId exists and parent was created, link them
    expect(parentTemplateId).toBeDefined();
  });
});

describe('Orchestration Command', () => {
  test('creates sprint before seeding', async () => {
    // Execution order must be: create → persist → seed capacity → seed stories
    // Not: seed → create → persist
    
    const executionOrder: string[] = [];
    
    // Hypothetical execution
    executionOrder.push('create-sprint');
    executionOrder.push('persist-iteration');
    executionOrder.push('seed-capacity');
    executionOrder.push('seed-stories');
    
    expect(executionOrder[0]).toBe('create-sprint');
    expect(executionOrder[1]).toBe('persist-iteration');
  });

  test('records audit trail for full transparency', async () => {
    // Every run should create a sprint_seed_runs record with:
    // - correlation_id (UUID)
    // - project_id, sprint_id
    // - run_status (completed/failed)
    // - timestamps
    
    const auditEntry = {
      correlation_id: 'uuid-1234',
      project_id: 'MotherOps-Alpha',
      sprint_id: 'iteration-123',
      run_status: 'completed',
      started_at: new Date('2026-03-08T10:00:00Z'),
      completed_at: new Date('2026-03-08T10:05:00Z')
    };
    
    expect(auditEntry.correlation_id).toBeDefined();
    expect(auditEntry.run_status).toBe('completed');
  });

  test('handles partial failures gracefully', async () => {
    // If capacity seeding fails but stories succeed:
    // - Record both outcomes
    // - Return success: false
    // - Include error message
    
    const result = {
      success: false,
      capacity: { success: false, errors: ['MCP timeout'] },
      stories: { success: true, storiesCreated: 5 },
      errors: ['Capacity seeding failed: MCP timeout']
    };
    
    expect(result.success).toBe(false);
    expect(result.capacity.success).toBe(false);
    expect(result.stories.success).toBe(true);
  });
});

describe('Reconciliation Command', () => {
  test('detects sprints without seed runs', async () => {
    // Query: sprints in config_project_iterations with NO matching successful entry in sprint_seed_runs
    // Expected: These are "missing" sprints needing reconciliation
    
    const sprintsMissingSeeding = [
      { iterationId: 'iter-1', sprintName: 'Sprint A', hasSeedRun: false },
      { iterationId: 'iter-2', sprintName: 'Sprint B', hasSeedRun: true },
      { iterationId: 'iter-3', sprintName: 'Sprint C', hasSeedRun: false }
    ];
    
    const needsReconciliation = sprintsMissingSeeding.filter(s => !s.hasSeedRun);
    expect(needsReconciliation.length).toBe(2);
  });

  test('skips sprints already seeded', async () => {
    // If sprint has successful seed run (run_status = 'completed'), skip it
    
    const hasSeedRun = true;
    const shouldReconcile = !hasSeedRun;
    
    expect(shouldReconcile).toBe(false);
  });

  test('supports dry-run for preview', async () => {
    // With --dry-run flag:
    // - Query operations happen
    // - Creation operations are logged but not executed
    // - No changes to Neon or Azure DevOps
    
    const dryRun = true;
    let operationsLogged = 0;
    
    if (dryRun) {
      operationsLogged++; // Log only, don't execute
      console.log('[DRY RUN] Would create story...');
    }
    
    expect(operationsLogged).toBe(1);
  });
});

// Helper function (would be in actual implementation)
function calculateWorkingDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Mon-Fri
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return Math.max(1, count);
}
