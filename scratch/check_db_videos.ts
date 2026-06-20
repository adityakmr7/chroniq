import postgres from "postgres";

const databaseUrl = "postgres://postgres:postgres@localhost:5432/chroniq";
const sql = postgres(databaseUrl);

async function check() {
  try {
    const videos = await sql`
      SELECT id, title, status, tts_provider, voice_id, error_message, created_at 
      FROM videos 
      ORDER BY created_at DESC 
      LIMIT 10
    `;
    console.log("--- Videos in Database ---");
    console.log(JSON.stringify(videos, null, 2));
  } catch (error) {
    console.error("Error querying database:", error);
  } finally {
    process.exit(0);
  }
}

check();
