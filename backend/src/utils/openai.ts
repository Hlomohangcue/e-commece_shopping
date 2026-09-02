import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY environment variable is required for AI features.');
}

const client = new OpenAI({ apiKey });

export async function getAiRecommendations(userId: string, productIds: string[]) {
  const prompt = `Generate 5 product recommendation slugs for user ${userId} based on the viewed products: ${productIds.join(', ')}.`;
  const completion = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: prompt,
    temperature: 0.7,
    max_output_tokens: 250,
  });
  return completion.output_text?.split('\n').filter(Boolean) ?? [];
}

export async function chatWithAi(message: string, sessionId?: string) {
  const completion = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: `User: ${message}\nAssistant:`,
    temperature: 0.72,
    max_output_tokens: 400,
  });
  return completion.output_text?.trim() ?? 'Sorry, I could not generate a response at this time.';
}
