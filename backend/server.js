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
import multer from 'multer';

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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Multer setup for audio file uploads
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(DOWNLOADS_DIR, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `audio_${Date.now()}_${uuidv4()}.webm`);
  }
});
const upload = multer({ 
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Store download progress
const downloadProgress = new Map();
// Store bulk download progress
const bulkDownloadProgress = new Map();

// YouTube Search API
app.post('/api/search', async (req, res) => {
  const { query, limit = 5 } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    const process = spawn('yt-dlp', [
      '--dump-json',
      '--flat-playlist',
      '--no-download',
      `ytsearch${limit}:${query}`
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
        console.error('yt-dlp search error:', stderr);
        return res.status(500).json({ error: 'Search failed', details: stderr });
      }

      try {
        // Each result is a separate JSON object on each line
        const results = stdout.trim().split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              const item = JSON.parse(line);
              return {
                videoId: item.id,
                title: item.title,
                url: item.url || `https://www.youtube.com/watch?v=${item.id}`,
                thumbnail: item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`,
                duration: item.duration,
                uploader: item.uploader || item.channel
              };
            } catch (e) {
              return null;
            }
          })
          .filter(Boolean);

        res.json({ results });
      } catch (parseErr) {
        console.error('Parse error:', parseErr);
        res.status(500).json({ error: 'Failed to parse search results' });
      }
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get video info
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Check if it's a YouTube URL or a search query
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+/;
  const isYouTubeUrl = youtubeRegex.test(url);
  
  // If not a URL, treat as search query and get first result
  const targetUrl = isYouTubeUrl ? url : `ytsearch1:${url}`;

  try {
    const process = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      targetUrl
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
  const { url, formatId, title, outputFormat = 'mp4', customFilename } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const downloadId = uuidv4();
  const outputTemplate = path.join(DOWNLOADS_DIR, `${downloadId}.%(ext)s`);
  
  // 파일명에서 사용할 수 없는 문자 제거 (customFilename 우선 사용)
  const safeTitle = (customFilename || title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
  
  console.log('Download request:', { url, formatId, title, safeTitle, outputFormat, customFilename });
  
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

// Waveform progress tracking
const waveformProgress = new Map();

// Generate waveform data from YouTube video
app.post('/api/waveform', async (req, res) => {
  const { url, videoId } = req.body;
  
  if (!url && !videoId) {
    return res.status(400).json({ error: 'URL or videoId is required' });
  }

  const targetUrl = url || `https://www.youtube.com/watch?v=${videoId}`;
  const waveformId = videoId || uuidv4();
  
  // Check if we already have cached waveform data
  const cached = waveformProgress.get(waveformId);
  if (cached && cached.status === 'completed' && cached.waveform) {
    return res.json({ waveformId, waveform: cached.waveform, cached: true });
  }

  waveformProgress.set(waveformId, { status: 'downloading', progress: 0 });
  res.json({ waveformId, message: 'Waveform generation started' });

  // Process in background
  (async () => {
    const tempDir = path.join(DOWNLOADS_DIR, `waveform_${waveformId}`);
    const audioPath = path.join(tempDir, 'audio.mp3');
    
    try {
      fs.mkdirSync(tempDir, { recursive: true });

      // Step 1: Download audio only (fast, low quality is fine for waveform)
      waveformProgress.set(waveformId, { status: 'downloading', progress: 10 });
      
      await new Promise((resolve, reject) => {
        const ytdlp = spawn('yt-dlp', [
          '-x',
          '--audio-format', 'mp3',
          '--audio-quality', '9', // Lowest quality for speed
          '-o', audioPath.replace('.mp3', '.%(ext)s'),
          '--no-playlist',
          '--max-filesize', '50M', // Limit file size
          targetUrl
        ]);

        ytdlp.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error('Download failed'));
        });

        ytdlp.on('error', reject);
      });

      waveformProgress.set(waveformId, { status: 'analyzing', progress: 50 });

      // Find the downloaded audio file
      const files = fs.readdirSync(tempDir);
      const audioFile = files.find(f => f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.webm'));
      
      if (!audioFile) {
        throw new Error('Audio file not found');
      }

      const actualAudioPath = path.join(tempDir, audioFile);

      // Step 2: Extract waveform data using FFmpeg
      const waveformData = await extractWaveformData(actualAudioPath);

      waveformProgress.set(waveformId, { 
        status: 'completed', 
        progress: 100,
        waveform: waveformData 
      });

      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true });

    } catch (error) {
      console.error('Waveform generation error:', error);
      waveformProgress.set(waveformId, { 
        status: 'error', 
        error: error.message 
      });
      
      // Clean up on error
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  })();
});

// Extract waveform data using FFmpeg
function extractWaveformData(audioPath, samples = 200) {
  return new Promise((resolve, reject) => {
    // Use FFmpeg to get audio duration first
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      audioPath
    ]);

    let probeOutput = '';
    ffprobe.stdout.on('data', (data) => {
      probeOutput += data.toString();
    });

    ffprobe.on('close', (probeCode) => {
      let duration = 180; // Default 3 minutes
      try {
        const probeData = JSON.parse(probeOutput);
        duration = parseFloat(probeData.format.duration) || 180;
      } catch (e) {}

      // Calculate sample rate for approximately 'samples' data points
      const sampleInterval = Math.max(duration / samples, 0.1);

      // Extract volume levels using FFmpeg
      const ffmpeg = spawn('ffmpeg', [
        '-i', audioPath,
        '-af', `volumedetect,astats=metadata=1:reset=${sampleInterval}`,
        '-f', 'null',
        '-'
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        // Parse RMS levels from FFmpeg output or generate from raw analysis
        const waveform = generateWaveformFromAudio(stderr, samples, duration);
        resolve(waveform);
      });

      ffmpeg.on('error', (err) => {
        // Fallback: generate approximate waveform
        resolve(generateFallbackWaveform(samples));
      });
    });

    ffprobe.on('error', () => {
      resolve(generateFallbackWaveform(samples));
    });
  });
}

// Generate waveform data from FFmpeg analysis
function generateWaveformFromAudio(ffmpegOutput, samples, duration) {
  const waveform = {
    peaks: [],
    duration: duration,
    sampleRate: samples
  };

  // Try to extract RMS values from output
  const rmsMatches = ffmpegOutput.match(/RMS level dB: (-?\d+\.?\d*)/g);
  
  if (rmsMatches && rmsMatches.length > 0) {
    const rmsValues = rmsMatches.map(m => {
      const db = parseFloat(m.match(/-?\d+\.?\d*/)[0]);
      // Convert dB to 0-1 scale (assuming -60dB to 0dB range)
      return Math.max(0, Math.min(1, (db + 60) / 60));
    });

    // Resample to exact number of samples needed
    for (let i = 0; i < samples; i++) {
      const idx = Math.floor((i / samples) * rmsValues.length);
      waveform.peaks.push(rmsValues[idx] || 0.5);
    }
  } else {
    // Fallback: use mean volume from volumedetect
    const meanMatch = ffmpegOutput.match(/mean_volume: (-?\d+\.?\d*) dB/);
    const maxMatch = ffmpegOutput.match(/max_volume: (-?\d+\.?\d*) dB/);
    
    const meanDb = meanMatch ? parseFloat(meanMatch[1]) : -20;
    const maxDb = maxMatch ? parseFloat(maxMatch[1]) : -5;
    
    // Generate realistic-looking waveform based on mean/max values
    waveform.peaks = generateRealisticWaveform(samples, meanDb, maxDb);
  }

  return waveform;
}

// Generate realistic waveform pattern
function generateRealisticWaveform(samples, meanDb, maxDb) {
  const peaks = [];
  const baseLevel = Math.max(0.2, (meanDb + 60) / 60);
  const peakLevel = Math.max(0.5, (maxDb + 60) / 60);
  
  // Create natural-looking waveform with intro, buildup, drops, and outro
  for (let i = 0; i < samples; i++) {
    const position = i / samples;
    
    // Envelope: quiet intro, build, peak sections, outro
    let envelope = 1;
    if (position < 0.05) {
      envelope = position / 0.05 * 0.3; // Quiet intro
    } else if (position < 0.15) {
      envelope = 0.3 + (position - 0.05) / 0.1 * 0.4; // Build
    } else if (position > 0.9) {
      envelope = 1 - (position - 0.9) / 0.1 * 0.5; // Outro
    }
    
    // Add variation and beats
    const beat = Math.sin(i * 0.5) * 0.15;
    const variation = (Math.random() - 0.5) * 0.2;
    const drop = (Math.sin(position * Math.PI * 4) > 0.8) ? 0.2 : 0;
    
    let value = baseLevel * envelope + beat + variation + drop;
    value = Math.max(0.1, Math.min(1, value));
    
    peaks.push(value);
  }
  
  return peaks;
}

