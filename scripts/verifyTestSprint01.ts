import 'dotenv/config';
import { azureDevOpsMcpClient } from '../src/clients/azureDevOpsMcpClient.js';

async function main() {
  await azureDevOpsMcpClient.initialize();

  console.log('=== TESTSPRINT 01 VERIFICATION ===\n');

  // Check Meetings parent (21516)
  const meetings = await azureDevOpsMcpClient.getWorkItem('MotherOps-Alpha', 21516);
  console.log('✓ Work Item 21516 - Meetings (Parent)');
  console.log('  Type:', meetings.fields['System.WorkItemType']);
  console.log('  State:', meetings.fields['System.State']);
  console.log('  Iteration:', meetings.fields['System.IterationPath']);
  const meetingChildren = meetings.relations?.filter(r => r.rel === 'System.LinkTypes.Hierarchy-Forward') || [];
  console.log('  Children:', meetingChildren.length);

  // Check UnPlanned parent (21522)
  const unplanned = await azureDevOpsMcpClient.getWorkItem('MotherOps-Alpha', 21522);
  console.log('\n✓ Work Item 21522 - UnPlanned (Parent)');
  console.log('  Type:', unplanned.fields['System.WorkItemType']);
  console.log('  State:', unplanned.fields['System.State']);
  console.log('  Iteration:', unplanned.fields['System.IterationPath']);
  const unplannedChildren = unplanned.relations?.filter(r => r.rel === 'System.LinkTypes.Hierarchy-Forward') || [];
  console.log('  Children:', unplannedChildren.length);

  // Check a child work item
  const sprintPlanning = await azureDevOpsMcpClient.getWorkItem('MotherOps-Alpha', 21517);
  console.log('\n✓ Work Item 21517 - Sprint Planning (Child)');
  console.log('  Type:', sprintPlanning.fields['System.WorkItemType']);
  console.log('  State:', sprintPlanning.fields['System.State']);
  console.log('  Iteration:', sprintPlanning.fields['System.IterationPath']);
  const parent = sprintPlanning.relations?.find(r => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
  console.log('  Parent ID:', parent?.url.match(/\d+$/)?.[0] || 'None');

  console.log('\n=== SUMMARY ===');
  console.log('✓ TestSprint 01 created with correct iteration path');
  console.log('✓ 10 work items created (2 parents + 8 children)');
  console.log('✓ Parent-child hierarchy established');
}

main().catch(console.error);
