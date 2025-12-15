import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import archiver from 'archiver';

// API Keys (from environment variables only - set in Railway dashboard)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize AI clients (only if API keys are available)
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const anthropic = CLAUDE_API_KEY ? new Anthropic({ apiKey: CLAUDE_API_KEY }) : null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const hasAI = !!(GEMINI_API_KEY || CLAUDE_API_KEY || OPENAI_API_KEY);
console.log('AI Services:', { gemini: !!GEMINI_API_KEY, claude: !!CLAUDE_API_KEY, openai: !!OPENAI_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8000;

// Downloads directory
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// CORS 설정
app.use(cors({
  origin: [
    'http://localhost:8080', 
    'http://127.0.0.1:8080',
    'https://ytgrab.vercel.app',
    'https://ytgrab-xi.vercel.app',
    /\.vercel\.app$/
  ],
  credentials: true
}));

app.use(express.json());

// Store download progress
const downloadProgress = new Map();
// Store bulk download progress
const bulkDownloadProgress = new Map();

// Get video info
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate YouTube URL
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+/;
  if (!youtubeRegex.test(url)) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  try {
    const process = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      url
    ]);

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        console.error('yt-dlp error:', stderr);
        return res.status(500).json({ error: 'Failed to get video info', details: stderr });
      }

      try {
        const info = JSON.parse(stdout);
        
        // Filter formats to only include mp4 with both video and audio, or best available
        const formats = info.formats
          .filter(f => f.ext === 'mp4' && f.vcodec !== 'none')
          .map(f => ({
            formatId: f.format_id,
            quality: f.format_note || f.resolution || 'Unknown',
            resolution: f.resolution || `${f.width}x${f.height}`,
            filesize: f.filesize || f.filesize_approx,
            hasAudio: f.acodec !== 'none',
            fps: f.fps
          }))
          .sort((a, b) => {
            const resA = parseInt(a.resolution) || 0;
            const resB = parseInt(b.resolution) || 0;
            return resB - resA;
          });

        res.json({
          title: info.title,
          thumbnail: info.thumbnail,
          duration: info.duration,
          uploader: info.uploader,
          viewCount: info.view_count,
          formats: formats.length > 0 ? formats : [{ formatId: 'best', quality: 'Best Available', resolution: 'Auto' }]
        });
      } catch (parseError) {
        console.error('Parse error:', parseError);
        res.status(500).json({ error: 'Failed to parse video info' });
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Download video
app.post('/api/download', async (req, res) => {
  const { url, formatId, title, outputFormat = 'mp4' } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const downloadId = uuidv4();
  const outputTemplate = path.join(DOWNLOADS_DIR, `${downloadId}.%(ext)s`);
  
  // 파일명에서 사용할 수 없는 문자 제거
  const safeTitle = (title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
  
  console.log('Download request:', { url, formatId, title, safeTitle, outputFormat });
  
  downloadProgress.set(downloadId, { progress: 0, status: 'starting', title: safeTitle, outputFormat });

  res.json({ downloadId, message: 'Download started' });

  let args = [];
  
  if (outputFormat === 'mp3') {
    // Audio only - MP3
    args = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputTemplate,
      '--no-playlist',
      '--newline',
      url
    ];
  } else if (outputFormat === 'webm') {
    // WebM format
    args = [
      '-f', formatId && formatId !== 'best' ? `${formatId}+bestaudio/best` : 'bestvideo+bestaudio/best',
      '--merge-output-format', 'webm',
      '-o', outputTemplate,
      '--no-playlist',
      '--newline',
      url
    ];
  } else {
    // MP4 (default)
    args = [
      '-f', formatId && formatId !== 'best' ? `${formatId}+bestaudio/best` : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', outputTemplate,
      '--no-playlist',
      '--newline',
      url
    ];
  }

  const process = spawn('yt-dlp', args);

  process.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('yt-dlp:', output);
    
    // Get existing progress data to preserve title and outputFormat
    const existingProgress = downloadProgress.get(downloadId) || {};
    
    // Parse progress
    const progressMatch = output.match(/(\d+\.?\d*)%/);
    if (progressMatch) {
      downloadProgress.set(downloadId, {
        ...existingProgress,
        progress: parseFloat(progressMatch[1]),
        status: 'downloading'
      });
    }
    
    if (output.includes('[Merger]') || output.includes('Merging') || output.includes('[ExtractAudio]')) {
      downloadProgress.set(downloadId, {
        ...existingProgress,
        progress: 99,
        status: 'processing'
      });
    }
  });

  process.stderr.on('data', (data) => {
    console.error('yt-dlp stderr:', data.toString());
  });

  process.on('close', (code) => {
    const currentProgress = downloadProgress.get(downloadId);
    if (code === 0) {
      // Find the downloaded file
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const downloadedFile = files.find(f => f.startsWith(downloadId));
      
      if (downloadedFile) {
        downloadProgress.set(downloadId, {
          progress: 100,
          status: 'completed',
          filename: downloadedFile,
          title: currentProgress?.title || 'video',
          outputFormat: currentProgress?.outputFormat || 'mp4'
        });
      } else {
        downloadProgress.set(downloadId, {
          progress: 0,
          status: 'error',
          error: 'File not found after download'
        });
      }
    } else {
      downloadProgress.set(downloadId, {
        progress: 0,
        status: 'error',
        error: 'Download failed'
      });
    }
  });
});

