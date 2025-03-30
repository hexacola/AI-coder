# Tauris AI Coder - XP Context Agent (v11)

## Description

Tauris AI Coder is an AI-powered web development tool designed to rapidly generate and enhance web applications. It features a Windows XP-inspired interface and leverages large language models (LLMs) via the Pollinations.AI API to create HTML, CSS, and JavaScript code based on user prompts.

The application follows a workflow where an initial functional core is generated, followed by an AI-generated enhancement plan. The AI then executes these enhancement steps sequentially, allowing for iterative development and refinement of complex applications within a Single Page Application (SPA) architecture.

## Features

*   **AI Code Generation:** Input a description, and the AI generates the initial HTML, CSS, and JavaScript.
*   **Model Selection:** Choose from various LLMs provided by Pollinations.AI, categorized by capabilities (Coding, Reasoning, General).
*   **Enhancement Planning:** After initial generation, the AI proposes a step-by-step plan for improving the application.
*   **Automated Enhancement:** The AI executes the enhancement plan, applying changes iteratively.
*   **Code Refinement:** Submit new prompts to refine or modify the existing generated code.
*   **Live Preview:** See the generated web application render in real-time within an iframe.
*   **SPA Focus:** Designed primarily to generate and work with Single Page Applications.
*   **Syntax Highlighting:** CodeMirror integration provides syntax highlighting for HTML, CSS, and JavaScript editors.
*   **Line Count:** Displays the total lines of code across HTML, CSS, and JS editors.
*   **Code Download:** Download the generated HTML, CSS, and JS files as a zip archive.
*   **Internet Research Mode (Optional):** Utilizes the `searchgpt` model to gather best practices and ideas from the internet related to the user's prompt before generation.
*   **XP-Themed Interface:** A nostalgic user interface inspired by Windows XP.
*   **Error Handling & Retry:** Basic error handling for API calls with a retry mechanism for failed operations.
*   **Stop Execution:** Ability to stop the enhancement process.
*   **Maximize Preview:** Option to expand the live preview area while keeping the code editor visible.

## Technologies Used

*   **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
*   **AI Backend:** [Pollinations.AI API](https://pollinations.ai/) (Specifically the OpenAI-compatible chat completions endpoint)
*   **Code Editor:** [CodeMirror](https://codemirror.net/)
*   **File Zipping (for Download):** [JSZip](https://stuk.github.io/jszip/)
*   **File Saving (for Download):** [FileSaver.js](https://github.com/eligrey/FileSaver.js/)

## Usage

1.  **Select Model:** Choose an AI model from the dropdown. Models are categorized by strengths (Coding 🧑‍💻, Reasoning 🧠, etc.).
2.  **Describe Project:** Enter a detailed description of the web application you want to create or the refinement you want to apply to existing code. For complex initial requests (e.g., using an API), provide necessary details or context (like the API documentation text).
3.  **(Optional) Enable Internet Research:** Check the box to allow the AI to perform a web search for relevant best practices before generating code.
4.  **Generate/Refine:**
    *   If the code editors are empty, click "Generate Code" (or similar) to create the initial application.
    *   If code exists, click "Generate / Refine" to apply your prompt as a modification request.
5.  **Enhancement Plan:** After initial generation, review the AI-proposed enhancement plan.
6.  **Enhancement Execution:** The AI will automatically execute the plan steps, updating the code and preview. You can use the "Stop Execution" button if needed.
7.  **Interact & Refine:** View the result in the Live Preview. Use the "Check & Fix Code" button for automated checks or enter new prompts to further refine the application.
8.  **Download:** Use the "Download Code" button to save the current HTML, CSS, and JS files.

## API Reference

This tool primarily uses the `POST https://text.pollinations.ai/openai` endpoint. Refer to the [Pollinations.AI API Documentation](https://pollinations.ai/) (or the provided `APIDOCS.md`) for details on available models and API parameters. The `searchgpt` model is used when Internet Research is enabled.

## License

*(You can add license information here if applicable, e.g., MIT License)* 