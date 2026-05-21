const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const apiKeyMatch = envContent.match(/^GEMINI_API_KEY=(.+)/m);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

if (!apiKey) {
  console.error("Error: GEMINI_API_KEY not found in .env.local");
  process.exit(1);
}

console.log("Found API Key:", apiKey.substring(0, 10) + "...");

// Changing model to gemini-2.5-flash which is available in AI Studio
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function testGemini() {
  const contents = [
    {
      role: "user",
      parts: [{ text: "Hello, Gemini! Please respond with 'Gemini 2.5 Flash works perfectly!' if you can hear me." }]
    }
  ];

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contents }),
    });

    console.log("HTTP Status:", response.status, response.statusText);
    const data = await response.json();
    console.log("Response Data:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Fetch Error:", error);
  }
}

testGemini();
