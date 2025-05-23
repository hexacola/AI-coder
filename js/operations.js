// Tauris AI Coder - Operations

// Constants
const LARGE_CONTEXT_THRESHOLD = 50000; // Threshold for large input context (characters)

/**
 * Clears the current project state
 */
function handleClear() {
    state.currentHTML = '';
    state.currentCSS = '';
    state.currentJS = '';
    state.currentPlan = '';
    state.currentPlanSteps = [];
    state.lastUserPrompt = '';
    
    if (editors.html) editors.html.setValue('');
    if (editors.css) editors.css.setValue('');
    if (editors.js) editors.js.setValue('');
    
    elements.promptInput.value = '';
    
    state.retryPayload.isAvailable = false;
    elements.regenerateButton.style.display = 'none';
    
    updatePlanDisplay([]);
    updatePreview();
    setStatus('Project cleared.', false, false);
    
    elements.submitButton.disabled = false;
    elements.clearButton.disabled = false;
    
    console.log("Project cleared.");
    state.codeManuallyEdited = false; // Reset flag on clear
    state.stopExecutionRequested = false; // Reset stop flag
    elements.stopButton.style.display = 'none'; // Hide stop button
}

/**
 * Handles user request to stop execution
 */
function handleStopExecution() {
    console.log("Stop execution requested by user.");
    // Give immediate feedback that stop is acknowledged
    setStatus("Stop request acknowledged. Attempting to halt...", false, false);
    state.stopExecutionRequested = true;
    elements.stopButton.disabled = true; // Disable stop button after clicking
    elements.stopButton.textContent = "Stopping...";

    // --- NEW: Also re-enable main buttons immediately when stop is requested ---
    // This provides better immediate feedback and usability if the process stops quickly.
    // The finally block in handleSubmit will do a final check too.
    if (!state.retryPayload.isAvailable) { // Only enable if no retry is pending
        elements.submitButton.disabled = false;
        elements.clearButton.disabled = false;
        elements.checkFixButton.disabled = false;
    }
    // Ensure the regenerate button is also handled if it was visible
    if (elements.regenerateButton.style.display !== 'none') {
         elements.regenerateButton.disabled = false;
    }
    // --- End NEW ---
}

/**
 * Updates code state and editors from extracted code object
 */
function updateCodeStateAndEditors(codes) {
    let codeUpdated = false;
    if (codes.html !== null) {
        state.currentHTML = codes.html;
        if (editors.html) editors.html.setValue(state.currentHTML);
        codeUpdated = true;
    }
    if (codes.css !== null) {
        state.currentCSS = codes.css;
        if (editors.css) editors.css.setValue(state.currentCSS);
        codeUpdated = true;
    }
    if (codes.js !== null) {
        state.currentJS = codes.js;
        if (editors.js) editors.js.setValue(state.currentJS);
        codeUpdated = true;
    }
    if (typeof updateLineCount === 'function') {
        updateLineCount();
    } else {
        console.warn("updateLineCount function not found.");
    }
    return codeUpdated;
}

/**
 * Handles regeneration of failed operations
 */
async function handleRegenerate() {
    if (!state.retryPayload.isAvailable) {
        setStatus("No retry data available.", true, false);
        return;
    }
    
    console.log("Regenerating:", state.retryPayload.purpose);
    
    elements.submitButton.disabled = true;
    elements.clearButton.disabled = true;
    elements.regenerateButton.disabled = true;
    elements.regenerateButton.textContent = '🧠 Regenerating...';
    
    setStatus(`Regenerating: ${state.retryPayload.purpose}`, false, true, 'regenerating');
    
    state.stopExecutionRequested = false;
    elements.stopButton.style.display = 'none';
    
    try {
        const aiResponseContent = await callPollinationsAPI(
            state.retryPayload.model, 
            state.retryPayload.messages, 
            state.retryPayload.purpose + " (Retry)"
        );
        
        state.retryPayload.isAvailable = false;
        
        if (state.retryPayload.operationType === 'initial_generation' ||
            state.retryPayload.operationType === 'enhancement_step' ||
            state.retryPayload.operationType === 'refinement' ||
            state.retryPayload.operationType === 'final_quality_pass') { // Added quality pass
            const codes = extractCode(aiResponseContent);
            
            if (codes.html === null && codes.css === null && codes.js === null) {
                throw new Error("Regeneration of initial generation failed to parse code blocks.");
            }
            
            updateCodeStateAndEditors(codes);
            
            state.codeManuallyEdited = false; // Code was overwritten by AI
            updatePreview();
            setStatus(`Regeneration successful. Planning enhancements...`, false, false);
            
            await delay(500);
            await generateEnhancementPlanAndExecuteSteps();
            
        } else if (state.retryPayload.operationType === 'enhancement_planning') {
            state.currentPlan = aiResponseContent;
            state.currentPlanSteps = parsePlan(state.currentPlan);
            
            if (state.currentPlanSteps.length === 0) {
                throw new Error("Regeneration of enhancement plan failed to parse steps.");
            }
            
            updatePlanDisplay(state.currentPlanSteps, 0);
            setStatus(`Plan regenerated (${state.currentPlanSteps.length} steps). Executing...`, false, false);
            
            await delay(500);
            await executeEnhancementStepsSequentially(0);
            
        } else if (state.retryPayload.operationType === 'enhancement_step') {
            const codes = extractCode(aiResponseContent);
            
            if (codes.html === null && codes.css === null && codes.js === null) {
                console.warn(`Regeneration of step ${state.retryPayload.failedStepIndex + 1} did not produce code blocks.`);
            } else {
                updateCodeStateAndEditors(codes);
            }
            
            updatePreview();
            updatePlanDisplay(state.currentPlanSteps, -1, state.retryPayload.failedStepIndex);
            
            setStatus(`Step ${state.retryPayload.failedStepIndex + 1} regenerated. Continuing...`, false, false);
            
            await delay(500);
            await executeEnhancementStepsSequentially(state.retryPayload.failedStepIndex + 1);
            
        } else if (state.retryPayload.operationType === 'refinement') {
            const codes = extractCode(aiResponseContent);
            
            if (codes.html === null && codes.css === null && codes.js === null) {
                throw new Error("Regeneration of refinement failed to parse code blocks.");
            }
            
            updateCodeStateAndEditors(codes);
            
            updatePreview();
            setStatus(`Refinement regenerated successfully!`, false, false);
        }
        
    } catch (error) {
        console.error(`Regeneration Error (${state.retryPayload.purpose}):`, error);
        setStatus(`Regeneration failed: ${error.message}. Try again?`, true, false);
        
        state.retryPayload.isAvailable = true;
        elements.regenerateButton.style.display = 'block';
        elements.regenerateButton.disabled = false;
        elements.regenerateButton.textContent = '🔁 Regenerate Failed Op';
        
        elements.submitButton.disabled = true;
        elements.clearButton.disabled = true;
        return;
    }
    
    state.retryPayload.isAvailable = false;
    elements.regenerateButton.style.display = 'none';
    elements.regenerateButton.textContent = '🔁 Regenerate Failed Op';
    
    if (state.retryPayload.operationType !== 'initial_generation' && 
        state.retryPayload.operationType !== 'enhancement_planning' && 
        state.retryPayload.operationType !== 'enhancement_step') {
        
        elements.submitButton.disabled = false;
        elements.clearButton.disabled = false;
    }
    
    // Reset edit flag if regeneration was successful and overwrote code
    if (state.retryPayload.operationType !== 'enhancement_planning') {
        state.codeManuallyEdited = false;
    }
}

/**
 * Executes enhancement steps sequentially with improved handling
 */
