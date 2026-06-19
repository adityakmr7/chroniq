import { getVideos, initDatabase, sql } from "../packages/db/src/index.ts";

async function main() {
  const videos = await getVideos();
  console.log("=== Videos in Database ===");
  for (const v of videos) {
    console.log(`ID: ${v.id}`);
    console.log(`Title: ${v.title}`);
    console.log(`Topic: ${v.topic}`);
    console.log(`Status: ${v.status}`);
    console.log(`Language: ${v.language}`);
    console.log(`TTS Provider: ${v.tts_provider}`);
    console.log(`Voice ID: ${v.voice_id}`);
    console.log(`Created At: ${v.created_at}`);
    
    // Fetch script
    const [script] = await sql`SELECT content FROM scripts WHERE video_id = ${v.id}`;
    if (script) {
      console.log(`Script Content (first 200 chars): ${script.content.slice(0, 200)}...`);
    } else {
      console.log("Script Content: None");
    }
    console.log("-----------------------------------------");
  }
  await sql.end();
}

main().catch(console.error);
