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
    state.stopExecutionRequested = false; // Reset stop flag at the start of execution
    elements.stopButton.style.display = 'inline-block'; // Show stop button
    elements.stopButton.disabled = false;
    elements.stopButton.textContent = "⏹️ Stop Execution";

    // Advanced execution parameters
    const MAX_PARALLEL_STEPS = 2; // Maximum number of steps to execute in parallel
    const DEPENDENCY_THRESHOLD = 0.7; // Threshold for considering a step as dependent on previous steps
    
    // Map to store execution promises
    const executingPromises = new Map();
    const completedSteps = new Set();
    
    // Process evaluation
    let i = startStepIndex;
    
    // Process steps - with controlled parallelism where possible
    while (i < state.currentPlanSteps.length) {
        // *** Check for stop request at the beginning of each loop iteration ***
        if (state.stopExecutionRequested) {
            console.log(`Execution stopped by user before starting step ${i + 1}.`);
            setStatus(`Execution stopped by user after step ${lastCompletedStep + 1}.`, false, false);
            allStepsSuccess = false; // Mark as not fully completed
            break; // Exit the loop
        }

        // Check if we can run more parallel steps (up to MAX_PARALLEL_STEPS)
        if (executingPromises.size < MAX_PARALLEL_STEPS) {
            const currentStepText = state.currentPlanSteps[i];
            
            // Determine if the step is a candidate for parallel execution
            // More complex steps or those likely dependent on previous steps should run sequentially
            const stepLength = currentStepText.length;
            const hasKeyDependencyTerms = /previous|existing|update|modify|enhance|improve|fix|extend|combine|integrate/i.test(currentStepText);
            const isComplexStep = stepLength > 100 || /implement|create complex|build system|advanced/i.test(currentStepText);
            
            // Simple heuristic: If we've just started, if the step is short and doesn't mention
            // previous elements, or if it's a new feature addition, it might be parallelizable
            const isDependentOnPrevious = hasKeyDependencyTerms || isComplexStep || 
                                         (i > startStepIndex + 3) && (Math.random() > DEPENDENCY_THRESHOLD);
            
            // If the step is dependent or we already have executing promises, execute sequentially
            if (isDependentOnPrevious || executingPromises.size > 0) {
                // Wait for all executing promises to complete before proceeding
                if (executingPromises.size > 0) {
                    const executingSteps = Array.from(executingPromises.keys()).join(', ');
                    console.log(`Waiting for steps ${executingSteps} to complete before proceeding with step ${i+1}`);
                    
                    await Promise.all(executingPromises.values());
                    executingPromises.clear();
                    
                    // Update last completed step index
                    const maxCompleted = Math.max(...completedSteps);
                    lastCompletedStep = maxCompleted > lastCompletedStep ? maxCompleted : lastCompletedStep;
                }
                
                // Execute the step and wait for it directly
                try {
                    setStatus(`Enhancing Step ${i + 1}/${state.currentPlanSteps.length}`, false, true, 'enhancing', { stepNum: i + 1 });
                    updatePlanDisplay(state.currentPlanSteps, i, lastCompletedStep);
                    await delay(400);
                    
                    // *** Check for stop request before executing the step ***
                    if (state.stopExecutionRequested) {
                        console.log(`Execution stopped by user before executing step ${i + 1}.`);
                        setStatus(`Execution stopped by user after step ${lastCompletedStep + 1}.`, false, false);
                        allStepsSuccess = false;
                        break; // Exit loop
                    }

                    await executeEnhancementStep(i);
                    
                    lastCompletedStep = i;
                    completedSteps.add(i);
                    
                    updatePlanDisplay(state.currentPlanSteps, -1, lastCompletedStep);
                    setStatus(`Step ${i + 1}/${state.currentPlanSteps.length} processed.`, false, false);
                    await delay(300);
                    
                    i++; // Move to next step
                } catch (error) {
                    updatePlanDisplay(state.currentPlanSteps, -1, lastCompletedStep, i); // Mark failed
                    allStepsSuccess = false; // Mark failure
                    break; // Stop execution on error
                }
            } else {
                // Potential candidate for parallel execution
                console.log(`Starting step ${i+1} in parallel`);
                
                // Update UI to show we're working on this step
                setStatus(`Starting Step ${i + 1}/${state.currentPlanSteps.length}`, false, true, 'enhancing', { stepNum: i + 1 });
                updatePlanDisplay(state.currentPlanSteps, i, lastCompletedStep);
                
                // Execute the step asynchronously and store the promise
                const stepPromise = (async (stepIndex) => {
                    try {
                        // *** Check for stop request before starting parallel step ***
                        if (state.stopExecutionRequested) {
                            console.log(`Execution stopped by user before starting parallel step ${stepIndex + 1}.`);
                            setStatus(`Execution stopped by user after step ${lastCompletedStep + 1}.`, false, false);
                            return false;
                        }
                        await executeEnhancementStep(stepIndex);
                        completedSteps.add(stepIndex);
                        return stepIndex;
                    } catch (error) {
                        console.error(`Parallel step ${stepIndex + 1} failed:`, error);
                        throw error;
                    }
                })(i);
                
                executingPromises.set(i + 1, stepPromise);
                i++; // Move to next step without awaiting
            }
        } else {
            // Wait for at least one promise to complete before continuing
            const results = await Promise.race([
                Promise.any(executingPromises.values()).catch(e => null),
                delay(30000).then(() => 'timeout') // 30-second safety timeout
            ]);
            
            if (results === 'timeout') {
                console.warn('Parallel execution timeout - forcing sequential processing');
                
                // Fall back to sequential processing
                await Promise.all(executingPromises.values()).catch(e => {
                    console.error('Error in parallel execution:', e);
                });
                executingPromises.clear();
            } else {
                // Remove completed promises
                for (const [stepNum, promise] of executingPromises.entries()) {
                    if (Promise.resolve(promise).status === 'fulfilled') {
                        executingPromises.delete(stepNum);
                    }
                }
            }
        }
    }
    
    // Wait for any remaining parallel steps to complete *unless stopped*
    if (executingPromises.size > 0 && !state.stopExecutionRequested) {
        setStatus(`Finalizing ${executingPromises.size} remaining steps...`, false, true, 'enhancing');
        await Promise.all(executingPromises.values()).catch(e => {
            console.error('Error in final steps:', e);
            allStepsSuccess = false;
        });
    }
    
    // Clean up stop button state
    elements.stopButton.style.display = 'none';
    state.stopExecutionRequested = false; // Reset flag for future runs

    // Re-enable buttons if execution finished or was stopped
    elements.submitButton.disabled = false;
    elements.clearButton.disabled = false;
     if (state.retryPayload.isAvailable) {
         elements.regenerateButton.disabled = false;
     }

    return allStepsSuccess; // Return true if loop completed without error or stop request
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
        // Optionally throw an error or return a specific value to signal stopping
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
        console.warn(`Context size (${currentContextSize} chars) for Step ${stepIndex + 1} is large. Potential risk of exceeding API limits.`);
    }

    // Refined Step Prompt - Emphasizing Modularity, Cumulative Output, Integration, and Error Handling
    const stepSystemPrompt = `You are Tauris AI Coder, an expert AI developer meticulously modifying a web project step-by-step. Focus intensely on quality, correctness, context-awareness, avoiding redundancy, and precisely following instructions. Your primary goal is to ensure the *entire* codebase remains functional, coherent, and *highly modular* (especially JavaScript) after *each* incremental modification. Anticipate potential runtime errors in generated JS and include basic checks (e.g., for null elements before access). Prioritize creating well-defined JavaScript functions or classes.`;

    const stepUserInstruction = `
CONTEXT:
- Original User Request: "${state.lastUserPrompt}"
- Full Enhancement Plan:\n${state.currentPlan}
- Current Code State (This is the *complete and entire* code. Analyze it thoroughly before making changes. It's the single source of truth.):
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
1.  **Verify Understanding:** Read the **Current Code State** and **CURRENT TASK** very carefully. Ensure your changes logically fit the existing structure.
2.  **Implement FOCUSED Step:** Execute ONLY the changes required by the CURRENT TASK. Do not introduce unrelated features or premature optimizations.
3.  **Minimal Necessary Changes & Careful Integration:** Modify or add only the code *directly* related to the CURRENT TASK. Reuse existing elements and functions correctly. Ensure seamless integration without breaking other parts. Check for potential conflicts (e.g., CSS class names, JS variable names).
4.  **MODULARITY & ROBUSTNESS (JS Focus):** Structure JavaScript modifications using well-named functions or classes. Avoid global scope pollution. **Add checks for potential errors** (e.g., \`if (element)\`) before using \`element.addEventListener\`. Add comments explaining complex logic or function purposes *within this step*.
5.  **Preserve Functionality:** Do not break existing features unless the task *explicitly* requires modification or removal.
6.  **Syntax & Completeness Check:** Meticulously review generated code for correctness (syntax, closing tags/brackets) and completeness (all necessary parts included).
7.  **Enhance Quality (Within Scope):** Apply best practices (semantic HTML, ARIA roles where appropriate, efficient/responsive CSS, clear/modular/error-checked JS).
8.  **Output COMPLETE CUMULATIVE Code:** Provide the ***ENTIRE, UPDATED, FULLY FUNCTIONAL*** code (HTML, CSS, JS) reflecting **ALL** previous changes **PLUS** the changes made in this specific step. Output the complete, current state of each file as if saving it.
9.  **Strict Formatting:** Output ONLY raw code within the specified fenced blocks (\`\`\`html, \`\`\`css, \`\`\`javascript). NO explanations, justifications, apologies, or summaries outside the code blocks.
10. **Path References:** Use only relative paths (like image sources if added) or inline content. Ensure all CSS is in the CSS block and all JS in the JS block. No external URLs for essential resources.
11. **CRITICAL FORMATTING:** You MUST output THREE SEPARATE code blocks (HTML, CSS, JavaScript), correctly fenced. Do NOT combine into a single HTML block with \`<style>\` or \`<script>\` tags. Do NOT add comments like \`<!-- HTML code -->\` above the blocks.

\\\`\\\`\\\`html
[Your FULL cumulative HTML code reflecting changes up to Step ${stepIndex + 1}]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Your FULL cumulative RESPONSIVE CSS code reflecting changes up to Step ${stepIndex + 1}]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[Your FULL cumulative MODULAR and ERROR-CHECKED JavaScript code reflecting changes up to Step ${stepIndex + 1}]
\\\`\\\`\\\`
`;

    state.retryPayload.operationType = 'enhancement_step';
    state.retryPayload.failedStepIndex = stepIndex;
    
    const aiResponseContent = await callPollinationsAPI(
        elements.modelSelect.value, // Use the main selected model (likely coder)
        [
            { role: "system", content: stepSystemPrompt },
            { role: "user", content: stepUserInstruction }
        ],
        `Enhancement Step ${stepIndex + 1}`
    );
    
    state.retryPayload.isAvailable = false;

    const codes = extractCode(aiResponseContent);
    
    if (codes.html === null && codes.css === null && codes.js === null) {
        console.warn(`No code blocks generated for enhancement step ${stepIndex + 1}. Assuming no changes were needed for this step.`);
    } else {
        // Fix any problematic resource references in HTML before saving
        if (codes.html) {
            // Replace any absolute URLs to local resources with proper references
            codes.html = codes.html
                .replace(/href\s*=\s*["']http:\/\/127\.0\.0\.1:[0-9]+\/styles\.css["']/gi, 'href="#styles-included-inline"')
                .replace(/src\s*=\s*["']http:\/\/127\.0\.0\.1:[0-9]+\/script\.js["']/gi, 'src="#script-included-inline"')
                .replace(/<link[^>]*href\s*=\s*["'][^"']*\/styles\.css["'][^>]*>/gi, '<!-- CSS is included inline in the head -->')
                .replace(/<script[^>]*src\s*=\s*["'][^"']*\/script\.js["'][^>]*><\/script>/gi, '<!-- JS is included inline at the end of body -->');
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
        setStatus(`Planning enhancements (using ${planningModel})...`, false, true, 'planning');
        elements.planAreaDiv.style.display = 'block';
        elements.planDisplayDiv.textContent = 'Generating enhancement plan...';
        
        // Get initial code from editors for planning context
        const initialHtml = editors.html ? editors.html.getValue() : '';
        const initialCss = editors.css ? editors.css.getValue() : '';
        const initialJs = editors.js ? editors.js.getValue() : '';

        // --- Updated Planning System Prompt ---
        const planningSystemPrompt = `You are Tauris AI Coder's Enhancement Planner, a senior software architect designing the roadmap for web application development. Your task is to analyze the initial code and user request to create a logical, impactful, and feature-focused enhancement plan.

GUIDELINES:
- **Focus on Value:** Prioritize steps that deliver significant functionality, major UI components, or core user interactions requested by the user.
- **Substantial Steps:** Aim for **3-8 meaningful, well-defined steps**. Group related implementation details (e.g., basic HTML structure, necessary CSS, initial JS logic for a feature) into a single, logical step.
- **Avoid Overly Granular Tasks:** Do NOT create steps for trivial changes like minor CSS tweaks (unless part of a larger UI theme/component implementation), adding single HTML elements (unless it's a major structural component), or extremely small JS helper functions. Focus on completing a feature or a significant part of it.
- **Logical Progression:** Structure steps logically (e.g., core logic -> UI integration -> interactions -> refinements -> validation). Ensure dependencies are considered.
- **Maintain Working State:** Steps should ideally build upon each other, maintaining a functional (even if incomplete) application state.
- **Include Validation/Review:** Add a step near the end like "Validate core functionality, test user interactions, and ensure responsiveness." A final "Review and polish" step is also recommended for larger projects.
- **Clarity:** Each step must be clearly defined, actionable, and represent a tangible improvement or feature implementation.

Output ONLY a numbered list in the format: "1. [Action verb] [specific, substantial task]" with NO additional text, explanations, summaries, or commentary.`;

        // --- Updated Planning User Message ---
        const planningUserMessage = `
Original User Request: "${state.lastUserPrompt}"

Initial Generated Code:
\\\`\\\`\\\`html
${initialHtml || '(empty)'}
\\\`\\\`\\\`
\\\`\\\`\\\`css
${initialCss || '(empty)'}
\\\`\\\`\\\`
\\\`\\\`\\\`javascript
${initialJs || '(empty)'}
\\\`\\\`\\\`

ENHANCEMENT PLANNING INSTRUCTIONS:
1.  Analyze the code and user request to identify core features and necessary improvements.
2.  **Create Substantial Steps:** Define steps that represent significant progress (e.g., "Implement core snake movement and rendering logic", "Add user authentication flow (UI and basic JS)", "Build the main product display component"). Aim for 3-8 major steps.
3.  **Group Related Tasks:** Combine related HTML structure, CSS styling, and initial JavaScript logic for a specific feature or component into a single step where logical.
4.  **Prioritize Impact:** Focus on implementing the most important features or user-facing changes first.
5.  **Avoid Trivial Steps:** Do not list minor adjustments (like changing a single color or adding one input field) as separate steps unless absolutely critical for the next major step.
6.  Structure steps logically considering dependencies.
7.  Include steps for quality improvements like responsiveness and accessibility *if* they represent significant work for the feature being built.
8.  **Crucially, include a validation/testing step near the end.**
9.  **Consider adding a final self-correction/review/polish step.**

Your output must be ONLY a numbered list of steps (e.g., "1. Implement the main game loop and player rendering"). DO NOT include notes, justifications, or any other text outside the numbered list.
`;

        state.retryPayload.operationType = 'enhancement_planning';
        state.retryPayload.failedStepIndex = -1;
        
        const generatedPlan = await callPollinationsAPI(
            planningModel, // Use the selected planning model
            [
                { role: "system", content: planningSystemPrompt },
                { role: "user", content: planningUserMessage }
            ],
            "Enhancement Planning"
        );
        
        state.retryPayload.isAvailable = false;
        state.currentPlan = generatedPlan;
        state.currentPlanSteps = parsePlan(state.currentPlan);
        
        if (state.currentPlanSteps.length === 0) {
            console.warn("No enhancement steps parsed:", state.currentPlan);
            setStatus("Initial version generated. No further enhancement steps planned.", false, false);
            updatePlanDisplay([]);
            return true;
        }
        
        updatePlanDisplay(state.currentPlanSteps, 0);
        setStatus(`Plan ready (${state.currentPlanSteps.length} steps). Executing...`, false, false);
        
        await delay(500);
        const stepsSuccess = await executeEnhancementStepsSequentially(0);
        
        if (stepsSuccess && !state.stopExecutionRequested) {
            const planHasReviewStep = state.currentPlanSteps.some(step =>
                /review|validate|test|fix|correct|polish/i.test(step.toLowerCase())
            );

            // Run quality pass if steps were successful and no explicit review step exists (and > 1 step)
            if (!planHasReviewStep && state.currentPlanSteps.length > 1) {
                 setStatus('Running final quality assurance pass...', false, true, 'fixing');
                 await finalQualityPass();
                 // finalQualityPass sets its own final status, or we set it after
                 if (!state.retryPayload.isAvailable) { // Check if quality pass failed
                    setStatus(`Enhancements complete & quality checked! Project is ready.`, false, false);
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
        console.error(`Enhancement Planning Error:`, err);
        setStatus(`Planning failed: ${err.message}`, true, false);
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
        const qualitySystemPrompt = `You are Tauris AI Coder's Quality Assurance Specialist, an expert in web development best practices, code optimization, debugging, and ensuring production readiness.

Your task is to perform a final, meticulous review and enhancement of the entire codebase to ensure:
1.  **Integration:** All HTML, CSS, and JS components work together seamlessly. Event listeners target existing elements. CSS classes used in JS/HTML are defined.
2.  **Best Practices & Optimization:** Code follows modern standards (semantic HTML5, efficient CSS selectors, minimal JS global scope). Remove unused code/variables. Optimize loops or repetitive operations if obvious.
3.  **Responsiveness:** The layout adapts reasonably well to different screen sizes. Check for overflows or broken layouts.
4.  **Accessibility (Basic):** Ensure essential ARIA attributes are present where needed (e.g., roles for custom controls, aria-label for icon buttons), images have alt text (even if generic initially), keyboard navigation is logical.
5.  **Error Handling & Robustness:** JavaScript includes basic checks for null/undefined before accessing properties or methods (e.g., \`if (element) { element.style... }\`). Add \`try...catch\` blocks around potentially problematic operations (like JSON parsing).
6.  **Consistency:** Naming conventions (variables, functions, CSS classes) are consistent. Code formatting is clean.
7.  **Self-Contained:** Verify NO external resource references (CDN links, external fonts unless specifically requested earlier, etc.). All CSS must be in the CSS block, all JS in the JS block.
8.  **Functionality Preservation:** Do NOT change the core logic or features. Only polish, fix, and optimize.

Focus on making the code stable, reliable, maintainable, and polished. Ensure all JS logic is well-encapsulated in functions or classes.`;

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

QUALITY ASSURANCE INSTRUCTIONS:
- Review holistically. Fix integration issues, JS errors, CSS conflicts, HTML validation errors.
- **Ensure JavaScript code is modular (use functions/classes) and includes error checks (null checks, try/catch where needed).** Refactor global scope logic into functions if necessary.
- Optimize performance where obvious (e.g., efficient selectors, debouncing event listeners if applicable - though maybe too complex for this stage).
- Improve accessibility (add missing ARIA, alt tags).
- Enhance responsive design (fix overflows, ensure readability on small screens).
- Improve JS error handling and edge case resilience.
- Clean up code organization, ensure consistent naming, remove commented-out dead code.
- CRITICAL: Remove any external resource references. All CSS/JS must be self-contained in their respective blocks.
- You MUST output THREE SEPARATE code blocks (HTML, CSS, JavaScript). Do NOT combine. NO explanations outside code blocks.

Provide the final, enhanced, polished, and robust code.

\\\`\\\`\\\`html
[ENHANCED HTML CODE]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[ENHANCED CSS CODE]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[ENHANCED MODULAR and ROBUST JAVASCRIPT CODE]
\\\`\\\`\\\`
`;

        state.retryPayload.operationType = 'final_quality_pass'; // Set operation type for retry

        const aiResponseContent = await callPollinationsAPI(
            elements.modelSelect.value, // Use the main selected model
            [
                { role: "system", content: qualitySystemPrompt },
                { role: "user", content: qualityUserPrompt }
            ],
            "Final Quality Pass"
        );

        state.retryPayload.isAvailable = false; // Reset retry payload after success

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
        setStatus(`Final quality improvements applied!`, false, false);
        
    } catch (error) {
        console.warn("Quality pass encountered an error, keeping current version:", error);
        setStatus(`Quality pass failed: ${error.message}. Keeping previous version.`, true, false);
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
    setStatus("Analyzing and fixing code...", false, true, 'fixing');
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
        // System Prompt for the Check/Fix operation - More Detailed
        const fixSystemPrompt = `You are Tauris AI Coder's Debugger & QA Bot, an expert in identifying and fixing web development issues. Your task is to meticulously analyze the provided HTML, CSS, and JavaScript code, identify problems (syntax, runtime, logic, integration), and provide the complete, corrected code adhering to best practices.

FOCUS AREAS:
- **Syntax Errors:** Correct any syntax mistakes in HTML (e.g., unclosed tags), CSS (e.g., missing semicolons), or JS (e.g., typos, bracket mismatches).
- **Runtime Errors:** Identify potential JS runtime errors (e.g., accessing properties of null/undefined, type errors, incorrect function calls) and add necessary checks (\`if (element)\`) or fixes.
- **Logic Flaws:** Identify and correct obvious logical errors in JavaScript that prevent intended functionality, *without* significantly altering the overall behavior or features.
- **Missing Elements/References:** Check for undefined variables, uncalled functions (if clearly intended but missed), broken HTML references (e.g., JS targeting non-existent IDs, incorrect \`for\` attributes on labels).
- **Integration Issues:** Look for CSS conflicts (specificity issues if obvious), JS functions not working due to HTML structure changes, event listeners not being attached correctly.
- **Best Practices (Minor Fixes):** Apply minor fixes for clarity, basic accessibility (e.g., adding a basic \`alt=""\` to images missing it), or simple performance improvements (e.g., removing clearly redundant operations). Ensure correct use of \`let\`/\`const\`.
- **Modularity (JS):** Ensure JS is reasonably modular. If significant logic is floating in the global scope and looks misplaced, try encapsulating it in a function (e.g., an initialization function).
- **Completeness & Consistency:** Ensure all tags, brackets, braces, and quotes are properly closed. Check for consistent naming conventions.

OUTPUT REQUIREMENTS:
- Analyze ALL provided code (HTML, CSS, JS).
- If issues are found, provide the ***ENTIRE, CORRECTED, FULLY FUNCTIONAL*** code for ALL THREE languages, even if only one was changed. Integrate fixes smoothly.
- If NO significant issues are found, return the original code blocks unchanged. Be conservative; don't make unnecessary stylistic changes.
- Output ONLY raw code within the specified fenced blocks (\`\`\`html, \`\`\`css, \`\`\`javascript). NO explanations, summaries of fixes, apologies, or commentary outside code blocks.
- Ensure all CSS remains in the CSS block and all JS in the JS block. NO <style> or <script> tags in the HTML block unless they were explicitly there in the input (which is discouraged).
- CRITICAL FORMATTING: You MUST output THREE SEPARATE code blocks.`;

        // User Prompt for Check/Fix - More explicit
        const fixUserPrompt = `
**TASK:** Analyze the following code for errors (syntax, runtime, basic logic), inconsistencies, broken references, and significant best practice violations. Provide the complete, corrected code. If no critical issues are found, return the original code blocks. Focus on fixing actual problems, not just stylistic preferences.

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

**OUTPUT (Strictly follow format, provide FULL code):**
\\\`\\\`\\\`html
[Your FULL corrected or original HTML code]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Your FULL corrected or original CSS code]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[Your FULL corrected or original MODULAR and ROBUST JavaScript code]
\\\`\\\`\\\`
`;

        state.retryPayload.operationType = 'check_fix'; // For potential retry

        const aiResponseContent = await callPollinationsAPI(
            elements.modelSelect.value, // Use the currently selected model
            [
                { role: "system", content: fixSystemPrompt },
                { role: "user", content: fixUserPrompt }
            ],
            "Check & Fix Code",
            { temperature: 0.1, maxRetries: 1 } // Low temp, fewer retries for fixing
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
            setStatus("Code check complete. Fixes applied!", false, false);
        } else {
            setStatus("Code check complete. No significant issues found.", false, false);
        }

    } catch (error) {
        console.error("Error during Check & Fix Code:", error);
        setStatus(`Error checking code: ${error.message}`, true, false);
        // Do NOT update the code state or UI on error
    } finally {
        // Re-enable buttons
        elements.submitButton.disabled = false;
        elements.clearButton.disabled = false;
        elements.checkFixButton.disabled = false;
        elements.checkFixButton.textContent = '🩺 Check & Fix Code';
         if (state.retryPayload.isAvailable) { // Re-enable regenerate only if applicable from a previous error
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

    elements.submitButton.disabled = true;
    elements.clearButton.disabled = true;
    elements.regenerateButton.style.display = 'none';
    elements.submitButton.textContent = "🧠 Thinking...";
    state.retryPayload.isAvailable = false;
    state.stopExecutionRequested = false;
    elements.stopButton.style.display = 'none';
    // Disable research toggle during operation
    if (elements.researchModeToggle) elements.researchModeToggle.disabled = true;

    // Determine if it's a new project based on editor content
    const currentHtmlFromEditor = editors.html ? editors.html.getValue() : '';
    const currentCssFromEditor = editors.css ? editors.css.getValue() : '';
    const currentJsFromEditor = editors.js ? editors.js.getValue() : '';
    const isNewProject = !currentHtmlFromEditor && !currentCssFromEditor && !currentJsFromEditor;

    let overallSuccess = false;
    let planError = null;
    let researchText = ""; // Variable to hold research findings

    try {
        // --- Optional Research Step ---
        researchText = await performResearchIfNeeded(
            state.lastUserPrompt,
            isNewProject ? "Initial Generation Research" : "Refinement Research"
        );

        if (isNewProject) {
            // --- New Project Workflow ---
            setStatus(`Generating initial version (using ${selectedModel})...`, false, true, 'generating');

            const initialGenSystemPrompt = `You are Tauris AI Coder, a world-class full-stack web developer creating modern, functional web applications from scratch using only HTML, CSS, and Vanilla JavaScript.

Your task is to generate complete, production-ready initial code based on a user description, ensuring robustness and maintainability from the start.

CORE PRINCIPLES:
- Functionality First: Implement all core features requested by the user accurately.
- Clean Architecture: Use semantic HTML5, well-structured CSS, and **highly modular JavaScript (functions/classes)**. Avoid global scope pollution.
- Responsive Design: Ensure the interface adapts gracefully to various screen sizes.
- Accessibility: Follow WCAG guidelines (semantic tags, ARIA where needed, keyboard navigation considerations).
- Performance: Write efficient code (e.g., sensible selectors, optimized JS where obvious).
- Maintainability: Clear organization, consistent naming, comments for complex logic.
- **Robustness:** Include basic error handling in JavaScript (e.g., null checks before DOM manipulation, try/catch for risky operations like parsing).
- Self-Contained: All code MUST be included in the provided code blocks with NO external dependencies (no CDNs, no external fonts unless specifically part of the core request).
- CRITICAL: You MUST output THREE SEPARATE code blocks - one for HTML, one for CSS, and one for JavaScript.`;

            const initialGenUserInstruction = `
**USER REQUEST:** "${state.lastUserPrompt}"
${researchText}
**DEVELOPMENT CONTEXT:**
- This is a brand new web project requiring complete HTML, CSS, and JavaScript.
- The application should be modern, responsive, accessible, and follow best practices.
- Use **vanilla HTML, CSS, and JavaScript ONLY**. No external frameworks, libraries, or dependencies are allowed.
- Include proper error handling (e.g., null checks in JS), basic validation (if forms are involved), and user feedback where appropriate.
- Design with both desktop and mobile viewports in mind from the start.

**REQUIRED TECHNICAL SPECIFICATIONS:**
1.  **HTML:** Use semantic HTML5 with proper document structure (\`<!DOCTYPE html>\`, \`html\`, \`head\`, \`body\`), appropriate tags (\`header\`, \`nav\`, \`main\`, \`article\`, \`aside\`, \`footer\`), and ARIA attributes where needed for accessibility.
2.  **CSS:** Implement responsive design (e.g., using Flexbox/Grid, media queries). Use sensible defaults, organize styles logically, and aim for compatibility (avoiding very niche properties).
3.  **JavaScript:** Create **modular, well-structured code using functions or classes**. Minimize global variables. Use \`'use strict';\` if appropriate. **Include checks for element existence before manipulating them** (e.g., \`const btn = document.getElementById('myBtn'); if (btn) { btn.addEventListener(...) }\`). Handle potential errors gracefully (e.g., \`try...catch\` for \`JSON.parse\`). Use modern JS features appropriately (\`let\`/\`const\`, arrow functions where clear).
4.  **User Experience:** Provide visual feedback for actions, clear instructions, and intuitive interactions. If forms are present, include basic client-side validation.
5.  **Integration:** Ensure all three code components work together seamlessly. JS should correctly target HTML elements, and CSS should style them as intended.
6.  **Comments:** Include helpful comments for complex JavaScript logic or CSS sections.
7.  **Crucial Formatting:** DO NOT include links to external stylesheets or scripts (e.g., no \`<link href="styles.css">\` or \`<script src="script.js">\`). All CSS MUST be in the CSS code block and all JavaScript MUST be in the JavaScript code block.

**OUTPUT FORMAT (STRICTLY REQUIRED):**
You MUST provide your response in EXACTLY this format with THREE separate code blocks. Do NOT add any text before, between, or after these blocks.

\\\`\\\`\\\`html
[Your complete HTML code here - DO NOT include <style> or <script> tags]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Your complete CSS code here]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[Your complete MODULAR and ROBUST JavaScript code here]
\\\`\\\`\\\`
`;

            // Determine optimal settings based on model capabilities
            const modelCapabilities = state.modelCapabilities[selectedModel] || {};
            
            // Set API call options based on model capabilities
            const apiOptions = {
                operationType: 'initial_generation',
                failedStepIndex: -1,
                temperature: 0.2, // Lower temperature for coder models
                maxTokens: Math.min(modelCapabilities.contextSize || 4096, 4000), // Cap tokens
                allowModelFallback: true,
                maxRetries: 3
            };
             state.retryPayload.operationType = 'initial_generation'; // Moved setup earlier

            const aiResponseContent = await callPollinationsAPI(
                selectedModel,
                [
                    { role: "system", content: initialGenSystemPrompt },
                    { role: "user", content: initialGenUserInstruction }
                ],
                "Initial Generation",
                apiOptions
            );
            
            state.retryPayload.isAvailable = false;

            const codes = extractCode(aiResponseContent);
            
            if (codes.html === null && codes.css === null && codes.js === null) {
                throw new Error("Initial generation failed to parse code blocks.");
            }
            
            updateCodeStateAndEditors(codes);
            
            state.codeManuallyEdited = false; // AI generated initial code
            updatePreview();
            setStatus(`Initial version generated. Planning enhancements...`, false, false);

            await delay(500);
            if (!state.stopExecutionRequested) {
                 overallSuccess = await generateEnhancementPlanAndExecuteSteps(); // Pass researchText? Maybe not needed for plan
            } else { /* Handle stop */ }

        } else {
            // --- Refinement Workflow ---
            setStatus(`Refining code (using ${selectedModel})...`, false, true, 'refining');

            const refineSystemPrompt = `You are Tauris AI Coder, an elite software architect specializing in web application refinement and enhancement. Your task is to carefully analyze the existing code (HTML, CSS, JS) and the user's specific refinement request, then implement *only* the requested changes precisely, while maintaining code quality, integration, and robustness.

PRINCIPLES FOR REFINEMENT:
- **Deep Understanding:** First, thoroughly understand the current code's structure, functionality, and patterns. Then, precisely understand the user's refinement goal.
- **Targeted Changes:** Implement *only* the changes directly related to the user's request. Avoid unrelated modifications or large refactors unless explicitly asked.
- **Preserve Existing Functionality:** Do not break features or change behavior unless the request requires it.
- **Maintain Consistency:** Adhere to existing code structure, naming conventions, and patterns found in the provided code.
- **Seamless Integration:** Ensure your changes integrate smoothly with the existing HTML, CSS, and JS. Update all relevant parts if necessary (e.g., if you change an HTML ID, update the JS that targets it).
- **Robustness:** If adding JS, include necessary error checks (null checks, etc.). Fix any obvious errors or inconsistencies *directly related* to the area you are modifying.
- **Self-Contained:** Keep all code self-contained. Do not introduce external dependencies.`;

            const refineUserInstruction = `
**USER REFINEMENT REQUEST:** "${state.lastUserPrompt}"
${researchText}
**CURRENT CODE STATE (This is the complete code, potentially modified by the user - analyze carefully):**
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

**REFINEMENT PROCESS & INSTRUCTIONS:**
1.  **Analyze:** Examine the existing code thoroughly to understand its structure and how the requested refinement fits in. Identify the specific lines/sections of HTML, CSS, or JS that need modification.
2.  **Plan (Mentally):** Determine the minimal changes required to fulfill the request while integrating smoothly. Consider any side effects.
3.  **Implement Precisely:** Make only the necessary modifications to the code. If adding new JS, make it modular and add error checks. Ensure changes are consistent with the existing style.
4.  **Output Complete Code:** Provide the COMPLETE, updated code for all three components (HTML, CSS, JS), including ALL existing code plus your specific refinements.
5.  **Preserve Functionality:** Do not remove or break existing features unless the request explicitly demands it.
6.  **CRITICAL FORMATTING:**
    *   You MUST output THREE SEPARATE code blocks (\`\`\`html, \`\`\`css, \`\`\`javascript).
    *   Do NOT combine code into a single HTML block with \`<style>\` or \`<script>\` tags.
    *   Do NOT add explanations, comments, or summaries outside the code blocks.
    *   Ensure all CSS remains in the CSS block and all JS in the JS block. No external resource links.

**Incorporate insights from the 'Internet Research Findings' section if provided.**

\\\`\\\`\\\`html
[Complete refined HTML code, incorporating your changes]
\\\`\\\`\\\`

\\\`\\\`\\\`css
[Complete refined CSS code, incorporating your changes]
\\\`\\\`\\\`

\\\`\\\`\\\`javascript
[Complete refined JavaScript code, incorporating your changes, ensuring modularity and robustness]
\\\`\\\`\\\`
`;

            // Determine optimal settings based on model capabilities
            const modelCapabilities = state.modelCapabilities[selectedModel] || {};
            
            // Set API call options
            const apiOptions = {
                operationType: 'refinement',
                failedStepIndex: -1,
                temperature: 0.3, // Lower temperature for refinement
                maxRetries: 3,
                allowModelFallback: true
            };
            state.retryPayload.operationType = 'refinement'; // Moved setup earlier

            const aiResponseContent = await callPollinationsAPI(
                selectedModel,
                [
                    { role: "system", content: refineSystemPrompt },
                    { role: "user", content: refineUserInstruction }
                ],
                "Code Refinement",
                apiOptions
            );
            
            state.retryPayload.isAvailable = false;

            const codes = extractCode(aiResponseContent);
            
            if (codes.html === null && codes.css === null && codes.js === null) {
                throw new Error("AI refinement response failed to parse code blocks.");
            }
            
            updateCodeStateAndEditors(codes);
            
            state.codeManuallyEdited = false; // AI provided refined code
            updatePreview();
            setStatus(`Code refined successfully!`, false, false);
            overallSuccess = true;
        }

    } catch (error) {
        // --- Main Error Handling ---
        console.error(`Error during handleSubmit:`, error);
        
        setStatus(`Error: ${error.message}. ${state.retryPayload.isAvailable ? 'Click Regenerate to retry.' : 'Check console.'}`, true, false);
        
        // Don't revert editors on error, keep the state they were in when error occurred
        // updatePreview(); // Preview already reflects the state before the failed call

        if (planError) {
            updatePlanDisplay([]);
            elements.planDisplayDiv.textContent = `Planning failed: ${planError.message}`;
            elements.planAreaDiv.style.display = 'block';
        }

    } finally {
        // --- Cleanup ---
        elements.submitButton.textContent = elements.modelSelect.options[elements.modelSelect.selectedIndex]?.textContent.includes('🧑‍💻') ? "🧑‍💻 Generate Code" : "🚀 Generate / Refine"; // Update based on selected model
        elements.regenerateButton.textContent = '🔁 Regenerate Failed Op';
         if (!state.retryPayload.isAvailable) {
             elements.submitButton.disabled = false;
             elements.clearButton.disabled = false;
         } else {
             elements.regenerateButton.style.display = 'block'; // Make sure regen is visible if available
             elements.regenerateButton.disabled = false;
         }
         if (elements.researchModeToggle) elements.researchModeToggle.disabled = false; // Re-enable toggle

        setStatus(elements.statusTextSpan.textContent, elements.statusContainer.classList.contains('error'), false); // Ensure loading indicator is off

        // Ensure stop button is hidden if workflow completes or fails
        elements.stopButton.style.display = 'none';
        state.stopExecutionRequested = false;
    }
}
