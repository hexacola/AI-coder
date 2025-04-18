// Tauris AI Coder - Core Application

// Constants & Configuration
const API_ENDPOINT = 'https://text.pollinations.ai/openai/chat/completions';
const REFERRER_ID = 'TaurisAICoderXP_v11_EnhancedAgent';
const MODEL_LIST_URL = 'https://text.pollinations.ai/models';
const API_VERSION = '2025.03.31';

// --- Add Back team_discussing Status Messages ---
const FUN_MESSAGES = {
    team_discussing: [ // Agent: The Whole Team / Individual Agent during discussion
        "Architect: Sketching structure...",
        "Frontend Dev: Considering components...",
        "JS Dev: Planning logic flow...",
        "CSS Designer: Visualizing the theme...",
        "QA/Tester: Identifying potential issues...",
        "Team: Discussing core requirements...",
        "Team: Refining the initial approach...",
        "Team: Aligning on priorities...",
        "Team: Reaching consensus...",
    ],
    generating: [ // Agent: Initial Generator / Implementer (after discussion)
        "Team Lead: Executing the agreed initial build...",
        "Implementing the core based on team consensus...",
        "Generating the foundation as planned...",
        "Bringing the team's vision to first draft...",
    ],
    planning: [ // Agent: Architect / Team Lead
        "Team Lead: Defining the enhancement to-do list...",
        "Architect mapping out next development steps...",
        "Prioritizing features for phased implementation...",
        "Creating the team's task backlog...",
    ],
    enhancing: [ // Agent: Developer (generic, maybe split further later)
        "Implementing step {stepNum} feature...",
        "Adding extra awesome to step {stepNum}...",
        "Coding enhancement for step {stepNum}...",
        "Making step {stepNum} functional...",
        "Building out feature from step {stepNum}...",
    ],
    developing_feature: [ // Agent: Developer (specific)
        "Implementing feature from step {stepNum}...",
        "Coding the core logic for step {stepNum}...",
        "Building out functionality for step {stepNum}...",
    ],
    fixing_styles: [ // Agent: UX/CSS Fixer
        "Polishing the pixels for step {stepNum}...",
        "Applying visual improvements for step {stepNum}...",
        "Adjusting CSS for step {stepNum}...",
        "Making step {stepNum} look sharp...",
        "Refining the interface for step {stepNum}...",
    ],
    improving_robustness: [ // Agent: Developer/QA
        "Adding error checks for step {stepNum}...",
        "Refactoring step {stepNum} for clarity...",
        "Making step {stepNum} more resilient...",
        "Improving code quality for step {stepNum}...",
    ],
    refining: [ // Agent: Refiner (Manual refinement request)
        "Fine-tuning the digital engine...",
        "Applying requested refinements...",
        "Making it *even* better based on your input...",
        "Implementing your specific changes...",
    ],
    fixing: [ // Agent: Debugger (Check & Fix button)
        "Debugging with the power of AI...",
        "Exterminating digital gremlins...",
        "Applying code bandages...",
        "Running diagnostics...",
        "Performing code CPR...",
    ],
    quality_assurance: [ // Agent: QA Specialist (Final Pass / Tester step)
        "Performing final quality checks...",
        "Ensuring code integration and stability...",
        "Applying the final layer of polish...",
        "Validating best practices...",
        "Making sure everything works together...",
        "Running tests for step {stepNum}...",
    ],
    researching: [ // Agent: Researcher
        "Scouring the digital library (internet)...",
        "Consulting the web elders for wisdom...",
        "Asking the internet nicely for tips...",
        "Downloading more knowledge...",
    ],
    regenerating: [ // Meta: Retry Mechanism
        "Giving it another go!",
        "Engaging retry protocols...",
        "Recalibrating the AI's thought process...",
        "Let's try that again, shall we?",
    ],
    thinking: [ // General fallback / Coordination
        "Cogitating...",
        "Processing request...",
        "AI Agents coordinating...",
        "Loading awesomeness...",
        "Hold on, magic in progress...",
        "Reviewing the plan...", // Added for reviewer context
    ]
};

// --- Helper to get a random message ---
function getRandomMessage(purpose = 'thinking', context = {}) {
    const messages = FUN_MESSAGES[purpose] || FUN_MESSAGES.thinking;
    let message = messages[Math.floor(Math.random() * messages.length)];

    // Replace placeholders
    if (context.stepNum) {
        message = message.replace('{stepNum}', context.stepNum);
    }
    // Add more placeholder replacements if needed

    return message;
}

// DOM References & Editor Instances
const elements = {
    modelSelect: document.getElementById('model-select'),
    promptInput: document.getElementById('prompt-input'),
    submitButton: document.getElementById('submit-button'),
    clearButton: document.getElementById('clear-button'),
    regenerateButton: document.getElementById('regenerate-button'),
    statusContainer: document.getElementById('status-container'),
    statusTextSpan: document.getElementById('status-text'),
    loadingIndicatorSpan: document.getElementById('loading-indicator'),
    htmlCodeTextarea: document.getElementById('html-code'),
    cssCodeTextarea: document.getElementById('css-code'),
    jsCodeTextarea: document.getElementById('js-code'),
    previewFrame: document.getElementById('preview-frame'),
    previewArea: document.querySelector('.preview-area'),
    mainContent: document.querySelector('.main-content'),
    maximizeToggleButton: document.getElementById('maximize-toggle-button'),
    planAreaDiv: document.getElementById('plan-area'),
    planDisplayDiv: document.getElementById('plan-display'),
    checkFixButton: document.getElementById('check-fix-button'),
    stopButton: document.getElementById('stop-button'),
    researchModeToggle: document.getElementById('research-mode-toggle'),
    totalLinesDisplay: document.getElementById('total-lines-display'),
    downloadCodeButton: document.getElementById('download-code-button')
};

// NEW: Store CodeMirror instances
const editors = {
    html: null,
    css: null,
    js: null
};

// State Management
const state = {
    currentHTML: '',
    currentCSS: '',
    currentJS: '',
    currentPlan: '',
    currentPlanSteps: [],
    lastUserPrompt: '',
    retryPayload: {
        isAvailable: false,
        model: null,
        messages: null,
        purpose: null,
        operationType: null,
        failedStepIndex: -1
    },
    modelCapabilities: {}, // Store capabilities of loaded models
    preferredSeeds: {}, // Store seeds that worked well for consistent results
    sessionStats: {
        startTime: Date.now(),
        apiCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        responseTokens: 0
    },
    stopExecutionRequested: false,
    isResearchModeEnabled: false
};

// Cache mechanism for API responses
const apiCache = {
    models: null,
    modelExpiry: 0, // Timestamp when models cache expires
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes in milliseconds
    lastResponses: new Map() // Map to cache recent API responses for similar queries
};

// --- Utility Functions ---

/**
 * Creates a Promise that resolves after specified milliseconds
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Updates the status display with message, error state, and loading indicator
 */