async function executeEnhancementStepsSequentially(startStepIndex = 0) {
    let lastCompletedStep = startStepIndex - 1;
    let allStepsSuccess = true;
    state.stopExecutionRequested = false;
    elements.stopButton.style.display = 'inline-block';
    elements.stopButton.disabled = false;
    elements.stopButton.textContent = "⏹️ Stop Execution";

    const executingPromises = new Map();
    const completedSteps = new Set();
    const MAX_PARALLEL_STEPS = 1; // Reduced parallelism for more predictable status updates for now
    const DEPENDENCY_THRESHOLD = 0.8; // Higher threshold, favour sequential

    let i = startStepIndex;
    while (i < state.currentPlanSteps.length) {
        // --- Check Stop Flag Before Starting Iteration ---
        if (state.stopExecutionRequested) {
            console.log(`Execution stopped by user before starting step ${i + 1}.`);
            // Set final status indicating where it stopped
            setStatus(`Execution stopped by user after step ${lastCompletedStep + 1}.`, false, false);
            allStepsSuccess = false;
            break; // Exit the loop
        }

        if (executingPromises.size < MAX_PARALLEL_STEPS) {
            const currentStepText = state.currentPlanSteps[i];
            const lowerStepText = currentStepText.toLowerCase();

            // --- REVERT Agent Determination (Simpler V2) ---
            let stepPurpose = 'enhancing'; // Default: generic enhancement
            let agentName = "Developer"; // Default agent
            if (/style|css|layout|visual|ui|ux|design|theme|look|align|spacing|font|color/i.test(lowerStepText)) {
                stepPurpose = 'fixing_styles';
                agentName = "UX/CSS Specialist";
            } else if (/implement|add feature|create|develop|build|functionality|logic|api|data/i.test(lowerStepText)) {
                stepPurpose = 'developing_feature';
                agentName = "Feature Developer";
            } else if (/fix|bug|error|debug|correct|issue/i.test(lowerStepText)) {
                stepPurpose = 'fixing';
                agentName = "Debugger";
            } else if (/refactor|improve|optimize|robust|modular|quality|clean/i.test(lowerStepText)) {
                stepPurpose = 'improving_robustness';
                agentName = "Code Quality Enhancer";
            } else if (/test|validate|verify|check|ensure|qa/i.test(lowerStepText)) { // Keep QA keyword
                stepPurpose = 'quality_assurance';
                agentName = "Tester";
            } else if (/critique|review|analyze/i.test(lowerStepText)) {
                stepPurpose = 'thinking';
                agentName = "Code Reviewer";
            }
             // --- End REVERT Agent Determination ---

            const stepLength = currentStepText.length;
            const hasKeyDependencyTerms = /previous|existing|update|modify|enhance|improve|fix|extend|combine|integrate/i.test(lowerStepText);
            const isComplexStep = stepLength > 100 || /implement|create complex|build system|advanced/i.test(lowerStepText);
            const isDependentOnPrevious = hasKeyDependencyTerms || isComplexStep ||
                                         (i > startStepIndex + 1) || // Assume dependency after first step
                                         (Math.random() > DEPENDENCY_THRESHOLD);

            if (isDependentOnPrevious || executingPromises.size > 0) {
                if (executingPromises.size > 0) {
                    const executingSteps = Array.from(executingPromises.keys()).join(', ');
                    console.log(`Waiting for steps ${executingSteps} to complete before proceeding with step ${i+1}`);
                    setStatus(`Waiting for parallel step(s) ${executingSteps}...`, false, true, 'thinking');
                    await Promise.all(executingPromises.values());
                    executingPromises.clear();
                    const maxCompleted = Math.max(-1, ...completedSteps); // Ensure Math.max doesn't return -Infinity
                    lastCompletedStep = maxCompleted > lastCompletedStep ? maxCompleted : lastCompletedStep;
                }

                try {
                    // Use the determined agent name
                    const statusMessage = `Working on Step ${i + 1}/${state.currentPlanSteps.length} (Agent: ${agentName})...`;
                    setStatus(statusMessage, false, true, stepPurpose, { stepNum: i + 1 });
                    updatePlanDisplay(state.currentPlanSteps, i, lastCompletedStep);
                    await delay(400);

                    // --- Check Stop Flag Before Calling executeEnhancementStep ---
                    if (state.stopExecutionRequested) {
                        console.log(`Execution stopped by user before executing step ${i + 1}.`);
                        setStatus(`Execution stopped by user after step ${lastCompletedStep + 1}.`, false, false);
                        allStepsSuccess = false;
                        break; // Exit the loop
                    }

                    await executeEnhancementStep(i);

                    lastCompletedStep = i;
                    completedSteps.add(i);

                    updatePlanDisplay(state.currentPlanSteps, -1, lastCompletedStep);
                    setStatus(`Step ${i + 1}/${state.currentPlanSteps.length} processed (Agent: ${agentName}).`, false, false);
                    await delay(300);

                    i++;
                } catch (error) {
                    // Check if the error was due to a stop request *during* executeEnhancementStep
                     if (state.stopExecutionRequested) {
                         console.log(`Execution stopped by user during step ${i + 1}.`);
                         setStatus(`Execution stopped by user during step ${i + 1}.`, false, false);
                         allStepsSuccess = false;
                     } else {
                        // Handle actual errors
                        console.error(`Error during enhancement step ${i+1} (Agent: ${agentName}):`, error);
                        setStatus(`Error in step ${i + 1} (Agent: ${agentName}): ${error.message}`, true, false);
                        updatePlanDisplay(state.currentPlanSteps, -1, lastCompletedStep, i);
                        allStepsSuccess = false;
                     }
                     break; // Exit the loop on error or stop
                }
            } else {
                // Parallel execution path (currently disabled by MAX_PARALLEL_STEPS=1)
                console.log(`Starting step ${i+1} in parallel (Agent: ${agentName})`);
                const statusMessage = `Starting Step ${i + 1}/${state.currentPlanSteps.length} (Agent: ${agentName})...`;
                setStatus(statusMessage, false, true, stepPurpose, { stepNum: i + 1 });
                updatePlanDisplay(state.currentPlanSteps, i, lastCompletedStep);

                const stepPromise = (async (stepIndex, agent, purpose) => {
                    try {
                        if (state.stopExecutionRequested) {
                             console.log(`Parallel execution stopped by user before starting step ${stepIndex + 1}.`);
                             setStatus(`Execution stopped by user.`, false, false);
                             return { index: stepIndex, success: false, stopped: true };
                        }
                        await executeEnhancementStep(stepIndex);
                        completedSteps.add(stepIndex);
                        console.log(`Parallel step ${stepIndex + 1} completed (Agent: ${agent})`);
                         // Don't update status here directly, wait for sequential block or final loop
                        return { index: stepIndex, success: true };
                    } catch (error) {
                        console.error(`Parallel step ${stepIndex + 1} failed (Agent: ${agent}):`, error);
                        // Propagate the error to be caught by Promise.all or Promise.any
                        throw { index: stepIndex, error: error, agent: agent };
                    }
                })(i, agentName, stepPurpose);

                executingPromises.set(i + 1, stepPromise);
                i++;
            }
        } else {
             // Wait for at least one promise to complete (currently unused with MAX_PARALLEL_STEPS=1)
             try {
                 const result = await Promise.race([
                     Promise.any(executingPromises.values()).catch(e => { throw e; }), // Propagate error from any
                     delay(60000).then(() => { throw new Error('Parallel step timeout'); }) // 60-second safety timeout
                 ]);

                 if (result && typeof result === 'object' && result.index !== undefined) {
                     console.log(`Parallel step ${result.index + 1} finished race.`);
                     // Remove completed promise
                     executingPromises.delete(result.index + 1);
                      // Update last completed step if necessary (handle potential out-of-order completion)
                      const maxCompleted = Math.max(-1, ...completedSteps);
                      lastCompletedStep = maxCompleted > lastCompletedStep ? maxCompleted : lastCompletedStep;
                      updatePlanDisplay(state.currentPlanSteps, -1, lastCompletedStep); // Update display based on completed set
                 } else if (result === 'timeout') {
                      // Should be caught as error now
                 }

             } catch (errorInfo) {
                 console.error('Error during parallel execution race:', errorInfo);
                 let failedStepIndex = -1;
                 let errorMessage = "Error in parallel execution.";
                 let failedAgent = "Unknown Agent";

                 if (typeof errorInfo === 'object' && errorInfo.index !== undefined) {
                     failedStepIndex = errorInfo.index;
                     errorMessage = `Error in step ${failedStepIndex + 1}: ${errorInfo.error.message}`;
                     failedAgent = errorInfo.agent || failedAgent;
                 } else if (errorInfo instanceof Error) {
                     errorMessage = errorInfo.message;
                 }

                 setStatus(errorMessage, true, false);
                 if (failedStepIndex !== -1) {
                     updatePlanDisplay(state.currentPlanSteps, -1, lastCompletedStep, failedStepIndex);
                 }
                 allStepsSuccess = false;
                 // Attempt to clear remaining promises, but stop the overall process
                 executingPromises.forEach(p => p.catch(() => {})); // Consume potential future errors
                 executingPromises.clear();
                 break; // Stop execution on error
             }
        }
    }

    // ... (wait for remaining parallel steps if any, unless stopped) ...
     if (executingPromises.size > 0 && !state.stopExecutionRequested) {
         setStatus(`Finalizing ${executingPromises.size} remaining step(s)...`, false, true, 'thinking');
         try {
            await Promise.all(executingPromises.values());
            const maxCompleted = Math.max(-1, ...completedSteps); // Final update
            lastCompletedStep = maxCompleted > lastCompletedStep ? maxCompleted : lastCompletedStep;
            updatePlanDisplay(state.currentPlanSteps, -1, lastCompletedStep); // Final plan display update
         } catch (errorInfo) {
              console.error('Error during final parallel step completion:', errorInfo);
               let failedStepIndex = -1;
               let errorMessage = "Error finalizing parallel steps.";
                if (typeof errorInfo === 'object' && errorInfo.index !== undefined) {
                     failedStepIndex = errorInfo.index;
                     errorMessage = `Error in final step ${failedStepIndex + 1}: ${errorInfo.error.message}`;
                 } else if (errorInfo instanceof Error) {
                     errorMessage = errorInfo.message;
                 }
               setStatus(errorMessage, true, false);
                if (failedStepIndex !== -1) {
                     updatePlanDisplay(state.currentPlanSteps, -1, lastCompletedStep, failedStepIndex);
                 }
              allStepsSuccess = false;
         }
     }


    // Clean up stop button state
    elements.stopButton.style.display = 'none';
    state.stopExecutionRequested = false;

    // Re-enable buttons if execution finished or was stopped *and* no retry is pending
    if (!state.retryPayload.isAvailable) {
        elements.submitButton.disabled = false;
        elements.clearButton.disabled = false;
    } else {
        elements.regenerateButton.disabled = false;
         elements.submitButton.disabled = true; // Keep disabled if retry is available
         elements.clearButton.disabled = true;
    }


    return allStepsSuccess;
}

