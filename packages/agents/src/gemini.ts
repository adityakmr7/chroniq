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

    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: opts?.json ? { responseMimeType: "application/json" } : {},
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`Gemini returned no text: ${JSON.stringify(data)}`);
    return text;
  }
}