// Fallback waveform if FFmpeg fails
function generateFallbackWaveform(samples) {
  return {
    peaks: generateRealisticWaveform(samples, -20, -5),
    duration: 180,
    sampleRate: samples,
    fallback: true
  };
}

// Get waveform generation progress
app.get('/api/waveform-progress/:waveformId', (req, res) => {
  const { waveformId } = req.params;
  const progress = waveformProgress.get(waveformId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Waveform not found' });
  }
  
  res.json(progress);
});

// Get cached waveform data
app.get('/api/waveform/:waveformId', (req, res) => {
  const { waveformId } = req.params;
  const data = waveformProgress.get(waveformId);
  
  if (!data || data.status !== 'completed') {
    return res.status(404).json({ error: 'Waveform not ready' });
  }
  
  res.json({ waveformId, waveform: data.waveform });
});

// Clean up old waveform cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of waveformProgress.entries()) {
    if (data.timestamp && now - data.timestamp > 30 * 60 * 1000) { // 30 minutes
      waveformProgress.delete(id);
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes

// ==================== DJ PRO FEATURES ====================

// Store for loop extraction, stem separation, and pitch shift progress
const loopProgress = new Map();
const stemProgress = new Map();
const pitchProgress = new Map();

// 1. Loop/Segment Extraction API
app.post('/api/extract-loop', async (req, res) => {
  const { url, startTime, endTime, title } = req.body;
  
  if (!url || startTime === undefined || endTime === undefined) {
    return res.status(400).json({ error: 'URL, startTime, and endTime are required' });
  }
  
  const loopId = uuidv4();
  const duration = endTime - startTime;
  
  if (duration <= 0 || duration > 300) {
    return res.status(400).json({ error: 'Invalid loop duration (max 5 minutes)' });
  }
  
  loopProgress.set(loopId, { status: 'processing', progress: 0 });
  
  // Process in background
  (async () => {
    const outputPath = path.join(DOWNLOADS_DIR, `${loopId}_loop.mp3`);
    
    try {
      // Download with time range using yt-dlp
      const ytdlp = spawn('yt-dlp', [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--download-sections', `*${startTime}-${endTime}`,
        '--force-keyframes-at-cuts',
        '-o', outputPath.replace('.mp3', '.%(ext)s'),
        url
      ]);
      
      ytdlp.stderr.on('data', (data) => {
        console.log('Loop extraction:', data.toString());
      });
      
      await new Promise((resolve, reject) => {
        ytdlp.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error('Loop extraction failed'));
        });
        ytdlp.on('error', reject);
      });
      
      loopProgress.set(loopId, { 
        status: 'completed', 
        path: outputPath,
        filename: `${title || 'loop'}_${startTime}s-${endTime}s.mp3`
      });
      
    } catch (error) {
      console.error('Loop extraction error:', error);
      loopProgress.set(loopId, { status: 'error', error: error.message });
    }
  })();
  
  res.json({ loopId, message: 'Loop extraction started' });
});

// Download extracted loop
app.get('/api/download-loop/:loopId', (req, res) => {
  const { loopId } = req.params;
  const progress = loopProgress.get(loopId);
  
  if (!progress || progress.status !== 'completed') {
    return res.status(404).json({ error: 'Loop not ready' });
  }
  
  const filePath = progress.path;
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Loop file not found' });
  }
  
  res.download(filePath, progress.filename, (err) => {
    if (!err) {
      // Clean up after download
      setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch (e) {}
        loopProgress.delete(loopId);
      }, 60000);
    }
  });
});

// Get loop extraction progress
app.get('/api/loop-progress/:loopId', (req, res) => {
  const { loopId } = req.params;
  const progress = loopProgress.get(loopId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Loop extraction not found' });
  }
  
  res.json(progress);
});

// 2. Stem Separation API (simplified - uses spleeter if available, otherwise returns error)
app.post('/api/separate-stems', async (req, res) => {
  const { url, title } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  const stemId = uuidv4();
  stemProgress.set(stemId, { status: 'starting', message: 'Downloading audio...' });
  
  // Process in background
  (async () => {
    const tempDir = path.join(DOWNLOADS_DIR, `stem_${stemId}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    try {
      // Step 1: Download audio
      stemProgress.set(stemId, { status: 'downloading', message: 'Downloading audio...', progress: 10 });
      
      const audioPath = path.join(tempDir, 'audio.mp3');
      const ytdlp = spawn('yt-dlp', [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', audioPath,
        url
      ]);
      
      await new Promise((resolve, reject) => {
        ytdlp.on('close', (code) => code === 0 ? resolve() : reject(new Error('Download failed')));
        ytdlp.on('error', reject);
      });
      
      // Step 2: Try to separate using demucs (if available)
      stemProgress.set(stemId, { status: 'separating', message: 'Separating stems (this may take a few minutes)...', progress: 30 });
      
      // Check if demucs is available
      const demucsCheck = spawn('which', ['demucs']);
      const hasDemucs = await new Promise((resolve) => {
        demucsCheck.on('close', (code) => resolve(code === 0));
        demucsCheck.on('error', () => resolve(false));
      });
      
      if (hasDemucs) {
        // Use demucs for high-quality separation
        const demucs = spawn('demucs', [
          '-n', 'htdemucs',
          '--two-stems', 'vocals', // Can be 'vocals', 'drums', 'bass', 'other'
          '-o', tempDir,
          audioPath
        ]);
        
        demucs.stderr.on('data', (data) => {
          const output = data.toString();
          if (output.includes('%')) {
            const match = output.match(/(\d+)%/);
            if (match) {
              stemProgress.set(stemId, { 
                status: 'separating', 
                message: `Separating stems: ${match[1]}%`,
                progress: 30 + parseInt(match[1]) * 0.6
              });
            }
          }
        });
        
        await new Promise((resolve, reject) => {
          demucs.on('close', (code) => code === 0 ? resolve() : reject(new Error('Demucs separation failed')));
          demucs.on('error', reject);
        });
        
        // Find output files
        const stemDir = path.join(tempDir, 'htdemucs', 'audio');
        const stems = {};
        
        if (fs.existsSync(path.join(stemDir, 'vocals.wav'))) {
          stems.vocals = path.join(stemDir, 'vocals.wav');
        }
        if (fs.existsSync(path.join(stemDir, 'no_vocals.wav'))) {
          stems.instrumental = path.join(stemDir, 'no_vocals.wav');
        }
        
        stemProgress.set(stemId, {
          status: 'completed',
          message: 'Stem separation complete!',
          progress: 100,
          stems,
          title: title || 'track'
        });
        
      } else {
        // Fallback: Use FFmpeg for basic vocal removal (not as good but works)
        stemProgress.set(stemId, { 
          status: 'separating', 
          message: 'Using basic separation (FFmpeg)...',
          progress: 50 
        });
        
        const vocalPath = path.join(tempDir, 'vocals_removed.mp3');
        
        // Simple center channel removal (removes most vocals)
        const ffmpeg = spawn('ffmpeg', [
          '-i', audioPath,
          '-af', 'pan=stereo|c0=c0-c1|c1=c1-c0',
          '-y',
          vocalPath
        ]);
        
        await new Promise((resolve, reject) => {
          ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error('FFmpeg processing failed')));
          ffmpeg.on('error', reject);
        });
        
        stemProgress.set(stemId, {
          status: 'completed',
          message: 'Basic stem separation complete (vocals reduced)',
          progress: 100,
          stems: {
            original: audioPath,
            instrumental: vocalPath
          },
          title: title || 'track',
          note: 'For better quality, install demucs: pip install demucs'
        });
      }
      
    } catch (error) {
      console.error('Stem separation error:', error);
      stemProgress.set(stemId, { 
        status: 'error', 
        message: error.message,
        progress: 0
      });
      
      // Clean up on error
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }
  })();
  
  res.json({ stemId, message: 'Stem separation started' });
});

// Get stem separation progress
app.get('/api/stem-progress/:stemId', (req, res) => {
  const { stemId } = req.params;
  const progress = stemProgress.get(stemId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Stem separation not found' });
  }
  
  res.json(progress);
});

// Download separated stem
app.get('/api/download-stem/:stemId/:stemType', (req, res) => {
  const { stemId, stemType } = req.params;
  const progress = stemProgress.get(stemId);
  
  if (!progress || progress.status !== 'completed') {
    return res.status(404).json({ error: 'Stems not ready' });
  }
  
  const stemPath = progress.stems[stemType];
  if (!stemPath || !fs.existsSync(stemPath)) {
    return res.status(404).json({ error: 'Stem file not found' });
  }
  
  const ext = path.extname(stemPath);
  const filename = `${progress.title}_${stemType}${ext}`;
  
  res.download(stemPath, filename);
});

// 3. Pitch Shift API
app.post('/api/pitch-shift', async (req, res) => {
  const { url, semitones, title } = req.body;
  
  if (!url || semitones === undefined) {
    return res.status(400).json({ error: 'URL and semitones are required' });
  }
  
  if (semitones < -12 || semitones > 12) {
    return res.status(400).json({ error: 'Semitones must be between -12 and 12' });
  }
  
  const pitchId = uuidv4();
  pitchProgress.set(pitchId, { status: 'processing', progress: 0 });
  
  // Process in background
  (async () => {
    const tempDir = path.join(DOWNLOADS_DIR, `pitch_${pitchId}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    try {
      // Step 1: Download audio
      pitchProgress.set(pitchId, { status: 'downloading', progress: 20 });
      
      const inputPath = path.join(tempDir, 'input.mp3');
      const ytdlp = spawn('yt-dlp', [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', inputPath,
        url
      ]);
      
      await new Promise((resolve, reject) => {
        ytdlp.on('close', (code) => code === 0 ? resolve() : reject(new Error('Download failed')));
        ytdlp.on('error', reject);
      });
      
      // Step 2: Apply pitch shift using rubberband (via FFmpeg)
      pitchProgress.set(pitchId, { status: 'processing', progress: 50 });
      
      const outputPath = path.join(tempDir, 'output.mp3');
      
      // Calculate pitch shift ratio (semitones to frequency ratio)
      // 1 semitone = 2^(1/12) ≈ 1.0595
      const pitchRatio = Math.pow(2, semitones / 12);
      
      // Use asetrate and aresample for pitch shifting without tempo change
      // Or use rubberband filter if available
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-af', `asetrate=44100*${pitchRatio},aresample=44100,atempo=${1/pitchRatio}`,
        '-y',
        outputPath
      ]);
      
      ffmpeg.stderr.on('data', (data) => {
        console.log('Pitch shift:', data.toString());
      });
      
      await new Promise((resolve, reject) => {
        ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error('Pitch shift failed')));
        ffmpeg.on('error', reject);
      });
      
      const keyChange = semitones > 0 ? `+${semitones}` : `${semitones}`;
      
      pitchProgress.set(pitchId, { 
        status: 'completed', 
        progress: 100,
        path: outputPath,
        filename: `${title || 'track'}_${keyChange}semitones.mp3`
      });
      
    } catch (error) {
      console.error('Pitch shift error:', error);
      pitchProgress.set(pitchId, { status: 'error', error: error.message });
      
      // Clean up on error
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }
  })();
  
  res.json({ pitchId, message: 'Pitch shift started' });
});

