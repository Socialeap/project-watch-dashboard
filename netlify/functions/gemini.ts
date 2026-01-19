import { Handler } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';

const HEADERS = {
  'Content-Type': 'application/json',
};

export const handler: Handler = async (event) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: HEADERS,
        body: JSON.stringify({
          error: 'Missing Gemini API key',
          transcript: '',
          response: 'Server configuration error. Please contact support.',
        }),
      };
    }

    const { audioBase64, messages } = JSON.parse(event.body || '{}');

    if (!audioBase64) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          error: 'No audio data provided',
          transcript: '',
          response: 'No audio was received. Please try again.',
        }),
      };
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const chat = model.startChat({ history: messages || [] });

    const result = await chat.sendMessage([
      {
        inlineData: {
          mimeType: 'audio/webm',
          data: audioBase64,
        },
      },
    ]);

    const responseText = result.response.text();

    // TODO: Remove this log after debugging
    console.log('[gemini] Success response:', JSON.stringify({ transcript: '🎤 Voice message', response: responseText }));

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        transcript: '🎤 Voice message',
        response: responseText,
      }),
    };
  } catch (err: any) {
    const errorMessage = err.message || 'Server error';
    
    // TODO: Remove this log after debugging
    console.error('[gemini] Error:', errorMessage);

    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({
        error: errorMessage,
        transcript: '',
        response: 'Voice processing failed on server. Please try again.',
      }),
    };
  }
};