// Get download progress
app.get('/api/progress/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const progress = downloadProgress.get(downloadId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Download not found' });
  }
  
  res.json(progress);
});

// Serve downloaded file
app.get('/api/file/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  const progress = downloadProgress.get(downloadId);
  
  if (!progress || progress.status !== 'completed') {
    return res.status(404).json({ error: 'File not ready' });
  }
  
  const filePath = path.join(DOWNLOADS_DIR, progress.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // outputFormat에 따른 확장자와 Content-Type 설정
  const formatInfo = {
    mp4: { ext: '.mp4', contentType: 'video/mp4' },
    mp3: { ext: '.mp3', contentType: 'audio/mpeg' },
    webm: { ext: '.webm', contentType: 'video/webm' }
  };
  
  const format = formatInfo[progress.outputFormat] || formatInfo.mp4;
  const downloadName = `${progress.title || 'video'}${format.ext}`;
  
  console.log('File download:', { 
    downloadId, 
    title: progress.title, 
    outputFormat: progress.outputFormat,
    downloadName 
  });
  
  // Content-Disposition 헤더 설정
  res.setHeader('Content-Type', format.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
  
  res.download(filePath, downloadName, (err) => {
    if (err) {
      console.error('Download error:', err);
    }
    // Clean up file after download
    setTimeout(() => {
      try {
        fs.unlinkSync(filePath);
        downloadProgress.delete(downloadId);
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    }, 60000); // Delete after 1 minute
  });
});

// Build AI prompt for music recommendations
function buildRecommendationPrompt(songCount, title, uploader, excludeTitles = []) {
  const excludeSection = excludeTitles.length > 0 
    ? `\n\nIMPORTANT: Do NOT recommend any of these songs (already recommended before):\n${excludeTitles.map(t => `- ${t}`).join('\n')}`
    : '';

  return `You are a music recommendation expert. Given a song or video title and artist, suggest ${songCount} similar songs/music videos that users might enjoy.

CRITICAL RULES:
1. Only recommend SINGLE SONGS (one track per recommendation)
2. NEVER recommend: mix compilations, 1-hour videos, "best of" collections, DJ sets, mashups, medleys, playlist videos, or any video containing multiple songs
3. Each recommendation must be a single, individual song/track
4. Search queries should include "official" or "audio" or "music video" to find single-track uploads

Return ONLY a JSON array with exactly ${songCount} items in this format (no other text, just the JSON):
[
  {"title": "Song Title", "artist": "Artist Name", "searchQuery": "Artist Name Song Title official audio"},
  ...
]

Make sure the recommendations are real, popular songs that exist on YouTube as single tracks. Focus on similar genre, mood, or artist style. Include a diverse mix of well-known and somewhat lesser-known tracks.${excludeSection}

Recommend ${songCount} similar songs to: "${title}" by ${uploader || 'Unknown Artist'}`;
}

// Try Gemini API
async function tryGemini(prompt, maxTokens = 4000) {
  if (!genAI) throw new Error('Gemini API key not configured');
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: {
      maxOutputTokens: maxTokens,
    }
  });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

// Try Claude API
async function tryClaude(prompt, maxTokens = 4000) {
  if (!anthropic) throw new Error('Claude API key not configured');
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  });
  return message.content[0].text;
}

