# Sprint and Work Item Cleanup Guide

## Current State Analysis
✅ Created:
- 26 Ceremony Issues (one parent per sprint)
- 221 Ceremony Tasks (child tasks under each Issue)
- 26 UnPlanned Issues + 221 contingency tasks
- 26 Sprint iterations in Azure DevOps (some duplicates from multiple runs)

## Issues to Clean Up

### Issue 1: Messy Sprint Iterations
Multiple "Sprint 2026-03-09" iterations created due to multiple script runs.

**Solution - Azure DevOps UI (Easiest):**
1. Go to MotherOps-Alpha project
2. Project Settings → Project Configuration → Work Item Categories
3. Click "Sprints" (left menu) or Classification Nodes
4. Expand "Iteration"
5. For each "Sprint 2026-XX-XX":
   - Right-click → Delete
   - Confirm deletion
6. Repeat for MotherOps-Beta

**Result:** Only one Sprint 2026-03-09, etc. remains per project

---

### Issue 2: Work Item Structure
Currently: Tasks appear directly under sprint (shows as "Unplanned items")
Desired: Tasks as children of parent "Meetings" and "UnPlanned" stories

**Current Handler Output:**
```
Sprint 2026-03-09
├── Meetings - Sprint 2026-03-09 (Issue - parent)
│   ├── Sprint Meetings - Tom Baker (Task)
│   ├── Sprint Meetings - Kate Baker (Task)
│   └── (etc. 8 tasks)
├── UnPlanned - Sprint 2026-03-09 (Issue - parent)
│   ├── Contingency - Tom Baker (Task)
│   └── (etc. 8 tasks)
```

**Desired Structure:**
```
Sprint 2026-03-09
├── Meetings (User Story - parent)
│   ├── Sprint Planning - Daily (Task)
│   ├── Daily Standup - Rotation (Task)
│   ├── Backlog Refinement (Task)
│   └── Sprint Review & Retro (Task)
├── UnPlanned (User Story - parent)
│   ├── Contingency Buffer - 15% (Task)
│   └── Risk Mitigation Buffer (Task)
```

---

## Recommended Cleanup Path

### Option A: Keep Current Structure (Minimal Changes)
✅ Already working and populated
✅ Parent-child relationship established
⚠️ Just delete duplicate Sprint iterations in Azure UI

```bash
# Only action needed:
# 1. Manual: Delete duplicate Sprint iterations via Azure DevOps UI
# 2. Done!
```

**Why this works:**
- The Issue parents ("Meetings - Sprint X") ARE the organizational
stories
- Tasks ARE properly linked as children
- The UI shows them grouped correctly

---

### Option B: Rebuild with User Story Parents (Recommended for Clean Demo)
This requires rewriting the handlers to use User Stories instead of Issues.

```bash
# Step 1: Clone existing tasks to track them
npm run cli -- list-work-items --project "MotherOps-Alpha"

# Step 2: Backup current work items (optional)
# Export from Azure DevOps → Queries → Run query

# Step 3: Delete existing ceremony/unplanned Issues
# For each "Meetings -" and "UnPlanned -" Issue:
#   - Get ID from backlog
#   - Delete via Azure UI or API

# Step 4: Run new handlers (to be created)
npx tsx create-ceremony-user-stories.ts  # Creates User Stories + Tasks
npx tsx create-unplanned-user-stories.ts # Creates UnPlanned stories + Tasks

# Step 5: Clean up duplicate sprints as above
```

---

## Quick Fix: Delete Duplicate Sprints (5 minutes)

**Via Azure DevOps UI:**
1. **MotherOps-Alpha Project:**
   - Settings → Project Configuration
   - Classification sections (often called "Sprints" or "Iterations")
   - Under "Iteration" node, look for duplicates
   - Keep ONE "Sprint 2026-03-09", delete others
   - Repeat for all 13 sprints

2. **MotherOps-Beta Project:**
   - Same process

**Check for duplicates:**
```bash
npx tsx query-azure-iterations.ts
# If you see duplicates like:
#   Sprint 2026-03-09 (id: 123)
#   Sprint 2026-03-09 (id: 456) ← DELETE THIS ONE
```

---

## My Recommendation for Demo

✅ **Keep Current Structure:** The hierarchy DOES exist (Issue parents + Task children)

**Reason:**
- Minimal changes required
- Already populated with 247 work items
- Parent-child relationship is correct
- Only cleanup: Delete duplicate Sprint iterations (~5 min manual work)

**Then:**
1. Go to Azure DevOps → MotherOps-Alpha → Backlog
2. Select "Sprint 2026-03-09"
3. Verify you see:
   - "Meetings - Sprint 2026-03-09" with 8 child tasks ✓
   - "UnPlanned - Sprint 2026-03-09" with 8 child tasks ✓
4. Delete any duplicate sprints you encounter

---

## Technical Details

**If you want to rebuild with User Stories:**
- Modify `createSprintMeetingsWithProfiles.ts` line ~131:
  - Change `type: "Issue"` → `type: "User Story"`
  - Adjust description to reflect ceremony categories
  
- Modify `createUnplannedItemsHandler.ts` line ~145:
  - Change `type: "Issue"` → `type: "User Story"`
  - Update description for contingency context

**Then re-run:**
```bash
npm run cli -- create-sprint-meetings-with-profiles --project "MotherOps-Alpha"
npm run cli -- create-unplanned-items --project "MotherOps-Alpha"
```

---

## Summary

| Action | Time | Impact |
|--------|------|--------|
| Delete duplicate sprints (UI) | 5 min | Cleaner project view |
| Keep current Issue parents | Now | Demo ready ✅ |
| Rebuild with User Stories | 30 min | Slightly cleaner structure |

**For demo on March 7, 2026:** Just delete the duplicate sprints and you're done! 🎉