// Get pitch shift progress
app.get('/api/pitch-progress/:pitchId', (req, res) => {
  const { pitchId } = req.params;
  const progress = pitchProgress.get(pitchId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Pitch shift not found' });
  }
  
  res.json(progress);
});

// Download pitch-shifted file
app.get('/api/download-pitched/:pitchId', (req, res) => {
  const { pitchId } = req.params;
  const progress = pitchProgress.get(pitchId);
  
  if (!progress || progress.status !== 'completed') {
    return res.status(404).json({ error: 'Pitch-shifted file not ready' });
  }
  
  const filePath = progress.path;
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(filePath, progress.filename, (err) => {
    if (!err) {
      // Clean up after download
      setTimeout(() => {
        try { 
          const tempDir = path.dirname(filePath);
          fs.rmSync(tempDir, { recursive: true, force: true }); 
        } catch (e) {}
        pitchProgress.delete(pitchId);
      }, 60000);
    }
  });
});

// 4. Energy Curve Analysis API
app.post('/api/analyze-energy', async (req, res) => {
  const { url, samples = 50 } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  const analysisId = uuidv4();
  const tempDir = path.join(DOWNLOADS_DIR, `energy_${analysisId}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  try {
    // Download audio
    const audioPath = path.join(tempDir, 'audio.mp3');
    const ytdlp = spawn('yt-dlp', [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '5',
      '-o', audioPath,
      url
    ]);
    
    await new Promise((resolve, reject) => {
      ytdlp.on('close', (code) => code === 0 ? resolve() : reject(new Error('Download failed')));
      ytdlp.on('error', reject);
    });
    
    // Analyze energy using FFmpeg's volumedetect
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      audioPath
    ]);
    
    let probeOutput = '';
    ffprobe.stdout.on('data', (data) => { probeOutput += data.toString(); });
    
    const duration = await new Promise((resolve) => {
      ffprobe.on('close', () => {
        try {
          const data = JSON.parse(probeOutput);
          resolve(parseFloat(data.format.duration) || 180);
        } catch (e) { resolve(180); }
      });
    });
    
    // Get RMS levels at intervals
    const interval = duration / samples;
    const energyCurve = [];
    
    for (let i = 0; i < samples; i++) {
      const startTime = i * interval;
      const endTime = Math.min(startTime + interval, duration);
      
      const ffmpeg = spawn('ffmpeg', [
        '-ss', startTime.toString(),
        '-t', interval.toString(),
        '-i', audioPath,
        '-af', 'volumedetect',
        '-f', 'null',
        '-'
      ]);
      
      let stderr = '';
      ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });
      
      const rms = await new Promise((resolve) => {
        ffmpeg.on('close', () => {
          const match = stderr.match(/mean_volume: ([-\d.]+) dB/);
          if (match) {
            // Convert dB to 0-100 scale (approx)
            const db = parseFloat(match[1]);
            const normalized = Math.max(0, Math.min(100, (db + 50) * 2));
            resolve(normalized);
          } else {
            resolve(50); // Default
          }
        });
      });
      
      energyCurve.push({
        time: startTime,
        energy: rms
      });
    }
    
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    res.json({ 
      energyCurve,
      duration,
      samples
    });
    
  } catch (error) {
    console.error('Energy analysis error:', error);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    res.status(500).json({ error: error.message });
  }
});

// 5. Track Structure Analysis API (Intro/Drop/Breakdown/Outro detection)
app.post('/api/analyze-structure', async (req, res) => {
  const { url, title } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  const analysisId = uuidv4();
  const tempDir = path.join(DOWNLOADS_DIR, `structure_${analysisId}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  try {
    // Download audio
    const audioPath = path.join(tempDir, 'audio.mp3');
    const ytdlp = spawn('yt-dlp', [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '5',
      '-o', audioPath,
      url
    ]);
    
    await new Promise((resolve, reject) => {
      ytdlp.on('close', (code) => code === 0 ? resolve() : reject(new Error('Download failed')));
      ytdlp.on('error', reject);
    });
    
    // Get duration
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      audioPath
    ]);
    
    let probeOutput = '';
    ffprobe.stdout.on('data', (data) => { probeOutput += data.toString(); });
    
    const duration = await new Promise((resolve) => {
      ffprobe.on('close', () => {
        try {
          const data = JSON.parse(probeOutput);
          resolve(parseFloat(data.format.duration) || 180);
        } catch (e) { resolve(180); }
      });
    });
    
    // Analyze energy at many points to detect structure
    const samples = 100;
    const interval = duration / samples;
    const energyData = [];
    
    for (let i = 0; i < samples; i++) {
      const startTime = i * interval;
      
      const ffmpeg = spawn('ffmpeg', [
        '-ss', startTime.toString(),
        '-t', interval.toString(),
        '-i', audioPath,
        '-af', 'volumedetect',
        '-f', 'null',
        '-'
      ]);
      
      let stderr = '';
      ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });
      
      const energy = await new Promise((resolve) => {
        ffmpeg.on('close', () => {
          const match = stderr.match(/mean_volume: ([-\d.]+) dB/);
          if (match) {
            const db = parseFloat(match[1]);
            resolve(Math.max(0, Math.min(100, (db + 50) * 2)));
          } else {
            resolve(50);
          }
        });
      });
      
      energyData.push({ time: startTime, energy });
    }
    
    // Detect structure based on energy changes
    const avgEnergy = energyData.reduce((a, b) => a + b.energy, 0) / energyData.length;
    const highThreshold = avgEnergy * 1.2;
    const lowThreshold = avgEnergy * 0.7;
    
    const sections = [];
    let currentSection = { type: 'intro', start: 0 };
    
    for (let i = 1; i < energyData.length; i++) {
      const prev = energyData[i - 1].energy;
      const curr = energyData[i].energy;
      const time = energyData[i].time;
      
      // Detect significant changes
      const change = curr - prev;
      
      if (change > 15 && curr > highThreshold && currentSection.type !== 'drop') {
        // Energy spike - likely a drop
        currentSection.end = time;
        sections.push({ ...currentSection });
        currentSection = { type: 'drop', start: time };
      } else if (change < -15 && curr < lowThreshold && currentSection.type !== 'breakdown') {
        // Energy drop - likely a breakdown
        currentSection.end = time;
        sections.push({ ...currentSection });
        currentSection = { type: 'breakdown', start: time };
      } else if (i > samples * 0.8 && currentSection.type !== 'outro') {
        // Last 20% - likely outro
        currentSection.end = time;
        sections.push({ ...currentSection });
        currentSection = { type: 'outro', start: time };
      }
    }
    
    // Close last section
    currentSection.end = duration;
    sections.push(currentSection);
    
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    res.json({
      duration,
      sections,
      energyData,
      avgEnergy: Math.round(avgEnergy)
    });
    
  } catch (error) {
    console.error('Structure analysis error:', error);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    res.status(500).json({ error: error.message });
  }
});

