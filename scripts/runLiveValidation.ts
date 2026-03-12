import dotenv from "dotenv";
import { createSprintsAndSeed } from "../src/handlers/createSprintsAndSeed";

dotenv.config();

async function main() {
  const schedule = {
    sprints: [
      {
        name: "LiveValidation 001",
        startDate: "2026-03-30",
        finishDate: "2026-04-05"
      }
    ]
  };

  const result = await createSprintsAndSeed({
    projectId: "MotherOps-Alpha",
    teamName: "MotherOps-Alpha Team",
    schedule: JSON.stringify(schedule),
    dryRun: false
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
