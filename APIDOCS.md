Pollinations.AI API Documentation
World's Most Accessible Open GenAI Platform 🚀 Text, Image & Audio APIs direct integration (no signup)

Quickstart
Click the links below to see examples in your browser:

Draw 🖌️: https://image.pollinations.ai/prompt/pollinations_logo
Ask ❓: https://text.pollinations.ai/why_you_should_donate_to_pollinations_ai
Search 🔍: https://text.pollinations.ai/what_are_the_last_pollinations_ai_news?model=searchgpt
Hear 🗣️: https://text.pollinations.ai/respond_with_a_small_hypnosis_urging_to_donate_to_pollinations_its_a_joke?model=openai-audio&voice=nova
Summary / Navigation
Pollinations.AI API Documentation
Quickstart
Summary / Navigation
Generate Image API 🖼️
Text-To-Image (GET) 🖌️
List Available Image Models 📜
Generate Text API 📝
Text-To-Text (GET) 🗣️
Text & Multimodal (OpenAI Compatible POST) 🧠💬🖼️🎤⚙️
Vision Capabilities (Image Input) 🖼️➡️📝
Speech-to-Text Capabilities (Audio Input) 🎤➡️📝
Function Calling ⚙️
List Available Text Models 📜
Generate Audio API 🎵
Text-to-Speech (GET) 📝➡️🎙️
Text-to-Speech (POST - OpenAI Compatible) 📝➡️🎙️
MCP Server for AI Assistants 🤖🔧
React Hooks ⚛️
Real-time Feeds API 🔄
Image Feed 🖼️📈
Text Feed 📝📈
Referrer 🔗
API Update (starting 2025.03.31) 📅
Special Bee ✅🐝🍯
License 📜
Generate Image API 🖼️
Text-To-Image (GET) 🖌️
GET https://image.pollinations.ai/prompt/{prompt}

Generates an image based on a text description.

Parameters:

Parameter	Required	Description	Default
prompt	Yes	Text description of the image. Should be URL-encoded.	
model	No	Model for generation. See Available Image Models.	flux
seed	No	Seed for reproducible results.	
width	No	Width of the generated image.	1024
height	No	Height of the generated image.	1024
nologo	No	Set to true to disable the Pollinations logo overlay.	false
private	No	Set to true to prevent the image from appearing in the public feed.	false
enhance	No	Set to true to enhance the prompt using an LLM for more detail.	false
safe	No	Set to true for strict NSFW filtering (throws error if detected).	false
referrer	No*	Referrer URL/Identifier. See Referrer Section.	
Return: Image file (typically JPEG) 🖼️

Rate Limit (per IP): 1 concurrent request / 5 sec interval.

Code Examples: Generate Image (GET)
List Available Image Models 📜
GET https://image.pollinations.ai/models

Description: Returns a list of available models for the Image Generation API.

Return: JSON list of model identifiers.

Code Examples: List Image Models
Generate Text API 📝
Text-To-Text (GET) 🗣️
GET https://text.pollinations.ai/{prompt}

Generates text based on a simple prompt.

Parameters:

Parameter	Required	Description	Options	Default
prompt	Yes	Text prompt for the AI. Should be URL-encoded.		
model	No	Model for generation. See Available Text Models.	openai, mistral, etc.	openai
seed	No	Seed for reproducible results.		
json	No	Set to true to receive the response formatted as a JSON string.	true / false	false
system	No	System prompt to guide AI behavior. Should be URL-encoded.		
stream	No	Set to true for streaming responses via Server-Sent Events (SSE). Handle data: chunks.	true / false	false
private	No	Set to true to prevent the response from appearing in the public feed.	true / false	false
referrer	No*	Referrer URL/Identifier. See Referrer Section.		
Return: Generated text (plain text or JSON string if json=true) 📝. If stream=true, returns an SSE stream.

Rate Limit (per IP): 1 concurrent request / 3 sec interval.

Code Examples: Generate Text (GET)
Text & Multimodal (OpenAI Compatible POST) 🧠💬🖼️🎤⚙️
POST https://text.pollinations.ai/openai