function setStatus(message, isError = false, isLoading = false, purpose = 'thinking', context = {}) {
    let corePurpose = 'thinking';
    const purposeMatch = message.match(/\((?:Agent|Team): ([^\)]+)\)/i); // Match Agent: or Team:
    const specificPurposeMatch = purpose.match(/^([a-z_]+)/i);

    if (purposeMatch) {
        const agentName = purposeMatch[1].toLowerCase();
        // --- ADD mapping for new agent names/concepts ---
        if (agentName.includes('team') || message.toLowerCase().includes('discussing') || message.toLowerCase().includes('architect:') || message.toLowerCase().includes('dev:') || message.toLowerCase().includes('designer:') || message.toLowerCase().includes('tester:')) {
             corePurpose = 'team_discussing'; // Map specific agent turns to team_discussing
        }
        // --- Revert other mappings to V2 ---
        else if (agentName.includes('architect') || agentName.includes('planner') || agentName.includes('team lead')) corePurpose = 'planning';
        else if (agentName.includes('generator') || agentName.includes('craftsman') || agentName.includes('implementer')) corePurpose = 'generating';
        else if (agentName.includes('css') || agentName.includes('ux') || agentName.includes('designer')) corePurpose = 'fixing_styles';
        else if (agentName.includes('developer') || agentName.includes('feature') || agentName.includes('backend') || agentName.includes('js')) corePurpose = 'developing_feature';
        else if (agentName.includes('quality') || agentName.includes('enhancer') || agentName.includes('refactor')) corePurpose = 'improving_robustness';
        else if (agentName.includes('debugger') || agentName.includes('fixer')) corePurpose = 'fixing';
        else if (agentName.includes('tester') || agentName.includes('qa') || agentName.includes('specialist')) corePurpose = 'quality_assurance';
        else if (agentName.includes('refiner')) corePurpose = 'refining';
        else if (agentName.includes('researcher')) corePurpose = 'researching';
        else if (agentName.includes('reviewer')) corePurpose = 'thinking';
         // --- End mapping updates ---
    } else if (specificPurposeMatch) {
        corePurpose = specificPurposeMatch[1].toLowerCase();
         // --- Add direct mapping for new purpose ---
         if (corePurpose === 'team_discussing') { /* handled */ }
         // --- End direct mapping ---
    } else if (purpose === 'enhancing' && context.stepNum) {
         corePurpose = 'developing_feature';
    }

    const validPurposes = Object.keys(FUN_MESSAGES);
    if (!validPurposes.includes(corePurpose)) {
        console.warn(`Invalid corePurpose derived: '${corePurpose}'. Falling back to 'thinking'.`);
        corePurpose = 'thinking';
    }

    // --- Status Update Logic ---
    // For team discussion, show the actual message from the AI directly
    // For other loading states, use random fun messages but keep the detailed message in the log
    if (isLoading) {
        if (corePurpose === 'team_discussing') {
            elements.statusTextSpan.textContent = message; // Show the simulated dialogue turn
        } else {
            const funMessage = getRandomMessage(corePurpose, context);
            // Maybe combine? e.g., elements.statusTextSpan.textContent = `${funMessage} (${message})`;
            elements.statusTextSpan.textContent = message; // Keep detailed message for clarity for now
        }
        elements.loadingIndicatorSpan.style.display = 'inline-block';
        console.log(`Status Set (Loading): Purpose='${purpose}', CorePurpose='${corePurpose}', Message='${message}'`);
    } else {
        elements.statusTextSpan.textContent = message;
        elements.loadingIndicatorSpan.style.display = 'none';
        console.log(`Status Set (Idle/Done): Purpose='${purpose}', CorePurpose='${corePurpose}', Message='${message}'`);
    }
    // --- End Status Update Logic ---


    elements.statusContainer.setAttribute('data-status-purpose', corePurpose); // Style based on overall phase

    if (isError) {
        elements.statusContainer.classList.add('error');
        elements.statusContainer.removeAttribute('data-status-purpose'); // Remove purpose styling on error
    } else {
        elements.statusContainer.classList.remove('error');
    }

    elements.regenerateButton.style.display = isError && state.retryPayload.isAvailable ? 'block' : 'none';
}

/**
 * Extracts HTML, CSS, and JS code blocks from AI response text
 */
function extractCode(responseText) {
    // More robust regex patterns that ensure we capture all content between code fences
    const htmlPattern = /```(?:html|HTML)\s*\n([\s\S]*?)```/i;
    const cssPattern = /```(?:css|CSS)\s*\n([\s\S]*?)```/i;
    const jsPattern = /```(?:javascript|js|JavaScript|JS)\s*\n([\s\S]*?)```/i;
    
    const html = responseText.match(htmlPattern)?.[1]?.trim() ?? null;
    const css = responseText.match(cssPattern)?.[1]?.trim() ?? null;
    const js = responseText.match(jsPattern)?.[1]?.trim() ?? null;
    
    console.log("Extraction:", { 
        html: html !== null, 
        css: css !== null, 
        js: js !== null,
        rawResponse: responseText.substring(0, 200) + "..." // Log start of raw response for debugging
    });
    
    // Verify we're not getting a combined response in HTML
    if (html && !css && !js) {
        console.warn("Only HTML block detected - checking if it contains all code");
        
        // Check if HTML contains style and script tags, indicating combined output
        if (html.includes('<style') && html.includes('<script')) {
            console.warn("Detected combined output in HTML block, attempting to extract");
            
            // Extract CSS from style tags
            const extractedCss = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1]?.trim() || null;
            
            // Extract JS from script tags
            const extractedJs = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1]?.trim() || null;
            
            // Remove style and script tags from HTML
            let cleanedHtml = html;
            if (extractedCss) {
                cleanedHtml = cleanedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '<!-- CSS moved to separate block -->');
            }
            if (extractedJs) {
                cleanedHtml = cleanedHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '<!-- JS moved to separate block -->');
            }
            
            return {
                html: cleanedHtml,
                css: extractedCss,
                js: extractedJs
            };
        }
    }
    
    return { html, css, js };
}

/**
 * Creates a deterministic hash for a string
 * Used for caching and retrieving consistent seeds
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

/**
 * Counts lines in a string (handles different line endings)
 */
function countLines(str = '') {
    if (!str) return 0;
    // Handles \n, \r\n, and \r - also counts the last line if not empty
    return (str.match(/(\r\n|\n|\r)/g) || []).length + (str.length > 0 && !str.endsWith('\n') && !str.endsWith('\r') ? 1 : 0);
}

/**
 * Updates the total line count display
 */
function updateLineCount() {
    if (!editors.html || !editors.css || !editors.js) return; // Ensure editors are initialized

    try {
        const htmlLines = editors.html.lineCount();
        const cssLines = editors.css.lineCount();
        const jsLines = editors.js.lineCount();
        const totalLines = htmlLines + cssLines + jsLines;

        if (elements.totalLinesDisplay) {
            elements.totalLinesDisplay.textContent = `Total Lines: ${totalLines}`;
        }

        // Disable download button if there's no code
        if (elements.downloadCodeButton) {
            elements.downloadCodeButton.disabled = totalLines === 0;
        }
    } catch (error) {
        console.error("Error updating line count:", error);
        if (elements.totalLinesDisplay) {
            elements.totalLinesDisplay.textContent = 'Total Lines: Error';
        }
         if (elements.downloadCodeButton) {
            elements.downloadCodeButton.disabled = true;
         }
    }
}

