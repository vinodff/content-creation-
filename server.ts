import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import { YoutubeTranscript } from 'youtube-transcript';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API endpoints
  app.get('/api/youtube/best-video', async (req, res) => {
    try {
      const channelUrlOrId = req.query.channel as string;
      const days = parseInt(req.query.days as string, 10);
      
      if (!channelUrlOrId || isNaN(days)) {
        return res.status(400).json({ error: 'Missing channel or valid days' });
      }

      // Detect Instagram Profilies
      if (channelUrlOrId.includes('instagram.com') || channelUrlOrId.startsWith('ig:') || channelUrlOrId.startsWith('instagram:') || (!channelUrlOrId.startsWith('@') && !channelUrlOrId.startsWith('UC') && !channelUrlOrId.includes('youtube.com'))) {
        // Also fall back to Instagram if it's just a raw username without @ and not a Youtube ID. Actually let's just stick to the current check but allow basic IG assumption if we can't figure it out, but for now we'll test primarily those matching the if.
        // Wait, the prompt says "not only youtube input it also take instagram profile also the group", so I'll just check explicitly for ig links/prefixes.
        let isIg = false;
        if (channelUrlOrId.includes('instagram.com') || channelUrlOrId.startsWith('ig:') || channelUrlOrId.startsWith('instagram:')) {
           isIg = true;
        }

        if (isIg) {
          let handle = channelUrlOrId;
          if (channelUrlOrId.includes('instagram.com/')) {
            handle = new URL(channelUrlOrId.startsWith('http') ? channelUrlOrId : `https://${channelUrlOrId}`).pathname.split('/')[1] || channelUrlOrId;
          } else {
            handle = handle.replace(/^(ig|instagram):@?/, '');
          }
          handle = handle.replace(/^@/, '').split('?')[0].replace(/\//g, '');
  
          const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
          if (!igToken) {
            return res.json({
              isInstagram: true,
              channel: {
                title: handle ? `@${handle}` : 'Instagram Profile',
                thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg',
                subscriberCount: null
              },
              bestVideo: null,
              videosAnalyzed: 0,
              error: 'Instagram API integration requires an INSTAGRAM_ACCESS_TOKEN. Please set it in your environment/secrets.',
              channelInput: channelUrlOrId
            });
          }
  
          try {
            // Attempt to find the configured user's IG Account ID
            let myIgAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  
            if (!myIgAccountId) {
              const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=accounts{instagram_business_account}&access_token=${igToken}`);
              const meData = await meRes.json() as any;
              
              if (meData.error) {
                 if (meData.error.message.includes('instagram_business_account')) {
                    throw new Error("Graph API Error: Ensure your token has 'pages_show_list' and 'pages_read_engagement' permissions.");
                 }
                throw new Error(`Graph API Error: ${meData.error.message}`);
              }
              
              if (meData.accounts?.data?.length > 0) {
                 for (const page of meData.accounts.data) {
                   if (page.instagram_business_account?.id) {
                     myIgAccountId = page.instagram_business_account.id;
                     break;
                   }
                 }
              }
            }
  
            if (!myIgAccountId) {
               throw new Error("Could not find a linked Instagram Page. Ensure your token has 'pages_show_list' and 'pages_read_engagement' permissions, and that your Facebook Page is linked to your Instagram Professional (Creator or Business) account.");
            }
  
            // Now use Business Discovery
            const qs = `fields=business_discovery.username(${handle}){id,name,biography,followers_count,profile_picture_url,media.limit(50){id,media_type,media_product_type,like_count,comments_count,permalink,caption,timestamp,media_url,thumbnail_url}}`;
            
            const discRes = await fetch(`https://graph.facebook.com/v19.0/${myIgAccountId}?${qs}&access_token=${igToken}`);
            const discData = await discRes.json() as any;
  
            if (discData.error) {
               throw new Error(discData.error.message || "Business Discovery API Error");
            }
  
            const targetUser = discData.business_discovery;
            if (!targetUser) throw new Error(`Could not find Instagram profile: ${handle}.`);
  
            const mediaList = targetUser.media?.data || [];
            const videos = mediaList.filter((m: any) => m.media_type === 'VIDEO' || m.media_product_type === 'REELS');
  
            let bestVideo: any = null;
            let maxEngagement = -1;
            
            const dateThreshold = new Date();
            dateThreshold.setDate(dateThreshold.getDate() - days);
            
            let videosAnalyzedCount = 0;
  
            videos.forEach((v: any) => {
               const publishedAt = new Date(v.timestamp);
               if (publishedAt >= dateThreshold) {
                 videosAnalyzedCount++;
                 // We estimate views/engagement because views aren't reliably returned by business discovery for other users via this endpoint sometimes
                 const engagement = parseInt(v.like_count || '0', 10) + parseInt(v.comments_count || '0', 10);
                 if (engagement > maxEngagement) {
                    maxEngagement = engagement;
                    bestVideo = {
                       id: v.id,
                       title: v.caption ? v.caption.substring(0, 100) + '...' : 'Instagram Reel',
                       views: engagement, // Using engagement as views metric placeholder for Instagram
                       likes: v.like_count || 0,
                       comments: v.comments_count || 0,
                       url: v.permalink,
                       thumbnail: v.thumbnail_url || v.media_url || targetUser.profile_picture_url,
                       publishedAt: v.timestamp
                    };
                 }
               }
            });
            
            // If we found no videos within the timeframe but we had videos, pick the best from all we fetched as a fallback
            if (!bestVideo && videos.length > 0) {
               videos.forEach((v: any) => {
                 const engagement = parseInt(v.like_count || '0', 10) + parseInt(v.comments_count || '0', 10);
                 if (engagement > maxEngagement) {
                    maxEngagement = engagement;
                    bestVideo = {
                       id: v.id,
                       title: v.caption ? v.caption.substring(0, 100) + '...' : 'Instagram Reel',
                       views: engagement,
                       likes: v.like_count || 0,
                       comments: v.comments_count || 0,
                       url: v.permalink,
                       thumbnail: v.thumbnail_url || v.media_url || targetUser.profile_picture_url,
                       publishedAt: v.timestamp
                    };
                 }
               });
            }
  
            // Try to extract full caption as transcript
            let captions = bestVideo ? discData.business_discovery.media?.data?.find((m: any) => m.id === bestVideo.id)?.caption || '' : '';
            if (!captions) captions = 'No caption available for this reel.';

            if (bestVideo) {
              bestVideo.captions = captions;
            }

            return res.json({
               isInstagram: true,
               channel: {
                 title: targetUser.name || `@${handle}`,
                 thumbnail: targetUser.profile_picture_url || 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg',
                 subscriberCount: targetUser.followers_count?.toString() || null
               },
               bestVideo,
               videosAnalyzed: videosAnalyzedCount > 0 ? videosAnalyzedCount : videos.length,
               channelInput: channelUrlOrId,
               error: videos.length === 0 ? 'No videos found on this profile.' : null
            });
  
          } catch (err: any) {
            console.error('Instagram API Error:', err);
            return res.json({
               isInstagram: true,
               channel: {
                  title: `@${handle}`,
                  thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg',
                  subscriberCount: null
               },
               bestVideo: null,
               videosAnalyzed: 0,
               error: err.message || 'Failed to fetch Instagram profile data.',
               channelInput: channelUrlOrId
            });
          }
        }
      }

      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey || apiKey === 'MY_YOUTUBE_API_KEY') {
        return res.status(500).json({ error: 'YouTube API Key is missing or invalid. Please configure it in the Secrets panel.' });
      }

      // Logic to resolve channel handle/url to channel ID
      let channelId = channelUrlOrId;
      let handle = null;

      if (channelUrlOrId.includes('youtube.com/')) {
        const urlObj = new URL(channelUrlOrId);
        if (urlObj.pathname.startsWith('/channel/')) {
          channelId = urlObj.pathname.replace('/channel/', '').split('/')[0];
        } else if (urlObj.pathname.startsWith('/c/') || urlObj.pathname.startsWith('/user/')) {
          handle = urlObj.pathname.split('/')[2];
        } else if (urlObj.pathname.startsWith('/@')) {
          handle = urlObj.pathname.replace('/', '').split('/')[0];
        }
      } else if (channelUrlOrId.startsWith('@')) {
        handle = channelUrlOrId;
      }

      // If it's a handle, resolve using channels endpoint with forHandle
      if (handle) {
        // YT API handles can be passed with or without @ sometimes, but usually better with it forHandle
        // However actually forHandle expects the full handle like @mkbhd
        const handleQuery = handle.startsWith('@') ? handle : `@${handle}`;
        const handleRes = await fetch(`https://youtube.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handleQuery)}&key=${apiKey}`);
        const handleData = await handleRes.json();
        
        if (!handleData.items || handleData.items.length === 0) {
          return res.status(404).json({ error: 'Channel not found from handle.' });
        }
        channelId = handleData.items[0].id;
      }

      // Fetch the playlist ID for "Uploads" to get recent videos reliably
      const channelRes = await fetch(`https://youtube.googleapis.com/youtube/v3/channels?part=contentDetails,snippet,statistics&id=${channelId}&key=${apiKey}`);
      const channelData = await channelRes.json();

      if (!channelData.items || channelData.items.length === 0) {
        return res.status(404).json({ error: 'Channel not found.' });
      }

      const channelSnippet = channelData.items[0].snippet;
      const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
      const subscriberCount = channelData.items[0].statistics.subscriberCount;

      // Calculate the date boundary
      const dateBoundary = new Date();
      dateBoundary.setDate(dateBoundary.getDate() - days);

      // Fetch videos from the uploads playlist until we hit the date boundary
      let videos: any[] = [];
      let nextPageToken = '';
      let keepFetching = true;

      while (keepFetching) {
        const playlistItemsRes = await fetch(`https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ''}&key=${apiKey}`);
        const playlistItemsData = await playlistItemsRes.json();

        if (!playlistItemsData.items || playlistItemsData.items.length === 0) {
          break;
        }

        for (const item of playlistItemsData.items) {
          const publishedAt = new Date(item.snippet.publishedAt);
          if (publishedAt < dateBoundary) {
            keepFetching = false;
            break;
          }
          videos.push(item);
        }

        nextPageToken = playlistItemsData.nextPageToken;
        if (!nextPageToken || videos.length > 200) { // Safety limit
          keepFetching = false;
        }
      }

      if (videos.length === 0) {
        return res.json({ 
          error: `No videos found in the last ${days} days.`,
          channel: {
            title: channelSnippet.title,
            thumbnail: channelSnippet.thumbnails.default.url
          }
        });
      }

      // Now fetch statistics for these videos to find the best performing one
      const videoIds = videos.map(v => v.snippet.resourceId.videoId).join(',');
      
      // If we have more than 50 videos we might need multiple requests, but for recent days 50 is likely enough
      // Let's handle batched video fetching if needed, up to 50 at a time
      let videoStats: any[] = [];
      for (let i = 0; i < videos.length; i += 50) {
        const idsBatch = videos.slice(i, i + 50).map(v => v.snippet.resourceId.videoId).join(',');
        const statsRes = await fetch(`https://youtube.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${idsBatch}&key=${apiKey}`);
        const statsData = await statsRes.json();
        if (statsData.items) {
          videoStats = videoStats.concat(statsData.items);
        }
      }
      
      // Sort by view count to find "best performing"
      videoStats.sort((a, b) => parseInt(b.statistics.viewCount || '0') - parseInt(a.statistics.viewCount || '0'));

      const bestVideo = videoStats[0];

      // Try to fetch subtitles for the best video
      let captions = '';
      try {
        const transcriptLines = await YoutubeTranscript.fetchTranscript(bestVideo.id);
        if (transcriptLines && transcriptLines.length > 0) {
          captions = transcriptLines.map(t => t.text).join(' ');
        }
      } catch (err: any) {
        console.error(`Default YoutubeTranscript failed for ${bestVideo.id}: ${err.message || err}, trying fallbacks...`);
        try {
          const enLines = await YoutubeTranscript.fetchTranscript(bestVideo.id, { lang: 'en' });
          captions = enLines.map(t => t.text).join(' ');
        } catch (enErr) {
           try {
             const hiLines = await YoutubeTranscript.fetchTranscript(bestVideo.id, { lang: 'hi' });
             captions = hiLines.map(t => t.text).join(' ');
           } catch (hiErr) {
             console.error(`All transcript fallbacks failed for ${bestVideo.id}`);
           }
        }
      }

      res.json({
        channel: {
          title: channelSnippet.title,
          thumbnail: channelSnippet.thumbnails.high.url,
          subscriberCount
        },
        bestVideo: {
          id: bestVideo.id,
          title: bestVideo.snippet.title,
          publishedAt: bestVideo.snippet.publishedAt,
          thumbnail: bestVideo.snippet.thumbnails.high?.url || bestVideo.snippet.thumbnails.default?.url,
          views: parseInt(bestVideo.statistics.viewCount || '0'),
          likes: parseInt(bestVideo.statistics.likeCount || '0'),
          comments: parseInt(bestVideo.statistics.commentCount || '0'),
          url: `https://www.youtube.com/watch?v=${bestVideo.id}`,
          captions: captions || undefined
        },
        videosAnalyzed: videos.length
      });

    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Provide a fallback for React Router if needed, or simply send index.html
    const indexPath = path.join(distPath, 'index.html');
    app.get('*all', (req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Not Found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
