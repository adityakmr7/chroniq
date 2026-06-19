import postgres from "postgres";

async function main() {
  const dbs = ["chroniq", "postgres"];
  for (const db of dbs) {
    console.log(`Checking DB: ${db}`);
    const sql = postgres(`postgres://postgres:postgres@localhost:5432/${db}`);
    try {
      const videos = await sql`SELECT * FROM videos WHERE id = '88f95113-d558-4a37-bc60-a12fc50ee6ac'`;
      if (videos.length > 0) {
        console.log(`Found in ${db}!`, videos[0]);
        const scripts = await sql`SELECT * FROM scripts WHERE video_id = '88f95113-d558-4a37-bc60-a12fc50ee6ac'`;
        console.log("Script:", scripts[0]);
      } else {
        console.log(`Not found in ${db}`);
      }
    } catch (e: any) {
      console.error(`Error checking ${db}:`, e.message);
    } finally {
      await sql.end();
    }
  }
}

main().catch(console.error);
