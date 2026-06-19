import postgres from "postgres";

async function main() {
  const sql = postgres("postgres://postgres:postgres@localhost:5432/chroniq");
  try {
    const scripts = await sql`SELECT s.content, v.id, v.title, v.language, v.tts_provider, v.voice_id FROM scripts s JOIN videos v ON s.video_id = v.id`;
    console.log(`Found ${scripts.length} scripts in database.`);
    for (const s of scripts) {
      if (s.content.includes("twist") || s.content.includes("happened") || /[\u0a00-\u0fff]/.test(s.content)) {
        console.log(`Video ID: ${s.id}`);
        console.log(`Title: ${s.title}`);
        console.log(`Language: ${s.language}`);
        console.log(`TTS: ${s.tts_provider} / ${s.voice_id}`);
        console.log(`Script Content:\n${s.content}`);
        console.log("-----------------------------------------");
      }
    }
  } catch (e: any) {
    console.error(e.message);
  } finally {
    await sql.end();
  }
}

main().catch(console.error);