// 6. Tempo Change (Time Stretch) API - BPM change while preserving pitch
app.post('/api/tempo-change', async (req, res) => {
  const { url, originalBpm, targetBpm, title } = req.body;
  
  if (!url || !originalBpm || !targetBpm) {
    return res.status(400).json({ error: 'URL, originalBpm, and targetBpm are required' });
  }
  
  const tempoRatio = targetBpm / originalBpm;
  if (tempoRatio < 0.5 || tempoRatio > 2.0) {
    return res.status(400).json({ error: 'Tempo change must be between 50% and 200%' });
  }
  
  const tempoId = uuidv4();
  const tempDir = path.join(DOWNLOADS_DIR, `tempo_${tempoId}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  try {
    // Download audio
    const inputPath = path.join(tempDir, 'input.mp3');
    const ytdlp = spawn('yt-dlp', [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', inputPath,
      url
    ]);
    
    await new Promise((resolve, reject) => {
      ytdlp.on('close', (code) => code === 0 ? resolve() : reject(new Error('Download failed')));
      ytdlp.on('error', reject);
    });
    
    // Apply tempo change using FFmpeg's rubberband or atempo filter
    const outputPath = path.join(tempDir, 'output.mp3');
    
    // atempo filter only works between 0.5 and 2.0
    // Chain multiple atempo filters if needed
    let atempoFilters = [];
    let ratio = tempoRatio;
    
    while (ratio < 0.5) {
      atempoFilters.push('atempo=0.5');
      ratio /= 0.5;
    }
    while (ratio > 2.0) {
      atempoFilters.push('atempo=2.0');
      ratio /= 2.0;
    }
    atempoFilters.push(`atempo=${ratio}`);
    
    const filterChain = atempoFilters.join(',');
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-af', filterChain,
      '-y',
      outputPath
    ]);
    
    await new Promise((resolve, reject) => {
      ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error('Tempo change failed')));
      ffmpeg.on('error', reject);
    });
    
    // Send file
    const filename = `${title || 'track'}_${originalBpm}to${targetBpm}bpm.mp3`;
    res.download(outputPath, filename, (err) => {
      // Clean up after download
      setTimeout(() => {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
      }, 60000);
    });
    
  } catch (error) {
    console.error('Tempo change error:', error);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    res.status(500).json({ error: error.message });
  }
});

// 7. Chord Detection API (AI-powered)
app.post('/api/detect-chords', async (req, res) => {
  const { title, artist, duration } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  
  if (!hasAI) {
    return res.status(503).json({ error: 'AI service not available' });
  }
  
  try {
    const prompt = `You are a professional music theory expert. Analyze the likely chord progression for this song:

Song: "${title}" by ${artist || 'Unknown'}
${duration ? `Duration: ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : ''}

Based on the song title, artist, and typical patterns in similar music:
1. Identify the most likely key
2. Provide the probable chord progression (using standard notation like C, Am, F, G)
3. Identify any notable chord features (7ths, sus chords, etc.)
4. Estimate the chord change pattern (every bar, every 2 bars, etc.)

Respond in this JSON format ONLY:
{
  "key": "C major",
  "chords": ["C", "G", "Am", "F"],
  "progression": "I - V - vi - IV",
  "pattern": "1 chord per bar",
  "confidence": "medium",
  "notes": "Classic pop progression"
}`;

    let result;
    
    if (genAI) {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const genResult = await model.generateContent(prompt);
      const text = genResult.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } else if (anthropic) {
      const message = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      });
      const text = message.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }
    
    if (!result) {
      throw new Error('Failed to analyze chords');
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Chord detection error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Smart Next Track Recommendation API
app.post('/api/smart-next-track', async (req, res) => {
  const { currentTrack, availableTracks } = req.body;
  
  if (!currentTrack || !availableTracks || availableTracks.length === 0) {
    return res.status(400).json({ error: 'Current track and available tracks are required' });
  }
  
  try {
    // Camelot wheel compatibility
    const camelotWheel = {
      '1A': ['12A', '1A', '2A', '1B'],
      '2A': ['1A', '2A', '3A', '2B'],
      '3A': ['2A', '3A', '4A', '3B'],
      '4A': ['3A', '4A', '5A', '4B'],
      '5A': ['4A', '5A', '6A', '5B'],
      '6A': ['5A', '6A', '7A', '6B'],
      '7A': ['6A', '7A', '8A', '7B'],
      '8A': ['7A', '8A', '9A', '8B'],
      '9A': ['8A', '9A', '10A', '9B'],
      '10A': ['9A', '10A', '11A', '10B'],
      '11A': ['10A', '11A', '12A', '11B'],
      '12A': ['11A', '12A', '1A', '12B'],
      '1B': ['12B', '1B', '2B', '1A'],
      '2B': ['1B', '2B', '3B', '2A'],
      '3B': ['2B', '3B', '4B', '3A'],
      '4B': ['3B', '4B', '5B', '4A'],
      '5B': ['4B', '5B', '6B', '5A'],
      '6B': ['5B', '6B', '7B', '6A'],
      '7B': ['6B', '7B', '8B', '7A'],
      '8B': ['7B', '8B', '9B', '8A'],
      '9B': ['8B', '9B', '10B', '9A'],
      '10B': ['9B', '10B', '11B', '10A'],
      '11B': ['10B', '11B', '12B', '11A'],
      '12B': ['11B', '12B', '1B', '12A']
    };
    
    // Key to Camelot mapping
    const keyToCamelot = {
      'C': '8B', 'Am': '8A', 'G': '9B', 'Em': '9A',
      'D': '10B', 'Bm': '10A', 'A': '11B', 'F#m': '11A',
      'E': '12B', 'C#m': '12A', 'B': '1B', 'G#m': '1A',
      'F#': '2B', 'D#m': '2A', 'Db': '3B', 'Bbm': '3A',
      'Ab': '4B', 'Fm': '4A', 'Eb': '5B', 'Cm': '5A',
      'Bb': '6B', 'Gm': '6A', 'F': '7B', 'Dm': '7A'
    };
    
    const currentBpm = currentTrack.bpm || 128;
    const currentKey = currentTrack.key;
    const currentCamelot = keyToCamelot[currentKey] || currentKey;
    const currentEnergy = currentTrack.energy || 5;
    
    const compatibleKeys = camelotWheel[currentCamelot] || [];
    
    // Score each track
    const scoredTracks = availableTracks.map(track => {
      let score = 0;
      const reasons = [];
      
      const trackCamelot = keyToCamelot[track.key] || track.key;
      const trackBpm = track.bpm || 128;
      const trackEnergy = track.energy || 5;
      
      // Key compatibility (most important)
      if (compatibleKeys.includes(trackCamelot)) {
        score += 40;
        reasons.push('Key compatible');
      } else if (currentCamelot === trackCamelot) {
        score += 50;
        reasons.push('Same key');
      }
      
      // BPM compatibility (within 5% is good)
      const bpmDiff = Math.abs(trackBpm - currentBpm) / currentBpm;
      if (bpmDiff <= 0.03) {
        score += 30;
        reasons.push('BPM match');
      } else if (bpmDiff <= 0.05) {
        score += 20;
        reasons.push('BPM close');
      } else if (bpmDiff <= 0.10) {
        score += 10;
        reasons.push('BPM acceptable');
      }
      
      // Energy flow (gradual increase or same is good)
      const energyDiff = trackEnergy - currentEnergy;
      if (energyDiff >= 0 && energyDiff <= 2) {
        score += 20;
        reasons.push('Good energy flow');
      } else if (energyDiff >= -1 && energyDiff <= 3) {
        score += 10;
        reasons.push('Acceptable energy');
      }
      
      return {
        ...track,
        score,
        reasons,
        compatibility: {
          keyMatch: compatibleKeys.includes(trackCamelot) || currentCamelot === trackCamelot,
          bpmDiff: Math.round(bpmDiff * 100),
          energyDiff
        }
      };
    });
    
    // Sort by score
    scoredTracks.sort((a, b) => b.score - a.score);
    
    res.json({
      recommendations: scoredTracks.slice(0, 5),
      currentTrack: {
        camelot: currentCamelot,
        compatibleKeys
      }
    });
    
  } catch (error) {
    console.error('Smart next track error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clean up old progress data periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  [loopProgress, stemProgress, pitchProgress].forEach(progressMap => {
    for (const [id, data] of progressMap.entries()) {
      if (data.timestamp && now - data.timestamp > maxAge) {
        progressMap.delete(id);
      }
    }
  });
}, 10 * 60 * 1000);

// ==================== END DJ PRO FEATURES ====================

// ==================== MUSIC RECOGNITION (Listen & Find Similar) ====================

// Analyze recorded audio and find similar music
app.post('/api/listen-and-find', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }
  
  if (!hasAI) {
    // Clean up uploaded file
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(503).json({ error: 'AI service not available' });
  }
  
  const audioPath = req.file.path;
  
  try {
    // Step 1: Convert webm to mp3 for analysis
    const mp3Path = audioPath.replace('.webm', '.mp3');
    
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', audioPath,
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-y',
        mp3Path
      ]);
      ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error('Conversion failed')));
      ffmpeg.on('error', reject);
    });
    
    // Step 2: Extract audio features using ffmpeg
    const audioFeatures = await new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        mp3Path
      ]);
      
      let output = '';
      ffprobe.stdout.on('data', (data) => { output += data.toString(); });
      ffprobe.on('close', () => {
        try {
          const data = JSON.parse(output);
          resolve(data);
        } catch (e) {
          resolve(null);
        }
      });
    });
    
    // Step 3: Get volume/energy levels at intervals
    const energyAnalysis = await new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', mp3Path,
        '-af', 'volumedetect',
        '-f', 'null',
        '-'
      ]);
      
      let stderr = '';
      ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });
      ffmpeg.on('close', () => {
        const meanMatch = stderr.match(/mean_volume: ([-\d.]+) dB/);
        const maxMatch = stderr.match(/max_volume: ([-\d.]+) dB/);
        resolve({
          meanVolume: meanMatch ? parseFloat(meanMatch[1]) : -20,
          maxVolume: maxMatch ? parseFloat(maxMatch[1]) : -10
        });
      });
    });
    
    // Step 4: Detect tempo/BPM using aubio (if available) or estimate
    let estimatedBpm = 128; // Default
    try {
      const aubio = spawn('aubio', ['tempo', mp3Path]);
      let bpmOutput = '';
      aubio.stdout.on('data', (data) => { bpmOutput += data.toString(); });
      await new Promise((resolve) => {
        aubio.on('close', () => {
          const lines = bpmOutput.trim().split('\n');
          if (lines.length > 0) {
            const bpm = parseFloat(lines[lines.length - 1]);
            if (!isNaN(bpm) && bpm > 60 && bpm < 200) {
              estimatedBpm = Math.round(bpm);
            }
          }
          resolve();
        });
        aubio.on('error', resolve); // Ignore if aubio not installed
      });
    } catch (e) {
      // aubio not available, use energy-based estimation
      const energy = Math.abs(energyAnalysis.meanVolume);
      if (energy < 15) estimatedBpm = 140; // High energy = fast
      else if (energy < 20) estimatedBpm = 128;
      else if (energy < 25) estimatedBpm = 110;
      else estimatedBpm = 90;
    }
    
    // Step 5: Use AI to analyze the audio characteristics and suggest search terms
    const analysisPrompt = `You are a music expert AI. Based on the following audio analysis data, identify the likely music characteristics:

Audio Duration: ${audioFeatures?.format?.duration || 'Unknown'} seconds
Mean Volume: ${energyAnalysis.meanVolume} dB
Max Volume: ${energyAnalysis.maxVolume} dB
Estimated BPM: ${estimatedBpm}

Based on these characteristics, analyze what type of music this might be and provide search recommendations.

Respond in this exact JSON format:
{
  "genre": "most likely genre (e.g., House, Hip-Hop, Pop, Rock, EDM, Lo-fi, Jazz)",
  "subGenre": "sub-genre if applicable",
  "mood": "mood/atmosphere (e.g., energetic, chill, melancholic, uplifting)",
  "energy": "energy level 1-10",
  "tempo": "tempo description (slow, medium, fast)",
  "characteristics": ["list of 3-5 musical characteristics"],
  "searchQueries": ["3-5 YouTube search queries to find similar music"],
  "suggestedArtists": ["3-5 artists that might have similar music"],
  "confidence": "low/medium/high"
}`;

    let aiAnalysis = null;
    
    if (openai) {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: analysisPrompt }],
          temperature: 0.7
        });
        const text = response.choices[0].message.content;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiAnalysis = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('OpenAI analysis error:', e);
      }
    }
    
    if (!aiAnalysis && genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(analysisPrompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiAnalysis = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('Gemini analysis error:', e);
      }
    }
    
    if (!aiAnalysis && anthropic) {
      try {
        const message = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 500,
          messages: [{ role: 'user', content: analysisPrompt }]
        });
        const text = message.content[0].text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiAnalysis = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('Claude analysis error:', e);
      }
    }
    
    // Fallback analysis if AI fails
    if (!aiAnalysis) {
      const energy = Math.abs(energyAnalysis.meanVolume);
      let genre = 'Electronic';
      let mood = 'Energetic';
      
      if (estimatedBpm < 100) {
        genre = energy < 20 ? 'Lo-fi' : 'Hip-Hop';
        mood = 'Chill';
      } else if (estimatedBpm < 120) {
        genre = 'Pop';
        mood = 'Upbeat';
      } else if (estimatedBpm < 135) {
        genre = 'House';
        mood = 'Groovy';
      } else {
        genre = 'EDM';
        mood = 'Energetic';
      }
      
      aiAnalysis = {
        genre,
        subGenre: null,
        mood,
        energy: Math.min(10, Math.max(1, Math.round((40 - energy) / 4))),
        tempo: estimatedBpm < 100 ? 'slow' : estimatedBpm < 130 ? 'medium' : 'fast',
        characteristics: ['beat-driven', 'electronic elements'],
        searchQueries: [
          `${genre} music ${estimatedBpm} bpm`,
          `${mood} ${genre} mix`,
          `best ${genre.toLowerCase()} songs`
        ],
        suggestedArtists: [],
        confidence: 'low'
      };
    }
    
    // Step 6: Search YouTube for similar music using the AI-generated queries
    const searchResults = [];
    
    for (const query of (aiAnalysis.searchQueries || []).slice(0, 2)) {
      try {
        const ytSearch = spawn('yt-dlp', [
          '--dump-json',
          '--flat-playlist',
          '--default-search', 'ytsearch5',
          `ytsearch5:${query}`
        ]);
        
        let output = '';
        ytSearch.stdout.on('data', (data) => { output += data.toString(); });
        
        await new Promise((resolve) => {
          ytSearch.on('close', () => {
            const lines = output.trim().split('\n');
            for (const line of lines) {
              try {
                const video = JSON.parse(line);
                if (video.id && !searchResults.find(r => r.videoId === video.id)) {
                  searchResults.push({
                    videoId: video.id,
                    title: video.title,
                    artist: video.uploader || video.channel,
                    thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
                    duration: video.duration,
                    url: `https://www.youtube.com/watch?v=${video.id}`
                  });
                }
              } catch (e) {}
            }
            resolve();
          });
        });
      } catch (e) {
        console.error('YouTube search error:', e);
      }
    }
    
    // Clean up files
    try { fs.unlinkSync(audioPath); } catch (e) {}
    try { fs.unlinkSync(mp3Path); } catch (e) {}
    
    res.json({
      analysis: {
        bpm: estimatedBpm,
        genre: aiAnalysis.genre,
        subGenre: aiAnalysis.subGenre,
        mood: aiAnalysis.mood,
        energy: aiAnalysis.energy,
        tempo: aiAnalysis.tempo,
        characteristics: aiAnalysis.characteristics,
        suggestedArtists: aiAnalysis.suggestedArtists,
        confidence: aiAnalysis.confidence
      },
      recommendations: searchResults.slice(0, 10),
      searchQueries: aiAnalysis.searchQueries
    });
    
  } catch (error) {
    console.error('Listen and find error:', error);
    // Clean up files
    try { fs.unlinkSync(audioPath); } catch (e) {}
    res.status(500).json({ error: error.message });
  }
});

