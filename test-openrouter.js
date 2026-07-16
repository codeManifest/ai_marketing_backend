import fetch from 'node-fetch';
import { prisma } from './src/config/db.js';

async function testOpenRouter() {
  const dbConfig = await prisma.aIConfig.findUnique({
    where: { provider: 'OPENROUTER' }
  });

  if (!dbConfig) {
    console.error('❌ No OpenRouter config found in database!');
    return;
  }

  const apiKey = dbConfig.apiKey;
  const baseUrl = dbConfig.baseUrl || 'https://openrouter.ai/api/v1';

  const modelsToTest = [
    'meta-llama/llama-3.1-8b-instruct:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'qwen/qwen-2.5-coder-32b-instruct:free',
    'google/gemini-2.5-flash',
    'openrouter/auto'
  ];

  for (const model of modelsToTest) {
    console.log(`\n🤖 Testing model: "${model}"...`);
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://postly.ai',
          'X-Title': 'Growthly'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: 'Say hello in one word.' }
          ],
          max_tokens: 10
        })
      });

      console.log(`Status: ${response.status}`);
      const data = await response.json();
      console.log('Response Payload:', JSON.stringify(data, null, 2));
    } catch (e) {
      console.error(`Error testing model "${model}":`, e.message);
    }
  }
}

testOpenRouter()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
