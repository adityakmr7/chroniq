async function test() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY is not set!");
    return;
  }

  const model = "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  
  console.log("Querying Gemini API...");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Hello! Reply with 'Gemini works!'" }] }]
    })
  });

  console.log(`Status: ${res.status}`);
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

test().catch(console.error);