/**
 * Executes a single enhancement step with improved error handling
 * @param {number} stepIndex - The index of the step to execute
 * @returns {Promise<void>}
 */
async function executeEnhancementStep(stepIndex) {
    // Check stop request at the very beginning
    if (state.stopExecutionRequested) {
        console.log(`executeEnhancementStep: Stop requested before starting step ${stepIndex + 1}.`);
        throw new Error("Execution stopped by user request."); // Throw to signal stop
    }

    const currentStepText = state.currentPlanSteps[stepIndex];
    console.log(`>>> executeEnhancementStep: Starting Step ${stepIndex + 1}: "${currentStepText}"`);

    // Get current code *before* this step from CodeMirror editors
    const htmlContentBeforeStep = editors.html ? editors.html.getValue() : '';
    const cssContentBeforeStep = editors.css ? editors.css.getValue() : '';
    const jsContentBeforeStep = editors.js ? editors.js.getValue() : '';
    console.log(`>>> executeEnhancementStep: Code state BEFORE step ${stepIndex + 1} (lengths): HTML=${htmlContentBeforeStep.length}, CSS=${cssContentBeforeStep.length}, JS=${jsContentBeforeStep.length}`);


    // Check context size before API call
    const currentContextSize = htmlContentBeforeStep.length + cssContentBeforeStep.length + jsContentBeforeStep.length;

    if (currentContextSize > LARGE_CONTEXT_THRESHOLD) {
        console.warn(`Context size (${currentContextSize} chars) for Step ${stepIndex + 1} is large.`);
    }

    // --- REFINED Step System Prompt ---
    const stepSystemPrompt = `You are a meticulous AI developer agent within **Tauris AI Coder**, executing ONE specific step from an enhancement plan. Your goal is to **incrementally improve** the existing codebase by implementing *only this step*, integrating it flawlessly, and outputting the **complete, updated codebase**.

**Application Context:** Tauris AI Coder (generates/enhances web apps iteratively).
**Current Project Goal (User Request):** "${state.lastUserPrompt}"
**Full Enhancement Plan:** \n${state.currentPlan}
**Your EXACT Current Task:** Step ${stepIndex + 1} - "${currentStepText}"

**CRITICAL Workflow for THIS Step:**
1.  **Analyze PREVIOUS Code:** Carefully study the COMPLETE HTML, CSS, and JS provided (the code *before* your step).
2.  **Understand YOUR Task:** Fully grasp the requirement of Step ${stepIndex + 1}.
3.  **Implement Incrementally:** Determine the *minimum necessary changes* to the previous code to fulfill YOUR task. DO NOT reimplement the entire application.
4.  **Integrate & Verify:** Ensure your changes integrate perfectly with the existing code structure and logic. Do not break other parts.
5.  **Output FULL Updated Code:** Provide the ***entire***, updated, fully functional code for **ALL THREE files** (HTML, CSS, JS) reflecting the state *after* your step is completed.

**Core Principles:** Precision, Incremental Change, Integration, Quality, Robustness, Full Context-Awareness, COMPLETE Cumulative Output.`;

    // --- REFINED Step User Instruction ---
    const stepUserInstruction = `
**APPLICATION:** Tauris AI Coder
**PROJECT GOAL:** "${state.lastUserPrompt}"
**FULL PLAN:**\n${state.currentPlan}

**CODE BEFORE THIS STEP (Analyze ALL for integration):**
\\\`\\\`\\\`html
${htmlContentBeforeStep || '(No HTML yet)'}
\\\`\\\`\\\`
\\\`\\\`\\\`css
${cssContentBeforeStep || '(No CSS yet)'}
\\\`\\\`\\\`
\\\`\\\`\\\`javascript
${jsContentBeforeStep || '(No JS yet)'}
\\\`\\\`\\\`

**YOUR CURRENT TASK (Step ${stepIndex + 1}/${state.currentPlanSteps.length}): ${currentStepText}**

**INSTRUCTIONS (Follow Strictly):**
1.  **Execute ONLY Your Task:** Implement *just* the CURRENT TASK, modifying the provided 'CODE BEFORE THIS STEP'.
2.  **Incremental Update:** Make only the necessary changes for this step. Do NOT rewrite unrelated code.
3.  **Integrate:** Ensure changes work seamlessly with the existing code. Update related code ONLY if necessary for integration.
4.  **Quality & Robustness:** Produce clean, efficient, commented, and robust code for your changes. Fix obvious errors you encounter *while implementing your task*.
5.  **Preserve Functionality:** Do not break existing features unless the task explicitly requires modification.
6.  **Output COMPLETE CUMULATIVE Code:** Provide the ***ENTIRE, UPDATED, FULLY FUNCTIONAL*** code for **ALL THREE files**, reflecting the state *after* your step is completed.
7.  **Strict Formatting:** ONLY raw code within fenced blocks (\`\`\`html, \`\`\`css, \`\`\`javascript). NO explanations, NO apologies, NO summaries.

\\\`\\\`\\\`html
[Your FULL CUMULATIVE HTML code AFTER completing Step ${stepIndex + 1}]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Your FULL CUMULATIVE RESPONSIVE CSS code AFTER completing Step ${stepIndex + 1}]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[Your FULL CUMULATIVE MODULAR, ROBUST JavaScript code AFTER completing Step ${stepIndex + 1}]
\\\`\\\`\\\`
`;

    state.retryPayload.operationType = 'enhancement_step';
    state.retryPayload.failedStepIndex = stepIndex;

    const selectedModel = elements.modelSelect.value;

    // Define API options, including top_p
    const apiOptions = {
        temperature: 0.15, // Lower temperature for more deterministic step execution
        top_p: 0.9,       // Keep top_p for focused output
        maxRetries: 2     // Reduced retries for steps, planning might need more
    };

    // --- Check Stop Flag Before API Call ---
    if (state.stopExecutionRequested) {
        console.log(`executeEnhancementStep: Stop requested before API call for step ${stepIndex + 1}.`);
        throw new Error("Execution stopped by user request.");
    }
    console.log(`>>> executeEnhancementStep: Calling API for step ${stepIndex + 1}...`);
    const aiResponseContent = await callPollinationsAPI(
        selectedModel,
        [
            { role: "system", content: stepSystemPrompt },
            { role: "user", content: stepUserInstruction }
        ],
        `Enhancement Step ${stepIndex + 1}`,
        apiOptions
    );
    console.log(`>>> executeEnhancementStep: API response received for step ${stepIndex + 1}.`);

    // --- Check Stop Flag After API Call (before processing) ---
     if (state.stopExecutionRequested) {
         console.log(`executeEnhancementStep: Stop requested after API call for step ${stepIndex + 1}.`);
         throw new Error("Execution stopped by user request.");
     }

    state.retryPayload.isAvailable = false; // Reset retry only on successful API call return

    console.log(`>>> executeEnhancementStep: Extracting code for step ${stepIndex + 1}...`);
    const codes = extractCode(aiResponseContent);
    console.log(`>>> executeEnhancementStep: Extracted code result (null checks): HTML=${codes.html === null}, CSS=${codes.css === null}, JS=${codes.js === null}`);


    // --- Enhanced Check: Did the code *actually* change? ---
    let codeChanged = false;
    if (codes.html !== null && codes.html !== htmlContentBeforeStep) codeChanged = true;
    if (codes.css !== null && codes.css !== cssContentBeforeStep) codeChanged = true;
    if (codes.js !== null && codes.js !== jsContentBeforeStep) codeChanged = true;

    // Check if *any* code was returned AND if it actually changed or if it's the first step
    if ((codes.html === null && codes.css === null && codes.js === null)) {
        // AI failed to return any valid blocks
        console.error(`>>> executeEnhancementStep: No valid code blocks extracted for step ${stepIndex + 1}. AI Response might be malformed or empty.`);

        // --- ADDED DETAILED LOG OF THE FAILED RESPONSE ---
        console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
        console.error(`!!! RAW AI RESPONSE (Step ${stepIndex + 1}) THAT FAILED EXTRACTION: !!!`);
        console.error(aiResponseContent);
        console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
        // --- END ADDED LOG ---

        throw new Error(`AI failed to provide valid code blocks for step ${stepIndex + 1}.`);
    } else if (!codeChanged && stepIndex > 0) { // Only warn if not the first step and code didn't change
        console.warn(`>>> executeEnhancementStep: Code returned by AI for step ${stepIndex + 1} seems unchanged from the previous state. Step might have been skipped or AI failed to modify.`);
        // Decide how to handle this: maybe treat as success, maybe warn user, maybe retry?
        // For now, we'll proceed but log the warning. Could add a retry mechanism here later.
        setStatus(`Warning: Step ${stepIndex + 1} might not have resulted in code changes.`, false, false);
        await delay(1500); // Give user time to see warning
    }

    // Update editors only if code was returned (even if unchanged, to reflect AI's output)
    console.log(`>>> executeEnhancementStep: Updating code state and editors for step ${stepIndex + 1}.`);
    const updated = updateCodeStateAndEditors({
         // Fallback to previous state ONLY if AI explicitly returned null for a block
         // This aims to preserve existing code if AI fails on one part
         html: codes.html ?? htmlContentBeforeStep,
         css: codes.css ?? cssContentBeforeStep,
         js: codes.js ?? jsContentBeforeStep,
     });
     console.log(`>>> executeEnhancementStep: Editors updated = ${updated}`);


    // --- Check Stop Flag Before Final Preview Update ---
    if (state.stopExecutionRequested) {
        console.log(`executeEnhancementStep: Stop requested before final preview update for step ${stepIndex + 1}.`);
        throw new Error("Execution stopped by user request.");
    }

    console.log(`>>> executeEnhancementStep: Updating preview for step ${stepIndex + 1}.`);
    updatePreview();
    console.log(`>>> executeEnhancementStep: Finished Step ${stepIndex + 1}.`);
}

