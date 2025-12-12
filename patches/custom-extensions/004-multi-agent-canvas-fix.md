# Multi-Agent Canvas Update Fix

**Patch:** `004-multi-agent-canvas-fix.patch`  
**Status:** ✅ **FIXED AND TESTED**  
**Date:** 2025-12-11  
**Severity:** High (Beta Feature Broken)

## Problem

When using the experimental Multi-Agent Workflow Builder (feature flag: `057_ai_builder_multi_agent`), the AI successfully generates a plan, executes tools (Discovery, Builder, Configurator), and reports completion. However, the generated workflow **does not appear on the canvas**. The canvas remains empty or unchanged.

Legacy single-agent mode works perfectly, confirming the issue is specific to the multi-agent architecture.

## Root Cause

The parent graph's `process_operations` node was not emitting `workflowJSON` in its state update when subgraphs had already processed operations internally. Here's what happened:

1. **Subgraph** (`builder_subgraph`) processes operations internally via its own `process_operations` node
2. **Subgraph returns** to parent with `workflowJSON` (updated) and `workflowOperations: []` (empty array)
3. **Parent's `process_operations`** receives state where `workflowOperations.length === 0`
4. **`processOperations(state)`** returns `{}` (empty object) because there are no operations to apply
5. **Parent node returned** `{ ...{}, workflowOperations: [] }` = `{ workflowOperations: [] }` → **NO `workflowJSON`!**
6. **Stream processor** checks for `workflowJSON` presence, filters it out because it's missing
7. **Frontend** never receives `workflow-updated` event, canvas stays empty

## The Fix

**File:** `packages/@n8n/ai-workflow-builder.ee/src/multi-agent-workflow-subgraphs.ts`

Changed the `process_operations` node to always emit `workflowJSON`, even when there are no operations to process:

```typescript
// BEFORE (BROKEN)
.addNode('process_operations', (state) => {
    const result = processOperations(state);
    return {
        ...result,  // ❌ When result is {}, workflowJSON is missing!
        workflowOperations: [],
    };
})

// AFTER (FIXED)
.addNode('process_operations', (state) => {
    const result = processOperations(state);
    
    // Ensure workflowJSON is always present in the return value
    const processedWorkflowJSON = 'workflowJSON' in result
        ? (result as { workflowJSON: SimpleWorkflow }).workflowJSON
        : state.workflowJSON;  // ✅ Fall back to current state
    
    return {
        workflowJSON: processedWorkflowJSON,  // ✅ Always present!
        workflowOperations: [],
    };
})
```

## Testing

### To Reproduce the Original Bug:
1. Enable multi-agent mode: `window.featureFlags.override('057_ai_builder_multi_agent', 'variant')`
2. Open AI Assistant in Editor
3. Request a workflow (e.g., "Create a workflow that syncs contacts from HubSpot to Salesforce")
4. Observe: Tools execute, chat shows progress, but **canvas remains empty**

### After Fix:
1. Same steps as above
2. Observe: Tools execute, chat shows progress, **workflow appears on canvas in real-time** ✅

### Debug Version

A debug version with comprehensive logging is available: `004-multi-agent-canvas-fix-debug.patch`

This version logs:
- **Backend (`stream-processor.ts`)**: All incoming chunks, filtering decisions, workflow-updated emission
- **Backend (`multi-agent-subgraphs.ts`)**: State before/after `processOperations()`, final return value
- **Frontend (`AskAssistantBuild.vue`)**: All incoming messages, workflow application results

To use debug version:
```bash
# Apply debug patch instead
patch -p1 < patches/custom-extensions/004-multi-agent-canvas-fix-debug.patch

# View logs in Docker
docker logs -f n8n-source | grep -E '\[stream-processor\]|\[multi-agent-subgraphs\]|\[AskAssistantBuild\]'
```

## Related Files

- **Bug Description:** `.docs/bugfixes/01. multi-agent-canvas-update-failure/description.md`
- **Research:** `.docs/bugfixes/01. multi-agent-canvas-update-failure/research.md`
- **Fix Plan:** `.docs/plans/multi-agent-canvas-fix-plan.md`
- **Architecture:** `.docs/codemaps/multi-agent-workflow-builder-live-orchestration.md`

## Impact

- ✅ **Fixes:** Multi-agent workflow builder canvas updates
- ✅ **Preserves:** All existing single-agent functionality
- ✅ **No Breaking Changes:** Minimal change, only affects `process_operations` return value
- ✅ **Performance:** No impact

## Upstream Contribution

This fix addresses a genuine bug in n8n's multi-agent workflow builder. Consider:
1. Creating a GitHub issue in the n8n repository
2. Submitting this fix as a pull request
3. Including the debug logs/analysis for reproducibility