// ==================== END MUSIC RECOGNITION ====================

// ==================== MUSIC TASTE SIMILARITY ANALYSIS ====================

// Analyze music taste similarity between two users
app.post('/api/analyze-similarity', async (req, res) => {
  const { myFavorites, theirFavorites, myProfile, theirProfile } = req.body;
  
  if (!myFavorites || !theirFavorites) {
    return res.status(400).json({ error: 'Both favorite lists are required' });
  }
  
  if (!hasAI) {
    // Fallback: Simple overlap calculation
    const myVideoIds = new Set(myFavorites.map(f => f.video_id));
    const theirVideoIds = new Set(theirFavorites.map(f => f.video_id));
    const overlap = [...myVideoIds].filter(id => theirVideoIds.has(id));
    const overlapPercentage = Math.round((overlap.length / Math.max(myVideoIds.size, theirVideoIds.size)) * 100);
    
    return res.json({
      overallScore: overlapPercentage,
      sharedTracks: overlap.length,
      analysis: {
        compatibility: overlapPercentage >= 50 ? 'high' : overlapPercentage >= 25 ? 'medium' : 'low',
        summary: `${overlap.length}개의 공통 즐겨찾기가 있습니다.`,
        details: []
      }
    });
  }
  
  try {
    // Prepare data for AI analysis
    const myTracks = myFavorites.slice(0, 20).map(f => ({
      title: f.title,
      artist: f.uploader
    }));
    
    const theirTracks = theirFavorites.slice(0, 20).map(f => ({
      title: f.title,
      artist: f.uploader
    }));
    
    // Find overlapping tracks
    const myVideoIds = new Set(myFavorites.map(f => f.video_id));
    const theirVideoIds = new Set(theirFavorites.map(f => f.video_id));
    const sharedVideoIds = [...myVideoIds].filter(id => theirVideoIds.has(id));
    const sharedTracks = myFavorites.filter(f => sharedVideoIds.includes(f.video_id));
    
    const prompt = `You are a music expert AI analyzing the musical taste compatibility between two DJs/music lovers.

User A's favorite tracks (most recent 20):
${myTracks.map((t, i) => `${i+1}. "${t.title}" by ${t.artist}`).join('\n')}

User B's favorite tracks (most recent 20):
${theirTracks.map((t, i) => `${i+1}. "${t.title}" by ${t.artist}`).join('\n')}

${myProfile?.favorite_genres?.length > 0 ? `User A's stated favorite genres: ${myProfile.favorite_genres.join(', ')}` : ''}
${theirProfile?.favorite_genres?.length > 0 ? `User B's stated favorite genres: ${theirProfile.favorite_genres.join(', ')}` : ''}

They share ${sharedTracks.length} common tracks.

Analyze their musical compatibility and provide a detailed assessment. Consider:
1. Genre similarities
2. Artist overlap/similarities
3. Era/time period preferences
4. Energy levels and vibes
5. Potential for music discovery between them

Respond in this exact JSON format:
{
  "overallScore": <number 0-100>,
  "genreMatch": <number 0-100>,
  "vibeMatch": <number 0-100>,
  "eraMatch": <number 0-100>,
  "compatibilityLevel": "soulmate" | "very_high" | "high" | "medium" | "low" | "different",
  "sharedGenres": ["list of genres both seem to enjoy"],
  "uniqueToA": ["genres/styles unique to User A"],
  "uniqueToB": ["genres/styles unique to User B"],
  "summary": "2-3 sentence summary of their musical relationship",
  "recommendation": "1 sentence recommendation for music they could share",
  "funFact": "A fun observation about their taste",
  "djCompatibility": "How well they could DJ together (1-10)",
  "playlistPotential": "How good a collaborative playlist would be (1-10)"
}`;

    let aiResult = null;
    
    if (openai) {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        });
        const text = response.choices[0].message.content;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiResult = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('OpenAI similarity error:', e);
      }
    }
    
    if (!aiResult && genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiResult = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('Gemini similarity error:', e);
      }
    }
    
    if (!aiResult && anthropic) {
      try {
        const message = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }]
        });
        const text = message.content[0].text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiResult = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('Claude similarity error:', e);
      }
    }
    
    // Fallback if AI fails
    if (!aiResult) {
      const overlapPercentage = Math.round((sharedTracks.length / Math.max(myFavorites.length, theirFavorites.length)) * 100);
      aiResult = {
        overallScore: Math.min(100, overlapPercentage + 20),
        genreMatch: 50,
        vibeMatch: 50,
        eraMatch: 50,
        compatibilityLevel: overlapPercentage >= 30 ? 'high' : overlapPercentage >= 15 ? 'medium' : 'low',
        sharedGenres: [],
        uniqueToA: [],
        uniqueToB: [],
        summary: `${sharedTracks.length}개의 공통 트랙을 공유하고 있습니다.`,
        recommendation: '서로의 즐겨찾기를 탐색해보세요!',
        funFact: '음악 취향 분석 결과입니다.',
        djCompatibility: Math.round(overlapPercentage / 10),
        playlistPotential: Math.round(overlapPercentage / 10)
      };
    }
    
    res.json({
      ...aiResult,
      sharedTracks: sharedTracks.length,
      sharedTracksList: sharedTracks.slice(0, 5).map(t => ({
        title: t.title,
        artist: t.uploader,
        thumbnail: t.thumbnail
      }))
    });
    
  } catch (error) {
    console.error('Similarity analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== END MUSIC TASTE SIMILARITY ====================

// ==================== FILE UPLOAD PROXY ====================

// For clients that can't directly upload to Supabase Storage
app.post('/api/upload-media', async (req, res) => {
  // This endpoint is a fallback; direct Supabase Storage uploads are preferred
  // This can be used for server-side file processing if needed
  res.json({ 
    message: 'Use Supabase Storage direct upload for best performance',
    instructions: 'See frontend/src/lib/supabase.js uploadMedia function'
  });
});

// ==================== END FILE UPLOAD PROXY ====================

// ==================== AI REMIX GENERATOR ====================

// Store remix generation progress
const remixProgress = new Map();

// AI Remix Generator - Create different versions of a track
app.post('/api/remix/generate', async (req, res) => {
  const { videoId, videoUrl, title, remixType, options = {} } = req.body;
  
  if (!videoId && !videoUrl) {
    return res.status(400).json({ error: 'Video ID or URL is required' });
  }
  
  const remixId = uuidv4();
  const targetUrl = videoUrl || `https://www.youtube.com/watch?v=${videoId}`;
  
  // Valid remix types
  const validTypes = ['extended', 'festival', 'radio', 'bootleg', 'slowed', 'sped_up', 'bass_boost', 'vocal_up'];
  if (!validTypes.includes(remixType)) {
    return res.status(400).json({ error: `Invalid remix type. Valid types: ${validTypes.join(', ')}` });
  }
  
  remixProgress.set(remixId, { 
    status: 'downloading', 
    progress: 0, 
    remixType,
    title: title || 'Unknown Track'
  });
  
  res.json({ remixId, status: 'started' });
  
  try {
    // Step 1: Download the original audio
    const originalPath = path.join(DOWNLOADS_DIR, `original_${remixId}.mp3`);
    const outputPath = path.join(DOWNLOADS_DIR, `remix_${remixId}_${remixType}.mp3`);
    
    // Download with yt-dlp
    await new Promise((resolve, reject) => {
      const downloadProcess = spawn('yt-dlp', [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', originalPath,
        targetUrl
      ]);
      
      downloadProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('Download failed'));
      });
      
      downloadProcess.on('error', reject);
    });
    
    remixProgress.set(remixId, { 
      ...remixProgress.get(remixId),
      status: 'processing', 
      progress: 30 
    });
    
    // Step 2: Apply remix effect using FFmpeg
    let ffmpegArgs = ['-i', originalPath];
    
    switch (remixType) {
      case 'extended':
        // Extended Mix: Loop intro/outro, add builds
        ffmpegArgs.push(
          '-filter_complex',
          '[0:a]apad=pad_dur=5,atrim=0:30,afade=t=in:st=0:d=3[intro];' +
          '[0:a]atrim=0:30,asetpts=PTS-STARTPTS[main_intro];' +
          '[0:a]copy[main];' +
          '[0:a]atrim=start=0,asetpts=PTS-STARTPTS,areverse,atrim=0:30,areverse,afade=t=out:st=25:d=5[outro];' +
          '[intro][main_intro][main][outro]concat=n=4:v=0:a=1[out]',
          '-map', '[out]'
        );
        break;
        
      case 'festival':
        // Festival Edit: Boost bass, add energy, emphasize drops
        ffmpegArgs.push(
          '-af',
          'bass=g=8:f=110:w=0.6,' +
          'acompressor=threshold=-20dB:ratio=4:attack=5:release=50,' +
          'loudnorm=I=-14:TP=-1:LRA=11,' +
          'equalizer=f=60:t=q:w=1:g=6,' +
          'equalizer=f=8000:t=q:w=1:g=3'
        );
        break;
        
      case 'radio':
        // Radio Edit: Shorter version with clean transitions
        ffmpegArgs.push(
          '-af',
          'atrim=0:180,' +  // 3 minutes max
          'afade=t=in:st=0:d=2,' +
          'afade=t=out:st=178:d=2,' +
          'loudnorm=I=-16:TP=-1.5:LRA=9'
        );
        break;
        
      case 'bootleg':
        // Bootleg: Pitch shift, tempo change, add effects
        ffmpegArgs.push(
          '-af',
          'asetrate=44100*1.05,aresample=44100,' +  // Slight pitch up
          'bass=g=5:f=100,' +
          'treble=g=3:f=3000,' +
          'aecho=0.8:0.88:60:0.4'
        );
        break;
        
      case 'slowed':
        // Slowed + Reverb (popular aesthetic)
        ffmpegArgs.push(
          '-af',
          'asetrate=44100*0.85,aresample=44100,' +
          'aecho=0.8:0.9:500:0.3,' +
          'bass=g=4:f=80'
        );
        break;
        
      case 'sped_up':
        // Nightcore / Sped up version
        ffmpegArgs.push(
          '-af',
          'asetrate=44100*1.25,aresample=44100,' +
          'treble=g=2:f=4000'
        );
        break;
        
      case 'bass_boost':
        // Heavy bass boost
        ffmpegArgs.push(
          '-af',
          'bass=g=15:f=80:w=0.5,' +
          'equalizer=f=40:t=q:w=1:g=10,' +
          'equalizer=f=100:t=q:w=1:g=8,' +
          'acompressor=threshold=-25dB:ratio=6:attack=3:release=100,' +
          'loudnorm=I=-14:TP=-1'
        );
        break;
        
      case 'vocal_up':
        // Enhance vocals
        ffmpegArgs.push(
          '-af',
          'equalizer=f=300:t=q:w=2:g=3,' +
          'equalizer=f=1000:t=q:w=2:g=4,' +
          'equalizer=f=3000:t=q:w=2:g=5,' +
          'acompressor=threshold=-18dB:ratio=3:attack=10:release=100'
        );
        break;
    }
    
    ffmpegArgs.push('-y', outputPath);
    
    // Run FFmpeg
    await new Promise((resolve, reject) => {
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      
      ffmpegProcess.stderr.on('data', (data) => {
        // Parse progress from FFmpeg output
        const output = data.toString();
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch) {
          remixProgress.set(remixId, {
            ...remixProgress.get(remixId),
            progress: Math.min(90, 30 + Math.random() * 50)
          });
        }
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('FFmpeg processing failed'));
      });
      
      ffmpegProcess.on('error', reject);
    });
    
    // Clean up original
    if (fs.existsSync(originalPath)) {
      fs.unlinkSync(originalPath);
    }
    
    remixProgress.set(remixId, { 
      ...remixProgress.get(remixId),
      status: 'completed', 
      progress: 100,
      downloadUrl: `/api/remix/download/${remixId}/${remixType}`
    });
    
  } catch (error) {
    console.error('Remix generation error:', error);
    remixProgress.set(remixId, { 
      ...remixProgress.get(remixId),
      status: 'error', 
      error: error.message 
    });
  }
});