/**
 * Updates the preview window with the current code from CodeMirror editors
 */
function updatePreview() {
    // Read directly from CodeMirror editors
    const htmlSource = editors.html ? editors.html.getValue() : '';
    const cssSource = editors.css ? editors.css.getValue() : '';
    const jsSource = editors.js ? editors.js.getValue() : '';

    // Update internal state as well (optional, but good practice)
    state.currentHTML = htmlSource;
    state.currentCSS = cssSource;
    state.currentJS = jsSource;

    // Basic XP-themed reset CSS
    const xpStyles = `
        body{margin:8px;font-family:Tahoma,sans-serif;font-size:11px;line-height:1.4;background-color:#ECE9D8;color:#000}
        button{background-color:#F5F4EA;color:#000;border:1px solid #ACA899;border-top-color:#FFF;border-left-color:#FFF;box-shadow:1px 1px 0 0 #505050;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-family:Tahoma,sans-serif}
        button:hover{background-color:#E3E3DE}
        button:active{background-color:#F5F4EA;border-color:#505050;border-top-color:#ACA899;border-left-color:#ACA899;box-shadow:inset 1px 1px 0 0 rgba(0,0,0,0.2)}
        input,textarea,select{padding:3px 5px;border:1px solid #7F9DB9;font-size:11px;background-color:#FFF;font-family:Tahoma,sans-serif;box-shadow:inset 1px 1px 1px rgba(0,0,0,0.1)}
        *,*::before,*::after{box-sizing:border-box}
    `;

    // Sanitize HTML - MORE AGGRESSIVE SANITIZATION
    let safeHTML = htmlSource || '';

    // 1. Remove ALL <link rel="stylesheet"> tags regardless of href
    safeHTML = safeHTML.replace(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi, '<!-- External stylesheet links removed by Tauris AI Coder -->');

    // 2. Check for embedded <style> and <script> tags (as before)
    if (safeHTML.includes('<style') || safeHTML.includes('<script')) {
        console.warn('HTML contains embedded style or script tags which should be in separate blocks. Neutralizing...');

        // Extract and remove style tags
        const styleMatches = safeHTML.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
        if (styleMatches) {
            styleMatches.forEach(styleTag => {
                safeHTML = safeHTML.replace(styleTag, '<!-- Embedded style block moved to CSS block -->');
            });
        }

        // Extract and remove script tags
        const scriptMatches = safeHTML.match(/<script[^>]*src\s*=\s*["'][^"']*["'][^>]*>[\s\S]*?<\/script>/gi); // Script tags with src
        const inlineScriptMatches = safeHTML.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi); // Inline script tags (no src)

        if (scriptMatches) {
            scriptMatches.forEach(scriptTag => {
                 // Be careful not to remove script tags for external libraries if we ever allow them
                 // For now, assume all src scripts are meant to be the generated JS
                safeHTML = safeHTML.replace(scriptTag, '<!-- External script link moved to JS block -->');
            });
        }
        if(inlineScriptMatches){
             inlineScriptMatches.forEach(scriptTag => {
                safeHTML = safeHTML.replace(scriptTag, '<!-- Inline script moved to JS block -->');
            });
        }
    }

    // 3. Remove potentially problematic base tags
    safeHTML = safeHTML.replace(/<base[^>]*>/gi, '<!-- Base tag removed by Tauris AI Coder -->');


    const combinedHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width,initial-scale=1.0">
            <title>Preview</title>
            <style>${xpStyles}${cssSource || ''}</style>
            <!-- Block any external resource loading -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; img-src 'self' data:;">
        </head>
        <body>
            ${safeHTML}
            <script>
                window.onerror=function(m,s,l,c,e){
                    console.error("Preview JS Error:",m,"at",s,l+":"+c,e);
                    return!0
                };
                try{${jsSource || ''}}catch(e){
                    console.error("Preview script exec error:",e),
                    window.onerror(e.message||"Script error","inline",0,0,e)
                }
            </script>
        </body>
        </html>
    `;

    try {
        if (combinedHtml.length > 2 * 1024 * 1024) {
            console.warn("Preview content is large (>2MB).");
        }
        elements.previewFrame.srcdoc = combinedHtml;
    } catch(e) {
        console.error("srcdoc error:", e);
        setStatus("Preview update error.", true, false);
    }

    console.log("Preview updated.");

    // Call line count update whenever preview is updated
    updateLineCount();
}

/**
 * Parse plan text into steps array
 */
function parsePlan(planText) {
    if (!planText || typeof planText !== 'string') return [];
    return planText.split('\n')
        .map(l => l.trim())
        .filter(l => /^\d+\.?\s+/.test(l));
}

/**
 * Update plan display with steps and their status (current, completed, failed)
 * Now adds data-step-type attribute for styling.
 */
function updatePlanDisplay(steps, currentIdx = -1, completedIdx = -1, failedIdx = -1) {
    if (!steps || steps.length === 0) {
        elements.planDisplayDiv.innerHTML = 'Enhancement plan...';
        elements.planAreaDiv.style.display = 'none';
        return;
    }

    elements.planAreaDiv.style.display = 'block';
    elements.planDisplayDiv.innerHTML = '';

    steps.forEach((step, i) => {
        const div = document.createElement('div');
        div.classList.add('plan-step');
        const txt = step.replace(/^\d+\.?\s+/, ''); // Keep original step text
        // div.textContent = txt; // We'll set innerHTML later

        let baseIcon = '⚪'; // Default: Pending
        let stepTypeIcon = '⚙️'; // Default: Generic Task/Implement
        let stepTypeKey = 'generic'; // Key for data attribute

        // Determine step type based on keywords (simple approach)
        const lowerStep = txt.toLowerCase();
        if (/style|css|layout|visual|ui|ux|design|theme|look|align|spacing|font|color|responsive/i.test(lowerStep)) {
            stepTypeIcon = '🎨'; stepTypeKey = 'ux-css';
        } else if (/implement|add feature|create|develop|build|functionality|logic|api|data|backend|integrate/i.test(lowerStep)) {
            stepTypeIcon = '💡'; stepTypeKey = 'feature';
        } else if (/fix|bug|error|debug|correct|issue|address|handle/i.test(lowerStep)) {
            stepTypeIcon = '🐛'; stepTypeKey = 'bugfix';
        } else if (/refactor|improve|optimize|robust|modular|quality|clean|enhance|structure/i.test(lowerStep)) {
            stepTypeIcon = '✨'; stepTypeKey = 'quality';
        } else if (/test|validate|verify|check|ensure/i.test(lowerStep)) {
            stepTypeIcon = '🧪'; stepTypeKey = 'test';
        } else if (/critique|review|analyze|plan|document/i.test(lowerStep)) {
            stepTypeIcon = '🧐'; stepTypeKey = 'analysis';
        } // Add more keywords/types if needed

        // Set the data attribute for CSS styling
        div.setAttribute('data-step-type', stepTypeKey);


        // Determine status icon
        let statusIcon = baseIcon; // Pending
        if (i === failedIdx) {
            div.classList.add('failed-step');
            statusIcon = '❌'; // Failed
        } else if (i <= completedIdx) {
            div.classList.add('completed-step');
            statusIcon = '✔️'; // Done
        } else if (i === currentIdx) {
            div.classList.add('current-step');
            statusIcon = '⏳'; // Current
        }


        // Combine icons and text
        div.innerHTML = `<span class="icon">${statusIcon}</span> <span class="icon" title="${getStepTypeTitle(stepTypeIcon)}">${stepTypeIcon}</span> ${txt}`; // Use txt here

        elements.planDisplayDiv.appendChild(div);

        if (i === currentIdx || i === failedIdx) {
            div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });

    console.log(`Plan display updated: Current ${currentIdx}, Completed ${completedIdx}, Failed ${failedIdx}`);
}

// Helper function for plan display icons
function getStepTypeTitle(icon) {
    switch (icon) {
        case '🎨': return 'UX/CSS Enhancement';
        case '💡': return 'Feature Implementation';
        case '🐛': return 'Bug Fix';
        case '✨': return 'Code Quality/Refactor';
        case '🧪': return 'Testing/Validation';
        case '🧐': return 'Analysis/Review/Planning';
        default: return 'General Task';
    }
}

// --- API Functions ---

/**
 * Fetches available models from Pollinations API with caching
 */
async function fetchModels(forceRefresh = false) {
    console.log("Fetching models...");
    console.time("Model Fetch and Process"); // Start timer

    // Check cache first if not forcing refresh
    const now = Date.now();
    if (!forceRefresh && apiCache.models && now < apiCache.modelExpiry) {
        console.log("Using cached models data");
        // Use cached data directly
        handleModelListResponse(apiCache.models); // Ensure this handles population and default selection
        console.timeEnd("Model Fetch and Process"); // End timer here for cached case
        return;
    }

    try {
        // Attempt to use the model list embedded in the HTML
        const modelListElement = document.getElementById('model-list-data');
        const modelListStr = modelListElement?.textContent;

        if (modelListStr) {
            console.log("Attempting to parse provided model list data from index.html...");
            try {
                const models = JSON.parse(modelListStr);
                console.log(`Successfully parsed ${models.length} models from embedded data.`);
                console.timeLog("Model Fetch and Process", "Parsed embedded models"); // Log time
                handleModelListResponse(models); // Process the parsed models
                console.timeEnd("Model Fetch and Process"); // End timer here for embedded case
                return; // Exit if embedded data was successfully used
            } catch (error) {
                console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                console.error("!!! CRITICAL: Failed to parse embedded model list JSON !!!", error);
                console.error("!!! Check the JSON syntax within <div id='model-list-data'> in index.html !!!");
                console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                // Set status to indicate critical failure
                setStatus("CRITICAL ERROR: Cannot load model list from page.", true, false);
                elements.modelSelect.innerHTML = '<option value="">! PARSE ERROR !</option>';
                elements.submitButton.disabled = true;
                elements.submitButton.textContent = '⚠️ Load Error';
                console.timeEnd("Model Fetch and Process"); // End timer on critical error
                return; // Stop further processing
            }
        } else {
             console.warn("No embedded model list data found (#model-list-data). Falling back to API fetch.");
        }

        // Fallback to API if no direct data was provided or parsing failed (though the catch above now stops it)
        console.log("Falling back to fetching models from API:", MODEL_LIST_URL);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(MODEL_LIST_URL, {
            signal: controller.signal,
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }

        const data = await response.json();
        console.log(`Successfully fetched ${data.length} models from API.`);
        handleModelListResponse(data); // Process API models

    } catch(e) {
        console.error('fetchModels Error (API Fallback or other issue):', e);
        elements.modelSelect.innerHTML = '<option value="">Error loading models</option>';
        setStatus(`Model Load Error: ${e.message}`, true, false);
        elements.submitButton.disabled = true;
        elements.submitButton.textContent = '⚠️ Load Error';
        console.timeEnd("Model Fetch and Process"); // End timer on error too
    }
}

/**
 * Process model list response and update UI
 */
function handleModelListResponse(models) {
    console.log(`handleModelListResponse: Processing ${models.length} models received.`);
    console.timeLog("Model Fetch and Process", "Entering handleModelListResponse"); // Log time

    // Cache the model data
    apiCache.models = models;
    apiCache.modelExpiry = Date.now() + 10 * 60 * 1000; // 10 min cache

    // Analyze model capabilities
    analyzeModelCapabilities(models);

    // Populate the select dropdown
    populateModelSelect(models); // This populates the dropdown
    selectDefaultModel(); // <<< KEEP THIS CALL HERE

    console.timeLog("Model Fetch and Process", "Exiting handleModelListResponse (population & default selection done)");
     // API case ends timer here implicitly via console.timeEnd in fetchModels success/error paths
}

/**
 * Analyzes and records capabilities of available models
 */
function analyzeModelCapabilities(models) {
    state.modelCapabilities = {};

    models.forEach(model => {
        const id = model.name;
        if (!id) return;

        // Extract metadata and capabilities - Refined Logic
        const lowerId = id.toLowerCase();
        const lowerDesc = model.description?.toLowerCase() || '';

        // Explicit Coder Check
        const isCoder = lowerId.includes('coder') ||
                      lowerDesc.includes('code generation') ||
                      lowerDesc.includes('coding assistant');

        // Explicit Reasoning Check (includes name-based inference)
        const hasReasoning = model.reasoning === true ||
                          lowerId.includes('reasoning') ||
                          lowerId.includes('think') || // Catches gemini-thinking
                          lowerId.includes('deepseek-r') || // Catches deepseek reasoning variants
                          lowerDesc.includes('reasoning') ||
                          lowerDesc.includes('complex tasks') ||
                          lowerDesc.includes('logic');

        // Vision Check
        const isVision = model.vision === true;

        // Audio Check
        const isAudio = model.audio === true; // Check for TTS/STT capabilities if relevant for chat models

        // Context Size Calculation (improved defaults)
        let contextSize = 4096; // Default fallback
        if (model.maxTokens) {
            contextSize = model.maxTokens;
        } else if (lowerId.includes('qwen')) {
             contextSize = 32768; // Qwen models generally have large context
        } else if (lowerId.includes('deepseek')) {
             contextSize = 16384; // Deepseek models often have large context
        } else if (lowerId.includes('gpt-4') || lowerId.includes('openai-large')) {
             contextSize = 8192; // Larger OpenAI models
        } else if (lowerId.includes('llama')) {
            contextSize = 8192; // Llama models
        } else if (lowerId.includes('mistral')) {
             contextSize = 16384;
        }


        // Record capabilities
        state.modelCapabilities[id] = {
            isCoder,
            hasReasoning,
            isVision,
            isAudio,
            contextSize,
            qualityScore: calculateModelQualityScore(model, { isCoder, hasReasoning, isVision }), // Pass analyzed caps
            provider: model.provider || 'unknown',
            baseModel: model.baseModel || false
        };
    });

    console.log("Model capabilities analyzed:", state.modelCapabilities);
}

/**
 * Calculates a quality score for model ranking based on known capabilities
 */
function calculateModelQualityScore(model, capabilities) { // Accept capabilities
    const id = model.name || '';
    const lowerId = id.toLowerCase();

    // Base scores for known models/families
    const baseScores = {
        'qwen-coder': 95,
        'deepseek-coder': 93,
        'deepseek-r1': 92,       // Reasoning variants
        'qwen-reasoning': 92,
        'deepseek-reasoner': 91,
        'openai-large': 88,      // GPT-4o
        'llama': 85,             // Llama 3 70B
        'openai-reasoning': 87,  // o3-mini
        'gemini-thinking': 86,   // Assume good reasoning
        'deepseek': 80,          // General Deepseek
        'qwen': 80,              // General Qwen
        'mistral': 78,
        'openai': 75,            // GPT-4o-mini
        'gemini': 72,            // Gemini Flash
        'phi': 70
    };

    // Find matching base score or use default
    let score = 50; // Default score
    let foundBase = false;
    for (const [modelPrefix, baseScore] of Object.entries(baseScores)) {
        if (lowerId.includes(modelPrefix)) {
            score = baseScore;
            foundBase = true;
            break;
        }
    }
    // If no prefix matched, check description for clues
    if (!foundBase) {
         if (model.description?.toLowerCase().includes('llama 3')) score = 85;
         else if (model.description?.toLowerCase().includes('qwen 2')) score = 80;
         else if (model.description?.toLowerCase().includes('gpt-4o')) score = 88;
    }


    // Adjust score based on analyzed capabilities
    if (capabilities.isCoder) score += 8;
    if (capabilities.hasReasoning) score += 10;
    if (capabilities.isVision) score += 2; // Small boost for vision
    if (model.baseModel === true) score += 3;

    // Boost specific models slightly if needed based on reputation
    if (lowerId === 'deepseek-r1-llama') score = Math.max(score, 90); // Ensure high score

    return Math.min(100, score); // Cap at 100
}

/**
 * Populates the model select dropdown with categorized models
 */
function populateModelSelect(models) {
    console.timeLog("Model Fetch and Process", "Entering populateModelSelect");
    elements.modelSelect.innerHTML = ''; // Clear existing options first

    // --- MODIFIED allowedModelIds to specific list ---
    const allowedModelIds = [
        'qwen-coder',        // Qwen 2.5 Coder 32B
        'deepseek-r1-llama', // DeepSeek R1 - Llama 70B
        'gemini-thinking',   // Gemini 2.0 Flash Thinking
        'openai',            // OpenAI GPT-4o-mini
        'openai-large',      // OpenAI GPT-4o
        'openai-reasoning'   // OpenAI o3-mini
    ];
    // --- END MODIFICATION ---
    console.log("populateModelSelect: Using specific allowedModelIds:", allowedModelIds);

    // Ensure models is an array before filtering
    if (!Array.isArray(models)) {
        console.error("populateModelSelect: Input 'models' is not an array! Received:", models);
        setStatus("Error: Invalid model data format.", true, false);
        elements.modelSelect.innerHTML = '<option value="">! FORMAT ERROR !</option>';
        console.timeEnd("Model Fetch and Process"); // End timer here too
        return; // Stop processing
    }

    const filteredModels = models.filter(m => {
        // Robust check: model exists, has a name, and the name is in allowed list
        const modelName = m?.name;
        const isAllowed = modelName && allowedModelIds.includes(modelName);
        // console.log(`Filtering model: ${modelName}. Allowed: ${isAllowed}`); // Verbose log if needed
        return isAllowed;
    });

    console.log(`populateModelSelect: Found ${filteredModels.length} models after filtering by specific allowedModelIds.`);
    if (filteredModels.length === 0) {
        console.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.warn("!!! populateModelSelect: No models matched the allowedModelIds list AFTER filtering. !!!");
        console.warn("!!! This usually means the parsed models (from index.html or API) don't contain any of the allowed IDs. !!!");
        console.warn("!!! Parsed Models Preview:", models.slice(0, 5).map(m => m?.name)); // Log names of first 5 parsed models
        console.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        elements.modelSelect.innerHTML = '<option value="">! NO MATCHING MODELS !</option>';
        setStatus("Error: No allowed models found after filtering.", true, false);
        elements.submitButton.disabled = true;
        elements.submitButton.textContent = '⚠️ No Models';
        console.timeEnd("Model Fetch and Process"); // End timer here too
        return; // Stop if no models to show
    }

    // Categorize models (using the filtered list now)
    const coderModels = [];
    const reasoningModels = [];
    const visionModels = [];
    const audioModels = [];
    const generalModels = [];

    filteredModels
        .forEach(m => {
            const id = m.name;
            if (!id) {
                 console.warn("Skipping model with no name:", m);
                 return;
            }
            console.log(`Processing filtered model for dropdown: ${id}`); // Log each model being added
            const capabilities = state.modelCapabilities[id];
            if (!capabilities) {
                console.warn(`No capabilities found for model ${id} during population, using defaults.`);
            }
            const effectiveCapabilities = capabilities || { /* defaults */ };
            console.log(`  Capabilities for ${id}:`, effectiveCapabilities);

            // Assign to categories with priority: Coder > Reasoning > Vision > General
            if (effectiveCapabilities.isCoder) {
                coderModels.push({ model: m, score: effectiveCapabilities.qualityScore || 0 });
                 // Also add to reasoning if it has both capabilities
                 if(effectiveCapabilities.hasReasoning) {
                    reasoningModels.push({ model: m, score: effectiveCapabilities.qualityScore || 0 });
                 }
            } else if (effectiveCapabilities.hasReasoning) {
                reasoningModels.push({ model: m, score: effectiveCapabilities.qualityScore || 0 });
            } else if (effectiveCapabilities.isVision) {
                visionModels.push({ model: m, score: effectiveCapabilities.qualityScore || 0 });
            } else if (effectiveCapabilities.isAudio) {
                 audioModels.push({ model: m, score: effectiveCapabilities.qualityScore || 0 });
            } else {
                // Only add to general if not already categorized
                if (!coderModels.some(item => item.model.name === id) &&
                    !reasoningModels.some(item => item.model.name === id) &&
                    !visionModels.some(item => item.model.name === id) &&
                    !audioModels.some(item => item.model.name === id)) {
                    generalModels.push({ model: m, score: effectiveCapabilities.qualityScore || 0 });
                }
            }
        });

    // Sort each category by quality score (descending)
    const sortByScore = (a, b) => (b.score || 0) - (a.score || 0);
    coderModels.sort(sortByScore);
    // Ensure reasoning models are unique if added from coder category too
    const uniqueReasoningModels = Array.from(new Map(reasoningModels.map(item => [item.model.name, item])).values());
    uniqueReasoningModels.sort(sortByScore);
    visionModels.sort(sortByScore);
    audioModels.sort(sortByScore);
    generalModels.sort(sortByScore);

    // Helper to create option groups
    function addOptionGroup(label, categoryModels) {
        if (categoryModels.length === 0) {
             console.log(`Skipping option group "${label}" - no models.`);
             return;
        }
        console.log(`Adding option group "${label}" with ${categoryModels.length} models.`);

        const group = document.createElement('optgroup');
        group.label = label; // Use the provided label directly

        categoryModels.forEach(({ model }) => {
            const id = model.name;
            if (!id) return;

            const o = document.createElement('option');
            o.value = id;

            let displayName = model.description || id;
            // Re-check capabilities for symbols, ensuring consistency
            const capabilities = state.modelCapabilities[id] || {};

            // Add symbols based on actual capabilities
            const symbols = [];
            if (capabilities.isCoder) symbols.push('🧑‍💻');
            if (capabilities.hasReasoning) symbols.push('🧠');
            if (capabilities.isVision) symbols.push('👁️');
            if (capabilities.isAudio) symbols.push('🔊');

            if (symbols.length > 0) {
                displayName += ` ${symbols.join('')}`;
            }

            o.textContent = displayName;
            group.appendChild(o);
            console.log(`  Adding option: ${model.name}`); // Log added option
        });

        elements.modelSelect.appendChild(group);
    }

    // Add the categorized model groups with refined labels
    addOptionGroup('🧑‍💻 Coding Models', coderModels);
    addOptionGroup('🧠 Reasoning Models', uniqueReasoningModels); // Use unique list
    addOptionGroup('👁️ Vision Models', visionModels);
    // addOptionGroup('🔊 Audio Models', audioModels); // Keep commented if no audio chat models yet
    addOptionGroup('📝 General Chat Models', generalModels);

    console.log(`Populated model select with specifically filtered list. Categories: Coders(${coderModels.length}), Reasoning(${uniqueReasoningModels.length}), Vision(${visionModels.length}), General(${generalModels.length})`);

    console.timeLog("Model Fetch and Process", "Finished populating select element");
}

/**
 * Pre-selects the best model for code generation
 */
function selectDefaultModel() {
    console.log("selectDefaultModel: Attempting to select default model...");
    console.log(`selectDefaultModel: Number of options in dropdown = ${elements.modelSelect.options.length}`);
    const preferredModels = [
        'qwen-coder',
        'deepseek-r1-llama',
        'openai-large',       // GPT-4o (Strong all-rounder)
        'gemini-thinking',    // Gemini Flash Thinking
        'openai',             // GPT-4o-mini
    ];
    console.log("selectDefaultModel: Preferred models order:", preferredModels);

    let modelSelected = false;
    for (const modelId of preferredModels) {
        // Find option *within the populated select*
        const option = Array.from(elements.modelSelect.options).find(o => o.value === modelId);
        if (option) {
            elements.modelSelect.value = modelId;
            console.log(`selectDefaultModel: Successfully selected preferred model found in dropdown: ${modelId}`);
            // Trigger change event to update button text etc.
            elements.modelSelect.dispatchEvent(new Event('change'));
            modelSelected = true;
            elements.submitButton.disabled = false; // Ensure button is enabled
            return; // Exit once a preferred model is selected
        } else {
             console.log(`selectDefaultModel: Preferred model '${modelId}' not found in dropdown.`);
        }
    }

    // Fallback logic if no preferred model was found in the dropdown
    if (!modelSelected && elements.modelSelect.options.length > 0) {
         console.log("selectDefaultModel: No preferred model found, attempting fallback...");
         // Find the *first* selectable option (value is not empty, not in optgroup if possible)
         const firstSelectableOption = Array.from(elements.modelSelect.options).find(
             o => o.value && o.value !== "" && !o.disabled && (!o.parentElement || o.parentElement.tagName !== 'OPTGROUP' || elements.modelSelect.options.length === 1)
         );

         if (firstSelectableOption) {
             elements.modelSelect.value = firstSelectableOption.value;
             console.log(`selectDefaultModel: Selected first available model as fallback: ${firstSelectableOption.value}`);
             elements.modelSelect.dispatchEvent(new Event('change'));
             modelSelected = true;
              elements.submitButton.disabled = false; // Ensure button is enabled
              return; // Exit after fallback selection
         } else {
              console.warn("selectDefaultModel: Fallback failed - could not find any selectable option.");
         }
    }

    // Final check if *still* no model is selected
    if (!modelSelected) {
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.error("!!! selectDefaultModel: FAILED to select ANY model. !!!");
        console.error("!!! Dropdown might be empty or contain only unselectable options. !!!");
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        setStatus("Error: No selectable models available.", true, false);
        elements.submitButton.disabled = true;
        elements.submitButton.textContent = "⚠️ No Model Available";
    }
}

/**
 * Calls the Pollinations API with enhanced error handling and smart retry logic
 * @param {string} model - The model ID to use
 * @param {Array} messages - Array of message objects for the API call
 * @param {string} purpose - Purpose description for logging
 * @param {Object} options - Optional parameters (temperature, maxTokens, top_p, reasoning_effort, etc.)
 * @returns {Promise<string>} - The API response content
 */
async function callPollinationsAPI(model, messages, purpose = "task", options = {}) {
    // Setup retry payload
    state.retryPayload = { 
        isAvailable: false, 
        model, 
        messages, 
        purpose, 
        operationType: options.operationType || null, 
        failedStepIndex: options.failedStepIndex || -1 
    };
    
    // Track statistics
    state.sessionStats.apiCalls++;
    
    // Truncate messages for logging
    const truncatedMsgs = messages.map(m => ({
        ...m, 
        content: m.content.substring(0, 2000) + (m.content.length > 2000 ? '...' : '')
    }));
    
    // Generate a hash for the request to potentially use cached responses
    const requestHash = simpleHash(JSON.stringify({ model, messages: truncatedMsgs, purpose }));
    
    // Check if we have a consistent seed for this type of request
    let seed = null;
    if (state.preferredSeeds[requestHash]) {
        seed = state.preferredSeeds[requestHash];
        console.log(`Using preferred seed ${seed} for ${purpose}`);
    }
    
    console.log(`API Call: ${purpose}`, { model, requestHash, seed, options, messages: truncatedMsgs }); // Log options too
    
    try {
        // Check if we have a cached response for very similar requests (for non-critical operations)
        if (options.allowCaching && apiCache.lastResponses.has(requestHash)) {
            const cachedResponse = apiCache.lastResponses.get(requestHash);
            console.log(`Using cached response for ${purpose} (hash: ${requestHash})`);
            state.retryPayload.isAvailable = false;
            return cachedResponse;
        }
        
        // Add exponential backoff for retries
        const maxRetries = options.maxRetries || 3;
        let retryCount = 0;
        let lastError = null;
        let responseContent = null;
        
        // Add jitter to retry backoff
        const getBackoffTime = (retry) => {
            const base = Math.pow(2, retry) * 1000;
            const jitter = Math.random() * 500;
            return base + jitter;
        };
        
        while (retryCount <= maxRetries) {
            try {
                // Create an AbortController for timeout handling
                const controller = new AbortController();
                const timeoutMs = options.timeout || 120000; // 2-minute default timeout
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                
                // Build request payload with smart defaults and new options
                const payload = {
                    model,
                    messages,
                    referrer: REFERRER_ID,
                    seed: seed || undefined,
                    temperature: options.temperature,
                    max_tokens: options.maxTokens,
                    private: true,
                    // --- NEW/Optional Parameters ---
                    top_p: options.top_p, // Will be undefined if not passed in options
                    reasoning_effort: options.reasoning_effort // Will be undefined if not passed
                };
                
                // Remove undefined values from payload
                Object.keys(payload).forEach(key => {
                    if (payload[key] === undefined || payload[key] === null) { // Check for null too
                        delete payload[key];
                    }
                });
                
                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                // --- Check for CORS explicitly BEFORE trying to read body ---
                // Although the error is thrown before this, checking response type can be informative
                if (response.type === 'opaque') {
                     // This would happen with mode: 'no-cors', which we are not using.
                     console.error(`API Error (${purpose}): Opaque response received. This usually indicates a CORS issue prevented accessing the actual response.`);
                     throw new Error(`API Error (${purpose}): Opaque response received (likely CORS issue).`);
                }
                 // A direct CORS failure often throws before we even get here, caught by the outer try/catch

                const body = await response.text(); // Read body only after confirming not opaque
                
                if (!response.ok) {
                    let errDets = `Status ${response.status}. Body: ${body}`;
                    
                    try {
                        errDets = JSON.stringify(JSON.parse(body).error || JSON.parse(body));
                    } catch(e) {}
                    
                    state.retryPayload.isAvailable = true;
                    // Check if the error is specifically a CORS-related status code, although usually caught earlier
                    if (response.status === 0 || response.status === 403 || response.status === 401) {
                         throw new Error(`API Error (${purpose}). Possible CORS or Auth issue. ${errDets}`);
                    } else {
                        throw new Error(`API Error (${purpose}). ${errDets}`);
                    }
                }
                
                const data = JSON.parse(body);
                console.log(`API OK (${purpose}):`, data);
                
                responseContent = data.choices?.[0]?.message?.content;
                
                if (typeof responseContent !== 'string') {
                    console.error("Invalid API content:", data.choices?.[0]?.message);
                    throw new Error(`API Error (${purpose}): Invalid content.`);
                }
                
                // Capture tokens for statistics
                if (data.usage && data.usage.completion_tokens) {
                    state.sessionStats.responseTokens += data.usage.completion_tokens;
                }
                
                // If this worked well, remember the seed for similar requests
                if (data.seed && !state.preferredSeeds[requestHash]) {
                    state.preferredSeeds[requestHash] = data.seed;
                    console.log(`Saved seed ${data.seed} for future ${purpose} requests`);
                }
                
                // Cache this response for potential reuse with similar requests
                if (options.allowCaching) {
                    apiCache.lastResponses.set(requestHash, responseContent);
                    // Keep cache size reasonable
                    if (apiCache.lastResponses.size > 20) {
                        const oldestKey = apiCache.lastResponses.keys().next().value;
                        apiCache.lastResponses.delete(oldestKey);
                    }
                }
                
                state.retryPayload.isAvailable = false;
                state.sessionStats.successfulCalls++;
                return responseContent;
                
            } catch (error) {
                lastError = error;
                console.warn(`API call attempt ${retryCount + 1} failed:`, error.message); // Log error for each attempt

                // Check if it's a timeout, network error, or likely CORS failure
                const isNetworkOrCorsError = error.name === 'AbortError' ||
                                            error.message.includes('Failed to fetch') || // Generic network/CORS
                                            error.message.includes('NetworkError') ||
                                            error.message.includes('CORS') ||
                                            error.message.includes('opaque') ||
                                            error.message.includes('timeout') ||
                                            error.message.includes('429'); // Also retry on rate limiting

                if (isNetworkOrCorsError) {
                    retryCount++;
                    if (retryCount <= maxRetries) {
                        const backoffTime = getBackoffTime(retryCount);
                        console.warn(`Retrying API call in ${backoffTime/1000}s...`);
                        await delay(backoffTime);
                        // Model fallback logic remains the same
                        // ...
                        continue; // Continue to the next retry iteration
                    } else {
                        console.error(`API call failed after ${maxRetries + 1} attempts.`);
                        // Explicitly mention CORS if it's likely the cause
                        if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
                           lastError = new Error(`API call failed after ${maxRetries + 1} attempts: Network or CORS error. Check browser console and network tab. Original: ${error.message}`);
                        } else {
                           lastError = new Error(`API call failed after ${maxRetries + 1} attempts. Original: ${error.message}`);
                        }
                    }
                }

                // For other errors or if we've exhausted retries
                throw lastError; // Re-throw the last encountered error
            }
        }
        
       // This part should ideally not be reached if the loop logic is correct, but added for safety
       throw lastError || new Error("API call failed after exhausting retries.");

    } catch (error) {
        console.error(`API call error (${purpose}):`, error); // Final error log
        state.sessionStats.failedCalls++;

        // Ensure retry payload is available for the user to manually trigger
        state.retryPayload.isAvailable = true;

        // Adjust the error message slightly for clarity
        throw new Error(`API call failed (${purpose}): ${error.message}`);
    }
}

/**
 * Gets a fallback model when primary model fails
 */
function getFallbackModel(currentModel, purpose) {
    // Get all available models
    const models = apiCache.models || [];
    
    // Filter to get only chat/completion models
    const availableModels = models.filter(m => 
        m && (m.type === 'chat' || m.type === 'completion')
    ).map(m => m.id || m.name).filter(Boolean);
    
    // Skip if we don't have alternatives
    if (availableModels.length <= 1) return null;
    
    // For code-related purposes, prioritize coder models
    if (purpose.toLowerCase().includes('code') || 
        purpose.toLowerCase().includes('generation') || 
        purpose.toLowerCase().includes('enhancement')) {
        
        // Try to find a coder model different from current
        for (const modelId of Object.keys(state.modelCapabilities)) {
            const capabilities = state.modelCapabilities[modelId];
            if (capabilities.isCoder && 
                modelId !== currentModel && 
                availableModels.includes(modelId)) {
                return modelId;
            }
        }
    }
    
    // For general fallback, find a different quality model
    const fallbackCandidates = availableModels
        .filter(modelId => modelId !== currentModel)
        .sort((a, b) => {
            const scoreA = state.modelCapabilities[a]?.qualityScore || 0;
            const scoreB = state.modelCapabilities[b]?.qualityScore || 0;
            return scoreB - scoreA; // Sort by descending score
        });
    
    return fallbackCandidates[0] || null;
}

/**
 * Handles the download code button click
 */
async function handleDownloadCode() {
    if (!window.JSZip || !window.saveAs) {
        setStatus("Download library not loaded.", true, false);
        console.error("JSZip or FileSaver not found. Make sure the libraries are included.");
        return;
    }

    elements.downloadCodeButton.disabled = true;
    elements.downloadCodeButton.textContent = '📦 Zipping...';
    setStatus("Preparing download...", false, true, 'thinking'); // Use thinking purpose

    try {
        const htmlContent = editors.html ? editors.html.getValue() : '';
        const cssContent = editors.css ? editors.css.getValue() : '';
        const jsContent = editors.js ? editors.js.getValue() : '';

        const zip = new JSZip();
        zip.file("index.html", htmlContent);
        zip.file("style.css", cssContent);
        zip.file("script.js", jsContent);

        // Add a README file
        const readmeContent = `Tauris AI Coder Project\nGenerated on: ${new Date().toLocaleString()}\n\nOriginal Prompt: ${state.lastUserPrompt || 'N/A'}\n\nFiles:\n- index.html\n- style.css\n- script.js`;
        zip.file("README.txt", readmeContent);


        const zipBlob = await zip.generateAsync({ type: "blob" });

        // Use FileSaver.js to trigger the download
        saveAs(zipBlob, "tauris-ai-coder-project.zip");

        setStatus("Download ready!", false, false);

    } catch (error) {
        console.error("Error creating zip file:", error);
        setStatus("Error preparing download.", true, false);
    } finally {
        elements.downloadCodeButton.textContent = '💾 Download Code';
        // Re-enable based on line count
        updateLineCount();
         // Make sure loading indicator is off if setStatus wasn't called with isLoading=false
         setStatus(elements.statusTextSpan.textContent, elements.statusContainer.classList.contains('error'), false);
    }
}

// --- Event Handlers ---

/**
 * Toggles maximize/minimize layout for the preview area and code editor.
 */
function togglePreviewMaximize() {
    // Check if elements exist, especially mainContent
    if (!elements.mainContent || !elements.maximizeToggleButton) {
         console.error("Required elements for maximizing preview not found.");
         return;
    }

    // Check if currently maximized by looking for the class on mainContent
    const isMaximized = elements.mainContent.classList.contains('preview-maximized');
    const iconSpan = elements.maximizeToggleButton.querySelector('span');

    if (isMaximized) {
        // Minimize: Remove class from mainContent
        elements.mainContent.classList.remove('preview-maximized');
        elements.maximizeToggleButton.title = "Maximize Preview"; // Update title
        if (iconSpan) {
             iconSpan.classList.remove('icon-minimize');
             iconSpan.classList.add('icon-maximize'); // Switch icon
        }
        console.log("Preview minimized.");
    } else {
        // Maximize: Add class to mainContent
        elements.mainContent.classList.add('preview-maximized');
        elements.maximizeToggleButton.title = "Minimize Preview"; // Update title
         if (iconSpan) {
             iconSpan.classList.remove('icon-maximize');
             iconSpan.classList.add('icon-minimize'); // Switch icon
         }
        console.log("Preview maximized.");
        // Optional: Scroll to top might be nice if layout shifts significantly
        // window.scrollTo(0, 0);
    }
}

// Initialize the application
async function initApp() {
    console.log("Initializing application");
    console.time("App Init"); // Start overall init timer
    console.log("Using API version:", API_VERSION);
    
    // --- Initialize CodeMirror Editors ---
    const editorOptions = {
        lineNumbers: true,
        theme: "eclipse", // Match the theme included in index.html
        indentUnit: 4,
        tabSize: 4,
        lineWrapping: true,
        // Add more options as needed (e.g., keymaps, linting later)
    };

    try {
        editors.html = CodeMirror.fromTextArea(elements.htmlCodeTextarea, {
            ...editorOptions,
            mode: "htmlmixed"
        });
        editors.css = CodeMirror.fromTextArea(elements.cssCodeTextarea, {
            ...editorOptions,
            mode: "css"
        });
        editors.js = CodeMirror.fromTextArea(elements.jsCodeTextarea, {
            ...editorOptions,
            mode: "javascript"
        });

        // Add change listeners to update line count dynamically
        const updateOnChange = () => updateLineCount();
        editors.html.on('change', updateOnChange);
        editors.css.on('change', updateOnChange);
        editors.js.on('change', updateOnChange);

        console.log("CodeMirror editors initialized.");
    } catch (error) {
        console.error("Failed to initialize CodeMirror:", error);
        setStatus("Error initializing code editors.", true, false);
        // Optionally hide textareas or show an error message if CM fails
    }
    // --- End CodeMirror Initialization ---

    // Setup event listeners
    elements.submitButton.addEventListener('click', handleSubmit);
    elements.clearButton.addEventListener('click', handleClear);
    elements.regenerateButton.addEventListener('click', handleRegenerate);
    elements.checkFixButton.addEventListener('click', handleCheckAndFixCode);
    elements.stopButton.addEventListener('click', handleStopExecution);
    if (elements.maximizeToggleButton) {
        elements.maximizeToggleButton.addEventListener('click', togglePreviewMaximize);
    }
    if (elements.downloadCodeButton) { // Add listener for download button
        elements.downloadCodeButton.addEventListener('click', handleDownloadCode);
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && elements.mainContent?.classList.contains('preview-maximized')) {
            console.log("Escape key pressed, minimizing preview.");
            togglePreviewMaximize();
        }
    });
    
    // Listener for the research mode toggle
    if (elements.researchModeToggle) {
        elements.researchModeToggle.addEventListener('change', (e) => {
            state.isResearchModeEnabled = e.target.checked;
            console.log(`Research Mode ${state.isResearchModeEnabled ? 'Enabled' : 'Disabled'}`);
            // Optionally update status or button text
             setStatus(`Research Mode ${state.isResearchModeEnabled ? 'enabled' : 'disabled'}.`, false, false);
             setTimeout(() => setStatus('Ready.'), 2000); // Reset status after 2 seconds
        });
         // Initialize state based on checkbox default (usually unchecked)
         state.isResearchModeEnabled = elements.researchModeToggle.checked;
    }
    
    // Add model change listener to update button text based on selection
    elements.modelSelect.addEventListener('change', (e) => {
        const selectedModel = e.target.value;
        if (selectedModel) {
            const capabilities = state.modelCapabilities[selectedModel] || {};
            console.log(`Selected model: ${selectedModel}`, capabilities);

            // Adjust UI based on model capabilities
            let buttonText = "🚀 Generate / Refine"; // Default
            if (capabilities.isCoder) {
                buttonText = "🧑‍💻 Generate Code";
            } else if (capabilities.hasReasoning) {
                buttonText = "🧠 Generate / Plan";
            }
            elements.submitButton.textContent = buttonText;
        } else {
            elements.submitButton.textContent = "🚀 Select Model First";
        }
    });
    
    // Initial state setup
    elements.planAreaDiv.style.display = 'none';
    elements.regenerateButton.style.display = 'none';
    
    // Fetch models and update UI
    await fetchModels(); // This now calls selectDefaultModel internally
    console.timeLog("App Init", "fetchModels completed");

    updatePreview();
    setStatus('Ready. Select a model and describe your project!', false, false);
    console.timeEnd("App Init"); // End overall init timer
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initApp);