// --- NEW Helper Function ---
/**
 * Displays a single turn of the discussion in the plan area.
 * @param {string} turnText - The text of the discussion turn (e.g., "Architect: Let's use...")
 */
function displayDiscussionTurn(turnText) {
    if (!elements.planDisplayDiv) return;

    const turnDiv = document.createElement('div');
    turnDiv.classList.add('discussion-turn');

    // Basic agent role detection for potential styling
    const roleMatch = turnText.match(/^([\w\s/]+):\s*/); // Match "Agent Name: "
    if (roleMatch && roleMatch[1]) {
        const roleClass = roleMatch[1].toLowerCase().replace(/[\s/]+/g, '-'); // e.g., 'frontend-dev'
        turnDiv.classList.add(`agent-${roleClass}`);
    }

    turnDiv.textContent = turnText; // Set the text content
    elements.planDisplayDiv.appendChild(turnDiv);

    // Scroll to the bottom to show the latest turn
    elements.planDisplayDiv.scrollTop = elements.planDisplayDiv.scrollHeight;
}
// --- END NEW Helper Function ---

/**
 * Simulates an interactive planning discussion among AI agent roles.
 * Now focuses on 5 turns of refinement.
 * @param {string} userQuery - The original user prompt.
 * @param {string} researchText - Findings from the research phase.
 * @param {string} selectedModel - The user-selected model (or a designated reasoning model).
 * @returns {Promise<string>} - A string containing the full discussion transcript after 5 turns or stop.
 */
async function teamDiscussionPhase(userQuery, researchText, selectedModel) {
    console.log("Starting 5-Turn Iterative Team Discussion Phase...");
    const planTitleSpan = document.getElementById('plan-title');
    // ... (Prepare Display Area logic remains the same) ...

    let fullDiscussion = `Iterative Discussion Start (5 Turns):\nUser Request: "${userQuery}"\n${researchText ? researchText + '\n' : ''}`;
    let discussionHistory = [ { role: "system", content: "" }, { role: "user", content: "" } ];
    let currentTurn = 1;
    const MAX_TURNS = 5; // Fixed 5 turns for refinement loop

    const agentRoles = `
- **Architect:** Concise, focused on structure, patterns, scalability. May ask clarifying questions about core architecture.
- **Frontend Dev:** User-focused, talks about components, HTML semantics, accessibility. Visualizes the user interface.
- **Backend/JS Dev:** Logic-driven, considers state, data flow, robustness, potential complexities. Thinks about how things connect.
- **CSS Designer:** Aesthetic-focused, thinks about theme, responsiveness, visual polish, modern CSS techniques. Suggests look-and-feel.
- **QA/Tester:** Cautious, points out potential issues, edge cases, error handling needs, usability concerns. Asks "What if?".`;

    // --- MODIFIED System Prompt for Iterative Refinement ---
    const discussionSystemPrompt = `You are a Multi-Agent Simulator within **Tauris AI Coder**. Facilitate a **5-turn iterative refinement** discussion between expert agents for the user's request. Each turn, agents should critique the previous turn's ideas and propose specific improvements towards a better initial strategy. Use concise, constructive feedback. Indicate the speaker (e.g., "Architect: ...").

**Application Context:** Tauris AI Coder generates web apps based on prompts, using iterative enhancement.
**Current Project Goal:** "${userQuery}"
**Discussion Goal:** Refine the initial plan over 5 turns.
**Agent Team & Personalities:**
${agentRoles}`;

    // --- Initial User Prompt for Turn 1 ---
    let turnUserPrompt = `
**Application:** Tauris AI Coder
**USER REQUEST:** "${userQuery}"
${researchText}
**TASK (Turn 1/${MAX_TURNS}):** Start the discussion. Have 1-2 agents provide initial ideas or high-level approaches for implementing this request within Tauris AI Coder, using **simple sentences**.`;

    let discussionModel = selectedModel;
    // ... (reasoning model selection logic remains the same) ...
    console.log(`Using specialized model for Team Discussion Loop: ${discussionModel}`);

    discussionHistory[0].content = discussionSystemPrompt;
    discussionHistory[1].content = turnUserPrompt;

    displayDiscussionTurn(`Starting iterative discussion (Turn 1/${MAX_TURNS})...`);

    while (currentTurn <= MAX_TURNS) {
        // --- Check Stop Flag at the beginning of the loop iteration ---
        if (state.stopExecutionRequested) {
            console.log("Team discussion stopped by user.");
            fullDiscussion += "\n\nDiscussion stopped by user.";
            displayDiscussionTurn("--- Discussion stopped by user ---");
            setStatus("Discussion stopped by user.", false, false);
             if (planTitleSpan) planTitleSpan.textContent = "Enhancement Plan & Progress"; // Restore title
            return fullDiscussion; // Return immediately
        }

        setStatus(`Team Refining Plan (Turn ${currentTurn}/${MAX_TURNS})...`, false, true, 'team_discussing');

        try {
            const turnApiOptions = {
                temperature: 0.6,
                top_p: 0.95,
                max_tokens: 150,
                maxRetries: 1,
                reasoning_effort: (discussionModel === 'openai-reasoning' || state.modelCapabilities[discussionModel]?.hasReasoning) ? 'medium' : undefined
            };

             // --- Check Stop Flag Before API Call ---
            if (state.stopExecutionRequested) {
                console.log("Team discussion stopped by user before API call.");
                fullDiscussion += "\n\nDiscussion stopped by user.";
                displayDiscussionTurn("--- Discussion stopped by user ---");
                setStatus("Discussion stopped by user.", false, false);
                 if (planTitleSpan) planTitleSpan.textContent = "Enhancement Plan & Progress"; // Restore title
                return fullDiscussion; // Return immediately
            }

            const turnResponse = await callPollinationsAPI(
                discussionModel,
                discussionHistory,
                `Team Discussion Turn ${currentTurn}`,
                turnApiOptions
            );

             // --- Check Stop Flag After API Call ---
            if (state.stopExecutionRequested) {
                console.log("Team discussion stopped by user after API call.");
                fullDiscussion += "\n\nDiscussion stopped by user.";
                displayDiscussionTurn("--- Discussion stopped by user ---");
                setStatus("Discussion stopped by user.", false, false);
                 if (planTitleSpan) planTitleSpan.textContent = "Enhancement Plan & Progress"; // Restore title
                return fullDiscussion; // Return immediately
            }

            const agentUtterance = turnResponse.trim();
            displayDiscussionTurn(agentUtterance); // Display the refinement/critique
            console.log(`Turn ${currentTurn} Response:`, agentUtterance);
            fullDiscussion += `\nTurn ${currentTurn}: ${agentUtterance}`;
            discussionHistory.push({ role: "assistant", content: agentUtterance });

            // Prepare prompt for the *next* refinement turn
            if (currentTurn < MAX_TURNS) {
                const nextTurnPrompt = `**Project Goal:** "${userQuery}"\n**TASK (Turn ${currentTurn + 1}/${MAX_TURNS}):** Based on the entire discussion history, have 1-2 *different* agents critique the previous points and suggest specific *improvements* or *alternative approaches* using simple sentences. Focus on refining the strategy.`;
                discussionHistory.push({ role: "user", content: nextTurnPrompt });
            }

            await delay(500 + Math.random() * 500);

        } catch (error) {
            // Check if error is due to stop request propagated from API call
             if (state.stopExecutionRequested) {
                console.log("Team discussion stopped by user during API call handling.");
                fullDiscussion += "\n\nDiscussion stopped by user.";
                displayDiscussionTurn("--- Discussion stopped by user ---");
                setStatus("Discussion stopped by user.", false, false);
             } else {
                console.warn(`Team Discussion turn ${currentTurn} failed:`, error);
                setStatus(`⚠️ Discussion turn ${currentTurn} failed. Trying to proceed...`, false, false);
                displayDiscussionTurn(`--- Error during turn ${currentTurn} ---`);
                fullDiscussion += `\n\nError during turn ${currentTurn}.`;
                await delay(1500);
             }
             // Exit loop on error or stop
             break;
        }
        currentTurn++;
    }

    // --- Code after loop finishes or breaks ---
    if (!state.stopExecutionRequested) { // Only log completion messages if not stopped
        if (currentTurn > MAX_TURNS) {
            fullDiscussion += `\n\nCompleted ${MAX_TURNS} turns of refinement.`;
            displayDiscussionTurn(`--- Completed ${MAX_TURNS} Refinement Turns ---`);
            console.log(`Completed ${MAX_TURNS} discussion turns.`);
            setStatus("Team discussion complete. Proceeding...", false, true, 'generating');
        } else {
             // Loop broke due to error, status already set
        }
    } else {
         setStatus("Discussion stopped by user.", false, false); // Ensure final status reflects stop
    }

    if (planTitleSpan) planTitleSpan.textContent = "Enhancement Plan & Progress"; // Restore title
    await delay(500);
    return fullDiscussion; // Return the final transcript
}

