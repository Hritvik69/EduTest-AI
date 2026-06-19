import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
  }
});

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

async function run() {
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      topP: 1,
      maxOutputTokens: 128
    }
  });

  for (let i = 1; i <= 3; i++) {
    try {
      const result = await model.generateContent("Return {\"ok\": true}");
      const text = result.response.text();
      console.log(`Run ${i}:`, JSON.stringify(text));
    } catch (err) {
      console.log(`Run ${i} Error:`, err.message.slice(0, 100));
    }
  }
}

run();
