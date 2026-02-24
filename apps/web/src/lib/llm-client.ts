import { eq } from 'drizzle-orm';
import { userApiKeys } from '@openlintel/db';
import { decryptApiKey } from './crypto';
import type { Database } from '@openlintel/db';

interface LLMResponse {
  content: string;
}

/**
 * Call an LLM using the user's stored (encrypted) API key.
 * Supports OpenAI, Anthropic, and Google providers.
 * Returns the parsed JSON from the model response.
 */
export async function callLLM(
  userId: string,
  db: Database,
  systemPrompt: string,
  userPrompt: string,
  preferredProvider?: string,
): Promise<Record<string, unknown>> {
  // Find the user's API key — prefer the specified provider, else use first available
  const keys = await db
    .select()
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));

  if (keys.length === 0) {
    throw new Error('No API keys configured. Add one in Settings.');
  }

  const apiKeyRow = preferredProvider
    ? keys.find((k) => k.provider === preferredProvider) ?? keys[0]
    : keys[0];

  const plainKey = decryptApiKey(
    apiKeyRow!.encryptedKey,
    apiKeyRow!.iv,
    apiKeyRow!.authTag,
  );

  // Update lastUsedAt
  await db
    .update(userApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(userApiKeys.id, apiKeyRow!.id));

  let result: LLMResponse;

  switch (apiKeyRow!.provider) {
    case 'openai':
      result = await callOpenAI(plainKey, systemPrompt, userPrompt);
      break;
    case 'anthropic':
      result = await callAnthropic(plainKey, systemPrompt, userPrompt);
      break;
    case 'google':
      result = await callGoogle(plainKey, systemPrompt, userPrompt);
      break;
    default:
      // Default to OpenAI-compatible API
      result = await callOpenAI(plainKey, systemPrompt, userPrompt);
  }

  // Try to parse JSON from response
  try {
    return JSON.parse(result.content);
  } catch {
    // If not valid JSON, wrap in an object
    return { raw: result.content };
  }
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<LLMResponse> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await res.json();
  return { content: data.choices[0].message.content };
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<LLMResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt + '\n\nAlways respond with valid JSON.',
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${err}`);
  }

  const data = await res.json();
  const textBlock = data.content.find((b: { type: string }) => b.type === 'text');
  return { content: textBlock?.text ?? '{}' };
}

async function callGoogle(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<LLMResponse> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt + '\n\nAlways respond with valid JSON.' }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google AI API error: ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return { content: text };
}
