
import { GoogleGenAI, Chat, Modality, LiveServerMessage, Type, FunctionDeclaration } from "@google/genai";
import { ProjectAnalysis, ProjectStatus } from "../types";

// Recommended models
const TEXT_MODEL = 'gemini-3-flash-preview';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

const getApiKey = () => {
  let apiKey: string | undefined;
  try {
    const rawKey = process.env.API_KEY;
    if (rawKey) {
      const clean = rawKey.toString().trim().replace(/^["']|["']$/g, '');
      if (clean !== 'undefined' && clean !== 'null' && clean.length > 20) {
        apiKey = clean;
      }
    }
  } catch (e) {
    console.warn("Error reading API_KEY:", e);
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
         // In @google/genai, sending tool responses back often requires standard message formatting
         // but for this implementation we assume the standard sendMessage handles the turn if it returned calls.
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
 * Connects to the Live Voice Session
 */
export const connectToLiveAnalyst = async (
  projects: ProjectAnalysis[],
  callbacks: {
    onAudioChunk: (base64: string) => void;
    onInterrupted: () => void;
    onTranscription: (text: string, isUser: boolean) => void;
    onTurnComplete: () => void;
    onClose: () => void;
    onError: (e: any) => void;
    onToolCall: (fc: any) => Promise<any>;
  }
) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });
  
  const sessionPromise = ai.live.connect({
    model: LIVE_MODEL,
    callbacks: {
      onopen: () => console.log("Live connection opened"),
      onmessage: async (message: LiveServerMessage) => {
        if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
          callbacks.onAudioChunk(message.serverContent.modelTurn.parts[0].inlineData.data);
        }
        if (message.toolCall) {
          for (const fc of message.toolCall.functionCalls) {
            const result = await callbacks.onToolCall(fc);
            const session = await sessionPromise;
            session.sendToolResponse({
              functionResponses: [{
                id: fc.id,
                name: fc.name,
                response: { result },
              }]
            });
          }
        }
        if (message.serverContent?.interrupted) callbacks.onInterrupted();
        if (message.serverContent?.outputTranscription) callbacks.onTranscription(message.serverContent.outputTranscription.text, false);
        if (message.serverContent?.inputTranscription) callbacks.onTranscription(message.serverContent.inputTranscription.text, true);
        if (message.serverContent?.turnComplete) callbacks.onTurnComplete();
      },
      onclose: callbacks.onClose,
      onerror: callbacks.onError,
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
      },
      systemInstruction: getSystemInstruction(projects),
      tools: [{ functionDeclarations: [searchProjectHistoryTool] }],
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    }
  });

  return sessionPromise;
};

/**
 * Generates Audio from text using Gemini TTS (One-off)
 */
export const generateSpeech = async (text: string): Promise<Uint8Array | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text: `Read this project report clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Charon' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) return decodeBase64(base64Audio);
    return null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};

// --- Audio Utilities ---
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

export async function playRawPcm(data: Uint8Array, sampleRate: number = 24000) {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
  const audioBuffer = await decodeAudioData(data, ctx, sampleRate, 1);
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start();
}