Provides an OpenAI-compatible endpoint supporting:

Chat Completions (Text Generation)
Vision (Image Input Analysis)
Speech-to-Text (Audio Input Transcription)
Function Calling
Streaming Responses (for Text Generation)
Follows the OpenAI Chat Completions API format for inputs where applicable.

Request Body (JSON):

{
  "model": "openai-audio",
  "messages": [
    {
      "role": "user",
      "content": "Convert this longer text into speech using the selected voice. This method is better for larger inputs."
    }
  ],
  "voice": "nova",
  "private": false
}
Common Body Parameters:

Parameter	Description	Notes
messages	An array of message objects (role: system, user, assistant). Used for Chat, Vision, STT.	Required for most tasks.
model	The model identifier. See Available Text Models.	Required. e.g., openai (Chat/Vision), openai-large (Vision), claude-hybridspace (Vision), openai-audio (STT).
seed	Seed for reproducible results (Text Generation).	Optional.
stream	If true, sends partial message deltas using SSE (Text Generation). Process chunks as per OpenAI streaming docs.	Optional, default false.
jsonMode / response_format	Set response_format={ "type": "json_object" } to constrain text output to valid JSON. jsonMode: true is a legacy alias.	Optional. Check model compatibility.
tools	A list of tools (functions) the model may call (Text Generation). See OpenAI Function Calling Guide.	Optional.
tool_choice	Controls how the model uses tools.	Optional.
private	Set to true to prevent the response from appearing in the public feed.	Optional, default false.
reasoning_effort	Sets reasoning effort for o3-mini model (Text Generation).	Optional. Options: low, medium, high.
Code Examples: Basic Chat Completion (POST)
Code Examples: Streaming Response (POST)
Vision Capabilities (Image Input) 🖼️➡️📝
Models: openai, openai-large, claude-hybridspace (check List Text Models for updates).
How: Include image URLs or base64 data within the content array of a user message.
{
  "model": "openai",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Describe this image:" },
        {
          "type": "image_url",
          "image_url": { "url": "data:image/jpeg;base64,{base64_string}" }
        }
      ]
    }
  ],
  "max_tokens": 300
}
Details: See OpenAI Vision Guide.
Return: Standard OpenAI chat completion JSON response containing the text analysis.
Code Examples: Vision (Image Input)
Speech-to-Text Capabilities (Audio Input) 🎤➡️📝
Model: openai-audio
How: Provide base64 audio data and format within the content array of a user message.
{
  "model": "openai-audio",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Transcribe this:" },
        {
          "type": "input_audio",
          "input_audio": { "data": "{base64_audio_string}", "format": "wav" }
        }
      ]
    }
  ]
}
Details: See OpenAI Audio Guide.
Return: Standard OpenAI chat completion JSON response containing the transcription in the message content.
Code Examples: Speech-to-Text (Audio Input)
Function Calling ⚙️
Models: Check compatibility (e.g., openai models often support this).
How: Define available functions in the tools parameter. The model may respond with a tool_calls object in the JSON response, which your code needs to handle.
Details: See OpenAI Function Calling Guide.
Return: Standard OpenAI chat completion JSON response, potentially including tool_calls.
Code Examples: Function Calling (Conceptual)
General Return Format (POST /openai for Text/Vision/STT/Functions):

OpenAI-style chat completion response object (JSON). 🤖
Rate Limits: (Inherits base text API limits, potentially subject to specific model constraints)

List Available Text Models 📜
GET https://text.pollinations.ai/models

Description: Returns a list of available models for the Text Generation API, including those supporting vision, audio (STT/TTS), and specific features. Also lists available voices for TTS.

Return: JSON list/object containing model identifiers and details (including voices).

Code Examples: List Text Models
Generate Audio API 🎵
Provides methods for generating audio via Text-to-Speech (TTS).

Text-to-Speech (GET) 📝➡️🎙️
GET https://text.pollinations.ai/{prompt}?model=openai-audio&voice={voice}

Generates speech audio from text using a simple GET request. Best suited for short text snippets due to URL length limitations.

Parameters:

