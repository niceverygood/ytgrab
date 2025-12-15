import { useState, useEffect, useRef } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function App() {
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

          if (progressData.status === 'completed') {
            clearInterval(bulkProgressInterval.current)
            setZipReady(true)
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
              <h2 className="video-title">{videoInfo.title}</h2>
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
                  <button className="download-all-btn" onClick={() => setDownloadAllModal(true)}>
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Download All
                  </button>
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
    </div>
  )
}

export default App

