# Fix Computer Use API Safety Decision Handling

## Problem

Tests fail with error:
```
The safety decision from function call type_text_at must be acknowledged in the corresponding function response.
```

## Root Cause

The `ComputerUseAgent.reportActionResult()` method does not extract and acknowledge safety decisions from the API's function call response. The Gemini Computer Use API includes safety metadata in function calls that must be echoed back in the function response.

## Solution

Update `src/agents/computer-use.js` to:
1. Capture safety decisions from API responses
2. Include them in function responses

## Implementation

### Step 1: Store Safety Decision from API Response

In `getNextAction()` method (line 68-100), extract safety information:

```javascript
// Extract function call from response
const functionCall = response.candidates[0].content.parts.find(
  part => part.functionCall
);

if (!functionCall) {
  this.logger.error('No function call in response');
  return null;
}

const action = functionCall.functionCall;

// NEW: Extract safety decision if present
const safetyDecision = response.candidates[0].safetyDecision || null;

// Store safety decision with action for later acknowledgement
action._safetyDecision = safetyDecision;
```

### Step 2: Acknowledge Safety Decision in Function Response

In `reportActionResult()` method (line 112-128), include safety acknowledgement:

```javascript
async reportActionResult(result, currentUrl) {
  // Computer Use API requires URL in function response
  const response = {
    ...result,
    url: currentUrl || result.url || ''
  };

  // NEW: Include safety decision if it was present in the original function call
  const functionResponsePart = {
    functionResponse: {
      name: result.actionName,
      response: response
    }
  };

  // If action had safety decision, acknowledge it
  if (result._safetyDecision) {
    functionResponsePart.functionResponse.safetyDecision = result._safetyDecision;
  }

  this.conversationHistory.push({
    role: 'function',
    parts: [functionResponsePart]
  });
}
```

### Step 3: Pass Safety Decision Through Execution Chain

In `src/orchestrator.js` (line 259-262), preserve safety decision:

```javascript
// Execute Computer Use action directly
const result = await testExecutor.executeComputerUseAction(action);

// NEW: Preserve safety decision from action
if (action._safetyDecision) {
  result._safetyDecision = action._safetyDecision;
}

// Capture page state after action to get current URL
const postActionState = await testExecutor.captureState();

// Report result back to Gemini with current URL (required by Computer Use API)
await computerUse.reportActionResult(result, postActionState.metadata.url);
```

## Testing

```bash
# Test with GitHub OAuth (should no longer get safety decision error)
npm run test:github

# Test with Google OAuth
npm run test:google

# Check logs for safety decision acknowledgement
grep -i "safety" tmp/oauth-test-*/execution.log
```

## Expected Outcome

- ✅ No more "safety decision must be acknowledged" errors
- ✅ Computer Use API conversation continues properly
- ⚠️ OAuth may still fail for other reasons (credential entry, OAuth config) but at least the API communication will work

## References

- Gemini Computer Use API: https://ai.google.dev/gemini-api/docs/computer-use
- Safety decisions are part of the responsible AI framework
- Function responses must mirror the safety context from function calls