// Try OpenAI API
async function tryOpenAI(prompt, maxTokens = 4000) {
  if (!openai) throw new Error('OpenAI API key not configured');
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens
  });
  return completion.choices[0].message.content;
}

// Get similar music recommendations using AI (Gemini → Claude → GPT fallback)
app.post('/api/recommend', async (req, res) => {
  const { title, uploader, count = 5, excludeTitles = [] } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Limit count to reasonable range (max 50)
  const songCount = Math.min(Math.max(parseInt(count) || 5, 1), 50);

  if (!hasAI) {
    return res.status(503).json({ 
      error: 'AI recommendations not available', 
      message: 'Please set API keys for AI services' 
    });
  }

  const prompt = buildRecommendationPrompt(songCount, title, uploader, excludeTitles);
  let content = null;
  let usedAI = null;

  // Try Gemini first
  try {
    console.log('Trying Gemini...');
    content = await tryGemini(prompt);
    usedAI = 'Gemini';
    console.log('Gemini succeeded');
  } catch (geminiError) {
    console.log('Gemini failed:', geminiError.message);
    
    // Try Claude as fallback
    try {
      console.log('Trying Claude...');
      content = await tryClaude(prompt);
      usedAI = 'Claude';
      console.log('Claude succeeded');
    } catch (claudeError) {
      console.log('Claude failed:', claudeError.message);
      
      // Try OpenAI as last resort
      try {
        console.log('Trying OpenAI...');
        content = await tryOpenAI(prompt);
        usedAI = 'OpenAI';
        console.log('OpenAI succeeded');
      } catch (openaiError) {
        console.log('OpenAI failed:', openaiError.message);
        return res.status(500).json({ 
          error: 'All AI services failed',
          details: `Gemini: ${geminiError.message}, Claude: ${claudeError.message}, OpenAI: ${openaiError.message}`
        });
      }
    }
  }

  try {
    
    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse recommendations');
    }
    
    const recommendations = JSON.parse(jsonMatch[0]);
    
    // Search YouTube for each recommendation
    const results = await Promise.all(
      recommendations.map(async (rec) => {
        try {
          const searchResult = await searchYouTube(rec.searchQuery);
          return {
            ...rec,
            ...searchResult
          };
        } catch (err) {
          console.error('Search error:', err);
          return null;
        }
      })
    );
    
    res.json({ recommendations: results.filter(r => r !== null) });
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ error: 'Failed to get recommendations', details: error.message });
  }
});

