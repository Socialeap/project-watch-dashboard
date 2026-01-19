
import { GoogleGenAI, Chat, Type, FunctionDeclaration } from "@google/genai";
import { ProjectAnalysis, ProjectStatus } from "../types";

// Model for text and multimodal operations
const TEXT_MODEL = 'gemini-2.0-flash';

const getApiKey = (): string => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Gemini API key");
  }
  return apiKey;
};

// Tool Definition for searching the spreadsheet
export const searchProjectHistoryTool: FunctionDeclaration = {
  name: 'searchProjectHistory',
  parameters: {
    type: Type.OBJECT,
    description: 'Searches the entire Google Spreadsheet for projects by name, owner, status, or tags. Use this if the user asks for archived projects or data not in the immediate context.',
    properties: {
      query: {
        type: Type.STRING,
        description: 'The search term to find in the spreadsheet (e.g., "Archived", "Stripe", "John Doe").',
      },
    },
    required: ['query'],
  },
};

const getSystemInstruction = (projects: ProjectAnalysis[]) => {
  const activeWork = projects.filter(p => 
    p.project.status !== ProjectStatus.COMPLETED && 
    p.project.status !== ProjectStatus.ARCHIVED
  );

  const dataContext = JSON.stringify(activeWork.map(p => ({
    name: p.project.name,
    daysInactive: p.daysSinceTouch,
    status: p.project.status,
    owner: p.project.owner || 'Unassigned',
    tags: p.project.tags || ''
  })), null, 2);

  return `
    You are an expert Agile Project Manager Assistant.
    
    IMMEDIATE CONTEXT: ${dataContext}
    
    CAPABILITIES:
    - You have access to a tool called "searchProjectHistory". 
    - If a user asks for "Archived" projects, or asks about a specific project name or tag that isn't in the IMMEDIATE CONTEXT above, you MUST call "searchProjectHistory" to query the full database.
    
    VOICE OPTIMIZATION RULES:
    1. NEVER verbalize URLs, long IDs, or technical tokens.
    2. If a project has a technical link, refer to it as "the document".
    3. BE CONCISE. Use natural, human tone. Skip diacritics or symbols.
    4. Focus on identifying "Rotting" or "Abandoned" projects.
  `;
};

/**
 * Initializes a Chat Session for Text
 */
export const createProjectChatSession = (projects: ProjectAnalysis[]): Chat | null => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  try {
    return ai.chats.create({
      model: TEXT_MODEL,
      config: {
        temperature: 0.3,
        systemInstruction: getSystemInstruction(projects),
        tools: [{ functionDeclarations: [searchProjectHistoryTool] }],
      },
    });
  } catch (error) {
    console.error("Failed to create chat session:", error);
    return null;
  }
};

export const sendChatMessage = async (chat: Chat | null, message: string, onToolCall?: (name: string, args: any) => Promise<any>): Promise<string> => {
  if (!chat) return "AI Service not initialized.";
  try {
    const response = await chat.sendMessage({ message });
    
    // Handle potential function calls in standard chat
    if (response.functionCalls && onToolCall) {
      const toolResults = [];
      for (const fc of response.functionCalls) {
        const result = await onToolCall(fc.name, fc.args);
        toolResults.push({
          id: fc.id,
          name: fc.name,
          response: { result },
        });
      }
      
      // Send results back to model to get final text
      const secondResponse = await chat.sendMessage({
         message: `Here are the search results: ${JSON.stringify(toolResults)}`
      });
      return secondResponse.text || "I found the data but couldn't summarize it.";
    }

    return response.text || "Empty response received.";
  } catch (error: any) {
    return `Error: ${error.message || "Unknown communication error."}`;
  }
};

/**
 * Transcribes a recorded voice clip (MediaRecorder) into plain text.
 * This is the core of the turn-based voice flow.
 */
export const transcribeVoiceClip = async (
  audioBytes: Uint8Array,
  mimeType: string
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return "";

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [
        {
          parts: [
            {
              text:
                "Transcribe the user's spoken question into plain text. " +
                "Return ONLY the transcription. Do not add commentary.",
            },
            {
              inlineData: {
                mimeType,
                data: encode(audioBytes),
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0.0,
      },
    });

    return (response.text || "").trim();
  } catch (error) {
    console.error("Transcription Error:", error);
    return "";
  }
};

export const sendVoiceMessage = async (
  audioBlob: Blob,
  chatSession: any,
  onToolCall?: (name: string, args: any) => Promise<any>
) => {
  // Convert audio to base64
  const reader = new FileReader();
  const audioBase64 = await new Promise<string>((resolve, reject) => {
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });

  const messages = chatSession.history.map((m: any) => ({
    role: m.role,
    parts: [{ text: m.parts?.[0]?.text || '' }],
  }));

  const res = await fetch('/.netlify/functions/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      messages,
    }),
  });

  if (!res.ok) {
    throw new Error('Voice request failed');
  }

  const data = await res.json();

  return {
    transcript: '🎤 Voice message',
    response: data.text,
  };
};

// --- Audio Utilities ---

/**
 * Encodes a Uint8Array to Base64 string
 */
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Speaks text aloud using browser's native speech synthesis
 */
export const speakText = (text: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      console.warn("Speech synthesis not supported");
      resolve();
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to get a good English voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha'))
    ) || voices.find(v => v.lang.startsWith('en'));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      console.error("Speech error:", e);
      resolve(); // Resolve anyway to not block the flow
    };

    window.speechSynthesis.speak(utterance);
  });
};

/**
 * Stops any ongoing speech
 */
export const stopSpeaking = () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};
