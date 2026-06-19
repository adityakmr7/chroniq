async function test() {
  const url = "http://host.docker.internal:11434/api/generate";
  const model = "qwen3.6:latest";
  const prompt = `You are an elite scriptwriter for faceless documentary YouTube Shorts.
Write a narration script for this video.
Language: Hindi.
Write the script in Hindi (using Devanagari script like 'नमस्ते'). Ensure the pronunciation and rhythm are natural for a Hindi voiceover generator.

Topic: "The History of Android"
Angle: Visualizing the story.
Summary: Android was founded in 2003 by Andy Rubin and Rich Miner. Google bought it in 2005. The first commercial device was T-Mobile G1 in 2008.
Key facts:
- Founded in Palo Alto, California
- Originally meant for digital cameras
- Acquired by Google for $50M

Requirements:
- 120-130 words total (strictly under 60 seconds).
- Open with a 1-2 sentence HOOK that creates an immediate curiosity gap.
- BODY tells the story with retention loops ("but here's the twist...", "what happened next...").
- End with a short CTA that invites a follow/comment, themed to the story.
- Conversational, punchy, spoken-word rhythm. No stage directions, no emojis, no markdown.

Return ONLY JSON matching:
{"hook": string, "body": string, "cta": string}`;

  console.log(`Connecting to ${url} with model ${model}...`);
  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model,
      prompt: prompt,
      stream: false,
      format: "json",
    }),
  });

  console.log(`Status: ${res.status}`);
  const data = await res.json();
  const duration = (Date.now() - start) / 1000;
  console.log(`Duration: ${duration}s`);
  console.log("Response:");
  console.log(data.response);
}

test().catch(console.error);
