const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function gemini(prompt: string, opts?: { json?: boolean }): Promise<string> {
  const provider = process.env.LLM_PROVIDER || "cloud";

  if (provider === "local") {
    const url = process.env.OLLAMA_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL || "llama3";
    const endpoint = `${url}/api/generate`;

    console.log(`     🤖 Querying local LLM via Ollama (Model: ${model})...`);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false,
        format: opts?.json ? "json" : undefined,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { response: string };
    return data.response;
  } else {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set. Copy .env.example to .env and fill it in.");

    const maxRetries = 3;
    let attempt = 0;
    let res;

    while (attempt < maxRetries) {
      res = await fetch(`${ENDPOINT}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: opts?.json ? { responseMimeType: "application/json" } : {},
        }),
      });

      if (res.status === 429) {
        attempt++;
        if (attempt >= maxRetries) break;

        let delayMs = 30000; // default 30s
        try {
          const errBody = await res.clone().json() as any;
          // Look for RetryInfo detail block
          const retryInfo = errBody?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo") || d.retryDelay);
          const retryDelayStr = retryInfo?.retryDelay;
          if (retryDelayStr) {
            const seconds = parseFloat(retryDelayStr.replace("s", ""));
            if (!isNaN(seconds)) {
              delayMs = Math.ceil(seconds * 1000) + 1500; // Add 1.5s safety buffer
            }
          }
        } catch (_) {}

        console.warn(`     ⚠️ Gemini API rate limited (429). Retrying in ${(delayMs / 1000).toFixed(1)}s... (Attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      break;
    }

    if (!res || !res.ok) {
      throw new Error(`Gemini ${res?.status || "Unknown"}: ${res ? await res.text() : "No response"}`);
    }

    const data = (await res.json()) as any;
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`Gemini returned no text: ${JSON.stringify(data)}`);
    
    text = text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    return text;
  }
}
