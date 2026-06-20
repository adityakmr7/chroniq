/**
 * analytics.ts — YouTube Data API v3 analytics fetcher
 *
 * Fetches video-level statistics (views, likes, comments, CTR, avg view duration)
 * from the YouTube Data API using an OAuth2 access token.
 *
 * Note: CTR and avg_view_duration require the YouTube Analytics API (separate quota).
 * The basic stats (views/likes/comments) only need the Data API v3 (free).
 */

import { getAccessToken } from "./youtube.ts";

export interface YouTubeVideoStats {
  youtubeVideoId: string;
  views: number;
  likes: number;
  comments: number;
  ctr: number | null;
  avgViewDuration: number | null;
}

/**
 * Fetch basic stats for a YouTube video via the Data API v3.
 * Does NOT require YouTube Analytics API — uses the free videos.list endpoint.
 */
export async function fetchVideoStats(
  youtubeVideoId: string,
  accessToken: string
): Promise<YouTubeVideoStats> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${youtubeVideoId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`YouTube Data API failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as any;
  const item = data.items?.[0];
  if (!item) {
    throw new Error(`YouTube video ${youtubeVideoId} not found via API.`);
  }

  const stats = item.statistics;
  return {
    youtubeVideoId,
    views: parseInt(stats.viewCount || "0"),
    likes: parseInt(stats.likeCount || "0"),
    comments: parseInt(stats.commentCount || "0"),
    ctr: null,             // Requires Analytics API (separate quota/setup)
    avgViewDuration: null, // Requires Analytics API
  };
}

/**
 * Fetch stats for multiple videos in one batched API call (max 50 per request).
 */
export async function fetchBatchVideoStats(
  youtubeVideoIds: string[],
  accessToken: string
): Promise<YouTubeVideoStats[]> {
  if (youtubeVideoIds.length === 0) return [];

  const ids = youtubeVideoIds.slice(0, 50).join(",");
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`YouTube batch stats failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as any;
  return (data.items || []).map((item: any) => ({
    youtubeVideoId: item.id,
    views: parseInt(item.statistics?.viewCount || "0"),
    likes: parseInt(item.statistics?.likeCount || "0"),
    comments: parseInt(item.statistics?.commentCount || "0"),
    ctr: null,
    avgViewDuration: null,
  }));
}

/**
 * Refresh access token and fetch stats for all provided video IDs.
 * Handles OAuth automatically if credentials are in env.
 */
export async function refreshAndFetchAllStats(
  youtubeVideoIds: string[]
): Promise<YouTubeVideoStats[]> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YouTube OAuth credentials not configured in .env");
  }

  const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
  return fetchBatchVideoStats(youtubeVideoIds, accessToken);
}