// Search YouTube using yt-dlp - finds single songs only (prefer under 10 minutes)
async function searchYouTube(query, maxDuration = 600) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      '--default-search', `ytsearch10`,  // Get 10 results to filter
      query
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr));
        return;
      }

      try {
        // Parse multiple JSON objects (one per line)
        const results = stdout.trim().split('\n')
          .map(line => {
            try { return JSON.parse(line); } 
            catch { return null; }
          })
          .filter(Boolean);
        
        if (results.length === 0) {
          resolve(null);
          return;
        }

        // Keywords that indicate mix/compilation videos
        const mixKeywords = ['mix', 'compilation', 'hour', 'hours', 'best of', 'playlist', 
          'medley', 'mashup', 'nonstop', 'non-stop', 'collection', '1 hour', '2 hour', 
          '1시간', '2시간', '모음', '메들리'];
        
        // Sort results by preference: short + not mix > short > not mix > any
        const scored = results.map(info => {
          const titleLower = (info.title || '').toLowerCase();
          const isMix = mixKeywords.some(kw => titleLower.includes(kw));
          const isShort = info.duration && info.duration <= maxDuration;
          
          let score = 0;
          if (isShort) score += 2;
          if (!isMix) score += 1;
          
          return { info, score, isShort, isMix };
        });
        
        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);
        
        // Get the best result
        const best = scored[0].info;
        
        resolve({
          videoId: best.id,
          url: `https://www.youtube.com/watch?v=${best.id}`,
          thumbnail: best.thumbnail,
          duration: best.duration,
          viewCount: best.view_count
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Analyze tracks for DJ info (BPM, Key, Energy)
app.post('/api/analyze-tracks', async (req, res) => {
  const { tracks } = req.body;
  
  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ error: 'Tracks array is required' });
  }

  if (!hasAI) {
    return res.status(503).json({ error: 'AI not available' });
  }

  const trackList = tracks.map((t, i) => `${i + 1}. "${t.title}" by ${t.artist}`).join('\n');
  
  const prompt = `You are a music analysis expert. Analyze these tracks and estimate their DJ-relevant properties.

TRACKS:
${trackList}

For each track, estimate:
- BPM (beats per minute, typical range 70-180)
- Key (using Camelot notation like 8A, 11B, etc.)
- Energy level (1-10, where 1 is very chill and 10 is peak energy)
- Genre/mood tags

Return ONLY a JSON object:
{
  "tracks": [
    {
      "index": 0,
      "title": "Song Title",
      "artist": "Artist",
      "bpm": 128,
      "key": "8A",
      "energy": 7,
      "genre": "House",
      "mood": "Energetic"
    }
  ]
}

Be accurate based on the song titles and artists. If unsure, make a reasonable estimate based on the artist's typical style.`;

  let content = null;
  const maxTokens = Math.min(4000, 500 + tracks.length * 100);

  try {
    content = await tryGemini(prompt, maxTokens);
  } catch (err) {
    console.log('Analyze: Gemini failed:', err.message);
  }

  if (!content) {
    try {
      content = await tryClaude(prompt, maxTokens);
    } catch (err) {
      console.log('Analyze: Claude failed:', err.message);
    }
  }

  if (!content) {
    try {
      content = await tryOpenAI(prompt, maxTokens);
    } catch (err) {
      console.log('Analyze: OpenAI failed:', err.message);
      return res.status(500).json({ error: 'All AI services failed' });
    }
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const result = JSON.parse(jsonMatch[0]);
    
    // Merge analysis with original track data
    if (result.tracks) {
      result.tracks = result.tracks.map((analyzed, idx) => ({
        ...tracks[idx],
        ...analyzed,
        originalIndex: idx
      }));
    }
    
    res.json(result);
  } catch (err) {
    console.error('Analyze JSON parse error:', err);
    res.status(500).json({ error: 'Failed to parse AI response' });
  }
});

