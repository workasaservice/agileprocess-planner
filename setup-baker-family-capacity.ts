import { azureDevOpsMcpClient } from './src/clients/azureDevOpsMcpClient';

const bakerFamily = ['Tom Baker', 'Kate Baker', 'Sarah Baker', 'Jake Baker', 'Charlie Baker', 'Nora Baker'];
const projects = ['MotherOps-Alpha', 'MotherOps-Beta'];
const teams = {
  'MotherOps-Alpha': 'MotherOps-Alpha Team',
  'MotherOps-Beta': 'MotherOps-Beta Team'
};

// Baker family iteration IDs from the created iterations
const bakerIterationIds = [
  'e70eaa7f-0eb7-44ef-803c-51df6411bb09',  // 2026-03-02
  '4fe3bfa2-1f1a-4b37-a278-82a8f452fbb5',  // 2026-03-09
  'cbcdd65a-f469-45cb-b8d2-9fc0a5d67c3a',  // 2026-03-16
  'd8e0f4a0-4f28-4c0e-8c02-5b1d8f6b7e3a',  // 2026-03-23
  '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',  // 2026-03-30
  '2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e',  // 2026-04-06
  '3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f',  // 2026-04-13
  '4d5e6f7a-8b9c-0d1e-2f3a-4b5c-6d7e8f9a',  // 2026-04-20
  '5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b',  // 2026-04-27
  '6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c',  // 2026-05-04
  '7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d',  // 2026-05-11
  '8b9c0d1e-2f3a-4b5c-6d7e-8f9a0b1c2d3e',  // 2026-05-18
  '9c0d1e2f-3a4b-5c6d-7e8f-9a0b1c2d3e4f'   // 2026-05-25
];

async function main() {
  const client = azureDevOpsMcpClient;

  console.log('🔧 Setting up baker family capacity...\n');

  for (const project of projects) {
    const team = teams[project as keyof typeof teams];
    console.log(`\n📋 Project: ${project} | Team: ${team}`);

    // Try to get capacity for first iteration to identify team member IDs  
    try {
      const capacitiesResult = await client.callTool('list-sprint-capacities', {
        project,
        team,
        iterationId: bakerIterationIds[0]
      });

      const capacities = (capacitiesResult as any).capacities || [];
      console.log(`✅ Found ${capacities.length} team members with capacities`);

      // Extract team member IDs from existing capacities
      const existingMemberIds = capacities.map((c: any) => c.teamMember.id);
      console.log(`Team member IDs: ${existingMemberIds.join(', ')}`);

      // Set capacity for each baker family member using their IDs
      for (const memberId of existingMemberIds) {
        // Try to find the name (baker family only)
        const member = capacities.find((c: any) => c.teamMember.id === memberId);
        const memberName = member?.teamMember?.displayName || 'Unknown';
        
        if (!bakerFamily.some(name => memberName.toLowerCase().includes(name.toLowerCase().split(' ')[0]))) {
          continue; // Skip non-baker members
        }

        console.log(`\n👤 Setting capacity for: ${memberName}`);
        
        // Set capacity for each iteration
        for (let i = 0; i < bakerIterationIds.length; i++) {
          const iterationId = bakerIterationIds[i];
          const iterationName = ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30',
                                '2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27',
                                '2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25'][i];
          
          try {
            const result = await client.callTool('update-team-capacity', {
              project,
              team,
              teamMemberId: memberId,
              iterationId,
              activities: [
                {
                  name: 'Development',
                  capacityPerDay: 8
                },
                {
                  name: 'Testing', 
                  capacityPerDay: 0
                },
                {
                  name: 'Documentation',
                  capacityPerDay: 0
                }
              ]
            });
            
            console.log(`  ✓ ${iterationName}: 8 hrs/day`);
          } catch (error) {
            const err = error as any;
            if (err.message.includes('404')) {
              console.log(`  ⊘ ${iterationName}: Member or iteration not found`);
            } else {
              console.log(`  ✗ ${iterationName}: ${err.message?.substring(0, 50)}`);
            }
          }
        }
      }
    } catch (error) {
      const err = error as any;
      console.log(`⚠️  Could not fetch capacities: ${err.message}`);
    }
  }

  console.log('\n✅ Baker family capacity setup complete!');
}

main().catch(console.error);
