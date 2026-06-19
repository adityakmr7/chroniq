import { createVideo, getVideoDetails, sql } from "../packages/db/src/index.ts";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

async function main() {
  const title = "Temp Test Delete Video";
  const slug = "temp-test-delete-video";
  const outputDir = join(process.cwd(), "output", slug);
  
  // 1. Create output dir
  await mkdir(outputDir, { recursive: true });
  await Bun.write(join(outputDir, "final.mp4"), "fake video data");
  console.log(`Created temp output dir: ${outputDir}`);

  // 2. Create DB record
  const video = await createVideo(title, "Startup Stories", "completed");
  console.log(`Created video record: ${video.id}`);

  // 3. Make delete request to local API
  console.log(`Sending DELETE request for video ID: ${video.id}...`);
  const res = await fetch(`http://localhost:3000/api/videos/${video.id}`, { method: "DELETE" });
  if (res.ok) {
    console.log("Delete request returned HTTP 200");
  } else {
    console.error(`Delete request failed: ${res.status} ${await res.text()}`);
  }

  // 4. Verify DB record deleted
  const details = await getVideoDetails(video.id);
  if (!details) {
    console.log("Verified: Database record deleted successfully.");
  } else {
    console.error("Error: Database record still exists!");
  }

  // 5. Verify file deleted
  if (!existsSync(outputDir)) {
    console.log("Verified: Output folder deleted successfully.");
  } else {
    console.error("Error: Output folder still exists at:", outputDir);
    // Cleanup manually
    const { rm } = await import("node:fs/promises");
    await rm(outputDir, { recursive: true, force: true });
  }

  await sql.end();
}

main().catch(console.error);
