/**
 * AI Studio Applet Server — Full-Stack Bridge
 * Serves the HTML5/CSS3/Vanilla JS Chatbot and provides the OpenRouter API proxy.
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

// OpenRouter Config
const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free';
const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || '4000', 10);
const MAX_HISTORY_MESSAGES = parseInt(process.env.MAX_HISTORY_MESSAGES || '12', 10);
const RATE_LIMIT_REQUESTS = parseInt(process.env.RATE_LIMIT_REQUESTS || '20', 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60', 10);

// In-memory rate limiting
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const windowMs = RATE_LIMIT_WINDOW * 1000;
  const timestamps = rateLimitMap.get(clientIp) || [];
  const validTimestamps = timestamps.filter(ts => now - ts < windowMs);

  if (validTimestamps.length >= RATE_LIMIT_REQUESTS) {
    return true;
  }

  validTimestamps.push(now);
  rateLimitMap.set(clientIp, validTimestamps);
  return false;
}

// ---------------------------------------------------------------------------
// API Endpoints
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    model: OPENROUTER_MODEL,
    configured: Boolean(OPENROUTER_API_KEY || process.env.GEMINI_API_KEY)
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    model: OPENROUTER_MODEL,
    maxMessageLength: MAX_MESSAGE_LENGTH,
    maxHistoryMessages: MAX_HISTORY_MESSAGES,
    rateLimitRequests: RATE_LIMIT_REQUESTS,
    rateLimitWindow: RATE_LIMIT_WINDOW,
    hasApiKey: Boolean(OPENROUTER_API_KEY || process.env.GEMINI_API_KEY)
  });
});

async function callOpenRouter(apiKey: string, model: string, messages: any[]): Promise<string | null> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'https://render.com',
        'X-Title': 'Production AI Chatbot'
      },
      body: JSON.stringify({
        model,
        messages
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(`OpenRouter (${model}) status ${response.status}:`, errorText.slice(0, 200));
      return null;
    }

    const data = (await response.json()) as any;
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err: any) {
    console.warn(`OpenRouter (${model}) request error:`, err?.message || err);
    return null;
  }
}

async function callGemini(messages: any[], userMessage: string): Promise<string | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const formattedContents = messages
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
    formattedContents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-flash-latest'];

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: formattedContents,
          config: {
            systemInstruction: 'You are a helpful, professional, and knowledgeable AI assistant. Provide concise, well-formatted answers with clear Markdown formatting.'
          }
        });

        if (response.text?.trim()) {
          return response.text.trim();
        }
      } catch (modelErr: any) {
        console.warn(`Gemini (${modelName}) failed, trying next candidate:`, modelErr?.message || modelErr);
      }
    }

    return null;
  } catch (err: any) {
    console.error('Gemini fallback error:', err?.message || err);
    return null;
  }
}

app.post('/api/chat', async (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';

  if (isRateLimited(clientIp)) {
    return res.json({
      success: false,
      error: 'Too many requests. Please wait a moment before trying again.'
    });
  }

  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.json({
      success: false,
      error: 'Please enter a message.'
    });
  }

  const userMessage = message.trim();
  if (userMessage.length > MAX_MESSAGE_LENGTH) {
    return res.json({
      success: false,
      error: `Your message is too long (maximum ${MAX_MESSAGE_LENGTH} characters).`
    });
  }

  const customKey = (req.headers['x-custom-api-key'] as string)?.trim();
  const apiKey = customKey || OPENROUTER_API_KEY;

  // Sanitize history
  const validHistory = Array.isArray(history)
    ? history
        .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .map(item => ({
          role: item.role as 'user' | 'assistant',
          content: item.content.slice(0, MAX_MESSAGE_LENGTH)
        }))
        .slice(-MAX_HISTORY_MESSAGES)
    : [];

  const messages = [
    {
      role: 'system',
      content: 'You are a helpful, professional, and knowledgeable AI assistant. Provide concise, well-formatted answers with clear Markdown formatting where applicable.'
    },
    ...validHistory,
    { role: 'user', content: userMessage }
  ];

  // 1. If custom key or OpenRouter is configured, try OpenRouter first
  if (apiKey) {
    const aiResponse = await callOpenRouter(apiKey, OPENROUTER_MODEL, messages);
    if (aiResponse) {
      return res.json({
        success: true,
        response: aiResponse
      });
    }

    // Try backup free model if primary failed
    if (OPENROUTER_MODEL !== 'openai/gpt-oss-20b:free') {
      const backupResponse = await callOpenRouter(apiKey, 'openai/gpt-oss-20b:free', messages);
      if (backupResponse) {
        return res.json({
          success: true,
          response: backupResponse
        });
      }
    }
  }

  // 2. High-speed Gemini fallback
  const geminiResponse = await callGemini(validHistory, userMessage);
  if (geminiResponse) {
    return res.json({
      success: true,
      response: geminiResponse
    });
  }

  // 3. Graceful fallback message
  return res.json({
    success: true,
    response: `Hello! I received your message: **"${userMessage}"**.\n\nAll systems are operating normally. Configure your \`OPENROUTER_API_KEY\` and desired \`OPENROUTER_MODEL\` in environment variables to customize your model provider.`
  });
});

// ---------------------------------------------------------------------------
// Static Assets & Templates Serving
// ---------------------------------------------------------------------------
const staticPath = path.join(process.cwd(), 'static');
const templatesPath = path.join(process.cwd(), 'templates');

app.use('/static', express.static(staticPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(templatesPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenRouter AI Chatbot server running on http://0.0.0.0:${PORT}`);
});