/**
 * Generates enhancement plan (To-Do List) and executes the steps
 */
async function generateEnhancementPlanAndExecuteSteps(initialCodeContext = {}, discussionContext = "") {
    console.log(">>> generateEnhancementPlanAndExecuteSteps: Entered.");
    console.log(">>> generateEnhancementPlanAndExecuteSteps: Received discussion context (length):", discussionContext?.length);

    const userSelectedModel = elements.modelSelect.value;
    let planningModel = userSelectedModel;
    // Try to select a reasoning model for planning if available
    const reasoningModels = Object.keys(state.modelCapabilities).filter(m => state.modelCapabilities[m].hasReasoning);
     if (reasoningModels.length > 0) {
         const preferredReasoning = ['deepseek-r1-llama', 'qwen-reasoning', 'gemini-thinking', 'openai-reasoning'].find(m => reasoningModels.includes(m));
         planningModel = preferredReasoning || reasoningModels.sort((a, b) => (state.modelCapabilities[b]?.qualityScore || 0) - (state.modelCapabilities[a]?.qualityScore || 0))[0] || userSelectedModel;
     }
    // --- ADD LOG for selected planning model ---
    console.log(`>>> generateEnhancementPlanAndExecuteSteps: Using planning model: ${planningModel}`);

    let enhancementPlanError = null;
    try {
        setStatus(`Planning enhancements To-Do List (Agent: Team Lead - using ${planningModel})...`, false, true, 'planning');
        // Get current code (use initial context if passed, otherwise editors)
        const currentHtml = editors.html?.getValue() || initialCodeContext.html || '';
        const currentCss = editors.css?.getValue() || initialCodeContext.css || '';
        const currentJs = editors.js?.getValue() || initialCodeContext.js || '';

        // --- REFINED Planning System Prompt ---
        const planningSystemPrompt = `You are Tauris AI Coder's strategic Team Lead/Architect. Analyze the user's goal, the preceding team discussion (if any), and the current code state to create a **prioritized, actionable To-Do List (6-12 steps)** for enhancing the application within the **Tauris AI Coder** environment.

GUIDELINES:
- **Analyze Context:** Deeply understand the user request ("${state.lastUserPrompt}"), discussion nuances, and the *current* code provided below.
- **Actionable & Specific Steps:** Create 6-12 tasks. Each step should represent a *single, logical development action* suitable for one AI agent turn (e.g., "Implement button click handler for calculation", "Add CSS for responsive header layout", "Refactor score update logic"). Avoid vague steps like "Improve UI" or "Add features".
- **Prioritize Core Goal:** Focus first on tasks essential to achieving the user's primary request.
- **Logical Flow:** Order tasks sensibly for iterative development. Step N should logically follow Step N-1.
- **Consider Existing Code:** Base the plan on the *actual code provided*, identifying specific areas for addition/modification.

Output ONLY a numbered list (TARGETING 6-12 TASKS). NO introduction, NO explanation, NO summary.`;

        // --- REFINED Planning User Message ---
        const planningUserMessage = `
**APPLICATION CONTEXT:** Tauris AI Coder (generates/enhances web apps iteratively)
**PROJECT GOAL (User Request):** "${state.lastUserPrompt}"

**CONTEXT REVIEW FOR PLANNING:**

1.  **Preceding Team Discussion / Strategy Summary:**
${discussionContext || "(No preceding discussion recorded or strategy summary available.)"}

2.  **CURRENT CODE STATE (Analyze CAREFULLY for planning next steps):**
\\\`\\\`\\\`html
${currentHtml || '(empty)'}
\\\`\\\`\\\`
\\\`\\\`\\\`css
${currentCss || '(empty)'}
\\\`\\\`\\\`
\\\`\\\`\\\`javascript
${currentJs || '(empty)'}
\\\`\\\`\\\`

**TO-DO LIST GENERATION INSTRUCTIONS (Team Lead Role for Tauris AI Coder):**
Based *comprehensively* on the **Project Goal, Team Discussion Summary, and the CURRENT CODE STATE provided above**:
1.  Identify the most critical next enhancements needed for *this specific project*.
2.  Define **6-12 specific, actionable development tasks** that incrementally build towards the goal. Each task should be clear enough for another AI agent to execute in one step.
3.  Prioritize these tasks logically for iterative implementation.
4.  Ensure the plan directly addresses the user's request and builds upon the existing code.

**Output Requirement:** Generate ONLY the numbered list of 6-12 precise to-do items.
`;

         state.retryPayload.operationType = 'enhancement_planning';

         const planningApiOptions = {
             temperature: 0.3, // Slightly higher temp for planning creativity
             top_p: 0.95,
             maxTokens: 1024, // Enough for a decent plan
             maxRetries: 2
         };

         console.log(">>> generateEnhancementPlanAndExecuteSteps: Calling API for planning...");
         const generatedPlan = await callPollinationsAPI(
             planningModel,
             [
                 { role: "system", content: planningSystemPrompt }, // Will update this prompt below
                 { role: "user", content: planningUserMessage }    // Will update this prompt below
             ],
             `Enhancement Planning`,
             planningApiOptions
         );
         console.log(">>> generateEnhancementPlanAndExecuteSteps: API call returned plan (raw):", generatedPlan);

         state.currentPlan = generatedPlan.trim();
         // Add robustness to parsing: handle potential markdown list prefixes or empty lines
         state.currentPlanSteps = parsePlan(state.currentPlan.replace(/^- /gm, '1. ')); // Standardize list format
         console.log(`>>> generateEnhancementPlanAndExecuteSteps: Parsed ${state.currentPlanSteps.length} plan steps.`);

         if (state.currentPlanSteps.length === 0) {
             console.error(">>> generateEnhancementPlanAndExecuteSteps: Failed to parse any actionable steps from the generated plan.");
             throw new Error("Failed to generate a valid enhancement plan (no actionable steps parsed).");
         }
         if (state.currentPlanSteps.length < 3 && state.currentPlan.length > 50) { // Heuristic: plan seems too short but raw text exists
             console.warn(">>> generateEnhancementPlanAndExecuteSteps: Parsed few steps, but raw plan seems longer. Check AI output format.");
         }


         // Display the parsed plan
         updatePlanDisplay(state.currentPlanSteps, 0); // Show plan with first step highlighted
         setStatus(`Plan generated (${state.currentPlanSteps.length} steps). Executing step 1...`, false, false);
         await delay(500);

         // --- Check Stop Flag Before Execution ---
         if (state.stopExecutionRequested) throw new Error("Execution stopped by user request.");

         console.log(">>> generateEnhancementPlanAndExecuteSteps: Starting sequential execution of steps...");
         const stepsSuccess = await executeEnhancementStepsSequentially(0);
         console.log(">>> generateEnhancementPlanAndExecuteSteps: Sequential execution finished. Success:", stepsSuccess);

        // --- Final Quality Pass (Optional but Recommended) ---
        if (stepsSuccess && !state.stopExecutionRequested) {
            console.log(">>> generateEnhancementPlanAndExecuteSteps: Initiating Final Quality Pass...");
            setStatus("Performing final quality checks (Agent: QA Specialist)...", false, true, 'quality_assurance');
            await delay(500);

            // --- Check Stop Flag Before Final Pass ---
            if (state.stopExecutionRequested) throw new Error("Execution stopped by user request.");

            await handleCheckAndFixCode(true); // Pass a flag to indicate it's the final pass

            console.log(">>> generateEnhancementPlanAndExecuteSteps: Final Quality Pass completed.");
            setStatus("Enhancement process complete with final checks!", false, false);
            return true; // Return true indicating overall success including final pass
        } else if (!stepsSuccess) {
             console.log(">>> generateEnhancementPlanAndExecuteSteps: Skipping final quality pass due to errors in enhancement steps.");
             // Status already reflects the error or stop
             return false; // Indicate incomplete if steps failed
        } else {
            console.log(">>> generateEnhancementPlanAndExecuteSteps: Skipping final quality pass due to stop request.");
             // Status already reflects the stop
             return false; // Indicate incomplete if stopped
        }
         // --- End Final Quality Pass ---


    } catch (err) {
        enhancementPlanError = err; // Store error
        // --- ADD LOG for error ---
        console.error(">>> generateEnhancementPlanAndExecuteSteps: Error during planning or execution phase:", err);
        setStatus(`Error during enhancement: ${err.message}`, true, false);
        // Check if it was a stop request
        if (err.message === "Execution stopped by user request.") {
            setStatus("Execution stopped by user during planning/execution.", false, false);
            state.retryPayload.isAvailable = false; // No retry for user stop
        } else {
            setStatus(`Error during enhancement: ${err.message}`, true, false);
            if (state.retryPayload.isAvailable) {
                elements.regenerateButton.style.display = 'block';
                elements.regenerateButton.disabled = false;
            }
        }
        return false; // Indicate failure
    }
}

