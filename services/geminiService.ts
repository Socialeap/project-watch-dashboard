
/**
 * Gemini Service - Server-side only
 * 
 * All Gemini API calls now route through Netlify serverless functions.
 * This file provides stubs for the frontend to maintain compatibility.
 */

/**
 * Creates a stub chat session for frontend compatibility.
 * Actual Gemini calls happen server-side via Netlify functions.
 */
export const createProjectChatSession = (_projects?: any) => {
  return {
    history: [],
  };
};

/**
 * Stub for text chat - returns a message indicating server-side processing.
 */
export const sendChatMessage = async (
  chat: any,
  message: string,
  onToolCall?: (name: string, args: any) => Promise<any>
): Promise<string> => {
  // Text chat not yet implemented via server function
  return "Text chat is being processed. Please use voice for now.";
};

/**
 * Sends a voice message via Netlify serverless function.
 */
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

/**
 * Speaks text aloud using browser's native speech synthesis
 */
export const speakText = (text: string): Promise<void> => {
  return new Promise((resolve) => {
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
    utterance.onerror = () => resolve();

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