// DJ Mix Order recommendation - AI suggests optimal track order for seamless mixing
app.post('/api/dj-order', async (req, res) => {
  const { tracks } = req.body;
  
  if (!tracks || !Array.isArray(tracks) || tracks.length < 2) {
    return res.status(400).json({ error: 'At least 2 tracks are required' });
  }

  if (!hasAI) {
    return res.status(503).json({ 
      error: 'AI not available', 
      message: 'Please set API keys for AI services' 
    });
  }

  const trackList = tracks.map((t, i) => `${i + 1}. "${t.title}" by ${t.artist}`).join('\n');
  
  // For many tracks, use a simpler prompt to avoid token limits
  const isLargeSet = tracks.length > 15;
  
  const prompt = isLargeSet 
    ? `You are a professional DJ. Order these ${tracks.length} tracks for optimal DJ mixing flow (BPM, key, energy progression).

TRACKS:
${trackList}

Return ONLY a JSON object:
{
  "orderedTracks": [
    {"position": 1, "originalIndex": 0, "title": "Song Title", "artist": "Artist Name"}
  ],
  "mixingTips": ["Tip 1", "Tip 2", "Tip 3"],
  "estimatedBPMRange": "120-128 BPM",
  "overallVibe": "Brief vibe description"
}

IMPORTANT: Include ALL ${tracks.length} tracks in orderedTracks array. Keep it compact - no reason field needed.`
    : `You are a professional DJ and music mixing expert. Analyze the following tracks and suggest the optimal order for a seamless DJ mix/set.

TRACKS TO ORDER:
${trackList}

Consider these factors when ordering:
1. BPM (tempo) - gradual transitions work best
2. Musical key - harmonically compatible keys mix better (Camelot wheel)
3. Energy level - build up and release patterns
4. Genre compatibility
5. Mood and vibe flow

Return ONLY a JSON object in this exact format (no other text):
{
  "orderedTracks": [
    {
      "position": 1,
      "originalIndex": 0,
      "title": "Song Title",
      "artist": "Artist Name",
      "reason": "Opening track - sets the mood with moderate energy"
    }
  ],
  "mixingTips": [
    "Tip 1 for transitioning between tracks",
    "Tip 2...",
    "Tip 3..."
  ],
  "estimatedBPMRange": "120-128 BPM",
  "overallVibe": "Description of the set's overall feeling"
}

Order all ${tracks.length} tracks for the best DJ mix flow.`;

  let content = null;
  
  // Calculate max tokens based on track count (more tracks = more output needed)
  const maxTokens = Math.min(8000, 1500 + tracks.length * 100);

  // Try Gemini first
  try {
    console.log(`DJ Order: Trying Gemini (${tracks.length} tracks, maxTokens: ${maxTokens})...`);
    content = await tryGemini(prompt, maxTokens);
    console.log('DJ Order: Gemini success');
  } catch (err) {
    console.log('DJ Order: Gemini failed:', err.message);
  }

  // Try Claude if Gemini failed
  if (!content) {
    try {
      console.log('DJ Order: Trying Claude...');
      content = await tryClaude(prompt, maxTokens);
      console.log('DJ Order: Claude success');
    } catch (err) {
      console.log('DJ Order: Claude failed:', err.message);
    }
  }

  // Try OpenAI if Claude failed
  if (!content) {
    try {
      console.log('DJ Order: Trying OpenAI...');
      content = await tryOpenAI(prompt, maxTokens);
      console.log('DJ Order: OpenAI success');
    } catch (err) {
      console.log('DJ Order: OpenAI failed:', err.message);
      return res.status(500).json({ error: 'All AI services failed' });
    }
  }

  try {
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const result = JSON.parse(jsonMatch[0]);
    
    // Add original track data to ordered tracks
    if (result.orderedTracks) {
      result.orderedTracks = result.orderedTracks.map(t => {
        const original = tracks[t.originalIndex];
        return {
          ...t,
          thumbnail: original?.thumbnail,
          url: original?.url,
          videoId: original?.videoId,
          duration: original?.duration
        };
      });
    }
    
    res.json(result);
  } catch (err) {
    console.error('DJ Order JSON parse error:', err);
    res.status(500).json({ error: 'Failed to parse AI response' });
  }
});