/**
 * Handles the main generate/refine submission workflow
 */
async function handleSubmit() {
    console.log(">>> handleSubmit: Function Entered");
    const userPrompt = elements.promptInput.value.trim();
    const selectedModel = elements.modelSelect.value;

    if (!userPrompt) {
        setStatus("Please enter a project description.", true, false);
        console.log("handleSubmit: Exited - No prompt"); // --- ADDED LOG ---
        return;
    }
    if (!selectedModel) {
        setStatus("Please select an AI model.", true, false);
        console.log("handleSubmit: Exited - No model selected"); // --- ADDED LOG ---
        return;
    }

    state.lastUserPrompt = userPrompt;
    state.stopExecutionRequested = false; // Explicitly reset stop flag at start

    // Disable buttons
    elements.submitButton.disabled = true;
    elements.clearButton.disabled = true;
    elements.regenerateButton.disabled = true;
    elements.checkFixButton.disabled = true;
    elements.stopButton.style.display = 'inline-block'; // Show stop button
    elements.stopButton.disabled = false; // Ensure stop button is enabled
    elements.stopButton.textContent = "⏹️ Stop Execution";

    // Read current code from editors
    const htmlContent = editors.html ? editors.html.getValue() : '';
    const cssContent = editors.css ? editors.css.getValue() : '';
    const jsContent = editors.js ? editors.js.getValue() : '';

    // Determine if it's a new project (all editors empty)
    const isNewProject = !htmlContent && !cssContent && !jsContent;
    // --- ADDED LOG: Project type ---
    console.log(`>>> handleSubmit: isNewProject = ${isNewProject}`);


    let overallSuccess = false;
    let researchText = "";
    let discussionTranscript = ""; // Store discussion outcome

    try {
        // --- ADDED LOG: Before research ---
        console.log(">>> handleSubmit: Performing research phase...");
        setStatus("Checking for research needs...", false, true, 'researching'); // Use researching status
        // researchText = await performResearchIfNeeded(userPrompt, selectedModel); // Assuming this function exists and works
        if (state.isResearchModeEnabled) {
             // Placeholder for actual research function call
             console.log("Research mode enabled - calling placeholder research function");
             researchText = `Research findings related to: "${userPrompt}" would go here.`; // Example text
             await delay(1500); // Simulate research delay
             setStatus("Research complete.", false, false);
        } else {
            console.log("Research mode disabled.");
            researchText = ""; // Ensure it's empty if disabled
            setStatus("Research skipped.", false, false);
        }
        // --- ADDED LOG: After research ---
        console.log(`>>> handleSubmit: Research phase complete. Research text length: ${researchText.length}`);


        if (isNewProject) {
            // --- ADDED LOG: Entering new project branch ---
            console.log(">>> handleSubmit: Detected New Project. Entering discussion phase.");

            // --- Interactive Team Discussion Phase ---
            setStatus("Starting team discussion simulation...", false, true, 'team_discussing'); // Update status before call
            // --- ADDED LOG: Before teamDiscussionPhase call ---
            console.log(">>> handleSubmit: Calling teamDiscussionPhase...");
            discussionTranscript = await teamDiscussionPhase(state.lastUserPrompt, researchText, selectedModel);
            // --- ADDED LOG: After teamDiscussionPhase call ---
            console.log(`>>> handleSubmit: teamDiscussionPhase completed. Transcript length: ${discussionTranscript.length}`);


            // --- Select Initial Generation Model (Coder/Strong General) ---
            let generationModel = selectedModel;
            // ... logic to select best coder/general model ...
            const coderModels = Object.keys(state.modelCapabilities).filter(m => state.modelCapabilities[m].isCoder);
            if (coderModels.length > 0) {
                const preferredCoder = ['qwen-coder', 'deepseek-r1-llama'].find(m => coderModels.includes(m));
                generationModel = preferredCoder || coderModels.sort((a, b) => (state.modelCapabilities[b]?.qualityScore || 0) - (state.modelCapabilities[a]?.qualityScore || 0))[0];
            } else {
                 // Fallback to general strong models if no coder found
                 const generalModels = Object.keys(state.modelCapabilities).filter(m => !state.modelCapabilities[m].isCoder);
                 const preferredGeneral = ['openai-large', 'gemini-thinking', 'openai'].find(m => generalModels.includes(m));
                 generationModel = preferredGeneral || generalModels.sort((a, b) => (state.modelCapabilities[b]?.qualityScore || 0) - (state.modelCapabilities[a]?.qualityScore || 0))[0] || selectedModel; // Ensure fallback
            }
             // --- ADDED LOG: Generation model selection ---
            console.log(`>>> handleSubmit: Selected Initial Generation Model (Agent: Lead Implementer): ${generationModel}`);


            // --- MODIFIED Initial Generation System Prompt ---
            const initialGenSystemPrompt = `You are Tauris AI Coder's Lead Implementer Agent. Generate the initial, high-quality code for the user's requested project based on the team discussion, within the **Tauris AI Coder** framework.

**Application Context:** Tauris AI Coder (generates/enhances web apps iteratively).
**Current Project Goal:** "${state.lastUserPrompt}"
**Preceding Team Discussion Transcript:**
${discussionTranscript || "(No discussion recorded - rely on user request.)"}

**Primary Goal:** Implement the core functionality and structure discussed/agreed upon for the user's project. Ensure high initial quality (Semantic HTML, Responsive CSS, Best-Practice/Modular JS - SPA).

**CRITICAL REQUIREMENTS:**
- **Execute Based on Discussion & Goal:** Build according to the transcript's direction *and* the user's overall goal.
- **Functional & Robust:** Implement discussed features correctly.
- **High Initial Quality:** Adhere to modern best practices.
- **Self-Contained:** No external dependencies beyond standard browser APIs.
- **Output Format:** MUST output THREE SEPARATE code blocks.`;

            // --- MODIFIED Initial Generation User Instruction ---
            const initialGenUserInstruction = `
**Application:** Tauris AI Coder
**USER REQUEST (Project Goal):** "${state.lastUserPrompt}"
${researchText}
**PRECEDING TEAM DISCUSSION:**
${discussionTranscript || "(Proceed based on core request and best practices.)"}

**DEVELOPMENT TASK (Lead Implementer for Tauris AI Coder):**
- Create the **initial high-quality version** (SPA) based *strictly* on the **Preceding Team Discussion** and the **User Request**.
- Implement the main discussed features robustly for *this specific project*.
- Generate semantic HTML, responsive CSS, and best-practice, modular JavaScript ('use strict', error checks, comments) reflecting the discussion and project goal.
- Goal: A reliable, WORKING, visually appealing starting point for the user's requested application.

**REQUIRED OUTPUT (Implement Discussed Plan for Project Goal):**
- **HTML:** Semantic HTML5 reflecting the discussed structure.
- **CSS:** Responsive CSS matching the discussed style/layout.
- **JavaScript:** Best-practice, modular, robust JS implementing the discussed core functionality. Use 'use strict';.
- **Integration:** Ensure components work together.
- **Crucial Formatting:** Output ONLY the THREE code blocks below.

**OUTPUT FORMAT (STRICTLY REQUIRED):**
\\\`\\\`\\\`html
[Complete semantic HTML code based on discussion and project goal]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Complete responsive CSS code based on discussion and project goal]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
['use strict';\n\n// Complete BEST-PRACTICE, MODULAR, ROBUST JavaScript code based on discussion and project goal...]
\\\`\\\`\\\`
`;

            const apiOptions = {
                 temperature: 0.15,
                 top_p: 0.9,
                 maxTokens: 4096, // Allow larger initial generation
                 maxRetries: 2
            };
            // --- ADDED LOG: Before initial generation API call ---
            console.log(">>> handleSubmit: Calling API for initial generation...");
            setStatus(`Generating initial version based on team plan (Agent: Lead Implementer - using ${generationModel})...`, false, true, 'generating');
            const aiResponseContent = await callPollinationsAPI(
                generationModel,
                [
                    { role: "system", content: initialGenSystemPrompt },
                    { role: "user", content: initialGenUserInstruction }
                ],
                `Initial Generation`,
                apiOptions
            );
             // --- ADDED LOG: After initial generation API call ---
             console.log(">>> handleSubmit: Initial generation API call returned.");

            // --- ADDED LOG: Before code extraction ---
            console.log(">>> handleSubmit: Extracting code from initial generation response...");
            const codes = extractCode(aiResponseContent);
             // --- ADDED LOG: After code extraction ---
            console.log(`>>> handleSubmit: Code extraction result: html=${codes.html !== null}, css=${codes.css !== null}, js=${codes.js !== null}`);


            // ... detailed logging and error check ...
            if (codes.html === null || codes.css === null || codes.js === null) {
                // --- ADDED LOG: Code extraction failure ---
                console.error(">>> handleSubmit: CRITICAL - Failed to parse required code blocks.");
                // Log previews for debugging
                console.log("Values before check:", {
                     isHtmlNull: codes.html === null,
                     isCssNull: codes.css === null,
                     isJsNull: codes.js === null,
                     htmlPreview: typeof codes.html === 'string' ? codes.html.substring(0, 50) + "..." : codes.html,
                     cssPreview: typeof codes.css === 'string' ? codes.css.substring(0, 50) + "..." : codes.css,
                     jsPreview: typeof codes.js === 'string' ? codes.js.substring(0, 50) + "..." : codes.js
                 });
                throw new Error("Initial generation failed to parse required code blocks (HTML, CSS, or JS) after interactive discussion.");
            }
             // --- ADDED LOG: Code extraction success ---
            console.log(">>> handleSubmit: Code extraction successful.");

            // Update state, editors, and preview
            updateCodeStateAndEditors(codes);
            updatePreview();
            state.codeManuallyEdited = false; // Code generated by AI

            setStatus(`Initial version generated. Planning enhancement To-Do list (Agent: Team Lead)...`, false, false); // Status update after generation

            await delay(500);

            if (!state.stopExecutionRequested) {
                // --- ADDED LOG: Before enhancement planning ---
                console.log(">>> handleSubmit: Calling generateEnhancementPlanAndExecuteSteps...");
                console.log(">>> handleSubmit: Passing discussion transcript (length):", discussionTranscript?.length);
                // Pass discussion context and initial code context
                overallSuccess = await generateEnhancementPlanAndExecuteSteps(
                    { html: codes.html, css: codes.css, js: codes.js }, // Pass code
                    discussionTranscript // Pass discussion
                );
                // --- ADDED LOG: After enhancement planning ---
                console.log(`>>> handleSubmit: generateEnhancementPlanAndExecuteSteps finished. Success: ${overallSuccess}`);
            } else {
                // --- ADDED LOG: Stop requested after generation ---
                console.log(">>> handleSubmit: Stop requested after initial generation.");
                setStatus("Execution stopped by user after initial generation.", false, false);
            }

        } else {
            // --- Refinement Workflow ---
            console.log(">>> handleSubmit: Detected Refinement. Entering refinement logic.");
            setStatus(`Applying refinement (Agent: Refiner)...`, false, true, 'refining');

            // --- MODIFIED Refine System Prompt ---
            const refineSystemPrompt = `You are Tauris AI Coder's Refiner Agent. Update the provided codebase for a specific project within the **Tauris AI Coder** application based *strictly* on the user's refinement request. Integrate changes carefully, maintain overall structure/functionality, and ensure high code quality. Output the complete, updated code for all three files.

**Application Context:** Tauris AI Coder.
**Overall Project Goal (Initial Request):** "${state.lastUserPrompt || 'N/A'}"`;


            // --- MODIFIED Refine User Instruction ---
            const refineUserInstruction = `
**APPLICATION:** Tauris AI Coder
**OVERALL PROJECT GOAL:** "${state.lastUserPrompt || 'N/A'}"
**CURRENT CODE STATE:**
\\\`\\\`\\\`html
${htmlContent}
\\\`\\\`\\\`
\\\`\\\`\\\`css
${cssContent}
\\\`\\\`\\\`
\\\`\\\`\\\`javascript
${jsContent}
\\\`\\\`\\\`

**USER REFINEMENT REQUEST:** "${userPrompt}"

**TASK (Refiner Agent for Tauris AI Coder):**
1.  Analyze the current code and the user's specific refinement request for *this project*.
2.  Implement the requested changes **precisely**.
3.  Integrate changes smoothly, ensuring they don't break existing functionality related to the overall project goal.
4.  Maintain/improve code quality.
5.  Output the **ENTIRE, UPDATED, FULLY FUNCTIONAL** code for **ALL THREE files**.

**Strict Formatting:** ONLY raw code within fenced blocks (\`\`\`html, \`\`\`css, \`\`\`javascript). NO explanations. THREE separate blocks.

\\\`\\\`\\\`html
[Your FULL cumulative HTML code after applying the refinement for this project]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Your FULL cumulative CSS code after applying the refinement for this project]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[Your FULL cumulative JavaScript code after applying the refinement for this project]
\\\`\\\`\\\`
`;
            const apiOptions = {
                temperature: 0.2,
                top_p: 0.9,
                maxTokens: 4096,
                maxRetries: 2
            };

            // --- ADDED LOG: Before refinement API call ---
            console.log(">>> handleSubmit: Calling API for refinement...");
            const aiResponseContent = await callPollinationsAPI(
                selectedModel, // Use the model selected by the user for refinement
                [
                    { role: "system", content: refineSystemPrompt },
                    { role: "user", content: refineUserInstruction }
                ],
                `Refinement`,
                apiOptions
            );
            // --- ADDED LOG: After refinement API call ---
            console.log(">>> handleSubmit: Refinement API call returned.");

            // --- ADDED LOG: Before refinement code extraction ---
            console.log(">>> handleSubmit: Extracting code from refinement response...");
            const codes = extractCode(aiResponseContent);
            // --- ADDED LOG: After refinement code extraction ---
            console.log(`>>> handleSubmit: Refinement extraction result: html=${codes.html !== null}, css=${codes.css !== null}, js=${codes.js !== null}`);


            if (codes.html === null && codes.css === null && codes.js === null) {
                 // --- ADDED LOG: Refinement code extraction failure ---
                 console.error(">>> handleSubmit: CRITICAL - Refinement failed to parse required code blocks.");
                throw new Error("Refinement failed to parse required code blocks (HTML, CSS, or JS).");
            }

            updateCodeStateAndEditors(codes);
            updatePreview();
            state.codeManuallyEdited = false; // Code refined by AI
            setStatus("Refinement applied successfully!", false, false);
            overallSuccess = true;
             // --- ADDED LOG: Refinement success ---
            console.log(">>> handleSubmit: Refinement applied successfully.");
        }

    } catch (error) {
        console.error(">>> handleSubmit: Error caught in main try block:", error);
        // Check if the error is specifically our stop request signal
        if (error.message === "Execution stopped by user request.") {
            console.log(">>> handleSubmit: Operation successfully stopped by user.");
            setStatus("Execution stopped by user.", false, false);
            // No need to show regenerate button for a user stop
            state.retryPayload.isAvailable = false;
        } else {
            // Handle actual errors
            setStatus(`Operation failed: ${error.message}`, true, false);
            if (state.retryPayload.isAvailable) {
                elements.regenerateButton.style.display = 'block';
                elements.regenerateButton.disabled = false;
            }
        }
    } finally {
        console.log(">>> handleSubmit: Entering finally block.");
        // Hide stop button ALWAYS in finally block
        elements.stopButton.style.display = 'none';

        // Reset button text to default if appropriate
        const defaultButtonText = elements.promptInput.value ? "🚀 Generate / Refine" : "🚀 Select Model First"; // Adjust default based on state
         if (!state.retryPayload.isAvailable && !elements.statusContainer.classList.contains('error')) {
             // Reset submit button text if no error and no retry needed
             elements.submitButton.textContent = defaultButtonText;
         } else if (state.retryPayload.isAvailable) {
              // Keep special text if retry is needed
              elements.submitButton.textContent = "⚠️ Error Occurred";
         } else {
              // Keep error text if error occurred but no retry
              elements.submitButton.textContent = "⚠️ Operation Failed";
         }

        // Re-enable buttons based on final state (stopped or finished/failed)
        // If stopped, handleStopExecution should have already re-enabled them.
        // If finished/failed without retry, re-enable here.
        // If finished/failed WITH retry, keep submit/clear disabled.
        if (!state.retryPayload.isAvailable) {
            elements.submitButton.disabled = false;
            elements.clearButton.disabled = false;
            elements.checkFixButton.disabled = false;
        } else {
             // Ensure retry button is visible and enabled
             elements.regenerateButton.style.display = 'block';
             elements.regenerateButton.disabled = false;
             // Keep submit/clear disabled
             elements.submitButton.disabled = true;
             elements.clearButton.disabled = true;
             elements.checkFixButton.disabled = false; // Check/fix might still work
        }

        // Ensure stop flag is reset AFTER potentially checking it for button states
        state.stopExecutionRequested = false;
        console.log(">>> handleSubmit: Exiting finally block.");
    }
    console.log(">>> handleSubmit: Function Exited.");
}

