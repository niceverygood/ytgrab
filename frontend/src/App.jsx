import { useState, useEffect, useRef } from 'react'
import './App.css'
import AuthModal from './components/AuthModal'
import HistoryModal from './components/HistoryModal'
import { supabase, signOut, saveDownload, addFavorite, removeFavorite, isFavorite, saveRecommendation, createSetlist, getSetlists } from './lib/supabase'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function App() {
  // Auth state
  const [user, setUser] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyTab, setHistoryTab] = useState('downloads')
  const [isFav, setIsFav] = useState(false)
  const [recFavorites, setRecFavorites] = useState({})
  
  // DJ & Mixset state
  const [showDJModal, setShowDJModal] = useState(false)
  const [djOrder, setDjOrder] = useState(null)
  const [loadingDJ, setLoadingDJ] = useState(false)
  const [showMixsetModal, setShowMixsetModal] = useState(false)
  const [mixsetProgress, setMixsetProgress] = useState(null)
  const [mixsetId, setMixsetId] = useState(null)
  const [crossfadeDuration, setCrossfadeDuration] = useState(5)
  
  // Main state
  const [url, setUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Download state
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [downloadTarget, setDownloadTarget] = useState(null) // 'source' or track object
  const [downloading, setDownloading] = useState(false)
  const [downloadId, setDownloadId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [outputFormat, setOutputFormat] = useState('mp3')
  const [quality, setQuality] = useState('best')
  
  // Recommendations state
  const [recommendations, setRecommendations] = useState([])
  const [loadingRecs, setLoadingRecs] = useState(false)
  const [recCount, setRecCount] = useState(10)
  const [previousRecs, setPreviousRecs] = useState([])
  
  // Bulk download state
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })
  const [bulkId, setBulkId] = useState(null)
  const [zipReady, setZipReady] = useState(false)
  
  // Preview state
  const [previewTrack, setPreviewTrack] = useState(null)
  
  // DJ Analysis state (A: BPM/Key/Energy)
  const [trackAnalysis, setTrackAnalysis] = useState({}) // { videoId: { bpm, key, energy, genre, mood } }
  const [analyzingTracks, setAnalyzingTracks] = useState(false)
  
  // Setlist state (C: 세트리스트)
  const [showSetlistModal, setShowSetlistModal] = useState(false)
  const [setlistName, setSetlistName] = useState('')
  const [savedSetlists, setSavedSetlists] = useState([])
  const [showSetlistsPanel, setShowSetlistsPanel] = useState(false)

  const progressInterval = useRef(null)
  const bulkProgressInterval = useRef(null)

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Check favorite status
  useEffect(() => {
    const checkFavorite = async () => {
      if (user && videoInfo) {
        const result = await isFavorite(user.id, videoInfo.videoId)
        setIsFav(result.isFavorite)
      }
    }
    checkFavorite()
  }, [user, videoInfo])

  // Utility functions
  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatViews = (views) => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`
    return `${views}`
  }

  // Fetch video info
  const fetchVideoInfo = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL')
      return
    }

    setLoading(true)
    setError('')
    setVideoInfo(null)
    setRecommendations([])
    setPreviousRecs([])
    setDjOrder(null)

    try {
      const response = await fetch(`${API_BASE}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get video info')
      }

      setVideoInfo(data)
      // Don't auto-fetch - user will click button to get recommendations
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Fetch AI recommendations
  const fetchRecommendations = async (count = recCount, isRefresh = false, sourceInfo = videoInfo) => {
    if (!sourceInfo) return

    setLoadingRecs(true)
    
    const excludeTitles = isRefresh 
      ? [...previousRecs, ...recommendations.map(r => r.title)]
      : previousRecs

    try {
      const response = await fetch(`${API_BASE}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sourceInfo.title,
          uploader: sourceInfo.uploader,
          songCount: count,
          excludeTitles
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get recommendations')
      }

      if (data.recommendations && data.recommendations.length > 0) {
        setRecommendations(data.recommendations)
        setPreviousRecs(prev => [...prev, ...data.recommendations.map(r => r.title)])
        
        // Save to history if logged in
        if (user) {
          saveRecommendation(user.id, sourceInfo, data.recommendations)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingRecs(false)
    }
  }

  // A) Analyze tracks for BPM/Key/Energy
  const analyzeTracks = async (tracks) => {
    if (!tracks || tracks.length === 0) return
    
    setAnalyzingTracks(true)
    
    try {
      const response = await fetch(`${API_BASE}/analyze-tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks: tracks.map(t => ({ title: t.title, artist: t.artist }))
        })
      })

      const data = await response.json()

      if (response.ok && data.tracks) {
        const analysisMap = {}
        data.tracks.forEach((t, idx) => {
          const videoId = tracks[idx]?.videoId
          if (videoId) {
            analysisMap[videoId] = {
              bpm: t.bpm,
              key: t.key,
              energy: t.energy,
              genre: t.genre,
              mood: t.mood
            }
          }
        })
        setTrackAnalysis(prev => ({ ...prev, ...analysisMap }))
      }
    } catch (err) {
      console.error('Track analysis error:', err)
    } finally {
      setAnalyzingTracks(false)
    }
  }

  // B) Calculate total set time
  const calculateSetTime = () => {
    return recommendations.reduce((total, track) => total + (track.duration || 0), 0)
  }

  // C) Save setlist
  const saveSetlist = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }
    
    if (!setlistName.trim()) {
      setError('Please enter a setlist name')
      return
    }

    const tracksWithAnalysis = recommendations.map(track => ({
      ...track,
      analysis: trackAnalysis[track.videoId] || null
    }))

    try {
      const { data, error: saveError } = await createSetlist(user.id, {
        name: setlistName,
        tracks: tracksWithAnalysis,
        totalDuration: calculateSetTime()
      })

      if (saveError) throw saveError

      setShowSetlistModal(false)
      setSetlistName('')
      setError('') // Clear any errors
      // Show success message briefly
      setError('✅ Setlist saved!')
      setTimeout(() => setError(''), 2000)
    } catch (err) {
      setError('Failed to save setlist: ' + err.message)
    }
  }

  // Load saved setlists
  const loadSetlists = async () => {
    if (!user) return
    
    const { data, error: loadError } = await getSetlists(user.id)
    if (!loadError && data) {
      setSavedSetlists(data)
    }
  }

  // Load setlist into recommendations
  const loadSetlistToRecommendations = (setlist) => {
    setRecommendations(setlist.tracks)
    // Also load analysis data
    const analysisMap = {}
    setlist.tracks.forEach(track => {
      if (track.videoId && track.analysis) {
        analysisMap[track.videoId] = track.analysis
      }
    })
    setTrackAnalysis(prev => ({ ...prev, ...analysisMap }))
    setShowSetlistsPanel(false)
  }

  // Download functions
  const startDownload = async (target, format, qual) => {
    const videoUrl = target === 'source' ? videoInfo.url : target.url
    const title = target === 'source' ? videoInfo.title : target.title

    setDownloading(true)
    setProgress(0)

    try {
      const response = await fetch(`${API_BASE}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoUrl,
          format,
          quality: qual
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Download failed')
      }

      setDownloadId(data.downloadId)

      // Poll for progress
      progressInterval.current = setInterval(async () => {
        try {
          const progressRes = await fetch(`${API_BASE}/progress/${data.downloadId}`)
          const progressData = await progressRes.json()

          setProgress(progressData.progress || 0)

          if (progressData.status === 'completed') {
            clearInterval(progressInterval.current)
            window.location.href = `${API_BASE}/file/${data.downloadId}`
            
            // Save to history if logged in
            if (user && target === 'source') {
              saveDownload(user.id, {
                video_id: videoInfo.videoId,
                title: videoInfo.title,
                thumbnail: videoInfo.thumbnail,
                uploader: videoInfo.uploader,
                duration: videoInfo.duration,
                format
              })
            }

            setTimeout(() => {
              setDownloading(false)
              setShowDownloadModal(false)
              setProgress(0)
            }, 1000)
          } else if (progressData.status === 'error') {
            clearInterval(progressInterval.current)
            setError(progressData.error || 'Download failed')
            setDownloading(false)
          }
        } catch (err) {
          console.error('Progress check error:', err)
        }
      }, 500)
    } catch (err) {
      setError(err.message)
      setDownloading(false)
    }
  }

  // Bulk download
  const downloadAll = async () => {
    if (recommendations.length === 0) return

    setDownloadingAll(true)
    setBulkProgress({ current: 0, total: recommendations.length })
    setZipReady(false)

    try {
      const response = await fetch(`${API_BASE}/bulk-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videos: recommendations.map(r => ({
            url: r.url,
            title: `${r.artist} - ${r.title}`
          })),
          outputFormat
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Bulk download failed')
      }

      setBulkId(data.bulkId)

      // Poll for progress
      bulkProgressInterval.current = setInterval(async () => {
        try {
          const progressRes = await fetch(`${API_BASE}/bulk-progress/${data.bulkId}`)
          const progressData = await progressRes.json()

          setBulkProgress({
            current: progressData.completed || 0,
            total: progressData.total || recommendations.length
          })

          if (progressData.status === 'completed') {
            clearInterval(bulkProgressInterval.current)
            setZipReady(true)
          } else if (progressData.status === 'error') {
            clearInterval(bulkProgressInterval.current)
            setError('Bulk download failed')
            setDownloadingAll(false)
          }
        } catch (err) {
          console.error('Bulk progress error:', err)
        }
      }, 1000)
    } catch (err) {
      setError(err.message)
      setDownloadingAll(false)
    }
  }

  const downloadZip = () => {
    if (bulkId) {
      window.location.href = `${API_BASE}/bulk-file/${bulkId}`
      setTimeout(() => {
        setDownloadingAll(false)
        setZipReady(false)
        setBulkId(null)
      }, 2000)
    }
  }

  // DJ Order
  const getDJOrder = async () => {
    if (recommendations.length < 2) return

    setLoadingDJ(true)
    setShowDJModal(true)

    try {
      const response = await fetch(`${API_BASE}/dj-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks: recommendations.map(r => ({
            title: r.title,
            artist: r.artist,
            thumbnail: r.thumbnail,
            url: r.url,
            videoId: r.videoId,
            duration: r.duration
          }))
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'DJ Order failed')
      }

      setDjOrder(data)
    } catch (err) {
      setDjOrder({ error: err.message })
    } finally {
      setLoadingDJ(false)
    }
  }

  // Create Mixset
  const createMixset = async () => {
    if (recommendations.length < 2) return

    const allTracks = djOrder?.orderedTracks || recommendations.map((rec, idx) => ({
      ...rec,
      position: idx + 1
    }))
    const tracksToMix = allTracks.slice(0, 10)

    setMixsetProgress({ status: 'starting', phase: 'Starting...' })

    try {
      const tracks = tracksToMix.map(track => ({
        url: track.url,
        title: track.title,
        artist: track.artist
      }))

      const mixsetName = videoInfo ? `${videoInfo.title}_Mixset` : 'DJ_Mixset'

      const response = await fetch(`${API_BASE}/create-mixset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks, crossfadeDuration, mixsetName })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create mixset')
      }

      setMixsetId(data.mixsetId)

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progressRes = await fetch(`${API_BASE}/mixset-progress/${data.mixsetId}`)
          const progressData = await progressRes.json()

          setMixsetProgress(progressData)

          if (progressData.status === 'completed' || progressData.status === 'error') {
            clearInterval(pollInterval)
          }
        } catch (err) {
          console.error('Mixset progress error:', err)
        }
      }, 1000)
    } catch (err) {
      setMixsetProgress({ status: 'error', error: err.message })
    }
  }

  const downloadMixset = () => {
    if (mixsetId) {
      window.location.href = `${API_BASE}/mixset-file/${mixsetId}`
      setTimeout(() => {
        setShowMixsetModal(false)
        setMixsetProgress(null)
        setMixsetId(null)
      }, 2000)
    }
  }

  // Favorite functions
  const toggleFavorite = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    if (isFav) {
      await removeFavorite(user.id, videoInfo.videoId)
      setIsFav(false)
    } else {
      await addFavorite(user.id, {
        video_id: videoInfo.videoId,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        uploader: videoInfo.uploader,
        duration: videoInfo.duration,
        url: videoInfo.url
      })
      setIsFav(true)
    }
  }

  const toggleRecFavorite = async (rec) => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    const isCurrentlyFav = recFavorites[rec.videoId]
    
    if (isCurrentlyFav) {
      await removeFavorite(user.id, rec.videoId)
      setRecFavorites(prev => ({ ...prev, [rec.videoId]: false }))
    } else {
      await addFavorite(user.id, {
        video_id: rec.videoId,
        title: rec.title,
        thumbnail: rec.thumbnail,
        uploader: rec.artist,
        duration: rec.duration,
        url: rec.url
      })
      setRecFavorites(prev => ({ ...prev, [rec.videoId]: true }))
    }
  }

  // Handle Enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      fetchVideoInfo()
    }
  }

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  return (
    <div className="app">
      {/* Background Effects */}
      <div className="bg-effects">
        <div className="bg-orb bg-orb-1"></div>
        <div className="bg-orb bg-orb-2"></div>
        <div className="bg-orb bg-orb-3"></div>
        <div className="bg-grid"></div>
      </div>

      <div className="main-container">
        {/* Header */}
        <header className="header">
          <div className="logo">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2"/>
                <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <span className="logo-text">Beatflo</span>
          </div>

          <div className="header-actions">
            {user ? (
              <div className="user-menu-container">
                <button className="user-btn" onClick={() => setShowUserMenu(!showUserMenu)}>
                  <div className="user-avatar">
                    {user.user_metadata?.avatar_url ? (
                      <img src={user.user_metadata.avatar_url} alt="avatar" />
                    ) : (
                      user.email?.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span>{user.user_metadata?.full_name || user.email?.split('@')[0]}</span>
                </button>

                {showUserMenu && (
                  <div className="user-dropdown">
                    <button className="user-dropdown-item" onClick={() => {
                      setHistoryTab('downloads')
                      setShowHistoryModal(true)
                      setShowUserMenu(false)
                    }}>
                      <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Downloads
                    </button>
                    <button className="user-dropdown-item" onClick={() => {
                      setHistoryTab('favorites')
                      setShowHistoryModal(true)
                      setShowUserMenu(false)
                    }}>
                      <svg viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Favorites
                    </button>
                    <button className="user-dropdown-item" onClick={() => {
                      setHistoryTab('recommendations')
                      setShowHistoryModal(true)
                      setShowUserMenu(false)
                    }}>
                      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      History
                    </button>
                    <div className="user-dropdown-divider"></div>
                    <button className="user-dropdown-item danger" onClick={() => {
                      signOut()
                      setShowUserMenu(false)
                    }}>
                      <svg viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="user-btn" onClick={() => setShowAuthModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Login
              </button>
            )}
          </div>
        </header>

        {/* Hero Section */}
        {!videoInfo && !loading && (
          <section className="hero">
            <div className="hero-badge">
              <svg viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              AI-Powered Music Discovery
            </div>
            <h1>
              Discover Your Next<br/>
              <span className="gradient-text">Favorite Beat</span>
            </h1>
            <p>Drop a song you love, and AI will find similar vibes for your perfect playlist.</p>
          </section>
        )}

        {/* Search Section */}
        <section className="search-section">
          <div className="search-box">
            <div className="search-icon">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <input
              type="text"
              className="search-input"
              placeholder="Paste YouTube URL or search for a song..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button 
              className="search-btn" 
              onClick={fetchVideoInfo}
              disabled={loading}
            >
              {loading ? (
                <div className="spinner"></div>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Discover
                </>
              )}
            </button>
          </div>
        </section>

        {/* Source Track */}
        {videoInfo && (
          <section className="source-section">
            <div className="section-label">
              <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2"/></svg>
              Your Source Track
            </div>
            <div className="source-card">
              <div className="source-thumbnail">
                <img src={videoInfo.thumbnail} alt={videoInfo.title} />
                <div className="play-overlay" onClick={() => setPreviewTrack({ url: videoInfo.url, title: videoInfo.title })}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div className="source-info">
                <h3>{videoInfo.title}</h3>
                <div className="source-meta">
                  <span>{videoInfo.uploader}</span>
                  <span>•</span>
                  <span>{formatDuration(videoInfo.duration)}</span>
                  <span>•</span>
                  <span>{formatViews(videoInfo.viewCount)} views</span>
                </div>
                <div className="source-actions">
                  <button 
                    className="action-btn primary"
                    onClick={() => fetchRecommendations(recCount, false)}
                    disabled={loadingRecs}
                  >
                    {loadingRecs ? (
                      <div className="spinner" style={{ width: 16, height: 16 }}></div>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                    {loadingRecs ? 'Finding...' : 'Find Vibes'}
                  </button>
                  <button 
                    className="action-btn secondary"
                    onClick={() => {
                      setDownloadTarget('source')
                      setShowDownloadModal(true)
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Download
                  </button>
                  <button 
                    className={`action-btn favorite ${isFav ? 'active' : ''}`}
                    onClick={toggleFavorite}
                  >
                    <svg viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Discovery Section */}
        {(videoInfo && (recommendations.length > 0 || loadingRecs)) && (
          <section className="discovery-section">
            <div className="discovery-header">
              <div className="discovery-title">
                <div className="waveform">
                  <div className="waveform-bar"></div>
                  <div className="waveform-bar"></div>
                  <div className="waveform-bar"></div>
                  <div className="waveform-bar"></div>
                  <div className="waveform-bar"></div>
                </div>
                <h2>Flow Recommendations</h2>
              </div>
              
              {recommendations.length > 0 && (
                <div className="discovery-controls">
                  <div className="count-selector">
                    {[5, 10, 20, 30, 50].map(count => (
                      <button
                        key={count}
                        className={`count-btn ${recCount === count ? 'active' : ''}`}
                        onClick={() => setRecCount(count)}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  <button 
                    className="refresh-btn"
                    onClick={() => fetchRecommendations(recCount, true)}
                    disabled={loadingRecs}
                  >
                    <svg viewBox="0 0 24 24" fill="none"><path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              )}
            </div>

            {loadingRecs ? (
              <div className="loading-state">
                <div className="loading-waveform">
                  <div className="bar"></div>
                  <div className="bar"></div>
                  <div className="bar"></div>
                  <div className="bar"></div>
                  <div className="bar"></div>
                  <div className="bar"></div>
                  <div className="bar"></div>
                </div>
                <h3>Finding Similar Vibes...</h3>
                <p>AI is analyzing the track and discovering similar beats</p>
              </div>
            ) : recommendations.length > 0 ? (
              <>
                {/* DJ Stats Bar */}
                <div className="dj-stats-bar">
                  <div className="dj-stat">
                    <span className="dj-stat-label">🎵 Tracks</span>
                    <span className="dj-stat-value">{recommendations.length}</span>
                  </div>
                  <div className="dj-stat">
                    <span className="dj-stat-label">⏱️ Set Time</span>
                    <span className="dj-stat-value">{formatDuration(calculateSetTime())}</span>
                  </div>
                  {Object.keys(trackAnalysis).length > 0 && (
                    <>
                      <div className="dj-stat">
                        <span className="dj-stat-label">🎹 BPM Range</span>
                        <span className="dj-stat-value">
                          {(() => {
                            const bpms = recommendations.map(r => trackAnalysis[r.videoId]?.bpm).filter(Boolean)
                            if (bpms.length === 0) return '-'
                            return `${Math.min(...bpms)}-${Math.max(...bpms)}`
                          })()}
                        </span>
                      </div>
                      <div className="dj-stat">
                        <span className="dj-stat-label">⚡ Avg Energy</span>
                        <span className="dj-stat-value">
                          {(() => {
                            const energies = recommendations.map(r => trackAnalysis[r.videoId]?.energy).filter(Boolean)
                            if (energies.length === 0) return '-'
                            return (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1)
                          })()}
                        </span>
                      </div>
                    </>
                  )}
                  <button 
                    className="analyze-btn"
                    onClick={() => analyzeTracks(recommendations)}
                    disabled={analyzingTracks}
                  >
                    {analyzingTracks ? '분석중...' : '🔍 AI 분석'}
                  </button>
                </div>

                {/* D) Energy Flow Graph */}
                {Object.keys(trackAnalysis).length > 0 && (
                  <div className="energy-flow-graph">
                    <div className="energy-flow-label">⚡ Energy Flow</div>
                    <div className="energy-flow-bars">
                      {recommendations.map((rec, idx) => {
                        const analysis = trackAnalysis[rec.videoId]
                        const energy = analysis?.energy || 5
                        return (
                          <div key={idx} className="energy-bar-container" title={`${rec.title} - Energy: ${energy}`}>
                            <div 
                              className="energy-bar" 
                              style={{ 
                                height: `${energy * 10}%`,
                                background: energy >= 8 ? '#EF4444' : energy >= 6 ? '#F59E0B' : energy >= 4 ? '#22D3EE' : '#8B5CF6'
                              }}
                            ></div>
                            <span className="energy-bar-num">{idx + 1}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="track-list">
                  {recommendations.map((rec, idx) => {
                    const analysis = trackAnalysis[rec.videoId]
                    return (
                    <div key={rec.videoId || idx} className="track-item">
                      <div className="track-num">{idx + 1}</div>
                      <div className="track-thumb">
                        <img src={rec.thumbnail} alt={rec.title} />
                        <div className="mini-play" onClick={() => setPreviewTrack({ url: rec.url, title: `${rec.artist} - ${rec.title}` })}>
                          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                      <div className="track-info">
                        <h4>{rec.title}</h4>
                        <p>{rec.artist}</p>
                        {/* DJ Info Tags */}
                        {analysis && (
                          <div className="track-dj-tags">
                            <span className="dj-tag bpm">🎹 {analysis.bpm}</span>
                            <span className="dj-tag key">🔑 {analysis.key}</span>
                            <span className="dj-tag energy" data-energy={analysis.energy}>⚡ {analysis.energy}</span>
                            {analysis.genre && <span className="dj-tag genre">{analysis.genre}</span>}
                          </div>
                        )}
                      </div>
                      <div className="track-actions">
                        <button 
                          className={`track-btn favorite ${recFavorites[rec.videoId] ? 'active' : ''}`}
                          onClick={() => toggleRecFavorite(rec)}
                        >
                          <svg viewBox="0 0 24 24" fill={recFavorites[rec.videoId] ? 'currentColor' : 'none'}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2"/></svg>
                        </button>
                        <button 
                          className="track-btn download"
                          onClick={() => {
                            setDownloadTarget(rec)
                            setShowDownloadModal(true)
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    </div>
                  )})}
                  
                </div>

                {/* Flow Actions */}
                <div className="flow-actions">
                  <button 
                    className="flow-btn dj-order"
                    onClick={getDJOrder}
                    disabled={loadingDJ}
                  >
                    <svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="2"/><path d="M6 21V9M18 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M6 9c0 0 0 5 6 5s6-5 6-5" stroke="currentColor" strokeWidth="2"/></svg>
                    {loadingDJ ? 'Analyzing...' : 'Beat Sequence'}
                  </button>

                  <button 
                    className={`flow-btn mixset ${recommendations.length > 10 ? 'disabled' : ''}`}
                    onClick={() => recommendations.length <= 10 && setShowMixsetModal(true)}
                    title={recommendations.length > 10 ? 'Max 10 tracks for mixset' : ''}
                  >
                    <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    Create Your Flow
                    {recommendations.length > 10 && <span className="badge">≤10</span>}
                  </button>

                  <button 
                    className="flow-btn download-all"
                    onClick={downloadAll}
                    disabled={downloadingAll}
                  >
                    <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {downloadingAll ? (
                      zipReady ? 'Download ZIP' : `${bulkProgress.current}/${bulkProgress.total}`
                    ) : (
                      `Download All (${recommendations.length})`
                    )}
                  </button>

                  <button 
                    className="flow-btn save-setlist"
                    onClick={() => setShowSetlistModal(true)}
                  >
                    <svg viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Save Setlist
                  </button>
                </div>

                {zipReady && (
                  <button 
                    className="flow-btn download-all"
                    onClick={downloadZip}
                    style={{ marginTop: '0.5rem', animation: 'pulse 2s infinite' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    📦 ZIP Ready - Click to Download
                  </button>
                )}
              </>
            ) : null}
          </section>
        )}
      </div>

      {/* Error Toast */}
      {error && (
        <div className="error-toast">
          {error}
        </div>
      )}

      {/* YouTube Preview */}
      {previewTrack && (
        <div className="youtube-preview">
          <div className="youtube-preview-header">
            <span>🎧 {previewTrack.title}</span>
            <button className="youtube-preview-close" onClick={() => setPreviewTrack(null)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>
          <iframe
            src={`https://www.youtube.com/embed/${previewTrack.url.split('v=')[1]?.split('&')[0]}?autoplay=1`}
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
      )}

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="modal-overlay" onClick={() => !downloading && setShowDownloadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => !downloading && setShowDownloadModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon primary">
                <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>Download Track</h3>
                <p>{downloadTarget === 'source' ? videoInfo?.title : downloadTarget?.title}</p>
              </div>
            </div>

            <div className="modal-body">
              {!downloading ? (
                <>
                  <div className="format-grid">
                    <button 
                      className={`format-btn ${outputFormat === 'mp3' ? 'active' : ''}`}
                      onClick={() => setOutputFormat('mp3')}
                    >
                      <span className="format-name">MP3</span>
                      <span className="format-desc">Audio only</span>
                    </button>
                    <button 
                      className={`format-btn ${outputFormat === 'mp4' ? 'active' : ''}`}
                      onClick={() => setOutputFormat('mp4')}
                    >
                      <span className="format-name">MP4</span>
                      <span className="format-desc">Video</span>
                    </button>
                    <button 
                      className={`format-btn ${outputFormat === 'webm' ? 'active' : ''}`}
                      onClick={() => setOutputFormat('webm')}
                    >
                      <span className="format-name">WebM</span>
                      <span className="format-desc">Web video</span>
                    </button>
                  </div>

                  {outputFormat !== 'mp3' && (
                    <>
                      <div className="quality-label">Quality</div>
                      <div className="quality-grid">
                        <button 
                          className={`quality-btn ${quality === 'best' ? 'active' : ''}`}
                          onClick={() => setQuality('best')}
                        >
                          Best
                        </button>
                        <button 
                          className={`quality-btn ${quality === '1080' ? 'active' : ''}`}
                          onClick={() => setQuality('1080')}
                        >
                          1080p
                        </button>
                        <button 
                          className={`quality-btn ${quality === '720' ? 'active' : ''}`}
                          onClick={() => setQuality('720')}
                        >
                          720p
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="progress-state">
                  <div className="spinner-large"></div>
                  <h4>Downloading...</h4>
                  <p>Please wait while we prepare your file</p>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                  <div className="progress-count">{progress}%</div>
                </div>
              )}
            </div>

            {!downloading && (
              <div className="modal-footer">
                <button 
                  className="download-action-btn"
                  onClick={() => startDownload(downloadTarget, outputFormat, quality)}
                >
                  <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Start Download
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DJ Order Modal */}
      {showDJModal && (
        <div className="modal-overlay" onClick={() => !loadingDJ && setShowDJModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <button className="modal-close" onClick={() => !loadingDJ && setShowDJModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon primary">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="2"/><path d="M6 21V9M18 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>🎧 Beat Sequence</h3>
                <p>AI-recommended mixing order</p>
              </div>
            </div>

            <div className="modal-body">
              {loadingDJ ? (
                <div className="loading-state">
                  <div className="loading-waveform">
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                  </div>
                  <h3>Analyzing Tracks...</h3>
                  <p>Considering BPM, key, and energy flow</p>
                </div>
              ) : djOrder?.error ? (
                <div className="error-state">
                  <p style={{ color: '#EF4444' }}>{djOrder.error}</p>
                </div>
              ) : djOrder ? (
                <>
                  {djOrder.overallVibe && (
                    <div className="dj-vibe">
                      <div className="dj-vibe-label">🎵 Overall Vibe</div>
                      <p>{djOrder.overallVibe}</p>
                      {djOrder.estimatedBPMRange && (
                        <span className="dj-bpm">{djOrder.estimatedBPMRange}</span>
                      )}
                    </div>
                  )}

                  <div className="dj-tracks">
                    {djOrder.orderedTracks?.map((track, idx) => (
                      <div key={idx} className="dj-track">
                        <div className="dj-track-num">{track.position || idx + 1}</div>
                        <div className="dj-track-info">
                          <h4>{track.title}</h4>
                          <p>{track.artist}</p>
                        </div>
                        {idx < djOrder.orderedTracks.length - 1 && (
                          <div className="dj-track-arrow">↓</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {djOrder.mixingTips && djOrder.mixingTips.length > 0 && (
                    <div className="dj-tips">
                      <div className="dj-tips-label">Mixing Tips</div>
                      <ul>
                        {djOrder.mixingTips.map((tip, idx) => (
                          <li key={idx}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Mixset Modal */}
      {showMixsetModal && (
        <div className="modal-overlay" onClick={() => !mixsetProgress && setShowMixsetModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button 
              className="modal-close" 
              onClick={() => {
                if (!mixsetProgress || mixsetProgress.status === 'completed' || mixsetProgress.status === 'error') {
                  setShowMixsetModal(false)
                  setMixsetProgress(null)
                  setMixsetId(null)
                }
              }}
            >
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon pink">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>🎛️ Create Your Flow</h3>
                <p>Mix tracks with crossfade (max 10)</p>
              </div>
            </div>

            <div className="modal-body">
              {!mixsetProgress ? (
                <>
                  <div className="mixset-info">
                    <div className="mixset-info-label">Tracks to mix</div>
                    <div className="mixset-info-value">
                      {Math.min(djOrder?.orderedTracks?.length || recommendations.length, 10)} songs
                      {djOrder && ' (Beat Sequence applied)'}
                    </div>
                    {(djOrder?.orderedTracks?.length || recommendations.length) > 10 && (
                      <div className="mixset-warning">⚠️ Only first 10 tracks will be mixed</div>
                    )}
                  </div>

                  <div className="crossfade-options">
                    <div className="crossfade-label">⏱️ Crossfade Duration</div>
                    <div className="crossfade-grid">
                      {[3, 5, 8, 10].map(sec => (
                        <button
                          key={sec}
                          className={`crossfade-btn ${crossfadeDuration === sec ? 'active' : ''}`}
                          onClick={() => setCrossfadeDuration(sec)}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mixset-preview">
                    <div className="mixset-preview-label">🎵 Track Order</div>
                    {(djOrder?.orderedTracks || recommendations).slice(0, 10).map((track, idx) => (
                      <div key={idx} className="mixset-track-item">
                        <span className="mixset-track-num">{idx + 1}</span>
                        <span className="mixset-track-name">{track.artist} - {track.title}</span>
                        {idx < Math.min((djOrder?.orderedTracks || recommendations).length, 10) - 1 && (
                          <span className="mixset-fade">~{crossfadeDuration}s~</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : mixsetProgress.status === 'starting' || mixsetProgress.status === 'downloading' ? (
                <div className="progress-state">
                  <div className="spinner-large"></div>
                  <h4>{mixsetProgress.phase}</h4>
                  {mixsetProgress.current && (
                    <p>🎵 {mixsetProgress.current}</p>
                  )}
                  {mixsetProgress.total && (
                    <>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${(mixsetProgress.completed / mixsetProgress.total) * 100}%` }}
                        ></div>
                      </div>
                      <div className="progress-count">{mixsetProgress.completed} / {mixsetProgress.total}</div>
                    </>
                  )}
                </div>
              ) : mixsetProgress.status === 'completed' ? (
                <div className="success-state">
                  <div className="success-icon">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <h4>Mixset Ready! 🎉</h4>
                  <p>{mixsetProgress.trackCount} tracks mixed with {mixsetProgress.crossfade}s crossfade</p>
                  <button className="mixset-action-btn" onClick={downloadMixset}>
                    <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Download Mixset
                  </button>
                </div>
              ) : mixsetProgress.status === 'error' ? (
                <div className="error-state" style={{ textAlign: 'center', padding: '2rem' }}>
                  <p style={{ color: '#EF4444', marginBottom: '1rem' }}>{mixsetProgress.error}</p>
                  <button 
                    className="mixset-action-btn"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                    onClick={() => setMixsetProgress(null)}
                  >
                    Try Again
                  </button>
                </div>
              ) : null}
            </div>

            {!mixsetProgress && (
              <div className="modal-footer">
                <button className="mixset-action-btn" onClick={createMixset}>
                  <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                  Create Mixset
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Setlist Save Modal */}
      {showSetlistModal && (
        <div className="modal-overlay" onClick={() => setShowSetlistModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSetlistModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon primary">
                <svg viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>💾 Save Setlist</h3>
                <p>Save your curated tracks for later</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="setlist-form">
                <label className="setlist-label">Setlist Name</label>
                <input 
                  type="text"
                  className="setlist-input"
                  placeholder="e.g., Friday Night Set, Chill Vibes..."
                  value={setlistName}
                  onChange={(e) => setSetlistName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="setlist-summary">
                <div className="setlist-summary-item">
                  <span>🎵 Tracks</span>
                  <span>{recommendations.length}</span>
                </div>
                <div className="setlist-summary-item">
                  <span>⏱️ Total Time</span>
                  <span>{formatDuration(calculateSetTime())}</span>
                </div>
                {Object.keys(trackAnalysis).length > 0 && (
                  <div className="setlist-summary-item">
                    <span>🔍 AI Analyzed</span>
                    <span>✓</span>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="download-action-btn"
                onClick={saveSetlist}
                disabled={!setlistName.trim()}
              >
                <svg viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Save Setlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* History Modal */}
      <HistoryModal 
        isOpen={showHistoryModal} 
        onClose={() => setShowHistoryModal(false)} 
        userId={user?.id}
        initialTab={historyTab}
      />
    </div>
  )
}

export default App

