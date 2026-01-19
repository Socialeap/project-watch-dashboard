import { Handler } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';

export const handler: Handler = async (event) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: 'Missing Gemini API key',
      };
    }

    const { audioBase64, messages } = JSON.parse(event.body || '{}');

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

    return {
      statusCode: 200,
      body: JSON.stringify({
        text: result.response.text(),
      }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: err.message || 'Server error',
    };
  }
};
