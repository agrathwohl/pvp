#!/usr/bin/env tsx
import Anthropic from "@anthropic-ai/sdk";

async function testAnthropicConnection() {
  console.log("🔍 Testing Anthropic API connection...\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  console.log("✅ API Key found");
  console.log(`   Key preview: ${apiKey.substring(0, 20)}...`);

  const anthropic = new Anthropic({ apiKey });

  console.log("\n📤 Sending test message to Claude...\n");

  try {
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: "Say 'Hello from PVP test!' and nothing else.",
        },
      ],
    });

    let fullResponse = "";

    stream.on("text", (text: string) => {
      process.stdout.write(text);
      fullResponse += text;
    });

    await stream.finalMessage();

    console.log("\n\n✅ Anthropic API working!");
    console.log(`   Response length: ${fullResponse.length} chars`);
    console.log("\n🎉 Your API key is valid and Claude is responding!");
  } catch (error: any) {
    console.error("\n❌ Anthropic API Error:");
    console.error(`   ${error.message}`);
    if (error.status) {
      console.error(`   HTTP Status: ${error.status}`);
    }
    process.exit(1);
  }
}

testAnthropicConnection();