// Bulk download - downloads multiple videos and creates a ZIP
app.post('/api/bulk-download', async (req, res) => {
  const { videos, outputFormat = 'mp3' } = req.body;
  
  if (!videos || !Array.isArray(videos) || videos.length === 0) {
    return res.status(400).json({ error: 'Videos array is required' });
  }

  const bulkId = uuidv4();
  const bulkDir = path.join(DOWNLOADS_DIR, bulkId);
  fs.mkdirSync(bulkDir, { recursive: true });

  bulkDownloadProgress.set(bulkId, {
    status: 'downloading',
    total: videos.length,
    completed: 0,
    current: '',
    files: []
  });

  res.json({ bulkId, message: 'Bulk download started' });

  // Process downloads sequentially
  (async () => {
    const downloadedFiles = [];
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const safeTitle = (video.title || `video_${i + 1}`).replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
      
      bulkDownloadProgress.set(bulkId, {
        ...bulkDownloadProgress.get(bulkId),
        current: safeTitle,
        completed: i,
        status: 'downloading'
      });

      try {
        const ext = outputFormat === 'mp3' ? 'mp3' : outputFormat === 'webm' ? 'webm' : 'mp4';
        const outputPath = path.join(bulkDir, `${safeTitle}.${ext}`);
        
        await downloadVideo(video.url, outputPath, outputFormat);
        downloadedFiles.push({ title: safeTitle, path: outputPath, ext });
        
        bulkDownloadProgress.set(bulkId, {
          ...bulkDownloadProgress.get(bulkId),
          completed: i + 1,
          files: downloadedFiles.map(f => f.title)
        });
      } catch (error) {
        console.error(`Failed to download ${video.title}:`, error);
      }
    }

    // Create ZIP file
    bulkDownloadProgress.set(bulkId, {
      ...bulkDownloadProgress.get(bulkId),
      status: 'zipping',
      current: 'Creating ZIP file...'
    });

    const zipPath = path.join(DOWNLOADS_DIR, `${bulkId}.zip`);
    
    try {
      await createZip(downloadedFiles, zipPath);
      
      // Clean up individual files
      fs.rmSync(bulkDir, { recursive: true, force: true });
      
      bulkDownloadProgress.set(bulkId, {
        ...bulkDownloadProgress.get(bulkId),
        status: 'completed',
        zipFile: `${bulkId}.zip`,
        current: ''
      });
    } catch (error) {
      console.error('ZIP creation error:', error);
      bulkDownloadProgress.set(bulkId, {
        ...bulkDownloadProgress.get(bulkId),
        status: 'error',
        error: 'Failed to create ZIP file'
      });
    }
  })();
});

// Download a single video (helper function)
function downloadVideo(url, outputPath, format) {
  return new Promise((resolve, reject) => {
    let args = [];
    
    if (format === 'mp3') {
      args = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', outputPath.replace('.mp3', '.%(ext)s'),
        '--no-playlist',
        url
      ];
    } else if (format === 'webm') {
      args = [
        '-f', 'bestvideo+bestaudio/best',
        '--merge-output-format', 'webm',
        '-o', outputPath,
        '--no-playlist',
        url
      ];
    } else {
      args = [
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', outputPath,
        '--no-playlist',
        url
      ];
    }

    const process = spawn('yt-dlp', args);
    
    process.stdout.on('data', (data) => {
      console.log('yt-dlp bulk:', data.toString());
    });
    
    process.stderr.on('data', (data) => {
      console.error('yt-dlp bulk stderr:', data.toString());
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        // For MP3, find the actual file
        if (format === 'mp3') {
          const dir = path.dirname(outputPath);
          const baseName = path.basename(outputPath, '.mp3');
          const files = fs.readdirSync(dir);
          const mp3File = files.find(f => f.startsWith(baseName) && f.endsWith('.mp3'));
          if (mp3File) {
            resolve(path.join(dir, mp3File));
          } else {
            reject(new Error('MP3 file not found'));
          }
        } else {
          resolve(outputPath);
        }
      } else {
        reject(new Error('Download failed'));
      }
    });
  });
}

// Create ZIP from files
function createZip(files, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => {
      console.log(`ZIP created: ${archive.pointer()} bytes`);
      resolve();
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.pipe(output);
    
    files.forEach(file => {
      if (fs.existsSync(file.path)) {
        archive.file(file.path, { name: `${file.title}.${file.ext}` });
      }
    });
    
    archive.finalize();
  });
}

// Mixset progress tracking
const mixsetProgress = new Map();

