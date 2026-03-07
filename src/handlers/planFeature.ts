/**
 * Plan Feature Handler
 * 
 * Decomposes a feature description into stories with acceptance criteria and estimates.
 * Used internally by planBacklog and can also be called independently.
 * 
 * Returns deterministic story structure from feature input.
 */
export async function planFeature(input: any) {
  try {
    const featureInput = normalizeFeatureInput(input);
    
    // Generate stories from feature description
    const stories = decomposeFeatureToStories(featureInput);
    
    return {
      success: true,
      feature: featureInput.title,
      storyCount: stories.length,
      totalEstimatedStoryPoints: stories.reduce((sum, s) => sum + s.estimatedStoryPoints, 0),
      stories
    };
  } catch (error) {
    console.error("planFeature failed:", error);
    throw error;
  }
}

// ===== Supporting Functions =====

interface FeatureInput {
  title: string;
  description?: string;
  estimatedComplexity?: "low" | "medium" | "high"; // Influences story count and size
}

interface PlannedStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  estimatedStoryPoints: number;
  tasks: Array<{ title: string; estimatedHours: number }>;
}

function normalizeFeatureInput(input: any): FeatureInput {
  const title = input?.title || input?.feature || input?.text || input?.requirements || "Unnamed Feature";
  const description = input?.description || "";
  const complexity = input?.complexity || "medium";

  return {
    title,
    description,
    estimatedComplexity: complexity
  };
}

function decomposeFeatureToStories(feature: FeatureInput): PlannedStory[] {
  // Heuristic decomposition rules based on feature complexity
  const storyCount = feature.estimatedComplexity === "low" ? 2 : feature.estimatedComplexity === "high" ? 4 : 3;

  const stories: PlannedStory[] = [];

  const templates = {
    low: [
      {
        titleSuffix: "Research & Evaluate",
        description: "Gather information and evaluate options",
        acceptanceCriteria: [
          "At least 3 options researched and documented",
          "Pro/con comparison created",
          "Initial recommendation drafted"
        ],
        estimatedStoryPoints: 2,
        taskCount: 2
      },
      {
        titleSuffix: "Finalization & Confirmation",
        description: "Finalize selection and confirm decision",
        acceptanceCriteria: [
          "Final option selected and approved",
          "Confirmation or booking completed",
          "Details communicated to stakeholders"
        ],
        estimatedStoryPoints: 1,
        taskCount: 2
      }
    ],
    medium: [
      {
        titleSuffix: "Discovery & Analysis",
        description: "Understand requirements and analyze options",
        acceptanceCriteria: [
          "Requirements gathered and documented",
          "At least 4 options evaluated",
          "Options matrix created with key criteria"
        ],
        estimatedStoryPoints: 3,
        taskCount: 2
      },
      {
        titleSuffix: "Selection & Planning",
        description: "Make selection and plan next steps",
        acceptanceCriteria: [
          "Preferred option identified",
          "Selection criteria documented",
          "Implementation plan drafted"
        ],
        estimatedStoryPoints: 2,
        taskCount: 2
      },
      {
        titleSuffix: "Execution & Confirmation",
        description: "Execute the plan and confirm completion",
        acceptanceCriteria: [
          "Selected option implemented",
          "Stakeholders notified",
          "Success criteria verified"
        ],
        estimatedStoryPoints: 2,
        taskCount: 2
      }
    ],
    high: [
      {
        titleSuffix: "Requirements Gathering",
        description: "Capture comprehensive requirements",
        acceptanceCriteria: [
          "Detailed requirements documented",
          "Stakeholder input collected",
          "Constraints and dependencies identified"
        ],
        estimatedStoryPoints: 3,
        taskCount: 3
      },
      {
        titleSuffix: "Research & Options Analysis",
        description: "Research solutions and analyze trade-offs",
        acceptanceCriteria: [
          "At least 5 solutions researched",
          "Detailed trade-off analysis completed",
          "Risk assessment for each option"
        ],
        estimatedStoryPoints: 5,
        taskCount: 3
      },
      {
        titleSuffix: "Selection & Design",
        description: "Select solution and design approach",
        acceptanceCriteria: [
          "Solution selected based on criteria",
          "Detailed design documented",
          "Implementation approach defined"
        ],
        estimatedStoryPoints: 3,
        taskCount: 2
      },
      {
        titleSuffix: "Implementation & Verification",
        description: "Implement and verify success",
        acceptanceCriteria: [
          "Solution fully implemented",
          "Testing/verification completed",
          "Success metrics demonstrated"
        ],
        estimatedStoryPoints: 5,
        taskCount: 3
      }
    ]
  };

  const templateList = templates[feature.estimatedComplexity || "medium"];
  let storyIndex = 1;

  for (const template of templateList) {
    const story: PlannedStory = {
      id: `${feature.title.substring(0, 2).toUpperCase()}-S${storyIndex}`,
      title: `${feature.title}: ${template.titleSuffix}`,
      description: template.description,
      acceptanceCriteria: template.acceptanceCriteria,
      estimatedStoryPoints: template.estimatedStoryPoints,
      tasks: generateTasks(template.titleSuffix, template.taskCount)
    };

    stories.push(story);
    storyIndex += 1;
  }

  return stories;
}

function generateTasks(
  storySuffix: string,
  taskCount: number
): Array<{ title: string; estimatedHours: number }> {
  const taskTemplates = [
    { prefix: "Research & Document", hours: 4 },
    { prefix: "Create Analysis/Summary", hours: 3 },
    { prefix: "Gather Stakeholder Input", hours: 2 },
    { prefix: "Create Plan/Design", hours: 4 },
    { prefix: "Schedule & Coordinate", hours: 2 },
    { prefix: "Verify & Document", hours: 3 }
  ];

  const tasks = [];
  for (let i = 0; i < Math.min(taskCount, taskTemplates.length); i++) {
    const template = taskTemplates[i];
    if (template) {
      tasks.push({
        title: `${template.prefix} for ${storySuffix}`,
        estimatedHours: template.hours
      });
    }
  }

  return tasks;
}