Parameter	Required	Description	Options	Default
prompt	Yes	Text to synthesize. Must be URL-encoded.		
model	Yes	Must be openai-audio.	openai-audio	openai-audio
voice	No	Voice to use. See available voices via List Text Models.	e.g., alloy, echo, fable, onyx, nova, shimmer	alloy
Return: Audio file (MP3 format, Content-Type: audio/mpeg) 🎧

Rate Limits: (Inherits base text API limits)

Code Examples: Text-to-Speech (GET)
Text-to-Speech (POST - OpenAI Compatible) 📝➡️🎙️
POST https://text.pollinations.ai/openai

Generates speech audio from text using the OpenAI compatible endpoint. This method is suitable for longer text inputs compared to the GET method.

Model: Must use openai-audio.
How: Send the text to be synthesized within the messages array and specify the desired voice in the JSON body.
Request Body (JSON):

{
  "model": "openai-audio",
  "messages": [
    {
      "role": "user",
      "content": "Convert this longer text into speech using the selected voice. This method is better for larger inputs."
    }
  ],
  "voice": "nova",
  "private": false
}
Parameters (in Body):

Parameter	Required	Description	Default
model	Yes	Must be openai-audio.	
messages	Yes	Standard OpenAI message array, containing the text to speak in the content of a user role message.	
voice	Yes	Voice to use. See available voices via List Text Models.	alloy
private	No	Set to true to prevent the response from appearing in the public feed.	false
Return: Audio file (MP3 format, Content-Type: audio/mpeg) 🎧. The response body is the audio data, not JSON.

Rate Limits: (Inherits base text API limits)

Code Examples: Text-to-Speech (POST)
MCP Server for AI Assistants 🤖🔧
Pollinations provides an MCP (Model Context Protocol) server that enables AI assistants (like Claude via Anthropics' tool use feature) to generate images and audio directly.

Server Name: pollinations-multimodal-api
Image Tools:
generateImageUrl: Generate an image URL from a text prompt.
generateImage: Generate an image and return the base64-encoded data.
listImageModels: List available image generation models.
Audio Tools:
respondAudio: Generate an audio response to a text prompt and play it (client-side execution assumed).
sayText: Generate speech that says the provided text verbatim.
listAudioVoices: List available voices for audio generation.
Text Tools:
listTextModels: List available text generation models.
General Tools:
listModels: List all available models (can filter by type).
For installation and usage instructions, see the MCP Server Documentation (Link placeholder - requires actual link). (Code examples are specific to MCP client implementations and are best suited for the dedicated MCP documentation.)

React Hooks ⚛️
Integrate Pollinations directly into your React applications.

npm install @pollinations/react

usePollinationsImage(prompt, options)
Options: width, height, model, seed, nologo, enhance
Return: string | null (Image URL or null)
usePollinationsText(prompt, options)
Options: seed, model, systemPrompt
Return: string | null (Generated text or null)
usePollinationsChat(initialMessages, options)
Options: seed, jsonMode, model (uses POST /openai)
Return: { sendUserMessage: (message) => void, messages: Array<{role, content}> }
Docs:

README
PLAYGROUND
Real-time Feeds API 🔄
Image Feed 🖼️📈
GET https://image.pollinations.ai/feed

Description: Server-Sent Events (SSE) stream of publicly generated images.

Example Event Data:

{
  "width": 1024,
  "height": 1024,
  "seed": 42,
  "model": "flux",
  "imageURL": "https://image.pollinations.ai/prompt/example",
  "prompt": "A radiant visage in the style of renaissance painting"
}
Code Examples: Image Feed (SSE)
Text Feed 📝📈
GET https://text.pollinations.ai/feed

Description: Server-Sent Events (SSE) stream of publicly generated text responses.

Example Event Data:

{
  "response": "Cherry Blossom Pink represents gentleness, kindness, and the transient nature of life. It symbolizes spring, renewal, and the beauty of impermanence in Japanese culture.",
  "model": "openai",
  "messages": [
    {
      "role": "user",
      "content": "What does the color cherry blossom pink represent?"
    }
  ]
}
Code Examples: Text Feed (SSE)