// Get remix progress
app.get('/api/remix/progress/:remixId', (req, res) => {
  const { remixId } = req.params;
  const progress = remixProgress.get(remixId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Remix not found' });
  }
  
  res.json(progress);
});

// Download remixed track
app.get('/api/remix/download/:remixId/:remixType', (req, res) => {
  const { remixId, remixType } = req.params;
  const filePath = path.join(DOWNLOADS_DIR, `remix_${remixId}_${remixType}.mp3`);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Remix file not found' });
  }
  
  const progress = remixProgress.get(remixId);
  const title = progress?.title || 'remix';
  const safeTitle = title.replace(/[^a-zA-Z0-9가-힣\s]/g, '').substring(0, 50);
  
  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_${remixType}.mp3"`);
  res.setHeader('Content-Type', 'audio/mpeg');
  
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
  
  // Clean up after download
  fileStream.on('end', () => {
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      remixProgress.delete(remixId);
    }, 60000); // Delete after 1 minute
  });
});

// Get available remix types
app.get('/api/remix/types', (req, res) => {
  res.json({
    types: [
      { id: 'extended', name: 'Extended Mix', description: '인트로/아웃트로 확장, DJ 믹싱용', icon: '⏱️', premium: false },
      { id: 'festival', name: 'Festival Edit', description: '베이스 부스트, 에너지 극대화', icon: '🎪', premium: true },
      { id: 'radio', name: 'Radio Edit', description: '3분 컷, 깔끔한 인아웃', icon: '📻', premium: false },
      { id: 'bootleg', name: 'Bootleg Remix', description: '피치업 + 이펙트, 클럽 스타일', icon: '🔥', premium: true },
      { id: 'slowed', name: 'Slowed + Reverb', description: '느린 템포 + 잔향 효과', icon: '🌙', premium: false },
      { id: 'sped_up', name: 'Nightcore / Sped Up', description: '빠른 템포 + 피치업', icon: '⚡', premium: false },
      { id: 'bass_boost', name: 'Bass Boosted', description: '강력한 저음 강조', icon: '🔊', premium: true },
      { id: 'vocal_up', name: 'Vocal Enhanced', description: '보컬 선명도 향상', icon: '🎤', premium: true }
    ]
  });
});