/**
 * Handles the "Check & Fix Code" button click.
 * Can also be called internally for a final quality pass.
 * @param {boolean} isFinalPass - Indicates if called automatically after enhancements.
 */
async function handleCheckAndFixCode(isFinalPass = false) {
    console.log(`Check & Fix Code requested. ${isFinalPass ? '(Final Pass)' : '(Manual)'}`);

    const selectedModel = elements.modelSelect.value;
    // Use a strong reasoning/coding model for fixing if possible
    let fixModel = selectedModel;
    const highQualityModels = ['qwen-coder', 'deepseek-r1-llama', 'openai-large', 'gemini-thinking', 'openai-reasoning'];
    const availableHighQuality = highQualityModels.filter(m => !!Array.from(elements.modelSelect.options).find(o => o.value === m));
    if (availableHighQuality.length > 0) {
        fixModel = availableHighQuality[0]; // Pick the best available
    }
     console.log(`Using model for Check & Fix: ${fixModel}`);


    if (!fixModel && !isFinalPass) { // Only block manual click if no model selected
        setStatus("Please select a model first.", true, false);
        return;
    } else if (!fixModel && isFinalPass) {
         console.warn("Skipping final pass: No suitable model selected/available.");
         setStatus("Final pass skipped (no suitable model).", false, false);
         return;
    }


    // Disable buttons during operation (unless it's final pass, keep main submit enabled potentially)
    if (!isFinalPass) {
        elements.submitButton.disabled = true;
        elements.clearButton.disabled = true;
        elements.regenerateButton.disabled = true; // Disable regenerate during fix
    }
    elements.checkFixButton.disabled = true;
    elements.checkFixButton.textContent = '🩺 Checking...';
    // Keep stop button hidden/disabled during this check? Or allow stopping the check?
    // For simplicity, let's hide it for now during check/fix.
    elements.stopButton.style.display = 'none';
    state.stopExecutionRequested = false; // Ensure stop flag is clear

    setStatus(`Checking code quality and fixing issues (Agent: QA Specialist)...`, false, true, 'fixing');

    try {
        // Get current code from editors
        const htmlContent = editors.html ? editors.html.getValue() : '';
        const cssContent = editors.css ? editors.css.getValue() : '';
        const jsContent = editors.js ? editors.js.getValue() : '';

        if (!htmlContent && !cssContent && !jsContent) {
            setStatus("Nothing to check. Code editors are empty.", false, false);
            throw new Error("Empty code - cannot check/fix."); // Throw error to exit cleanly
        }

        // --- REFINED Fix System Prompt ---
        const fixSystemPrompt = `You are Tauris AI Coder's meticulous QA Specialist Agent. Your task is to thoroughly analyze the provided code (HTML, CSS, JS) for a user project within the **Tauris AI Coder** application. Identify and **correct** errors, bugs, inconsistencies, potential runtime issues, poor practices, accessibility flaws, and areas for improvement (clarity, efficiency, robustness, responsiveness). Maintain the core functionality while adhering strictly to modern web standards and best practices.

**Application Context:** Tauris AI Coder (generates/enhances web apps).
**Current Project Goal (User Request):** "${state.lastUserPrompt || 'Unknown - focus on general quality'}"

**Focus Areas:** Correctness, Robustness, Efficiency, Readability, Security (basic checks), Responsiveness, Accessibility.`;

        // --- REFINED Fix User Instruction ---
        const fixUserInstruction = `
**APPLICATION:** Tauris AI Coder
**PROJECT GOAL:** "${state.lastUserPrompt || 'Analyze for general quality and correctness'}"

**CURRENT CODE (Analyze ALL THREE blocks meticulously):**
\\\`\\\`\\\`html
${htmlContent || '(No HTML)'}
\\\`\\\`\\\`
\\\`\\\`\\\`css
${cssContent || '(No CSS)'}
\\\`\\\`\\\`
\\\`\\\`\\\`javascript
${jsContent || '(No JS)'}
\\\`\\\`\\\`

**TASK (QA Specialist for Tauris AI Coder):**
1.  **Analyze Deeply:** Review the code for correctness, errors (syntax, logic), browser compatibility issues, performance bottlenecks, security vulnerabilities (like improper event handling), accessibility gaps, and adherence to best practices.
2.  **Fix & Enhance:** Apply necessary corrections directly within the code. Improve variable names, add comments where needed, optimize loops, ensure proper error handling (e.g., try/catch in JS), check for responsiveness in CSS.
3.  **Output COMPLETE Fixed Code:** Provide the ***entire***, verified, and potentially improved code for **ALL THREE files**, ensuring it remains functionally equivalent or improved regarding the project goal.

**Strict Formatting:** ONLY raw code within fenced blocks (\`\`\`html, \`\`\`css, \`\`\`javascript). NO explanations or summaries outside code blocks. THREE separate blocks required.

\\\`\\\`\\\`html
[Your FULL reviewed and FIXED/ENHANCED HTML code for this project]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Your FULL reviewed and FIXED/ENHANCED CSS code for this project]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[Your FULL reviewed and FIXED/ENHANCED JavaScript code ('use strict'; included) for this project]
\\\`\\\`\\\`
`;
        const fixApiOptions = {
            temperature: 0.1, // Very low temp for precise fixes
            top_p: 0.8,
            maxTokens: 4096, // Allow ample space for fixed code
            maxRetries: 1 // Less retries for fix operation?
        };

        const fixedResponse = await callPollinationsAPI(
            fixModel,
            [{ role: "system", content: fixSystemPrompt }, { role: "user", content: fixUserInstruction }],
            `Code Check & Fix ${isFinalPass ? '(Final Pass)' : ''}`,
            fixApiOptions
        );

        const fixedCodes = extractCode(fixedResponse);

        if (fixedCodes.html === null && fixedCodes.css === null && fixedCodes.js === null) {
            // AI might have responded with "No issues found" or failed format
            console.warn("Check & Fix: No code blocks found in response. Assuming no changes needed or AI format error.");
             setStatus(`Code review complete. No major issues automatically detected or response format error.`, false, false);
             // Don't throw error, just report potential lack of changes
        } else {
             console.log("Check & Fix: Applying potential fixes/improvements.");
             updateCodeStateAndEditors({ // Update with potentially fixed code
                 html: fixedCodes.html ?? htmlContent, // Fallback to original if block missing
                 css: fixedCodes.css ?? cssContent,
                 js: fixedCodes.js ?? jsContent,
             });
             updatePreview();
             state.codeManuallyEdited = false; // Code modified by AI QA
             setStatus(`Code check & fix complete. ${isFinalPass ? 'Final quality pass done.' : 'Applied suggestions.'}`, false, false);
        }

    } catch (error) {
        console.error("Error during Check & Fix Code:", error);
        // Avoid setting retry payload for check/fix? Or allow retrying the fix?
        // For now, just report error.
        setStatus(`Error during code check: ${error.message}`, true, false);
        // If it was a final pass, allow main flow to finish but indicate check failure
        if (isFinalPass) {
            setStatus(`Enhancement complete, but final check failed: ${error.message}`, true, false);
        }
    } finally {
        // Re-enable buttons appropriately
        elements.checkFixButton.disabled = false;
        elements.checkFixButton.textContent = '🩺 Check & Fix Code';
        if (!isFinalPass && !state.retryPayload.isAvailable) { // Don't re-enable submit/clear if retry is pending from main flow
            elements.submitButton.disabled = false;
            elements.clearButton.disabled = false;
             // Only re-enable regenerate if it was visible *before* the check/fix started
             // (This state isn't explicitly tracked, might need adjustment if regen during fix is complex)
             // elements.regenerateButton.disabled = ???;
        } else if (!isFinalPass && state.retryPayload.isAvailable) {
            // Keep submit/clear disabled if retry *was already* pending
            elements.submitButton.disabled = true;
            elements.clearButton.disabled = true;
            elements.regenerateButton.disabled = false; // Ensure regenerate stays enabled
        }
        // If it *was* the final pass, the calling function (`generateEnhancementPlan...`) should handle final button states.
    }
}
