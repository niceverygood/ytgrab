import { useState, useEffect, useRef } from 'react'
import './App.css'
import AuthModal from './components/AuthModal'
import HistoryModal from './components/HistoryModal'
import { supabase, signOut, saveDownload, addFavorite, removeFavorite, isFavorite, saveRecommendation } from './lib/supabase'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function App() {
  // Auth state
  const [user, setUser] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyTab, setHistoryTab] = useState('downloads')
  const [isFav, setIsFav] = useState(false)
  const [recFavorites, setRecFavorites] = useState({}) // 추천곡 즐겨찾기 상태
  const [showDJModal, setShowDJModal] = useState(false) // DJ 순서 추천 모달
  const [djOrder, setDjOrder] = useState(null) // DJ 순서 추천 결과
  const [loadingDJ, setLoadingDJ] = useState(false) // DJ 추천 로딩
  const [showMixsetModal, setShowMixsetModal] = useState(false) // 믹스셋 모달
  const [mixsetProgress, setMixsetProgress] = useState(null) // 믹스셋 진행상황
  const [mixsetId, setMixsetId] = useState(null) // 믹스셋 ID
  const [crossfadeDuration, setCrossfadeDuration] = useState(5) // 크로스페이드 시간
  
  const [url, setUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [downloadId, setDownloadId] = useState(null)
  const [selectedFormat, setSelectedFormat] = useState(null)
  const [outputFormat, setOutputFormat] = useState('mp4') // mp4, mp3, webm
  const [recommendations, setRecommendations] = useState([])
  const [loadingRecs, setLoadingRecs] = useState(false)
  const [downloadingRec, setDownloadingRec] = useState(null)
  const [recError, setRecError] = useState('')
  const [recDownloadModal, setRecDownloadModal] = useState(null) // 선택된 추천곡
  const [recFormat, setRecFormat] = useState('mp4')
  const [recQuality, setRecQuality] = useState('best')
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadAllProgress, setDownloadAllProgress] = useState({ current: 0, total: 0, status: '', current_title: '' })
  const [downloadAllModal, setDownloadAllModal] = useState(false)
  const [recCount, setRecCount] = useState(5) // 추천받을 곡 수
  const [showRecSection, setShowRecSection] = useState(false) // 추천 섹션 표시 여부
  const [bulkId, setBulkId] = useState(null) // ZIP 다운로드 ID
  const [zipReady, setZipReady] = useState(false) // ZIP 준비 완료 여부
  const [previousRecs, setPreviousRecs] = useState([]) // 이전 추천 기록 (중복 방지용)
  const progressInterval = useRef(null)
  const bulkProgressInterval = useRef(null)

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
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`
    return `${views} views`
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown'
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`
    return `${(bytes / 1024).toFixed(2)} KB`
  }

  const fetchVideoInfo = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL')
      return
    }

    setLoading(true)
    setError('')
    setVideoInfo(null)

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
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const startDownload = async (formatId) => {
    setDownloading(true)
    setProgress(0)
    setStatus('Starting download...')
    setError('')

    // 다운로드할 영상의 title 확보
    const downloadTitle = videoInfo?.title || 'video'
    console.log('Downloading:', { url, formatId, title: downloadTitle, outputFormat })

    try {
      const response = await fetch(`${API_BASE}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formatId, title: downloadTitle, outputFormat })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start download')
      }

      setDownloadId(data.downloadId)
      
      // Save download to history (logged in users only)
      if (user && videoInfo) {
        const videoId = url.match(/(?:v=|\/)([\w-]{11})/)?.[1]
        if (videoId) {
          saveDownload(user.id, {
            videoId,
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
            uploader: videoInfo.uploader,
            duration: videoInfo.duration,
            format: outputFormat
          })
        }
      }
    } catch (err) {
      setError(err.message)
      setDownloading(false)
    }
  }

  useEffect(() => {
    if (downloadId) {
      progressInterval.current = setInterval(async () => {
        try {
          const response = await fetch(`${API_BASE}/progress/${downloadId}`)
          const data = await response.json()

          setProgress(data.progress)

          if (data.status === 'downloading') {
            setStatus(`Downloading... ${data.progress.toFixed(1)}%`)
          } else if (data.status === 'merging') {
            setStatus('Merging video and audio...')
          } else if (data.status === 'completed') {
            setStatus('Download complete!')
            clearInterval(progressInterval.current)
            
            // Trigger file download
            window.location.href = `${API_BASE}/file/${downloadId}`
            
            setTimeout(() => {
              setDownloading(false)
              setProgress(0)
              setStatus('')
              setDownloadId(null)
            }, 2000)
          } else if (data.status === 'error') {
            setError(data.error || 'Download failed')
            setDownloading(false)
            clearInterval(progressInterval.current)
          }
        } catch (err) {
          console.error('Progress check error:', err)
        }
      }, 500)
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current)
      }
    }
  }, [downloadId])

  // Auth state listener
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setShowAuthModal(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showUserMenu && !e.target.closest('.user-menu')) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showUserMenu])

  const handleSignOut = async () => {
    await signOut()
    setShowUserMenu(false)
  }

  const openHistory = (tab) => {
    setHistoryTab(tab)
    setShowHistoryModal(true)
    setShowUserMenu(false)
  }

  // Check if current video is favorited
  useEffect(() => {
    const checkFavorite = async () => {
      if (user && videoInfo) {
        const videoId = url.match(/(?:v=|\/)([\w-]{11})/)?.[1]
        if (videoId) {
          const { isFavorite: fav } = await isFavorite(user.id, videoId)
          setIsFav(fav)
        }
      } else {
        setIsFav(false)
      }
    }
    checkFavorite()
  }, [user, videoInfo, url])

  const toggleFavorite = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }
    
    const videoId = url.match(/(?:v=|\/)([\w-]{11})/)?.[1]
    if (!videoId || !videoInfo) return

    if (isFav) {
      await removeFavorite(user.id, videoId)
      setIsFav(false)
    } else {
      await addFavorite(user.id, {
        videoId,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        uploader: videoInfo.uploader,
        duration: videoInfo.duration,
        url: url
      })
      setIsFav(true)
    }
  }

  // Toggle favorite for recommendation
  const toggleRecFavorite = async (rec) => {
    if (!user) {
      setShowAuthModal(true)
      return
    }
    
    const videoId = rec.videoId
    if (!videoId) return

    const isCurrentlyFav = recFavorites[videoId]
    
    if (isCurrentlyFav) {
      await removeFavorite(user.id, videoId)
      setRecFavorites(prev => ({ ...prev, [videoId]: false }))
    } else {
      await addFavorite(user.id, {
        videoId,
        title: rec.title,
        thumbnail: rec.thumbnail,
        uploader: rec.artist,
        duration: rec.duration,
        url: rec.url
      })
      setRecFavorites(prev => ({ ...prev, [videoId]: true }))
    }
  }

  // Check favorites for recommendations when they load
  useEffect(() => {
    const checkRecFavorites = async () => {
      if (user && recommendations.length > 0) {
        const favStatus = {}
        for (const rec of recommendations) {
          if (rec.videoId) {
            const { isFavorite: fav } = await isFavorite(user.id, rec.videoId)
            favStatus[rec.videoId] = fav
          }
        }
        setRecFavorites(favStatus)
      }
    }
    checkRecFavorites()
  }, [user, recommendations])

  // Create mixset with crossfade (max 10 tracks)
  const createMixset = async () => {
    if (recommendations.length < 2) return
    
    // Use DJ order if available, otherwise use current order (limit to 10)
    const allTracks = djOrder?.orderedTracks || recommendations.map((rec, idx) => ({
      ...rec,
      position: idx + 1
    }))
    const tracksToMix = allTracks.slice(0, 10) // Max 10 tracks for mixset
    
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
        body: JSON.stringify({ 
          tracks, 
          crossfadeDuration,
          mixsetName
        })
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
          
          if (progressData.status === 'completed') {
            clearInterval(pollInterval)
          } else if (progressData.status === 'error') {
            clearInterval(pollInterval)
          }
        } catch (err) {
          console.error('Mixset progress error:', err)
        }
      }, 1000)
    } catch (err) {
      console.error('Mixset error:', err)
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

  // Get DJ mix order recommendation
  const getDJOrder = async () => {
    if (recommendations.length < 2) return
    
    setLoadingDJ(true)
    setDjOrder(null)
    setShowDJModal(true)
    
    try {
      const tracks = recommendations.map(rec => ({
        title: rec.title,
        artist: rec.artist,
        thumbnail: rec.thumbnail,
        url: rec.url,
        videoId: rec.videoId,
        duration: rec.duration
      }))
      
      const response = await fetch(`${API_BASE}/dj-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get DJ order')
      }
      
      setDjOrder(data)
    } catch (err) {
      console.error('DJ Order error:', err)
      setDjOrder({ error: err.message })
    } finally {
      setLoadingDJ(false)
    }
  }

  // Save download to history
  const saveDownloadHistory = async (format) => {
    if (!user || !videoInfo) return
    const videoId = url.match(/(?:v=|\/)([\w-]{11})/)?.[1]
    if (!videoId) return
    
    await saveDownload(user.id, {
      videoId,
      title: videoInfo.title,
      thumbnail: videoInfo.thumbnail,
      uploader: videoInfo.uploader,
      duration: videoInfo.duration,
      format: outputFormat
    })
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading) {
      fetchVideoInfo()
    }
  }

  const resetAll = () => {
    setUrl('')
    setVideoInfo(null)
    setError('')
    setProgress(0)
    setStatus('')
    setDownloading(false)
    setSelectedFormat(null)
    setOutputFormat('mp4')
  }

  const selectFormat = (format) => {
    setSelectedFormat(format)
  }

  const handleDownload = () => {
    if (selectedFormat) {
      startDownload(selectedFormat.formatId)
    }
  }

  // Fetch similar music recommendations
  const fetchRecommendations = async (count = recCount, isRefresh = false) => {
    if (!videoInfo) return
    
    setLoadingRecs(true)
    setRecommendations([])
    setRecError('')
    setShowRecSection(true)
    
    // 리프레시가 아닌 첫 추천일 경우 이전 추천 기록 초기화
    const excludeTitles = isRefresh ? previousRecs : []
    if (!isRefresh) {
      setPreviousRecs([])
    }
    
    try {
      const response = await fetch(`${API_BASE}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: videoInfo.title, 
          uploader: videoInfo.uploader,
          count: count,
          excludeTitles: excludeTitles
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        if (response.status === 503) {
          setRecError(data.message || 'AI recommendations not available')
        } else {
          setRecError(data.error || 'Failed to get recommendations')
        }
        return
      }
      
      const newRecs = data.recommendations || []
      setRecommendations(newRecs)
      
      // 새 추천을 이전 추천 기록에 추가 (다음 리프레시를 위해)
      const newTitles = newRecs.map(r => `${r.artist} - ${r.title}`)
      setPreviousRecs(prev => [...prev, ...newTitles])
      
      // Save recommendation history (logged in users only)
      if (user && newRecs.length > 0) {
        saveRecommendation(user.id, {
          title: videoInfo.title,
          uploader: videoInfo.uploader
        }, newRecs)
      }
    } catch (err) {
      console.error('Recommendation error:', err)
      setRecError('Failed to connect to recommendation service')
    } finally {
      setLoadingRecs(false)
    }
  }

  // Open download modal for recommended video
  const openRecDownloadModal = (rec) => {
    setRecDownloadModal(rec)
    setRecFormat('mp4')
    setRecQuality('best')
  }

  // Close download modal
  const closeRecDownloadModal = () => {
    setRecDownloadModal(null)
  }

  // Download recommended video with selected options
  const downloadRecommended = async () => {
    if (!recDownloadModal) return
    
    const rec = recDownloadModal
    setDownloadingRec(rec.videoId)
    closeRecDownloadModal()
    
    try {
      const response = await fetch(`${API_BASE}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: rec.url, 
          formatId: recQuality, 
          title: `${rec.artist} - ${rec.title}`,
          outputFormat: recFormat 
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start download')
      }
      
      // Poll for completion
      const checkProgress = setInterval(async () => {
        try {
          const progressRes = await fetch(`${API_BASE}/progress/${data.downloadId}`)
          const progressData = await progressRes.json()
          
          if (progressData.status === 'completed') {
            clearInterval(checkProgress)
            window.location.href = `${API_BASE}/file/${data.downloadId}`
            setTimeout(() => setDownloadingRec(null), 2000)
          } else if (progressData.status === 'error') {
            clearInterval(checkProgress)
            setDownloadingRec(null)
          }
        } catch (err) {
          clearInterval(checkProgress)
          setDownloadingRec(null)
        }
      }, 1000)
    } catch (err) {
      console.error('Download error:', err)
      setDownloadingRec(null)
    }
  }

  // Reset recommendation section when video changes
  useEffect(() => {
    if (videoInfo) {
      setShowRecSection(false)
      setRecommendations([])
      setPreviousRecs([]) // 이전 추천 기록도 초기화
    }
  }, [videoInfo])

  // Download all recommendations as ZIP
  const downloadAllRecommendations = async () => {
    if (recommendations.length === 0) return
    
    setDownloadAllModal(false)
    setDownloadingAll(true)
    setZipReady(false)
    setBulkId(null)
    setDownloadAllProgress({ 
      current: 0, 
      total: recommendations.length, 
      status: 'starting',
      current_title: '' 
    })

    try {
      // Prepare videos array
      const videos = recommendations.map(rec => ({
        url: rec.url,
        title: `${rec.artist} - ${rec.title}`
      }))

      // Start bulk download
      const response = await fetch(`${API_BASE}/bulk-download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos, outputFormat: recFormat })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start bulk download')
      }

      setBulkId(data.bulkId)

      // Poll for progress
      bulkProgressInterval.current = setInterval(async () => {
        try {
          const progressRes = await fetch(`${API_BASE}/bulk-progress/${data.bulkId}`)
          const progressData = await progressRes.json()

          setDownloadAllProgress({
            current: progressData.completed || 0,
            total: progressData.total || recommendations.length,
            status: progressData.status,
            current_title: progressData.current || ''
          })

          if (progressData.status === 'completed' || progressData.zipFile) {
            clearInterval(bulkProgressInterval.current)
            setZipReady(true)
            console.log('ZIP ready:', progressData)
          } else if (progressData.status === 'error') {
            clearInterval(bulkProgressInterval.current)
            setDownloadingAll(false)
            setError(progressData.error || 'Bulk download failed')
          }
        } catch (err) {
          console.error('Progress check error:', err)
        }
      }, 1000)
    } catch (err) {
      console.error('Bulk download error:', err)
      setDownloadingAll(false)
      setError(err.message)
    }
  }

  // Download the ZIP file
  const downloadZipFile = () => {
    if (bulkId) {
      window.location.href = `${API_BASE}/bulk-file/${bulkId}`
      // Reset after download
      setTimeout(() => {
        setDownloadingAll(false)
        setZipReady(false)
        setBulkId(null)
        setDownloadAllProgress({ current: 0, total: 0, status: '', current_title: '' })
      }, 2000)
    }
  }

  // Cleanup bulk progress interval
  useEffect(() => {
    return () => {
      if (bulkProgressInterval.current) {
        clearInterval(bulkProgressInterval.current)
      }
    }
  }, [])

  return (
    <div className="app">
      <div className="container">
        {/* Header */}
        <header className="header">
          <div className="header-top">
            <div className="logo">
              <div className="logo-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h1>YT<span>Grab</span></h1>
            </div>
            
            {/* Auth Section */}
            {user ? (
              <div className="user-menu">
                <button className="user-avatar-btn" onClick={() => setShowUserMenu(!showUserMenu)}>
                  {user.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="Avatar" className="user-avatar" />
                  ) : (
                    <div className="user-avatar-placeholder">
                      {(user.email || user.user_metadata?.name || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="user-name">{user.user_metadata?.name || user.email?.split('@')[0]}</span>
                  <svg viewBox="0 0 24 24" fill="none" style={{width: '16px', height: '16px'}}>
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                
                {showUserMenu && (
                  <div className="user-dropdown">
                    <button className="user-dropdown-item" onClick={() => openHistory('downloads')}>
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      다운로드 기록
                    </button>
                    <button className="user-dropdown-item" onClick={() => openHistory('favorites')}>
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      즐겨찾기
                    </button>
                    <button className="user-dropdown-item" onClick={() => openHistory('recommendations')}>
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      추천 기록
                    </button>
                    <button className="user-dropdown-item logout" onClick={handleSignOut}>
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      로그아웃
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="login-btn" onClick={() => setShowAuthModal(true)}>
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                로그인
              </button>
            )}
          </div>
          <p className="tagline">Download YouTube videos in MP4 format</p>
        </header>

        {/* Search Section */}
        <div className="search-section">
          <div className="input-wrapper">
            <input
              type="text"
              placeholder="Paste YouTube URL here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading || downloading}
              className="url-input"
            />
            <button 
              onClick={fetchVideoInfo} 
              disabled={loading || downloading}
              className="fetch-btn"
            >
              {loading ? (
                <span className="spinner"></span>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Fetch
                </>
              )}
            </button>
          </div>
          
          {error && (
            <div className="error-message">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Video Info Card */}
        {videoInfo && (
          <div className="video-card">
            <button 
              className="close-btn"
              onClick={() => {
                setVideoInfo(null)
                setSelectedFormat(null)
                setRecommendations([])
                setShowRecSection(false)
                setError('')
              }}
              title="New Search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
            <div 
              className="video-thumbnail clickable"
              onClick={() => window.open(url, '_blank')}
              title="Open in YouTube"
            >
              <img src={videoInfo.thumbnail} alt={videoInfo.title} />
              <div className="duration-badge">{formatDuration(videoInfo.duration)}</div>
              <div className="play-overlay">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
            
            <div className="video-details">
              <div className="video-title-row">
                <h2 className="video-title">{videoInfo.title}</h2>
                <button 
                  className={`favorite-btn ${isFav ? 'active' : ''}`}
                  onClick={toggleFavorite}
                  title={isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                >
                  <svg viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'}>
                    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <div className="video-meta">
                <span className="uploader">{videoInfo.uploader}</span>
                <span className="separator">•</span>
                <span className="views">{formatViews(videoInfo.viewCount)}</span>
              </div>

              {/* Download Progress */}
              {downloading && (
                <div className="progress-section">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <span className="progress-text">{status}</span>
                </div>
              )}

              {/* Format Selection */}
              {!downloading && (
                <div className="format-section">
                  <h3>Select Format</h3>
                  <div className="format-tabs">
                    <button 
                      className={`format-tab ${outputFormat === 'mp4' ? 'active' : ''}`}
                      onClick={() => setOutputFormat('mp4')}
                    >
                      <svg viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                        <path d="M8 21H16M12 17V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      <span>MP4</span>
                      <small>Video</small>
                    </button>
                    <button 
                      className={`format-tab ${outputFormat === 'mp3' ? 'active' : ''}`}
                      onClick={() => setOutputFormat('mp3')}
                    >
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M9 18V5L21 3V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2"/>
                        <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      <span>MP3</span>
                      <small>Audio Only</small>
                    </button>
                    <button 
                      className={`format-tab ${outputFormat === 'webm' ? 'active' : ''}`}
                      onClick={() => setOutputFormat('webm')}
                    >
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>WebM</span>
                      <small>Web Video</small>
                    </button>
                  </div>
                </div>
              )}

              {/* Quality Selection */}
              {!downloading && (
                <div className="quality-section">
                  <h3>{outputFormat === 'mp3' ? 'Audio Quality' : 'Video Quality'}</h3>
                  <div className="quality-grid">
                    {videoInfo.formats.slice(0, 6).map((format, index) => (
                      <button
                        key={format.formatId}
                        className={`quality-btn ${selectedFormat?.formatId === format.formatId ? 'selected' : ''}`}
                        onClick={() => selectFormat(format)}
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <span className="quality-label">{format.quality}</span>
                        <span className="quality-info">
                          {format.resolution}
                          {format.filesize && ` • ${formatFileSize(format.filesize)}`}
                        </span>
                        {selectedFormat?.formatId === format.formatId && (
                          <span className="check-icon">✓</span>
                        )}
                      </button>
                    ))}
                    <button
                      className={`quality-btn best ${selectedFormat?.formatId === 'best' ? 'selected' : ''}`}
                      onClick={() => selectFormat({ formatId: 'best', quality: 'Best Quality' })}
                    >
                      <span className="quality-label">Best Quality</span>
                      <span className="quality-info">Auto select highest</span>
                      {selectedFormat?.formatId === 'best' && (
                        <span className="check-icon">✓</span>
                      )}
                    </button>
                  </div>
                  
                  {/* Download Button */}
                  <button 
                    className={`download-btn ${selectedFormat ? 'active' : ''}`}
                    onClick={handleDownload}
                    disabled={!selectedFormat}
                  >
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {selectedFormat ? `Download ${selectedFormat.quality} (${outputFormat.toUpperCase()})` : 'Select a quality first'}
                  </button>
                </div>
              )}
            </div>

            <button className="reset-btn" onClick={resetAll} title="Start over">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* AI Recommendation Trigger */}
        {videoInfo && !showRecSection && (
          <div className="rec-trigger-section">
            <div className="rec-trigger-header">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <h3>AI Music Recommendations</h3>
                <p>Find similar songs based on "{videoInfo.title}"</p>
              </div>
            </div>
            
            <div className="rec-trigger-options">
              <label>Number of songs:</label>
              <div className="rec-count-buttons">
                {[5, 10, 20, 30, 50].map(num => (
                  <button
                    key={num}
                    className={`rec-count-btn ${recCount === num ? 'active' : ''}`}
                    onClick={() => setRecCount(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
            
            <button className="rec-trigger-btn" onClick={() => fetchRecommendations(recCount)}>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Get {recCount} Recommendations
            </button>
          </div>
        )}

        {/* AI Recommendations */}
        {videoInfo && showRecSection && (
          <div className="recommendations-section">
            <div className="rec-header">
              <h2>
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                AI Recommended Similar Music
              </h2>
              <div className="rec-header-buttons">
                {recommendations.length > 0 && !downloadingAll && (
                  <>
                    <button className="download-all-btn" onClick={() => setDownloadAllModal(true)}>
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Download All
                    </button>
                    {recommendations.length >= 2 && (
                      <>
                        <button className="dj-order-btn" onClick={getDJOrder} disabled={loadingDJ}>
                          <svg viewBox="0 0 24 24" fill="none">
                            <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2"/>
                            <circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="2"/>
                            <path d="M6 21V9M18 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <path d="M6 9C6 9 6 14 12 14C18 14 18 9 18 9" stroke="currentColor" strokeWidth="2"/>
                          </svg>
                          {loadingDJ ? 'AI 분석중...' : 'DJ Order'}
                        </button>
                        <button 
                          className={`create-mixset-btn ${recommendations.length > 10 ? 'disabled' : ''}`}
                          onClick={() => recommendations.length <= 10 && setShowMixsetModal(true)}
                          title={recommendations.length > 10 ? '최대 10곡까지만 믹스셋 제작 가능' : 'Create Mixset'}
                        >
                          <svg viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                          Mixset {recommendations.length > 10 ? '(≤10곡)' : ''}
                        </button>
                      </>
                    )}
                  </>
                )}
                {downloadingAll && !zipReady && (
                  <div className="download-all-progress">
                    <span className="spinner small"></span>
                    <span>{downloadAllProgress.current} / {downloadAllProgress.total}</span>
                  </div>
                )}
                {zipReady && (
                  <button className="download-zip-btn" onClick={downloadZipFile}>
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Download ZIP
                  </button>
                )}
                <div className="rec-count-selector">
                  {[5, 10, 20, 30, 50].map(num => (
                    <button
                      key={num}
                      className={`rec-count-mini ${recCount === num ? 'active' : ''}`}
                      onClick={() => setRecCount(num)}
                      disabled={loadingRecs || downloadingAll}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <button className="refresh-btn" onClick={() => fetchRecommendations(recCount, true)} disabled={loadingRecs || downloadingAll}>
                  <svg viewBox="0 0 24 24" fill="none" className={loadingRecs ? 'spinning' : ''}>
                    <path d="M4 4V9H4.58152M19.9381 11C19.446 7.05369 16.0796 4 12 4C8.64262 4 5.76829 6.06817 4.58152 9M4.58152 9H9M20 20V15H19.4185M19.4185 15C18.2317 17.9318 15.3574 20 12 20C7.92038 20 4.55399 16.9463 4.06189 13M19.4185 15H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {loadingRecs ? 'Finding...' : `Get ${recCount}`}
                </button>
              </div>
            </div>
            
            {loadingRecs ? (
              <div className="rec-loading">
                <div className="rec-loading-spinner"></div>
                <p>AI is finding similar music...</p>
              </div>
            ) : recError ? (
              <div className="rec-error">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <p>{recError}</p>
              </div>
            ) : recommendations.length > 0 ? (
              <div className="rec-grid">
                {recommendations.map((rec, index) => (
                  <div key={index} className="rec-card">
                    <a 
                      href={rec.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="rec-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="rec-thumbnail">
                        <img src={rec.thumbnail} alt={rec.title} />
                        {rec.duration && (
                          <span className="rec-duration">{formatDuration(rec.duration)}</span>
                        )}
                        <div className="play-overlay">
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                      <div className="rec-info">
                        <h4>{rec.title}</h4>
                        <p>{rec.artist}</p>
                        {rec.viewCount && (
                          <span className="rec-views">{formatViews(rec.viewCount)}</span>
                        )}
                      </div>
                    </a>
                    <div className="rec-actions">
                      <button 
                        className={`rec-fav-btn ${recFavorites[rec.videoId] ? 'active' : ''}`}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          toggleRecFavorite(rec)
                        }}
                        title={recFavorites[rec.videoId] ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                      >
                        <svg viewBox="0 0 24 24" fill={recFavorites[rec.videoId] ? 'currentColor' : 'none'}>
                          <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                      <button 
                        className={`rec-download-btn ${downloadingRec === rec.videoId ? 'downloading' : ''}`}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          openRecDownloadModal(rec)
                        }}
                        disabled={downloadingRec === rec.videoId}
                      >
                        {downloadingRec === rec.videoId ? (
                          <span className="spinner small"></span>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none">
                            <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rec-empty">
                <p>No recommendations available</p>
              </div>
            )}
          </div>
        )}

        {/* Features */}
        {!videoInfo && !loading && (
          <div className="features">
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>Fast Download</h3>
              <p>High-speed downloads with optimized servers</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M9 12L15 12M12 9L12 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h3>Multiple Formats</h3>
              <p>Choose from various quality options</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/>
                  <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>No Registration</h3>
              <p>Download instantly without signing up</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="footer">
          <p>Made with <span className="heart">♥</span> for video lovers</p>
        </footer>
      </div>

      {/* Download Options Modal */}
      {recDownloadModal && (
        <div className="modal-overlay" onClick={closeRecDownloadModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeRecDownloadModal}>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            
            <div className="modal-header">
              <img src={recDownloadModal.thumbnail} alt={recDownloadModal.title} className="modal-thumb" />
              <div className="modal-info">
                <h3>{recDownloadModal.title}</h3>
                <p>{recDownloadModal.artist}</p>
              </div>
            </div>

            <div className="modal-section">
              <h4>Format</h4>
              <div className="modal-format-tabs">
                <button 
                  className={`modal-format-btn ${recFormat === 'mp4' ? 'active' : ''}`}
                  onClick={() => setRecFormat('mp4')}
                >
                  <span>🎬</span> MP4
                </button>
                <button 
                  className={`modal-format-btn ${recFormat === 'mp3' ? 'active' : ''}`}
                  onClick={() => setRecFormat('mp3')}
                >
                  <span>🎵</span> MP3
                </button>
                <button 
                  className={`modal-format-btn ${recFormat === 'webm' ? 'active' : ''}`}
                  onClick={() => setRecFormat('webm')}
                >
                  <span>🌐</span> WebM
                </button>
              </div>
            </div>

            <div className="modal-section">
              <h4>Quality</h4>
              <div className="modal-quality-grid">
                <button 
                  className={`modal-quality-btn ${recQuality === 'best' ? 'active' : ''}`}
                  onClick={() => setRecQuality('best')}
                >
                  <span className="quality-name">Best</span>
                  <span className="quality-desc">Highest available</span>
                </button>
                {recFormat !== 'mp3' && (
                  <>
                    <button 
                      className={`modal-quality-btn ${recQuality === '1080' ? 'active' : ''}`}
                      onClick={() => setRecQuality('1080')}
                    >
                      <span className="quality-name">1080p</span>
                      <span className="quality-desc">Full HD</span>
                    </button>
                    <button 
                      className={`modal-quality-btn ${recQuality === '720' ? 'active' : ''}`}
                      onClick={() => setRecQuality('720')}
                    >
                      <span className="quality-name">720p</span>
                      <span className="quality-desc">HD</span>
                    </button>
                    <button 
                      className={`modal-quality-btn ${recQuality === '480' ? 'active' : ''}`}
                      onClick={() => setRecQuality('480')}
                    >
                      <span className="quality-name">480p</span>
                      <span className="quality-desc">SD</span>
                    </button>
                  </>
                )}
                {recFormat === 'mp3' && (
                  <>
                    <button 
                      className={`modal-quality-btn ${recQuality === '320' ? 'active' : ''}`}
                      onClick={() => setRecQuality('320')}
                    >
                      <span className="quality-name">320kbps</span>
                      <span className="quality-desc">High quality</span>
                    </button>
                    <button 
                      className={`modal-quality-btn ${recQuality === '192' ? 'active' : ''}`}
                      onClick={() => setRecQuality('192')}
                    >
                      <span className="quality-name">192kbps</span>
                      <span className="quality-desc">Standard</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <button className="modal-download-btn" onClick={downloadRecommended}>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Download {recFormat.toUpperCase()}
            </button>
          </div>
        </div>
      )}

      {/* Download All Modal */}
      {downloadAllModal && (
        <div className="modal-overlay" onClick={() => setDownloadAllModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDownloadAllModal(false)}>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            
            <div className="modal-header-all">
              <div className="modal-icon-all">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <h3>Download All {recommendations.length} Songs</h3>
                <p>Select format and quality for all downloads</p>
              </div>
            </div>

            <div className="modal-songs-preview">
              {recommendations.slice(0, 3).map((rec, i) => (
                <div key={i} className="preview-song">
                  <img src={rec.thumbnail} alt={rec.title} />
                  <span>{rec.artist} - {rec.title}</span>
                </div>
              ))}
              {recommendations.length > 3 && (
                <div className="preview-more">+{recommendations.length - 3} more songs</div>
              )}
            </div>

            <div className="modal-section">
              <h4>Format</h4>
              <div className="modal-format-tabs">
                <button 
                  className={`modal-format-btn ${recFormat === 'mp4' ? 'active' : ''}`}
                  onClick={() => setRecFormat('mp4')}
                >
                  <span>🎬</span> MP4
                </button>
                <button 
                  className={`modal-format-btn ${recFormat === 'mp3' ? 'active' : ''}`}
                  onClick={() => setRecFormat('mp3')}
                >
                  <span>🎵</span> MP3
                </button>
                <button 
                  className={`modal-format-btn ${recFormat === 'webm' ? 'active' : ''}`}
                  onClick={() => setRecFormat('webm')}
                >
                  <span>🌐</span> WebM
                </button>
              </div>
            </div>

            <div className="modal-section">
              <h4>Quality</h4>
              <div className="modal-quality-grid">
                <button 
                  className={`modal-quality-btn ${recQuality === 'best' ? 'active' : ''}`}
                  onClick={() => setRecQuality('best')}
                >
                  <span className="quality-name">Best</span>
                  <span className="quality-desc">Highest available</span>
                </button>
                {recFormat !== 'mp3' && (
                  <>
                    <button 
                      className={`modal-quality-btn ${recQuality === '720' ? 'active' : ''}`}
                      onClick={() => setRecQuality('720')}
                    >
                      <span className="quality-name">720p</span>
                      <span className="quality-desc">HD</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <button className="modal-download-btn download-all-action" onClick={downloadAllRecommendations}>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Download All ({recommendations.length} songs)
            </button>
          </div>
        </div>
      )}

      {/* DJ Mix Order Modal */}
      {showDJModal && (
        <div className="modal-overlay" onClick={() => setShowDJModal(false)}>
          <div className="modal-content dj-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowDJModal(false)}>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon dj-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="2"/>
                  <path d="M6 21V9M18 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M6 9C6 9 6 14 12 14C18 14 18 9 18 9" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>
              <div>
                <h3>🎧 DJ Mix Order</h3>
                <p>AI가 추천하는 자연스러운 DJ 믹스 순서</p>
              </div>
            </div>

            {loadingDJ ? (
              <div className="dj-loading">
                <div className="rec-loading-spinner"></div>
                <p>AI가 최적의 믹스 순서를 분석중...</p>
                <span>BPM, 키, 에너지 레벨을 고려합니다</span>
              </div>
            ) : djOrder?.error ? (
              <div className="dj-error">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <p>{djOrder.error}</p>
              </div>
            ) : djOrder ? (
              <div className="dj-result">
                {djOrder.overallVibe && (
                  <div className="dj-vibe">
                    <span className="dj-label">Overall Vibe</span>
                    <p>{djOrder.overallVibe}</p>
                    {djOrder.estimatedBPMRange && (
                      <span className="dj-bpm">🎵 {djOrder.estimatedBPMRange}</span>
                    )}
                  </div>
                )}

                <div className="dj-tracklist">
                  <span className="dj-label">Recommended Order</span>
                  <div className="dj-tracks">
                    {djOrder.orderedTracks?.map((track, idx) => (
                      <div key={idx} className="dj-track">
                        <div className="dj-track-num">{track.position || idx + 1}</div>
                        <div className="dj-track-thumb">
                          {track.thumbnail ? (
                            <img src={track.thumbnail} alt={track.title} />
                          ) : (
                            <div className="thumb-placeholder">🎵</div>
                          )}
                        </div>
                        <div className="dj-track-info">
                          <h4>{track.title}</h4>
                          <p>{track.artist}</p>
                          {track.reason && (
                            <span className="dj-track-reason">{track.reason}</span>
                          )}
                        </div>
                        {idx < djOrder.orderedTracks.length - 1 && (
                          <div className="dj-track-arrow">↓</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {djOrder.mixingTips && djOrder.mixingTips.length > 0 && (
                  <div className="dj-tips">
                    <span className="dj-label">💡 Mixing Tips</span>
                    <ul>
                      {djOrder.mixingTips.map((tip, idx) => (
                        <li key={idx}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Mixset Modal */}
      {showMixsetModal && (
        <div className="modal-overlay" onClick={() => !mixsetProgress && setShowMixsetModal(false)}>
          <div className="modal-content mixset-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => {
              if (!mixsetProgress || mixsetProgress.status === 'completed' || mixsetProgress.status === 'error') {
                setShowMixsetModal(false)
                setMixsetProgress(null)
                setMixsetId(null)
              }
            }}>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon mixset-icon">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <h3>🎛️ Create Mixset</h3>
                <p>선택한 곡들을 크로스페이드로 하나의 믹스셋으로 제작</p>
                <span className="mixset-limit-badge">⚠️ 최대 10곡</span>
              </div>
            </div>

            {!mixsetProgress ? (
              <>
                <div className="mixset-settings">
                  <div className="mixset-info">
                    <span className="mixset-label">📀 Tracks to mix</span>
                    <p>{Math.min(djOrder?.orderedTracks?.length || recommendations.length, 10)} songs{djOrder && ' (DJ Order 적용됨)'}</p>
                    {(djOrder?.orderedTracks?.length || recommendations.length) > 10 && (
                      <span className="mixset-warning">처음 10곡만 믹스됩니다</span>
                    )}
                  </div>
                  
                  <div className="mixset-option">
                    <span className="mixset-label">⏱️ Crossfade Duration</span>
                    <div className="crossfade-buttons">
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
                </div>

                <div className="mixset-preview">
                  <span className="mixset-label">🎵 Track Order Preview</span>
                  <div className="mixset-tracks">
                    {(djOrder?.orderedTracks || recommendations.slice(0, 5)).map((track, idx) => (
                      <div key={idx} className="mixset-track-item">
                        <span className="mixset-track-num">{idx + 1}</span>
                        <span className="mixset-track-name">{track.artist} - {track.title}</span>
                        {idx < (djOrder?.orderedTracks?.length || recommendations.length) - 1 && (
                          <span className="mixset-fade-indicator">~{crossfadeDuration}s~</span>
                        )}
                      </div>
                    ))}
                    {!djOrder && recommendations.length > 5 && (
                      <div className="mixset-track-more">+{recommendations.length - 5} more tracks...</div>
                    )}
                  </div>
                </div>

                <button className="modal-download-btn create-mixset-action" onClick={createMixset}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  Create Mixset
                </button>
              </>
            ) : mixsetProgress.status === 'downloading' || mixsetProgress.status === 'starting' ? (
              <div className="mixset-progress">
                <div className="rec-loading-spinner"></div>
                <p className="mixset-phase">{mixsetProgress.phase}</p>
                {mixsetProgress.current && (
                  <span className="mixset-current">🎵 {mixsetProgress.current}</span>
                )}
                {mixsetProgress.total && (
                  <div className="mixset-progress-bar">
                    <div 
                      className="mixset-progress-fill" 
                      style={{ width: `${(mixsetProgress.completed / mixsetProgress.total) * 100}%` }}
                    ></div>
                  </div>
                )}
                {mixsetProgress.completed !== undefined && mixsetProgress.total && (
                  <span className="mixset-count">{mixsetProgress.completed} / {mixsetProgress.total}</span>
                )}
              </div>
            ) : mixsetProgress.status === 'completed' ? (
              <div className="mixset-complete">
                <div className="mixset-success-icon">✓</div>
                <h4>Mixset Ready! 🎉</h4>
                <p>{mixsetProgress.trackCount} tracks mixed with {mixsetProgress.crossfade}s crossfade</p>
                <button className="modal-download-btn download-mixset-action" onClick={downloadMixset}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Download Mixset
                </button>
              </div>
            ) : mixsetProgress.status === 'error' ? (
              <div className="mixset-error">
                <div className="mixset-error-icon">✕</div>
                <h4>Mixset Failed</h4>
                <p>{mixsetProgress.error}</p>
                <button className="modal-download-btn retry-mixset" onClick={() => setMixsetProgress(null)}>
                  Try Again
                </button>
              </div>
            ) : null}
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

