import postgres from "postgres";

async function main() {
  const sql = postgres("postgres://postgres:postgres@localhost:5432/chroniq");
  try {
    const videos = await sql`SELECT id, title, status, language, tts_provider, voice_id FROM videos WHERE status = 'awaiting_approval'`;
    console.log(`Found ${videos.length} videos awaiting approval:`);
    for (const v of videos) {
      console.log(v);
    }
  } catch (e: any) {
    console.error(e.message);
  } finally {
    await sql.end();
  }
}

main().catch(console.error);