// Create mixset with crossfade
app.post('/api/create-mixset', async (req, res) => {
  const { tracks, crossfadeDuration = 5, mixsetName = 'DJ_Mixset' } = req.body;
  
  if (!tracks || !Array.isArray(tracks) || tracks.length < 2) {
    return res.status(400).json({ error: 'At least 2 tracks are required' });
  }

  const mixsetId = uuidv4();
  const mixsetDir = path.join(DOWNLOADS_DIR, mixsetId);
  fs.mkdirSync(mixsetDir, { recursive: true });

  mixsetProgress.set(mixsetId, {
    status: 'downloading',
    total: tracks.length,
    completed: 0,
    current: '',
    phase: 'Downloading tracks...'
  });

  res.json({ mixsetId, message: 'Mixset creation started' });

  // Process in background
  (async () => {
    const downloadedFiles = [];
    
    // Step 1: Download all tracks as MP3
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const safeTitle = (track.title || `track_${i + 1}`).replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
      const paddedNum = String(i + 1).padStart(2, '0');
      
      mixsetProgress.set(mixsetId, {
        ...mixsetProgress.get(mixsetId),
        current: `${track.artist} - ${track.title}`,
        completed: i,
        phase: `Downloading track ${i + 1}/${tracks.length}...`
      });

      try {
        const outputPath = path.join(mixsetDir, `${paddedNum}_${safeTitle}.mp3`);
        await downloadVideo(track.url, outputPath, 'mp3');
        
        // Find the actual downloaded file
        const files = fs.readdirSync(mixsetDir);
        const mp3File = files.find(f => f.startsWith(paddedNum) && f.endsWith('.mp3'));
        if (mp3File) {
          downloadedFiles.push({
            path: path.join(mixsetDir, mp3File),
            title: `${track.artist} - ${track.title}`,
            order: i
          });
        }
        
        mixsetProgress.set(mixsetId, {
          ...mixsetProgress.get(mixsetId),
          completed: i + 1
        });
      } catch (error) {
        console.error(`Failed to download ${track.title}:`, error);
      }
    }

    if (downloadedFiles.length < 2) {
      mixsetProgress.set(mixsetId, {
        ...mixsetProgress.get(mixsetId),
        status: 'error',
        error: 'Not enough tracks downloaded successfully'
      });
      return;
    }

    // Step 2: Create mixset with FFmpeg crossfade
    mixsetProgress.set(mixsetId, {
      ...mixsetProgress.get(mixsetId),
      phase: 'Creating mixset with crossfade...',
      current: 'Mixing tracks together'
    });

    const safeMixsetName = mixsetName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
    const outputMixset = path.join(DOWNLOADS_DIR, `${mixsetId}_${safeMixsetName}.mp3`);

    try {
      await createMixsetWithCrossfade(downloadedFiles, outputMixset, crossfadeDuration);
      
      // Clean up individual files
      fs.rmSync(mixsetDir, { recursive: true, force: true });
      
      mixsetProgress.set(mixsetId, {
        ...mixsetProgress.get(mixsetId),
        status: 'completed',
        phase: 'Mixset ready!',
        filename: `${mixsetId}_${safeMixsetName}.mp3`,
        trackCount: downloadedFiles.length,
        crossfade: crossfadeDuration
      });
    } catch (error) {
      console.error('Mixset creation error:', error);
      mixsetProgress.set(mixsetId, {
        ...mixsetProgress.get(mixsetId),
        status: 'error',
        error: 'Failed to create mixset: ' + error.message
      });
    }
  })();
});