// ==================== END AI REMIX GENERATOR ====================

// ==================== TREND PREDICTION ENGINE ====================

// Analyze track and predict trend potential
app.post('/api/trends/predict', async (req, res) => {
  const { videoId, videoUrl, title, artist, genre } = req.body;
  
  if (!hasAI) {
    return res.status(503).json({ error: 'AI services not available' });
  }
  
  try {
    const prompt = `You are a music industry analyst AI specializing in trend prediction.

Analyze this track and predict its viral/chart potential:
- Title: ${title || 'Unknown'}
- Artist: ${artist || 'Unknown'}
- Genre: ${genre || 'Unknown'}
- YouTube ID: ${videoId || 'N/A'}

Provide a JSON response with:
{
  "chartPotential": (0-100 score),
  "viralPotential": (0-100 score),
  "peakTimeframe": "예상 피크 시점 (예: 2주 후, 1개월 후)",
  "targetAudience": ["주요 타겟층"],
  "similarSuccesses": ["비슷한 성공 사례 트랙들"],
  "keyFactors": ["성공 요인들"],
  "risks": ["리스크 요인들"],
  "recommendation": "DJ에게 추천 멘트",
  "bestPlayContext": ["최적의 플레이 상황 (클럽 피크타임, 페스티벌 등)"],
  "hashtagSuggestions": ["추천 해시태그"],
  "trendCategory": "rising|stable|declining|viral_potential|sleeper_hit"
}`;

    let prediction;
    
    if (genAI) {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      prediction = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } else if (anthropic) {
      const result = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      });
      const text = result.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      prediction = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } else if (openai) {
      const result = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500
      });
      const text = result.choices[0].message.content;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      prediction = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }
    
    if (!prediction) {
      throw new Error('Failed to parse AI prediction');
    }
    
    res.json({
      success: true,
      track: { videoId, title, artist, genre },
      prediction,
      analyzedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Trend prediction error:', error);
    res.status(500).json({ error: 'Failed to predict trends', details: error.message });
  }
});

