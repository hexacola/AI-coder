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
    setStatus("Stop requested. Finishing current operation...", false, false);
    state.stopExecutionRequested = true;
    elements.stopButton.disabled = true; // Disable stop button after clicking
    elements.stopButton.textContent = "Stopping...";
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
        if (state.stopExecutionRequested) {
            console.log(`Execution stopped by user before starting step ${i + 1}.`);
            setStatus(`Execution stopped by user after step ${lastCompletedStep + 1}.`, false, false);
            allStepsSuccess = false;
            break;
        }

        if (executingPromises.size < MAX_PARALLEL_STEPS) {
            const currentStepText = state.currentPlanSteps[i];
            const lowerStepText = currentStepText.toLowerCase();

            // *** Determine Step Purpose/Agent ***
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
            } else if (/test|validate|verify|check|ensure/i.test(lowerStepText)) {
                stepPurpose = 'quality_assurance';
                agentName = "Tester";
            } else if (/critique|review|analyze/i.test(lowerStepText)) {
                // Add a new purpose for critique if needed, or map to existing
                stepPurpose = 'thinking'; // Or a new 'critiquing' purpose
                agentName = "Code Reviewer";
            }

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
                    // *** Use determined purpose and agent name for status ***
                    const statusMessage = `Working on Step ${i + 1}/${state.currentPlanSteps.length} (Agent: ${agentName})...`;
                    setStatus(statusMessage, false, true, stepPurpose, { stepNum: i + 1 });
                    updatePlanDisplay(state.currentPlanSteps, i, lastCompletedStep);
                    await delay(400);

                    if (state.stopExecutionRequested) {
                        console.log(`Execution stopped by user before executing step ${i + 1}.`);
                        setStatus(`Execution stopped by user after step ${lastCompletedStep + 1}.`, false, false);
                        allStepsSuccess = false;
                        break;
                    }

                    await executeEnhancementStep(i);

                    lastCompletedStep = i;
                    completedSteps.add(i);

                    updatePlanDisplay(state.currentPlanSteps, -1, lastCompletedStep);
                    setStatus(`Step ${i + 1}/${state.currentPlanSteps.length} processed (Agent: ${agentName}).`, false, false);
                    await delay(300);

                    i++;
                } catch (error) {
                    console.error(`Error during enhancement step ${i+1}:`, error);
                    setStatus(`Error in step ${i + 1} (Agent: ${agentName}): ${error.message}`, true, false);
                    updatePlanDisplay(state.currentPlanSteps, -1, lastCompletedStep, i);
                    allStepsSuccess = false;
                    break;
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
    // *** Check stop request at the very beginning of the step function ***
    if (state.stopExecutionRequested) {
        console.log(`Skipping execution of step ${stepIndex + 1} due to stop request.`);
        throw new Error("Execution stopped by user request.");
    }

    const currentStepText = state.currentPlanSteps[stepIndex];
    // Get current code from CodeMirror editors
    const htmlContent = editors.html ? editors.html.getValue() : '';
    const cssContent = editors.css ? editors.css.getValue() : '';
    const jsContent = editors.js ? editors.js.getValue() : '';

    // Check context size before API call
    const currentContextSize = (htmlContent?.length || 0) +
                              (cssContent?.length || 0) +
                              (jsContent?.length || 0);

    if (currentContextSize > LARGE_CONTEXT_THRESHOLD) {
        console.warn(`Context size (${currentContextSize} chars) for Step ${stepIndex + 1} is large. Potential risk of exceeding API limits or degraded performance.`);
        // Future enhancement: Could potentially implement context truncation/summarization strategies here.
        // For now, rely on model's ability to handle larger contexts and the refined prompt.
    }

    // --- REFINED Step System Prompt (Emphasizing Integration & Substance) ---
    const stepSystemPrompt = `You are Tauris AI Coder, an expert AI developer executing a step in a pre-defined enhancement plan for building a potentially complex web application. Your primary goal is to implement the assigned step **correctly, robustly, and make substantial progress**, ensuring it integrates perfectly with the *entire* existing codebase. Maintain a professional standard.
Your internal workflow for EACH step MUST be:
1.  **Analyze FULL Context & Task:** Deeply understand the original goal, the full plan, the SPECIFIC task for *this* step, and the ***ENTIRE*** current codebase (HTML, CSS, JS). Identify how this step fits into the overall application structure.
2.  **Plan Substantial Modifications:** Determine the *exact* code changes required. Plan for **significant, meaningful progress** on the task, not just minor tweaks. Consider how changes impact other parts of the application.
3.  **Generate High-Quality Integrated Code:** Write necessary new/modified code. Prioritize functionality, modularity, clarity, efficiency, and robustness. **Ensure the new code seamlessly integrates with existing logic and structure.** Adhere to modern best practices.
4.  **Integrate & Verify Functionality/Integration:** Carefully merge code. Ensure seamless integration **and verify both the step's core functionality AND that it doesn't break existing parts.**
5.  **Output Complete Cumulative Result:** Provide the ***entire***, updated, fully functional code for **ALL THREE files**.

**Core Principles:** Functionality, Integration, Substantial Progress, Professionalism, Quality, Robustness, Modularity, Efficiency, Full Context-Awareness, Cumulative Output.`;

    // --- REFINED Step User Instruction (Emphasizing Integration & Substance) ---
    const stepUserInstruction = `
CONTEXT:
- Original User Request: "${state.lastUserPrompt}" (Goal: Potentially complex application)
- Full Enhancement Plan:\n${state.currentPlan}
- Current Code State (**Analyze ALL of it for integration needs**):
\\\`\\\`\\\`html
${htmlContent || '(No HTML yet)'}
\\\`\\\`\\\`
\\\`\\\`\\\`css
${cssContent || '(No CSS yet)'}
\\\`\\\`\\\`
\\\`\\\`\\\`javascript
${jsContent || '(No JS yet)'}
\\\`\\\`\\\`

**CURRENT TASK (Step ${stepIndex + 1}/${state.currentPlanSteps.length}): ${currentStepText}**

**INSTRUCTIONS (CRITICAL - Follow Strictly):**
1.  **Execute Internal Workflow:** Adhere to the 5-stage process, paying close attention to analyzing the FULL context.
2.  **Focus on Substantial Progress & Integration:** Implement the CURRENT TASK **thoroughly and correctly**. Ensure it represents significant progress and integrates seamlessly with the existing HTML structure, CSS rules, and JavaScript logic/functions. Update related code sections if necessary for proper integration.
3.  **Code Quality:** Produce clean, modular, robust code.
4.  **Preserve Functionality:** Do not break unrelated features.
5.  **Output COMPLETE CUMULATIVE Code:** Provide the ***ENTIRE, UPDATED, FULLY FUNCTIONAL, and WELL-INTEGRATED*** code for **ALL THREE files**.
6.  **Strict Formatting:** ONLY raw code within fenced blocks (\`\`\`html, \`\`\`css, \`\`\`javascript). NO explanations. THREE separate blocks.

\\\`\\\`\\\`html
[Your FULL cumulative HTML code after completing Step ${stepIndex + 1}]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Your FULL cumulative RESPONSIVE CSS code after completing Step ${stepIndex + 1}]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[Your FULL cumulative MODULAR, ROBUST, and INTEGRATED JavaScript code after completing Step ${stepIndex + 1}]
\\\`\\\`\\\`
`;

    state.retryPayload.operationType = 'enhancement_step';
    state.retryPayload.failedStepIndex = stepIndex;

    const selectedModel = elements.modelSelect.value;

    // Define API options, including top_p
    const apiOptions = {
        temperature: 0.2, // Keep temperature low for consistency
        top_p: 0.9,       // Add top_p for focused output
        maxRetries: 3
    };

    const aiResponseContent = await callPollinationsAPI(
        selectedModel,
        [
            { role: "system", content: stepSystemPrompt },
            { role: "user", content: stepUserInstruction }
        ],
        `Enhancement Step ${stepIndex + 1}`,
        apiOptions // Pass the options object
    );

    state.retryPayload.isAvailable = false; // Reset retry only on successful API call return

    const codes = extractCode(aiResponseContent);

    // Check if *any* code was returned before assuming no changes needed
    if (codes.html === null && codes.css === null && codes.js === null) {
        // It's possible the AI failed to follow instructions or returned empty blocks
        console.error(`No valid code blocks extracted for enhancement step ${stepIndex + 1}. AI Response might be malformed or empty.`);
        // Treat as failure for this step to allow regeneration
        throw new Error(`AI failed to provide valid code blocks for step ${stepIndex + 1}.`);
    } else {
        // Only update if we successfully parsed at least one block
        // Sanitation logic (ensure it's robust)
        if (codes.html) {
             codes.html = codes.html
                 .replace(/href\s*=\s*["']http:\/\/127\.0\.0\.1:[0-9]+\/styles\.css["']/gi, 'href="#styles-included-inline"')
                 .replace(/src\s*=\s*["']http:\/\/127\.0\.0\.1:[0-9]+\/script\.js["']/gi, 'src="#script-included-inline"')
                 .replace(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi, '<!-- External stylesheet links removed by Tauris AI Coder -->') // Remove all link rel=stylesheet
                 .replace(/<script[^>]*src\s*=\s*["'][^"']*\/script\.js["'][^>]*><\/script>/gi, '<!-- JS is included inline at the end of body -->') // Generic script.js removal
                 .replace(/<base[^>]*>/gi, '<!-- Base tag removed by Tauris AI Coder -->'); // Remove base tags
        }
        updateCodeStateAndEditors(codes);
    }

    updatePreview();
}

/**
 * Generates enhancement plan and executes the steps
 */
async function generateEnhancementPlanAndExecuteSteps() {
    const userSelectedModel = elements.modelSelect.value;
    let planningModel = userSelectedModel;
    const reasoningModels = Object.keys(state.modelCapabilities).filter(m => state.modelCapabilities[m].hasReasoning);
    if (reasoningModels.length > 0) {
        const preferredReasoning = ['qwen-reasoning', 'deepseek-r1', 'openai-reasoning', 'gemini-thinking'].find(m => reasoningModels.includes(m));
        if (preferredReasoning) {
            planningModel = preferredReasoning;
        } else {
            planningModel = reasoningModels[0];
        }
        console.log(`Using specialized model for planning: ${planningModel}`);
    } else {
        console.log(`Using user-selected model for planning: ${planningModel}`);
    }

    let enhancementPlanError = null;
    
    try {
        setStatus(`Planning enhancements for complex app (Agent: Architect - using ${planningModel})...`, false, true, 'planning');
        elements.planAreaDiv.style.display = 'block';
        elements.planDisplayDiv.textContent = 'Generating enhancement plan...';
        
        // Get initial code from editors for planning context
        const initialHtml = editors.html ? editors.html.getValue() : '';
        const initialCss = editors.css ? editors.css.getValue() : '';
        const initialJs = editors.js ? editors.js.getValue() : '';

        // --- REFINED Planning System Prompt (Targeting Complexity & Development) ---
        const planningSystemPrompt = `You are Tauris AI Coder's Enhancement Planner (Architect Agent), a senior software architect. Your task is to analyze the initial codebase and user request to create a **strategic, high-impact enhancement plan** aimed at building a **potentially complex and feature-rich application.**

GUIDELINES:
- **Focus on Significant Development:** Generate a plan with **6-12 high-value steps** that make **substantial progress** towards a complex application. Prioritize steps that:
    - Implement major features or core functionality.
    - Establish key architectural patterns (e.g., state management, routing for SPA).
    - Significantly improve complex UX flows.
    - Perform necessary large-scale refactoring for future complexity.
    - Enhance robustness/security for a more complex system.
- **Substantial Steps:** Each step should represent a major leap in functionality or structure. Avoid breaking down features into too many tiny steps.
- **Analyze for Complexity:** Base your plan on the initial code and user goal, anticipating the needs of a more complex application.
- **Diverse Roles:** Cover key development facets needed for a complex app (Architecture, Core Features, Complex UX, Quality, Testing).
- **Clarity & Action:** Describe the *what* and *why* concisely. Use strong action verbs.
- **Logical Flow:** Order steps sensibly, building complexity logically.

Output ONLY a numbered list (TARGETING 6-12 STEPS) in the format: "1. [Action verb] [specific, impactful development description for a complex app]" with NO additional text.`;

        // --- REFINED Planning User Message (Targeting Complexity & Development) ---
        const planningUserMessage = `
Original User Request: "${state.lastUserPrompt}"

**Initial Generated Code (Analyze for potential complexity and structure):**
\\\`\\\`\\\`html
${initialHtml || '(empty)'}
\\\`\\\`\\\`
\\\`\\\`\\\`css
${initialCss || '(empty)'}
\\\`\\\`\\\`
\\\`\\\`\\\`javascript
${initialJs || '(empty)'}
\\\`\\\`\\\`

**ENHANCEMENT PLANNING INSTRUCTIONS (Architect Agent):**
Based *specifically* on the Initial Generated Code and the User Request (aiming for complexity):
1.  Identify the most **impactful areas for substantial development** towards a feature-rich, potentially complex application.
2.  Define **6-12 high-level, significant enhancement steps**. Each step should represent a major leap in functionality or structure.
3.  Prioritize **implementing core/complex features, establishing architecture, major UX improvements, and necessary refactoring.** Think bigger steps.
4.  Cover diverse development aspects needed for a complex app.
5.  Describe each step's objective clearly.
6.  Ensure steps build logically towards the complex goal.

**Output ONLY the numbered list of 6-12 enhancement steps.** No justifications or summaries.
`;

        state.retryPayload.operationType = 'enhancement_planning';
        state.retryPayload.failedStepIndex = -1;
        
        // Define Planning API options
        const planningApiOptions = {
            temperature: 0.4, // Slightly higher temp for planning creativity
            top_p: 0.95,      // Keep top_p relatively high for planning
            maxRetries: 2
        };
        // Add reasoning_effort if applicable
        if (planningModel === 'openai-reasoning') {
            planningApiOptions.reasoning_effort = 'high';
            console.log("Using high reasoning_effort for planning with o3-mini.");
        }

        const generatedPlan = await callPollinationsAPI(
            planningModel,
            [
                { role: "system", content: planningSystemPrompt },
                { role: "user", content: planningUserMessage }
            ],
            "Enhancement Planning (Architect)",
            planningApiOptions // Pass planning-specific options
        );
        
        state.retryPayload.isAvailable = false;
        state.currentPlan = generatedPlan;
        state.currentPlanSteps = parsePlan(state.currentPlan);
        
        // Reduce generated plan if AI ignores the prompt (optional, but can help)
        const MAX_PLAN_STEPS = 15; // Slightly increased upper limit
        state.currentPlanSteps = parsePlan(state.currentPlan);
        if (state.currentPlanSteps.length > MAX_PLAN_STEPS) {
            console.warn(`AI generated ${state.currentPlanSteps.length} steps, exceeding target. Truncating to ${MAX_PLAN_STEPS}.`);
            state.currentPlanSteps = state.currentPlanSteps.slice(0, MAX_PLAN_STEPS);
            // Optionally regenerate plan text from truncated steps if needed elsewhere
            state.currentPlan = state.currentPlanSteps.join('\n');
        }

        if (state.currentPlanSteps.length === 0) {
            console.warn("No enhancement steps parsed:", state.currentPlan);
            setStatus("Initial version generated. No further enhancement steps planned.", false, false);
            updatePlanDisplay([]);
             // Enable buttons as process finished successfully, even without plan
             elements.submitButton.disabled = false;
             elements.clearButton.disabled = false;
            return true; // Return success as initial generation worked
        }
        
        updatePlanDisplay(state.currentPlanSteps, 0);
        setStatus(`Plan ready (${state.currentPlanSteps.length} impactful steps). Executing...`, false, false);
        
        await delay(500);
        const stepsSuccess = await executeEnhancementStepsSequentially(0);
        
        if (stepsSuccess && !state.stopExecutionRequested) {
            const planHasReviewStep = state.currentPlanSteps.some(step =>
                /review|validate|test|fix|correct|polish/i.test(step.toLowerCase())
            );

            // Run quality pass if steps were successful and no explicit review step exists (and > 1 step)
            if (!planHasReviewStep && state.currentPlanSteps.length > 1) {
                 setStatus('Running final checks (Agent: QA Specialist)...', false, true, 'quality_assurance');
                 await finalQualityPass();
                 // finalQualityPass sets its own final status, or we set it after
                 if (!state.retryPayload.isAvailable) { // Check if quality pass failed
                    setStatus(`Enhancements complete & QA checked! Project is ready.`, false, false);
                 }
            } else {
                 // If review step existed or quality pass was skipped
                 setStatus(`All enhancement steps completed! Project is ready.`, false, false);
            }
        } else if (!stepsSuccess && !state.stopExecutionRequested) {
            setStatus(`Enhancement process finished with errors. Check logs or try regenerating.`, true, false);
        } else if (state.stopExecutionRequested) {
             // Status already set by the loop break condition
        }

        return stepsSuccess;
        
    } catch(err) {
        enhancementPlanError = err; // Store error for potential display
         // Log and set status in the catch block
        console.error(`Enhancement Planning Error (Architect Agent):`, err);
        setStatus(`Planning failed (Architect Agent): ${err.message}`, true, false);
        // Ensure plan area reflects failure
        updatePlanDisplay([]);
        elements.planDisplayDiv.textContent = `Planning failed: ${err.message}`;
        elements.planAreaDiv.style.display = 'block';

        // Make retry available for the planning step
        state.retryPayload.isAvailable = true;
        state.retryPayload.operationType = 'enhancement_planning'; // Ensure this is set for retry context
        elements.regenerateButton.style.display = 'block';
        elements.regenerateButton.disabled = false;

        // Keep other buttons disabled as the process failed at planning
        elements.submitButton.disabled = true;
        elements.clearButton.disabled = true;

        // Don't re-throw here, let the main handleSubmit finally block handle UI state
        return false; // Indicate failure
    }
}

/**
 * Performs a final quality pass over the code after all enhancement steps
 */
async function finalQualityPass() {
    // *** Check stop request before starting quality pass ***
    if (state.stopExecutionRequested) {
        console.log("Skipping final quality pass due to stop request.");
        return; // Exit gracefully
    }

    // Get current code from CodeMirror editors
    const htmlContent = editors.html ? editors.html.getValue() : '';
    const cssContent = editors.css ? editors.css.getValue() : '';
    const jsContent = editors.js ? editors.js.getValue() : '';

    try {
        // --- REFINED V2: Quality System Prompt (Including Latest Standards) ---
        const qualitySystemPrompt = `You are Tauris AI Coder's Quality Assurance & Polishing Specialist. Perform a final, meticulous review and refinement pass on the entire codebase, ensuring it meets **current (2025) best practices and standards.**

Your **primary goal** is to ensure the application is **fully functional, robust, modern, and well-integrated**. Your secondary goal is to add polish.
1.  **Integration & Correctness:** **CRITICAL:** Fix *any* remaining functional bugs, integration issues (JS interacting with HTML/CSS correctly), broken references, runtime errors. **Verify all core logic.**
2.  **Structural Integrity & Integration:** Review the overall structure (especially JS). Look for opportunities to improve module interaction or slightly refactor for better clarity and integration *without changing core logic*. Ensure components work together seamlessly.
3.  **Robustness & Error Handling:** Ensure comprehensive checks are present.
4.  **Best Practices & Modernization (2025 Standards):** Ensure modern standards (**reflecting 2025 best practices** in HTML5, CSS3+, ES6+ JS), remove dead code, apply minor optimizations. Use 'use strict';. Ensure code is clean and maintainable according to current conventions.
5.  **Modularity & Readability (JS Focus):** Ensure JS is well-encapsulated and readable.
6.  **Responsiveness & Accessibility:** Validate layout and fix basic accessibility issues according to modern standards.
7.  **Self-Contained:** Confirm NO external references.
8.  **Creative Polish (Secondary):** After ensuring full functionality and integration, add subtle visual polish if appropriate.

Focus FIRST on correctness, stability, reliability, and integration, THEN on structure, maintainability, modern standards (2025), and polish.`;

        // --- REFINED V2: Quality User Prompt (Including Latest Standards) ---
        const qualityUserPrompt = `
Original User Request: "${state.lastUserPrompt}"
${state.currentPlan ? `\nDevelopment Plan:\n${state.currentPlan}` : ''}

Final Code After All Enhancement Steps:
\\\`\\\`\\\`html
${htmlContent || '(empty)'}
\\\`\\\`\\\`
\\\`\\\`\\\`css
${cssContent || '(empty)'}
\\\`\\\`\\\`
\\\`\\\`\\\`javascript
${jsContent || '(empty)'}
\\\`\\\`\\\`

QUALITY ASSURANCE & POLISHING INSTRUCTIONS (Apply 2025 Standards):
- Perform a holistic review. **PRIORITY 1: Fix ALL functional bugs, integration errors, JS runtime/logic errors, CSS conflicts.** Ensure the app works correctly.
- **PRIORITY 2: Check Code Structure & Integration.** Ensure JS modules/functions interact correctly. Look for minor structural improvements for clarity/integration. Ensure JS correctly targets HTML elements.
- **PRIORITY 3:** Ensure JavaScript is robust ('use strict', error checks). Optimize, enhance accessibility, responsiveness, consistency. Remove dead code. **Crucially, ensure all code adheres to modern (2025) best practices and standards.**
- **PRIORITY 4:** Add subtle visual polish (transitions, spacing) **only after confirming full functionality and integration.** Do not add new features.
- Remove ALL external resource links.
- Output the final, polished, robust, integrated, **and modern (2025 standards)** code.

Provide the final, production-ready, polished code ONLY in the specified format.

\\\`\\\`\\\`html
[FINAL POLISHED HTML CODE - 2025 Standards]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[FINAL POLISHED CSS CODE - 2025 Standards]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[FINAL POLISHED, MODULAR, ROBUST, WELL-INTEGRATED JAVASCRIPT CODE - 2025 Standards]
\\\`\\\`\\\`
`;
        setStatus('Running final QA, Integration & Modernization checks (Agent: QA Specialist)...', false, true, 'quality_assurance'); // Updated status

        state.retryPayload.operationType = 'final_quality_pass';

        const selectedModel = elements.modelSelect.value;

        // Define QA API options
        const qaApiOptions = {
            temperature: 0.1, // Very low temp for QA fixes
            top_p: 0.9,       // Focused output
            maxRetries: 2
        };
        // Add reasoning_effort if QA happens to use o3-mini (less likely, but possible)
        if (selectedModel === 'openai-reasoning') {
             qaApiOptions.reasoning_effort = 'medium';
        }

        const aiResponseContent = await callPollinationsAPI(
            selectedModel,
            [
                { role: "system", content: qualitySystemPrompt },
                { role: "user", content: qualityUserPrompt }
            ],
            "Final Quality & Modernization Pass (QA Specialist)", // Updated purpose
            qaApiOptions // Pass QA-specific options
        );

        state.retryPayload.isAvailable = false;

        const codes = extractCode(aiResponseContent);
        
        if (codes.html === null && codes.css === null && codes.js === null) {
            console.warn("Quality pass didn't produce code changes, keeping current version");
            setStatus(`Quality pass complete. No changes made.`, false, false);
            return;
        }
        
        // Sanitize HTML to prevent external resource references
        if (codes.html) {
            codes.html = codes.html
                .replace(/href\s*=\s*["'](?:https?:)?\/\/[^"']*\/styles\.css["']/gi, 'href="#styles-included-inline"')
                .replace(/src\s*=\s*["'](?:https?:)?\/\/[^"']*\/script\.js["']/gi, 'src="#script-included-inline"')
                .replace(/<link[^>]*href\s*=\s*["'][^"']*styles\.css["'][^>]*>/gi, '<!-- CSS is included inline in the head -->')
                .replace(/<script[^>]*src\s*=\s*["'][^"']*script\.js["'][^>]*><\/script>/gi, '<!-- JS is included inline at the end of body -->');
        }
        
        updateCodeStateAndEditors(codes);
        
        updatePreview();
        setStatus(`Final quality & modernization improvements applied (Agent: QA Specialist)!`, false, false); // Updated status
        
    } catch (error) {
        console.warn("Quality & Modernization pass (QA Specialist) encountered an error, keeping current version:", error);
        setStatus(`Quality & Modernization pass failed (Agent: QA Specialist): ${error.message}. Keeping previous version.`, true, false); // Updated status
         // Ensure retry is possible if quality pass fails
        state.retryPayload.isAvailable = true;
        elements.regenerateButton.style.display = 'block';
        elements.regenerateButton.disabled = false;
    }
}

/**
 * Handles the request to check and fix the current code
 */
async function handleCheckAndFixCode() {
    console.log("Check & Fix Code requested.");

    // Disable buttons
    elements.submitButton.disabled = true;
    elements.clearButton.disabled = true;
    elements.regenerateButton.disabled = true;
    elements.checkFixButton.disabled = true;
    elements.checkFixButton.textContent = '🩺 Checking...';
    setStatus("Analyzing and fixing code (Agent: Debugger)...", false, true, 'fixing');
    state.stopExecutionRequested = false; // Ensure flag is reset

    // Get current code from CodeMirror editors
    const htmlContent = editors.html ? editors.html.getValue() : '';
    const cssContent = editors.css ? editors.css.getValue() : '';
    const jsContent = editors.js ? editors.js.getValue() : '';

    if (!htmlContent && !cssContent && !jsContent) {
        setStatus("Nothing to check. Code areas are empty.", false, false);
        elements.submitButton.disabled = false;
        elements.clearButton.disabled = false;
        elements.checkFixButton.disabled = false;
        elements.checkFixButton.textContent = '🩺 Check & Fix Code';
        return;
    }

    try {
        // --- REFINED Check/Fix System Prompt ---
        const fixSystemPrompt = `You are Tauris AI Coder's Debugger Bot. Analyze the provided code (HTML, CSS, JS) to identify and fix **actual errors** and critical issues.

FOCUS AREAS:
- **Syntax Errors:** Correct any syntax mistakes in HTML, CSS, or JS.
- **Runtime Errors:** Identify and fix potential JS runtime errors (null access, type errors) by adding necessary checks (\`if (element)\`) or correcting logic.
- **Broken References:** Fix JS targeting non-existent IDs, incorrect label \`for\` attributes, etc.
- **Integration Bugs:** Address clear issues where CSS/JS/HTML interaction is broken.
- **Obvious Logic Flaws:** Correct simple logical errors preventing intended core functionality.

**DO NOT:**
- Make purely stylistic changes.
- Refactor extensively unless fixing a direct error.
- Change intended functionality.

OUTPUT REQUIREMENTS:
- Analyze ALL provided code.
- If errors are found, provide the ***ENTIRE, CORRECTED*** code for ALL THREE files.
- If NO critical errors are found, return the original code blocks unchanged.
- Output ONLY raw code within fenced blocks (\`\`\`html, \`\`\`css, \`\`\`javascript). NO explanations.
- Ensure code remains self-contained. Output THREE separate blocks.`;

        // --- REFINED Check/Fix User Prompt ---
        const fixUserPrompt = `
**TASK:** Analyze the following code for **ERRORS** (syntax, runtime, broken references, integration bugs, simple logic flaws). Provide the complete, corrected code only if errors are found. Ignore stylistic preferences.

**CURRENT CODE:**
\\\`\\\`\\\`html
${htmlContent || '(No HTML)'}
\\\`\\\`\\\`

\\\`\\\`\\\`css
${cssContent || '(No CSS)'}
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
${jsContent || '(No JS)'}
\\\`\\\`\\\`

**OUTPUT (Strictly follow format, provide FULL code ONLY IF ERRORS FIXED):**
\\\`\\\`\\\`html
[Your FULL corrected or original HTML code]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Your FULL corrected or original CSS code]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[Your FULL corrected or original JavaScript code]
\\\`\\\`\\\`
`;

        state.retryPayload.operationType = 'check_fix';

        const selectedModel = elements.modelSelect.value;

        // Define Fix API options
        const fixApiOptions = {
            temperature: 0.1, // Very low temp for fixing
            top_p: 0.9,       // Focused output
            maxRetries: 1
        };
        if (selectedModel === 'openai-reasoning') {
            fixApiOptions.reasoning_effort = 'low'; // Low effort probably sufficient for fixing
        }

        const aiResponseContent = await callPollinationsAPI(
            selectedModel,
            [
                { role: "system", content: fixSystemPrompt },
                { role: "user", content: fixUserPrompt }
            ],
            "Check & Fix Code (Debugger)",
            fixApiOptions // Pass fix-specific options
        );

        const codes = extractCode(aiResponseContent);

        if (codes.html === null && codes.css === null && codes.js === null) {
            // This might happen if the AI response format is wrong, or if it truly found nothing *and* decided not to return the original. Treat as error.
            throw new Error("AI failed to return valid code blocks after check/fix.");
        }

        // Check if the code actually changed significantly (simple length check as proxy)
        const codeChanged = (codes.html !== htmlContent) ||
                            (codes.css !== cssContent) ||
                            (codes.js !== jsContent);

        // Update editors with fixed code
        updateCodeStateAndEditors(codes);
        updatePreview();

        if (codeChanged) {
            setStatus("Code check complete. Fixes applied (Agent: Debugger)!", false, false);
        } else {
            setStatus("Code check complete. No significant issues found (Agent: Debugger).", false, false);
        }

    } catch (error) {
        console.error("Error during Check & Fix Code (Debugger):", error);
        setStatus(`Error checking code (Agent: Debugger): ${error.message}`, true, false);
        // Do NOT update the code state or UI on error
    } finally {
        // Re-enable buttons
        elements.submitButton.disabled = false;
        elements.clearButton.disabled = false;
        elements.checkFixButton.disabled = false;
        elements.checkFixButton.textContent = '🩺 Check & Fix Code';
         if (state.retryPayload.isAvailable) {
             elements.regenerateButton.disabled = false;
         }
        setStatus(elements.statusTextSpan.textContent, elements.statusContainer.classList.contains('error'), false); // Ensure loading indicator is off
    }
}

/**
 * Performs research using the internet if research mode is enabled.
 * @param {string} userQuery - The original user prompt or task description.
 * @param {string} researchPurpose - Description of what the research is for (e.g., "Initial Generation Best Practices").
 * @returns {Promise<string>} - A string containing research findings or an empty string if disabled/failed.
 */
async function performResearchIfNeeded(userQuery, researchPurpose) {
    if (!state.isResearchModeEnabled) {
        return ""; // Return empty string if mode is disabled
    }

    setStatus(`Researching internet for best practices...`, false, true, 'researching');
    console.log(`Performing internet research for: ${researchPurpose}`);

    // Construct a focused research query
    const researchQuery = `What are the current best practices, common pitfalls, and key considerations for implementing the following web development task: "${userQuery}"? Focus on vanilla HTML, CSS, and modern JavaScript (ES6+). Provide concise, actionable advice or code snippets where appropriate.`;

    try {
        const researchFindings = await callPollinationsAPI(
            'searchgpt',
            [{ role: "user", content: researchQuery }],
            researchPurpose,
            { temperature: 0.3, maxRetries: 1, allowCaching: true }
        );
        console.log("Internet Research Findings:", researchFindings.substring(0, 300) + "...");
        setStatus(`🔬 Internet research complete. Proceeding...`, false, true);
        await delay(500);
        return `\n\n## Internet Research Findings (Consider these points):\n${researchFindings}\n## End of Research Findings\n`;
    } catch (error) {
        console.warn(`Internet research step failed for "${researchPurpose}":`, error);
        setStatus(`⚠️ Internet research failed. Proceeding without it.`, false, false);
         await delay(1500);
        return ""; // Return empty string on failure
    }
}

/**
 * Handles the main generate/refine submission workflow
 */
async function handleSubmit() {
    state.lastUserPrompt = elements.promptInput.value.trim();
    const selectedModel = elements.modelSelect.value;
    
    if (!state.lastUserPrompt || !selectedModel) {
        setStatus('Please provide a prompt and select a model.', true, false);
        return;
    }

    console.log("handleSubmit: Starting..."); // LOG: Start

    elements.submitButton.disabled = true;
    elements.clearButton.disabled = true;
    elements.regenerateButton.style.display = 'none';
    elements.submitButton.textContent = "🧠 Thinking...";
    state.retryPayload.isAvailable = false;
    state.stopExecutionRequested = false;
    elements.stopButton.style.display = 'none';
    if (elements.researchModeToggle) elements.researchModeToggle.disabled = true;

    const currentHtmlFromEditor = editors.html ? editors.html.getValue() : '';
    const currentCssFromEditor = editors.css ? editors.css.getValue() : '';
    const currentJsFromEditor = editors.js ? editors.js.getValue() : '';
    const isNewProject = !currentHtmlFromEditor && !currentCssFromEditor && !currentJsFromEditor;

    let overallSuccess = false;
    let planError = null;
    let researchText = "";

    try {
        researchText = await performResearchIfNeeded(
            state.lastUserPrompt,
            isNewProject ? "Initial Generation Research" : "Refinement Research"
        );

        if (isNewProject) {
            console.log("handleSubmit: Detected New Project. Starting generation..."); // LOG: New Project Start
            setStatus(`Generating high-quality initial version (Agent: Master Craftsman - using ${selectedModel})...`, false, true, 'generating'); // Updated status message slightly

            // --- REFINED V2: Initial Generation System Prompt (High Quality First) ---
            const initialGenSystemPrompt = `You are Tauris AI Coder (Master Craftsman Agent), an expert full-stack web developer specializing in creating **high-quality, aesthetically pleasing, and robust** web applications from the start. Generate a complete, well-structured, **WORKING, and BEAUTIFUL** initial version using only semantic HTML, modern responsive CSS, and best-practice Vanilla JavaScript (SPA architecture).

**Primary Goal:** Generate not just a functional foundation, but a **demonstrably high-quality starting point**. This includes:
-   **Best Practice HTML:** Semantic, accessible, well-structured.
-   **Beautiful & Responsive CSS:** Aesthetically pleasing (within the requested theme/style if specified), responsive, well-organized CSS. Use modern layout techniques (Flexbox/Grid) where appropriate.
-   **Best Practice JS:** Highly modular, robust, efficient, well-commented JavaScript ('use strict';, comprehensive error handling).

Functionality, extensibility, **and initial quality/aesthetics** are top priorities.

**CRITICAL REQUIREMENTS:**
- **Functional & Robust:** Implement the main functionality CORRECTLY and reliably.
- **High Initial Quality:** Code must adhere to modern best practices and demonstrate quality from the outset.
- **Aesthetics (CSS):** Create visually appealing and responsive layouts and styles.
- **Extensible Structure:** Use modular JS (functions/classes) and semantic HTML suitable for future expansion.
- **SPA Architecture:** Default to SPA.
- **Clean & Modular Code:** Semantic HTML, well-structured/beautiful CSS, ***highly modular and robust JavaScript***.
- **Self-Contained:** No external dependencies.
- **Output Format:** MUST output THREE SEPARATE code blocks.`;

            // --- REFINED V2: Initial Generation User Instruction (High Quality First) ---
            const initialGenUserInstruction = `
**USER REQUEST:** "${state.lastUserPrompt}" (Aiming for a high-quality, potentially complex application)
${researchText}
**DEVELOPMENT CONTEXT & TASK:**
- Create the **initial high-quality version** of this web application as a **Single Page Application (SPA)** using vanilla HTML, CSS, and JavaScript.
- **PRIORITY #1: Implement the main requested features robustly AND ensure the initial code quality (HTML structure, CSS beauty, JS logic) is high.**
- Generate necessary semantic HTML structure, **beautiful and responsive CSS**, and **best-practice, modular JavaScript logic** ('use strict', error checks, comments).
- Goal: A reliable, ***WORKING***, **visually appealing**, and well-structured starting point demonstrating quality, ready for potential future complex additions.

**API DOCUMENTATION / CONTEXT (If provided):**
*Implement core working interactions based on any API details provided, adhering to high-quality code standards.*

**REQUIRED OUTPUT (High Standard Expected):**
1.  **HTML:** Semantic, accessible HTML5, structured for potential future complexity.
2.  **CSS:** **Beautiful**, well-organized, responsive CSS. Use modern layout techniques.
3.  **JavaScript:** ***Best-practice, modular***, robust, well-commented, handles core interactions reliably. Use 'use strict';. MUST be functional.
4.  **Integration:** Ensure components work together functionally and visually.
5.  **Crucial Formatting:** Output ONLY the THREE code blocks below.

**OUTPUT FORMAT (STRICTLY REQUIRED):**
\\\`\\\`\\\`html
[Complete semantic and well-structured HTML code for the initial HIGH-QUALITY SPA]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Complete BEAUTIFUL, responsive, well-organized CSS code for initial styling]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
['use strict';\n\n// Complete BEST-PRACTICE, MODULAR, ROBUST JavaScript code for the core FUNCTIONALITY, structured for extensibility...]
\\\`\\\`\\\`
`;

            const modelCapabilities = state.modelCapabilities[selectedModel] || {};

            // Determine a reasonable max_tokens based on model and potential complexity
            // Let's start with a higher base and adjust if needed
            let requestedTokens = 4096; // Default max
            if (modelCapabilities.contextSize && modelCapabilities.contextSize > 8000) {
                requestedTokens = Math.min(modelCapabilities.contextSize - 1000, 8192); // Leave some buffer, cap at 8k for initial gen to avoid excessive cost/time
            }
             // Increase slightly for higher quality generation demand
             requestedTokens = Math.min(requestedTokens + 1024, modelCapabilities.contextSize ? modelCapabilities.contextSize - 500 : 8192);


            const apiOptions = {
                temperature: 0.25, // Slightly increased temp for a bit more creativity in CSS/JS structure, but still focused
                max_tokens: requestedTokens,
                top_p: 0.9, // Keep top_p for focus
                maxRetries: 3
            };
            // Add reasoning_effort if applicable and potentially beneficial for quality
             if (selectedModel === 'openai-reasoning' || (modelCapabilities.hasReasoning && modelCapabilities.qualityScore > 85)) {
                 apiOptions.reasoning_effort = 'medium'; // Use medium effort for initial gen if using a reasoning model
                 console.log(`Using medium reasoning_effort for high-quality initial generation with ${selectedModel}.`);
             }


            state.retryPayload.operationType = 'initial_generation';

            console.log("handleSubmit: Calling API for High-Quality Initial Generation..."); // LOG: Before API Call
            const aiResponseContent = await callPollinationsAPI(
                selectedModel,
                [
                    { role: "system", content: initialGenSystemPrompt },
                    { role: "user", content: initialGenUserInstruction }
                ],
                "Initial High-Quality Generation (Master Craftsman)", // Updated purpose description
                apiOptions
            );
            console.log("handleSubmit: API Call for Initial Generation returned."); // LOG: After API Call

            state.retryPayload.isAvailable = false; // Reset retry *only* after successful API return

            console.log("handleSubmit: Extracting code..."); // LOG: Before Extraction
            const codes = extractCode(aiResponseContent);
            console.log("handleSubmit: Code extraction result:", { html: codes.html!==null, css: codes.css!==null, js: codes.js!==null }); // LOG: After Extraction

            if (codes.html === null && codes.css === null && codes.js === null) {
                 console.error("handleSubmit: Initial generation failed to parse any code blocks."); // LOG: Extraction Error
                throw new Error("Initial generation failed to parse code blocks.");
            }

             console.log("handleSubmit: Updating code state and preview with extracted code..."); // LOG: Before UI Update
            updateCodeStateAndEditors(codes);
            state.codeManuallyEdited = false;
            updatePreview();
             console.log("handleSubmit: Code state and preview updated."); // LOG: After UI Update

            setStatus(`Initial version generated. Planning enhancements (Agent: Architect)...`, false, false); // Update status *before* potentially long planning step

            await delay(500); // Short delay before planning

            if (!state.stopExecutionRequested) {
                 console.log("handleSubmit: Starting enhancement planning and execution..."); // LOG: Before Plan/Execute
                 overallSuccess = await generateEnhancementPlanAndExecuteSteps();
                 console.log("handleSubmit: Enhancement planning and execution finished. Success:", overallSuccess); // LOG: After Plan/Execute
            } else {
                 console.log("handleSubmit: Stop requested before planning."); // LOG: Stop before planning
                 setStatus("Execution stopped by user after initial generation.", false, false);
            }

        } else {
            // --- Refinement Workflow ---
             console.log("handleSubmit: Detected Refinement. Starting refinement..."); // LOG: Refinement Start
             setStatus(`Refining code with high standards (Agent: Refiner - using ${selectedModel})...`, false, true, 'refining'); // Adjusted status slightly

             // --- REFINED V2: Refinement System Prompt (Maintain High Quality) ---
            const refineSystemPrompt = `You are Tauris AI Coder (Expert Refiner Agent), an expert software architect refining an existing web application, ensuring changes maintain or improve its **high quality, aesthetics, and robustness**. Analyze the current code and the user's request, then implement *only* the requested changes precisely, professionally, ensuring **robust functionality and seamless integration** while adhering to best practices.

PRINCIPLES:
- **Understand Context & Quality:** Thoroughly analyze current code (HTML, CSS, JS) and the refinement goal. Understand the existing quality standard and structure.
- **Targeted & Precise:** Implement *only* the requested changes.
- **Preserve/Improve Functionality & Quality:** **CRITICAL:** Do not break existing features or lower code quality. Ensure the refined code works correctly, robustly, and integrates seamlessly.
- **Seamless Integration:** **CRITICAL:** Ensure changes integrate smoothly with existing HTML, CSS, and *all relevant JavaScript functions/modules*. Update related code if needed. Maintain visual consistency.
- **Maintain Consistency:** Adhere to existing code style and quality standards.
- **Robustness:** Include error checks. Use 'use strict';.
- **Self-Contained:** No external dependencies.`;

            // --- REFINED V2: Refinement User Instruction (Maintain High Quality) ---
            const refineUserInstruction = `
**USER REFINEMENT REQUEST:** "${state.lastUserPrompt}"
${researchText}
**CURRENT CODE STATE (Analyze structure, quality, and integration points carefully):**
\\\`\\\`\\\`html
${currentHtmlFromEditor || '(empty)'}
\\\`\\\`\\\`
\\\`\\\`\\\`css
${currentCssFromEditor || '(empty)'}
\\\`\\\`\\\`
\\\`\\\`\\\`javascript
${currentJsFromEditor || '(empty)'}
\\\`\\\`\\\`
${state.currentPlan ? `**Original Development Plan (for context):**\n${state.currentPlan}\n` : ''}

**REFINEMENT INSTRUCTIONS (Maintain High Standard):**
1.  **Analyze:** Understand existing code structure/quality and how the request fits.
2.  **Implement Precisely & Integratively:** Make only the necessary modifications. **Ensure the changes integrate perfectly with the existing code (HTML, CSS, JS), work correctly, and maintain/improve the overall quality and visual consistency.** Update any related JS functions/listeners.
3.  **Robustness:** Ensure the refined code is robust and functional.
4.  **Output Complete Code:** Provide the COMPLETE, updated, **FUNCTIONAL, WELL-INTEGRATED, and HIGH-QUALITY** code for ALL THREE files.
5.  **CRITICAL FORMATTING:** Output THREE SEPARATE code blocks. NO explanations. Keep code self-contained.

**Incorporate insights from 'Internet Research Findings' if provided.**

\\\`\\\`\\\`html
[Complete refined semantic HTML code]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Complete refined beautiful and responsive CSS code]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[Complete refined, functional, best-practice, and well-integrated JavaScript code]
\\\`\\\`\\\`
`;
            // Define Refinement API options (similar logic to initial generation, maybe slightly less tokens needed)
             const refineModelCapabilities = state.modelCapabilities[selectedModel] || {};
             let refineRequestedTokens = 4096; // Default max
             if (refineModelCapabilities.contextSize && refineModelCapabilities.contextSize > 8000) {
                 refineRequestedTokens = Math.min(refineModelCapabilities.contextSize - 1000, 6144); // Can use slightly less for refinement usually
             }

             const refineApiOptions = {
                temperature: 0.2, // Keep temp lower for precise refinement
                max_tokens: refineRequestedTokens,
                top_p: 0.9,
                maxRetries: 3
            };
             if (selectedModel === 'openai-reasoning' || (refineModelCapabilities.hasReasoning && refineModelCapabilities.qualityScore > 85)) {
                 refineApiOptions.reasoning_effort = 'low'; // Low effort usually fine for refinement
                 console.log(`Using low reasoning_effort for refinement with ${selectedModel}.`);
             }

            state.retryPayload.operationType = 'refinement';

            console.log("handleSubmit: Calling API for High-Quality Refinement..."); // LOG: Before API Call
            const aiRefineResponseContent = await callPollinationsAPI(
                selectedModel,
                [
                    { role: "system", content: refineSystemPrompt },
                    { role: "user", content: refineUserInstruction }
                ],
                "High-Quality Refinement (Refiner)", // Updated purpose
                refineApiOptions
            );
             console.log("handleSubmit: API Call for Refinement returned."); // LOG: After API Call

            state.retryPayload.isAvailable = false; // Reset retry *only* after successful API return

            console.log("handleSubmit: Extracting refined code..."); // LOG: Before Extraction
            const refinedCodes = extractCode(aiRefineResponseContent);
             console.log("handleSubmit: Refined code extraction result:", { html: refinedCodes.html!==null, css: refinedCodes.css!==null, js: refinedCodes.js!==null }); // LOG: After Extraction

            if (refinedCodes.html === null && refinedCodes.css === null && refinedCodes.js === null) {
                 console.error("handleSubmit: Refinement failed to parse any code blocks."); // LOG: Extraction Error
                throw new Error("Refinement failed to parse code blocks.");
            }

             console.log("handleSubmit: Updating code state and preview with refined code..."); // LOG: Before UI Update
            updateCodeStateAndEditors(refinedCodes);
            state.codeManuallyEdited = false; // Assume refinement overwrites manual changes
            updatePreview();
             console.log("handleSubmit: Code state and preview updated."); // LOG: After UI Update

            setStatus(`Refinement applied successfully! Ready for next request.`, false, false);
            overallSuccess = true; // Mark as success for the finally block

        }

    } catch (error) {
        console.error("handleSubmit Error:", error); // LOG: General Error
        setStatus(`Operation failed: ${error.message}`, true, false);
        state.retryPayload.isAvailable = true; // Ensure retry is available on error
        elements.regenerateButton.style.display = 'block';
        elements.regenerateButton.disabled = false;
        overallSuccess = false;
        // No re-throw needed, finally block handles UI
    } finally {
        console.log("handleSubmit: Entering finally block. Overall Success:", overallSuccess); // LOG: Finally Start
        // Re-enable buttons only if the entire process (including planning/execution if applicable) was successful OR stopped, AND no retry is pending
        if ((overallSuccess || state.stopExecutionRequested) && !state.retryPayload.isAvailable) {
             console.log("handleSubmit: Enabling Submit/Clear buttons."); // LOG: Enabling Buttons
            elements.submitButton.disabled = false;
            elements.clearButton.disabled = false;
        } else if (!state.retryPayload.isAvailable) {
             // If failed but no retry is available (shouldn't normally happen, but safety check)
             console.log("handleSubmit: Process failed, no retry available, enabling Submit/Clear."); // LOG: Enabling Buttons (Error, No Retry)
             elements.submitButton.disabled = false;
             elements.clearButton.disabled = false;
        } else {
             console.log("handleSubmit: Retry available or process failed, keeping Submit/Clear disabled."); // LOG: Keeping Buttons Disabled
             // Keep submit/clear disabled if retry is available
             elements.submitButton.disabled = true;
             elements.clearButton.disabled = true;
        }

        // Always reset the submit button text if it wasn't left in a loading state
        const currentStatusIsLoading = elements.loadingIndicatorSpan.style.display === 'inline-block';
        if (!currentStatusIsLoading) {
             console.log("handleSubmit: Resetting Submit button text."); // LOG: Resetting Button Text
            const selectedModel = elements.modelSelect.value;
            const capabilities = state.modelCapabilities[selectedModel] || {};
            let buttonText = "🚀 Generate / Refine";
            if (capabilities.isCoder) buttonText = "🧑‍💻 Generate Code";
            else if (capabilities.hasReasoning) buttonText = "🧠 Generate / Plan";
            elements.submitButton.textContent = buttonText;
        } else {
            console.log("handleSubmit: Leaving Submit button text as is (still loading)."); // LOG: Leaving Button Text
            // If it's still loading (e.g., stopped during a step), leave the text as is or set to a generic "Thinking..."
             elements.submitButton.textContent = "🧠 Thinking..."; // Or maybe revert based on model? Thinking is safer.
        }


        // Reset stop button state
        elements.stopButton.style.display = 'none';
        elements.stopButton.disabled = false;
        elements.stopButton.textContent = "⏹️ Stop Execution";
         if (elements.researchModeToggle) elements.researchModeToggle.disabled = false; // Re-enable toggle
         console.log("handleSubmit: Finished."); // LOG: End
    }
}