// Create mixset using FFmpeg with crossfade
function createMixsetWithCrossfade(files, outputPath, crossfadeSec) {
  return new Promise((resolve, reject) => {
    if (files.length < 2) {
      reject(new Error('Need at least 2 files'));
      return;
    }

    // Sort files by order
    files.sort((a, b) => a.order - b.order);
    
    // Build FFmpeg command for crossfade concatenation
    // Using acrossfade filter for smooth transitions
    const inputArgs = [];
    files.forEach(f => {
      inputArgs.push('-i', f.path);
    });

    // Build filter complex for crossfade
    let filterComplex = '';
    const cf = crossfadeSec;
    
    if (files.length === 2) {
      // Simple case: 2 files
      filterComplex = `[0:a][1:a]acrossfade=d=${cf}:c1=tri:c2=tri[out]`;
    } else {
      // Multiple files: chain crossfades
      // [0:a][1:a]acrossfade=d=5[a01]; [a01][2:a]acrossfade=d=5[a02]; ...
      let lastOutput = '[0:a]';
      for (let i = 1; i < files.length; i++) {
        const outputLabel = i === files.length - 1 ? '[out]' : `[a${String(i).padStart(2, '0')}]`;
        filterComplex += `${lastOutput}[${i}:a]acrossfade=d=${cf}:c1=tri:c2=tri${outputLabel}`;
        if (i < files.length - 1) {
          filterComplex += '; ';
          lastOutput = `[a${String(i).padStart(2, '0')}]`;
        }
      }
    }

    const args = [
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-codec:a', 'libmp3lame',
      '-q:a', '2',
      '-y',
      outputPath
    ];

    console.log('FFmpeg mixset command:', 'ffmpeg', args.join(' '));

    const ffmpeg = spawn('ffmpeg', args);
    
    ffmpeg.stdout.on('data', (data) => {
      console.log('FFmpeg stdout:', data.toString());
    });
    
    ffmpeg.stderr.on('data', (data) => {
      // FFmpeg outputs progress to stderr
      console.log('FFmpeg:', data.toString());
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
}

// Get mixset progress
app.get('/api/mixset-progress/:mixsetId', (req, res) => {
  const { mixsetId } = req.params;
  const progress = mixsetProgress.get(mixsetId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Mixset not found' });
  }
  
  res.json(progress);
});

// Download mixset file
app.get('/api/mixset-file/:mixsetId', (req, res) => {
  const { mixsetId } = req.params;
  const progress = mixsetProgress.get(mixsetId);
  
  if (!progress || progress.status !== 'completed') {
    return res.status(404).json({ error: 'Mixset not ready' });
  }
  
  const filePath = path.join(DOWNLOADS_DIR, progress.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Mixset file not found' });
  }
  
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(progress.filename)}"; filename*=UTF-8''${encodeURIComponent(progress.filename)}`);
  
  res.download(filePath, progress.filename, (err) => {
    if (err) {
      console.error('Mixset download error:', err);
    }
    // Clean up after download
    setTimeout(() => {
      try {
        fs.unlinkSync(filePath);
        mixsetProgress.delete(mixsetId);
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    }, 300000); // Delete after 5 minutes
  });
});

// Get bulk download progress
app.get('/api/bulk-progress/:bulkId', (req, res) => {
  const { bulkId } = req.params;
  const progress = bulkDownloadProgress.get(bulkId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Bulk download not found' });
  }
  
  res.json(progress);
});

// Serve bulk download ZIP file
app.get('/api/bulk-file/:bulkId', (req, res) => {
  const { bulkId } = req.params;
  const progress = bulkDownloadProgress.get(bulkId);
  
  if (!progress || progress.status !== 'completed') {
    return res.status(404).json({ error: 'ZIP file not ready' });
  }
  
  const filePath = path.join(DOWNLOADS_DIR, progress.zipFile);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'ZIP file not found' });
  }
  
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="music_downloads.zip"; filename*=UTF-8''music_downloads.zip`);
  
  res.download(filePath, 'music_downloads.zip', (err) => {
    if (err) {
      console.error('Download error:', err);
    }
    // Clean up after download
    setTimeout(() => {
      try {
        fs.unlinkSync(filePath);
        bulkDownloadProgress.delete(bulkId);
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    }, 300000); // Delete after 5 minutes
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Downloads directory: ${DOWNLOADS_DIR}`);
});