// Get trending tracks by genre (simulated with AI analysis)
app.post('/api/trends/genre', async (req, res) => {
  const { genre, timeframe = 'week' } = req.body;
  
  if (!hasAI) {
    return res.status(503).json({ error: 'AI services not available' });
  }
  
  try {
    const prompt = `You are a music trend analyst. Generate a realistic list of trending ${genre} tracks for the ${timeframe}.

Return JSON:
{
  "genre": "${genre}",
  "timeframe": "${timeframe}",
  "trends": [
    {
      "rank": 1,
      "title": "track name",
      "artist": "artist name",
      "trendScore": 95,
      "movement": "up|down|stable|new",
      "weeksOnChart": 3,
      "peakPosition": 1,
      "playCount": "2.3M",
      "growthRate": "+45%",
      "topDJs": ["DJ names playing this"],
      "venues": ["where it's being played"]
    }
  ],
  "emergingArtists": ["up and coming artists"],
  "predictedNextBig": ["tracks likely to chart soon"],
  "genreHealth": "growing|stable|declining",
  "insights": "overall genre trend analysis"
}

Generate 10 realistic trending tracks.`;

    let trendData;
    
    if (genAI) {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      trendData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } else if (anthropic) {
      const result = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      });
      const text = result.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      trendData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }
    
    res.json({
      success: true,
      ...trendData,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Genre trends error:', error);
    res.status(500).json({ error: 'Failed to get genre trends' });
  }
});

// Get rising tracks predictions
app.get('/api/trends/rising', async (req, res) => {
  if (!hasAI) {
    return res.status(503).json({ error: 'AI services not available' });
  }
  
  try {
    const prompt = `You are a music industry analyst. Generate a list of tracks that are predicted to blow up soon.

Return JSON:
{
  "risingTracks": [
    {
      "title": "track name",
      "artist": "artist name",
      "genre": "genre",
      "currentPopularity": 45,
      "predictedPeak": 92,
      "daysUntilPeak": 14,
      "confidence": 87,
      "signals": ["why this will blow up"],
      "similarPastHits": ["tracks that had similar trajectory"],
      "recommendedAction": "what DJs should do"
    }
  ],
  "methodology": "how predictions are made",
  "accuracy": "historical accuracy rate",
  "lastUpdated": "timestamp"
}

Generate 8 realistic rising track predictions across different genres.`;

    let risingData;
    
    if (genAI) {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      risingData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } else if (anthropic) {
      const result = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      });
      const text = result.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      risingData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }
    
    res.json({
      success: true,
      ...risingData,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Rising tracks error:', error);
    res.status(500).json({ error: 'Failed to get rising tracks' });
  }
});

// ==================== END TREND PREDICTION ENGINE ====================

// ==================== GLOBAL DJ PLAYLIST SPY ====================

// Get tracks played by famous DJs
app.post('/api/spy/dj-tracks', async (req, res) => {
  const { djName, timeframe = 'week', venue = null } = req.body;
  
  if (!hasAI) {
    return res.status(503).json({ error: 'AI services not available' });
  }
  
  try {
    const venueContext = venue ? ` at ${venue}` : '';
    const prompt = `You are a music industry analyst with access to DJ setlist data.

Generate realistic setlist data for ${djName}${venueContext} over the past ${timeframe}.

Return JSON:
{
  "dj": {
    "name": "${djName}",
    "genres": ["primary genres"],
    "style": "DJ style description",
    "avgBPM": 128,
    "signatureSound": "what makes them unique"
  },
  "recentTracks": [
    {
      "title": "track name",
      "artist": "artist name",
      "playCount": 5,
      "lastPlayed": "date",
      "venues": ["where played"],
      "setPosition": "opener|buildup|peak|closer",
      "crowdReaction": "reaction description",
      "isUnreleased": false,
      "bpm": 126,
      "key": "Am"
    }
  ],
  "topVenues": ["recent venues"],
  "upcomingGigs": ["upcoming shows"],
  "styleEvolution": "how their style is changing",
  "trackSources": ["labels/sources they pull from"],
  "hiddenGems": ["lesser known tracks they've played"],
  "collaboration": ["artists they frequently play"]
}

Generate 15 realistic tracks.`;

    let djData;
    
    if (genAI) {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      djData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } else if (anthropic) {
      const result = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }]
      });
      const text = result.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      djData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }
    
    res.json({
      success: true,
      ...djData,
      queriedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('DJ spy error:', error);
    res.status(500).json({ error: 'Failed to get DJ tracks' });
  }
});

// Get popular DJs list
app.get('/api/spy/popular-djs', async (req, res) => {
  res.json({
    djs: [
      { name: 'Carl Cox', genres: ['Techno', 'House'], followers: '2.1M', active: true },
      { name: 'Charlotte de Witte', genres: ['Techno'], followers: '1.8M', active: true },
      { name: 'Fisher', genres: ['Tech House'], followers: '1.5M', active: true },
      { name: 'Peggy Gou', genres: ['House', 'Techno'], followers: '1.2M', active: true },
      { name: 'Adam Beyer', genres: ['Techno'], followers: '980K', active: true },
      { name: 'Amelie Lens', genres: ['Techno'], followers: '1.4M', active: true },
      { name: 'Black Coffee', genres: ['Afro House'], followers: '1.1M', active: true },
      { name: 'Nina Kraviz', genres: ['Techno'], followers: '890K', active: true },
      { name: 'Jamie Jones', genres: ['Tech House'], followers: '750K', active: true },
      { name: 'Solomun', genres: ['Melodic House'], followers: '1.3M', active: true },
      { name: 'Tale of Us', genres: ['Melodic Techno'], followers: '1.1M', active: true },
      { name: 'Richie Hawtin', genres: ['Minimal Techno'], followers: '820K', active: true },
      { name: 'Boris Brejcha', genres: ['High-Tech Minimal'], followers: '950K', active: true },
      { name: 'Disclosure', genres: ['House', 'UK Garage'], followers: '2.3M', active: true },
      { name: 'Fred again..', genres: ['House', 'Electronic'], followers: '1.9M', active: true }
    ]
  });
});

// Get venue/festival trending tracks
app.post('/api/spy/venue-trends', async (req, res) => {
  const { venue, timeframe = 'month' } = req.body;
  
  if (!hasAI) {
    return res.status(503).json({ error: 'AI services not available' });
  }
  
  try {
    const prompt = `You are a music analyst tracking club and festival playlists.

Generate trending track data for ${venue} over the past ${timeframe}.

Return JSON:
{
  "venue": {
    "name": "${venue}",
    "location": "city, country",
    "type": "club|festival|radio",
    "capacity": 1500,
    "soundSystem": "system details",
    "residentDJs": ["resident DJs"],
    "musicPolicy": "what kind of music"
  },
  "trendingTracks": [
    {
      "rank": 1,
      "title": "track name",
      "artist": "artist name",
      "playCount": 23,
      "peakTime": "when most played (e.g., 2-3am)",
      "djsPlaying": ["DJs who played it"],
      "firstPlayed": "date",
      "crowdFavorite": true,
      "bpm": 128,
      "genre": "genre"
    }
  ],
  "genreBreakdown": {"Techno": 45, "House": 35, "Other": 20},
  "avgBPM": 127,
  "peakHours": "1am-4am",
  "insights": "venue trend analysis"
}

Generate 12 trending tracks.`;

    let venueData;
    
    if (genAI) {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      venueData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } else if (anthropic) {
      const result = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }]
      });
      const text = result.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      venueData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }
    
    res.json({
      success: true,
      ...venueData,
      queriedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Venue trends error:', error);
    res.status(500).json({ error: 'Failed to get venue trends' });
  }
});

// Get popular venues list
app.get('/api/spy/venues', async (req, res) => {
  res.json({
    venues: [
      { name: 'Berghain', location: 'Berlin, Germany', type: 'club', genres: ['Techno'] },
      { name: 'Fabric', location: 'London, UK', type: 'club', genres: ['Techno', 'DnB'] },
      { name: 'Output', location: 'New York, USA', type: 'club', genres: ['Techno', 'House'] },
      { name: 'Amnesia', location: 'Ibiza, Spain', type: 'club', genres: ['House', 'Techno'] },
      { name: 'Cakeshop', location: 'Seoul, Korea', type: 'club', genres: ['Techno', 'House'] },
      { name: 'Warehouse Project', location: 'Manchester, UK', type: 'club', genres: ['Electronic'] },
      { name: 'Tomorrowland', location: 'Boom, Belgium', type: 'festival', genres: ['EDM'] },
      { name: 'Ultra Music Festival', location: 'Miami, USA', type: 'festival', genres: ['EDM'] },
      { name: 'Awakenings', location: 'Amsterdam, Netherlands', type: 'festival', genres: ['Techno'] },
      { name: 'Sonar', location: 'Barcelona, Spain', type: 'festival', genres: ['Electronic'] },
      { name: 'Movement', location: 'Detroit, USA', type: 'festival', genres: ['Techno'] },
      { name: 'BBC Radio 1', location: 'UK', type: 'radio', genres: ['Electronic'] }
    ]
  });
});

// ==================== END GLOBAL DJ PLAYLIST SPY ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Downloads directory: ${DOWNLOADS_DIR}`);
});

