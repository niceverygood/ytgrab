import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import './App.css'
import AuthModal from './components/AuthModal'
import HistoryModal from './components/HistoryModal'
import WaveformVisualizer from './components/WaveformVisualizer'
import ListenButton from './components/ListenButton'
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
  const [mixPreviewTrack, setMixPreviewTrack] = useState(null) // Currently playing track in mixset modal
  const mixPreviewRef = useRef(null) // Audio element ref for mix preview
  
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
  const [inlinePreview, setInlinePreview] = useState(null) // For inline audio preview
  
  // Filter state (B: Smart Filters)
  const [filters, setFilters] = useState({
    bpmMin: 0,
    bpmMax: 200,
    energyMin: 1,
    energyMax: 10,
    genre: 'all',
    showFilters: false
  })
  
  // DJ Analysis state (A: BPM/Key/Energy)
  const [trackAnalysis, setTrackAnalysis] = useState({}) // { videoId: { bpm, key, energy, genre, mood } }
  const [analyzingTracks, setAnalyzingTracks] = useState(false)
  
  // Setlist state (C: 세트리스트)
  const [showSetlistModal, setShowSetlistModal] = useState(false)
  const [setlistName, setSetlistName] = useState('')
  const [savedSetlists, setSavedSetlists] = useState([])
  const [showSetlistsPanel, setShowSetlistsPanel] = useState(false)
  
  // Waveform state
  const [expandedWaveform, setExpandedWaveform] = useState(null) // videoId of expanded waveform
  const [waveformModal, setWaveformModal] = useState(null) // Track data for modal view
  const [waveformPlayback, setWaveformPlayback] = useState({
    isPlaying: false,
    currentTime: 0,
    videoId: null
  })

  // DJ Pro Features state
  const [showCamelotWheel, setShowCamelotWheel] = useState(false)
  const [selectedTrackForBpmSync, setSelectedTrackForBpmSync] = useState(null)
  const [showLoopExtractor, setShowLoopExtractor] = useState(false)
  const [loopExtractTrack, setLoopExtractTrack] = useState(null)
  const [loopStart, setLoopStart] = useState(0)
  const [loopEnd, setLoopEnd] = useState(30)
  const [loopExtracting, setLoopExtracting] = useState(false)
  
  // Stem Separation state
  const [showStemModal, setShowStemModal] = useState(false)
  const [stemTrack, setStemTrack] = useState(null)
  const [stemProgress, setStemProgress] = useState(null)
  const [stemResults, setStemResults] = useState(null)
  
  // Pitch Shift state
  const [showPitchModal, setShowPitchModal] = useState(false)
  const [pitchTrack, setPitchTrack] = useState(null)
  const [pitchShift, setPitchShift] = useState(0) // semitones
  const [pitchProcessing, setPitchProcessing] = useState(false)

  // NEW: Advanced DJ Pro Features state
  const [showStructureModal, setShowStructureModal] = useState(false)
  const [structureTrack, setStructureTrack] = useState(null)
  const [structureData, setStructureData] = useState(null)
  const [structureLoading, setStructureLoading] = useState(false)
  
  const [showTempoModal, setShowTempoModal] = useState(false)
  const [tempoTrack, setTempoTrack] = useState(null)
  const [targetBpm, setTargetBpm] = useState(128)
  const [tempoProcessing, setTempoProcessing] = useState(false)
  
  const [trackNotes, setTrackNotes] = useState({}) // { videoId: "note text" }
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [notesTrack, setNotesTrack] = useState(null)
  const [noteText, setNoteText] = useState('')
  
  const [showChordModal, setShowChordModal] = useState(false)
  const [chordTrack, setChordTrack] = useState(null)
  const [chordData, setChordData] = useState(null)
  const [chordLoading, setChordLoading] = useState(false)
  
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [compareTrack1, setCompareTrack1] = useState(null)
  const [compareTrack2, setCompareTrack2] = useState(null)
  
  const [smartNextTracks, setSmartNextTracks] = useState([])
  const [showSmartNextModal, setShowSmartNextModal] = useState(false)
  const [smartNextLoading, setSmartNextLoading] = useState(false)

  const progressInterval = useRef(null)
  const waveformPlayerRef = useRef(null)
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

  // A) Harmonic Mixing - Camelot Wheel compatibility
  const getCompatibleKeys = (key) => {
    if (!key) return []
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
    }
    return camelotWheel[key] || []
  }

  const isKeyCompatible = (key1, key2) => {
    if (!key1 || !key2) return false
    const compatible = getCompatibleKeys(key1)
    return compatible.includes(key2)
  }

  // B) Filter recommendations
  const getFilteredRecommendations = () => {
    if (!filters.showFilters) return recommendations
    
    return recommendations.filter(rec => {
      const analysis = trackAnalysis[rec.videoId]
      if (!analysis) return true // Show tracks without analysis
      
      // BPM filter
      if (analysis.bpm) {
        if (analysis.bpm < filters.bpmMin || analysis.bpm > filters.bpmMax) return false
      }
      
      // Energy filter
      if (analysis.energy) {
        if (analysis.energy < filters.energyMin || analysis.energy > filters.energyMax) return false
      }
      
      // Genre filter
      if (filters.genre !== 'all' && analysis.genre) {
        if (!analysis.genre.toLowerCase().includes(filters.genre.toLowerCase())) return false
      }
      
      return true
    })
  }

  // Get unique genres from analyzed tracks
  const getUniqueGenres = () => {
    const genres = new Set()
    recommendations.forEach(rec => {
      const analysis = trackAnalysis[rec.videoId]
      if (analysis?.genre) genres.add(analysis.genre)
    })
    return Array.from(genres)
  }

  // ==================== DJ PRO FEATURES ====================
  
  // Camelot Wheel Data - Key to Camelot mapping
  const keytoCamelot = {
    'C': '8B', 'Am': '8A',
    'G': '9B', 'Em': '9A',
    'D': '10B', 'Bm': '10A',
    'A': '11B', 'F#m': '11A',
    'E': '12B', 'C#m': '12A',
    'B': '1B', 'G#m': '1A',
    'F#': '2B', 'D#m': '2A',
    'Db': '3B', 'Bbm': '3A',
    'Ab': '4B', 'Fm': '4A',
    'Eb': '5B', 'Cm': '5A',
    'Bb': '6B', 'Gm': '6A',
    'F': '7B', 'Dm': '7A'
  }

  const camelotToKey = Object.fromEntries(
    Object.entries(keytoCamelot).map(([k, v]) => [v, k])
  )

  // Camelot Wheel positions for visualization
  const camelotPositions = {
    '1A': { angle: 0, radius: 0.6 }, '1B': { angle: 0, radius: 0.85 },
    '2A': { angle: 30, radius: 0.6 }, '2B': { angle: 30, radius: 0.85 },
    '3A': { angle: 60, radius: 0.6 }, '3B': { angle: 60, radius: 0.85 },
    '4A': { angle: 90, radius: 0.6 }, '4B': { angle: 90, radius: 0.85 },
    '5A': { angle: 120, radius: 0.6 }, '5B': { angle: 120, radius: 0.85 },
    '6A': { angle: 150, radius: 0.6 }, '6B': { angle: 150, radius: 0.85 },
    '7A': { angle: 180, radius: 0.6 }, '7B': { angle: 180, radius: 0.85 },
    '8A': { angle: 210, radius: 0.6 }, '8B': { angle: 210, radius: 0.85 },
    '9A': { angle: 240, radius: 0.6 }, '9B': { angle: 240, radius: 0.85 },
    '10A': { angle: 270, radius: 0.6 }, '10B': { angle: 270, radius: 0.85 },
    '11A': { angle: 300, radius: 0.6 }, '11B': { angle: 300, radius: 0.85 },
    '12A': { angle: 330, radius: 0.6 }, '12B': { angle: 330, radius: 0.85 }
  }

  // BPM Sync Calculator
  const calculateBpmSync = (bpm1, bpm2) => {
    if (!bpm1 || !bpm2) return null
    const ratio = bpm1 / bpm2
    const halfRatio = bpm1 / (bpm2 * 2)
    const doubleRatio = (bpm1 * 2) / bpm2
    
    // Find the best match
    const options = [
      { label: '1:1', value: ratio, percent: Math.round(ratio * 100) },
      { label: '1:2', value: halfRatio, percent: Math.round(halfRatio * 100) },
      { label: '2:1', value: doubleRatio, percent: Math.round(doubleRatio * 100) }
    ]
    
    // Find closest to 100%
    const best = options.reduce((prev, curr) => 
      Math.abs(curr.percent - 100) < Math.abs(prev.percent - 100) ? curr : prev
    )
    
    return {
      exact: ratio,
      options,
      best,
      pitchChange: ((best.value - 1) * 100).toFixed(1)
    }
  }

  // Loop Extraction
  const extractLoop = async (track, startTime, endTime) => {
    setLoopExtracting(true)
    try {
      const response = await fetch(`${API_BASE}/extract-loop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: track.url,
          startTime,
          endTime,
          title: track.title
        })
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      
      // Download the extracted loop
      window.location.href = `${API_BASE}/download-loop/${data.loopId}`
    } catch (err) {
      setError(err.message)
    } finally {
      setLoopExtracting(false)
    }
  }

  // Stem Separation
  const separateStems = async (track) => {
    setStemProgress({ status: 'starting', message: 'Preparing stem separation...' })
    try {
      const response = await fetch(`${API_BASE}/separate-stems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: track.url,
          title: track.title
        })
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      
      // Poll for progress
      const pollProgress = async () => {
        const progressRes = await fetch(`${API_BASE}/stem-progress/${data.stemId}`)
        const progressData = await progressRes.json()
        
        setStemProgress(progressData)
        
        if (progressData.status === 'completed') {
          setStemResults(progressData.stems)
        } else if (progressData.status !== 'error') {
          setTimeout(pollProgress, 2000)
        }
      }
      
      pollProgress()
    } catch (err) {
      setStemProgress({ status: 'error', message: err.message })
    }
  }

  // Pitch Shift Download
  const downloadWithPitchShift = async (track, semitones) => {
    setPitchProcessing(true)
    try {
      const response = await fetch(`${API_BASE}/pitch-shift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: track.url,
          semitones,
          title: track.title
        })
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      
      window.location.href = `${API_BASE}/download-pitched/${data.pitchId}`
    } catch (err) {
      setError(err.message)
    } finally {
      setPitchProcessing(false)
      setShowPitchModal(false)
    }
  }

  // Get track's Camelot notation
  const getTrackCamelot = (track) => {
    const analysis = trackAnalysis[track.videoId]
    if (!analysis?.key) return null
    return keytoCamelot[analysis.key] || analysis.key
  }

  // ==================== NEW ADVANCED DJ PRO FEATURES ====================

  // Analyze track structure (Intro/Drop/Breakdown/Outro)
  const analyzeStructure = async (track) => {
    setStructureLoading(true)
    setStructureData(null)
    try {
      const response = await fetch(`${API_BASE}/analyze-structure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: track.url,
          title: track.title
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setStructureData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setStructureLoading(false)
    }
  }

  // Download with tempo change
  const downloadWithTempoChange = async (track, originalBpm, newBpm) => {
    setTempoProcessing(true)
    try {
      window.location.href = `${API_BASE}/tempo-change?url=${encodeURIComponent(track.url)}&originalBpm=${originalBpm}&targetBpm=${newBpm}&title=${encodeURIComponent(track.title)}`
      
      // Use POST for proper download
      const response = await fetch(`${API_BASE}/tempo-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: track.url,
          originalBpm,
          targetBpm: newBpm,
          title: track.title
        })
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error)
      }
      
      // Download the file
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${track.title}_${originalBpm}to${newBpm}bpm.mp3`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(downloadUrl)
      a.remove()
      
    } catch (err) {
      setError(err.message)
    } finally {
      setTempoProcessing(false)
      setShowTempoModal(false)
    }
  }

  // Save track note
  const saveTrackNote = (videoId, note) => {
    setTrackNotes(prev => ({
      ...prev,
      [videoId]: note
    }))
    // Also save to localStorage
    const notes = JSON.parse(localStorage.getItem('beatflo_track_notes') || '{}')
    notes[videoId] = note
    localStorage.setItem('beatflo_track_notes', JSON.stringify(notes))
  }

  // Load track notes from localStorage
  useEffect(() => {
    const savedNotes = localStorage.getItem('beatflo_track_notes')
    if (savedNotes) {
      setTrackNotes(JSON.parse(savedNotes))
    }
  }, [])

  // Detect chords using AI
  const detectChords = async (track) => {
    setChordLoading(true)
    setChordData(null)
    try {
      const analysis = trackAnalysis[track.videoId]
      const response = await fetch(`${API_BASE}/detect-chords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: track.title,
          artist: track.artist || track.uploader,
          duration: track.duration
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setChordData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setChordLoading(false)
    }
  }

  // Get smart next track recommendations
  const getSmartNextTrack = async (currentTrack) => {
    setSmartNextLoading(true)
    try {
      const analysis = trackAnalysis[currentTrack.videoId] || {}
      const response = await fetch(`${API_BASE}/smart-next-track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentTrack: {
            ...currentTrack,
            bpm: analysis.bpm,
            key: analysis.key,
            energy: analysis.energy
          },
          availableTracks: recommendations
            .filter(r => r.videoId !== currentTrack.videoId)
            .map(r => ({
              ...r,
              bpm: trackAnalysis[r.videoId]?.bpm,
              key: trackAnalysis[r.videoId]?.key,
              energy: trackAnalysis[r.videoId]?.energy
            }))
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setSmartNextTracks(data.recommendations)
    } catch (err) {
      setError(err.message)
    } finally {
      setSmartNextLoading(false)
    }
  }

  // ==================== END DJ PRO FEATURES ====================

  // Fetch video info
  const fetchVideoInfo = async (inputUrl = null) => {
    const targetUrl = inputUrl || url
    if (!targetUrl.trim()) {
      setError('Please enter a YouTube URL or search term')
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
        body: JSON.stringify({ url: targetUrl })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get video info')
      }

      // Extract videoId from response or URL
      let videoId = data.id || data.videoId
      if (!videoId) {
        // Try to extract from webpage_url or original URL
        const urlToCheck = data.webpage_url || data.url || targetUrl
        const videoIdMatch = urlToCheck.match(/(?:v=|youtu\.be\/|\/watch\?v=)([a-zA-Z0-9_-]{11})/)
        videoId = videoIdMatch ? videoIdMatch[1] : null
      }

      // Get actual URL from response
      const actualUrl = data.webpage_url || data.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : targetUrl)

      setVideoInfo({
        ...data,
        videoId,
        url: actualUrl
      })
      
      // Update the input field with the actual URL if it was a search
      if (actualUrl !== targetUrl) {
        setUrl(actualUrl)
      }
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
    const artist = target === 'source' ? videoInfo.uploader : target.artist
    
    // Get DJ analysis info if available
    const analysis = target !== 'source' ? trackAnalysis[target.videoId] : null
    
    // Build custom filename with DJ info
    let customFilename = artist ? `${artist} - ${title}` : title
    if (analysis) {
      const djInfo = []
      if (analysis.bpm) djInfo.push(`${analysis.bpm}BPM`)
      if (analysis.key) djInfo.push(analysis.key)
      if (analysis.energy) djInfo.push(`E${analysis.energy}`)
      if (analysis.genre) djInfo.push(analysis.genre)
      if (analysis.mood) djInfo.push(analysis.mood)
      if (djInfo.length > 0) {
        customFilename += ` [${djInfo.join('_')}]`
      }
    }

    setDownloading(true)
    setProgress(0)

    try {
      const response = await fetch(`${API_BASE}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoUrl,
          format,
          quality: qual,
          customFilename
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
          videos: recommendations.map(r => {
            const analysis = trackAnalysis[r.videoId]
            let title = `${r.artist} - ${r.title}`
            
            // Add DJ info to filename if available
            if (analysis) {
              const djInfo = []
              if (analysis.bpm) djInfo.push(`${analysis.bpm}BPM`)
              if (analysis.key) djInfo.push(analysis.key)
              if (analysis.energy) djInfo.push(`E${analysis.energy}`)
              if (analysis.genre) djInfo.push(analysis.genre)
              if (analysis.mood) djInfo.push(analysis.mood)
              if (djInfo.length > 0) {
                title += ` [${djInfo.join('_')}]`
              }
            }
            
            return { url: r.url, title }
          }),
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
        videoId: videoInfo.videoId,
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
        videoId: rec.videoId,
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

  // Waveform functions
  const toggleWaveform = (videoId) => {
    setExpandedWaveform(prev => prev === videoId ? null : videoId)
  }

  const openWaveformModal = (track) => {
    setWaveformModal(track)
    setWaveformPlayback({
      isPlaying: false,
      currentTime: 0,
      videoId: track.videoId
    })
  }

  const closeWaveformModal = () => {
    setWaveformModal(null)
    setWaveformPlayback({
      isPlaying: false,
      currentTime: 0,
      videoId: null
    })
    // Stop any playing audio
    if (waveformPlayerRef.current) {
      waveformPlayerRef.current.pause()
    }
  }

  const handleWaveformSeek = (time, track) => {
    // Open YouTube preview at specific time
    const videoId = track.videoId || track.url?.split('v=')[1]?.split('&')[0]
    if (videoId) {
      const startTime = Math.floor(time)
      setPreviewTrack({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: `${track.artist || track.uploader} - ${track.title}`,
        startTime
      })
    }
  }

  // 히스토리/즐겨찾기에서 트랙 선택 시 메인 노래로 설정
  const handleSelectTrackFromHistory = async (track) => {
    setUrl(track.url || `https://www.youtube.com/watch?v=${track.videoId}`)
    setLoading(true)
    setError('')
    setRecommendations([])
    setPreviousRecs([])
    setDjOrder(null)

    try {
      const response = await fetch(`${API_BASE}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: track.url || `https://www.youtube.com/watch?v=${track.videoId}` })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get video info')
      }

      setVideoInfo({
        ...data,
        videoId: track.videoId,
        url: track.url || `https://www.youtube.com/watch?v=${track.videoId}`
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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
        <div className="bg-hero-image"></div>
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
              <Link to="/my" className="user-btn">
                <div className="user-avatar">
                  {user.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="avatar" />
                  ) : (
                    user.email?.charAt(0).toUpperCase()
                  )}
                </div>
                <span>{user.user_metadata?.full_name || user.email?.split('@')[0]}</span>
              </Link>
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
            
            {/* Listen & Find Similar Music Button */}
            <ListenButton 
              onResults={(data) => {
                if (data.selectedTrack) {
                  // User selected a track from results
                  setUrl(data.selectedTrack.url)
                  fetchVideoInfo(data.selectedTrack.url)
                } else if (data.recommendations?.length > 0) {
                  // Auto-select first recommendation
                  setUrl(data.recommendations[0].url)
                  fetchVideoInfo(data.recommendations[0].url)
                }
              }}
              onError={(msg) => setError(msg)}
            />
          </div>
        </section>

        {/* Quick Start Section - 마중물 */}
        {!videoInfo && !loading && (
          <section className="quick-start-section">
            {/* Trending Genres */}
            <div className="quick-start-block">
              <h3 className="quick-start-title">
                <span className="title-icon">🎧</span>
                인기 장르로 시작하기
              </h3>
              <div className="genre-pills">
                {[
                  { name: 'House', emoji: '🏠', query: 'house music 2024' },
                  { name: 'Techno', emoji: '🔊', query: 'techno music underground' },
                  { name: 'Hip Hop', emoji: '🎤', query: 'hip hop beat 2024' },
                  { name: 'R&B', emoji: '💜', query: 'r&b soul music' },
                  { name: 'K-Pop', emoji: '🇰🇷', query: 'kpop music 2024' },
                  { name: 'Lo-Fi', emoji: '🌙', query: 'lofi hip hop chill' },
                  { name: 'EDM', emoji: '⚡', query: 'edm festival music' },
                  { name: 'Jazz', emoji: '🎷', query: 'jazz music modern' },
                ].map((genre) => (
                  <button
                    key={genre.name}
                    className="genre-pill"
                    onClick={() => {
                      setUrl(genre.query)
                      fetchVideoInfo(genre.query)
                    }}
                  >
                    <span className="genre-emoji">{genre.emoji}</span>
                    {genre.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Mood Selection */}
            <div className="quick-start-block">
              <h3 className="quick-start-title">
                <span className="title-icon">✨</span>
                무드로 찾기
              </h3>
              <div className="mood-cards">
                {[
                  { mood: '에너지 충전', emoji: '🔥', color: '#FF6B6B', query: 'energetic workout music' },
                  { mood: '집중 모드', emoji: '🎯', color: '#4ECDC4', query: 'focus study music' },
                  { mood: '편안한 휴식', emoji: '☕', color: '#9B59B6', query: 'relaxing chill music' },
                  { mood: '파티 타임', emoji: '🎉', color: '#F1C40F', query: 'party dance music' },
                  { mood: '감성 충전', emoji: '💫', color: '#E91E63', query: 'emotional ballad music' },
                  { mood: '드라이브', emoji: '🚗', color: '#3498DB', query: 'driving music playlist' },
                ].map((item) => (
                  <button
                    key={item.mood}
                    className="mood-card"
                    style={{ '--mood-color': item.color }}
                    onClick={() => {
                      setUrl(item.query)
                      fetchVideoInfo(item.query)
                    }}
                  >
                    <span className="mood-emoji">{item.emoji}</span>
                    <span className="mood-name">{item.mood}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sample Tracks */}
            <div className="quick-start-block">
              <h3 className="quick-start-title">
                <span className="title-icon">🎵</span>
                이 곡들로 시작해보세요
              </h3>
              <div className="sample-tracks">
                {[
                  { 
                    title: 'Blinding Lights',
                    artist: 'The Weeknd',
                    url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ',
                    thumb: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg',
                    genre: 'Synthwave'
                  },
                  { 
                    title: 'As It Was',
                    artist: 'Harry Styles',
                    url: 'https://www.youtube.com/watch?v=H5v3kku4y6Q',
                    thumb: 'https://i.ytimg.com/vi/H5v3kku4y6Q/mqdefault.jpg',
                    genre: 'Pop'
                  },
                  { 
                    title: 'Dua Lipa - Levitating',
                    artist: 'Dua Lipa',
                    url: 'https://www.youtube.com/watch?v=TUVcZfQe-Kw',
                    thumb: 'https://i.ytimg.com/vi/TUVcZfQe-Kw/mqdefault.jpg',
                    genre: 'Disco Pop'
                  },
                  { 
                    title: 'Stay',
                    artist: 'The Kid LAROI, Justin Bieber',
                    url: 'https://www.youtube.com/watch?v=kTJczUoc26U',
                    thumb: 'https://i.ytimg.com/vi/kTJczUoc26U/mqdefault.jpg',
                    genre: 'Pop'
                  },
                  { 
                    title: 'Heat Waves',
                    artist: 'Glass Animals',
                    url: 'https://www.youtube.com/watch?v=mRD0-GxqHVo',
                    thumb: 'https://i.ytimg.com/vi/mRD0-GxqHVo/mqdefault.jpg',
                    genre: 'Indie Pop'
                  },
                  { 
                    title: 'Bad Habit',
                    artist: 'Steve Lacy',
                    url: 'https://www.youtube.com/watch?v=VF-FGf_ZZiI',
                    thumb: 'https://i.ytimg.com/vi/VF-FGf_ZZiI/mqdefault.jpg',
                    genre: 'R&B'
                  },
                ].map((track) => (
                  <div
                    key={track.url}
                    className="sample-track-card"
                    onClick={() => {
                      setUrl(track.url)
                      fetchVideoInfo(track.url)
                    }}
                  >
                    <div className="sample-thumb">
                      <img src={track.thumb} alt={track.title} />
                      <div className="sample-play">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                    <div className="sample-info">
                      <span className="sample-title">{track.title}</span>
                      <span className="sample-artist">{track.artist}</span>
                      <span className="sample-genre">{track.genre}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* How It Works */}
            <div className="quick-start-block how-it-works">
              <h3 className="quick-start-title">
                <span className="title-icon">💡</span>
                이렇게 사용하세요
              </h3>
              <div className="steps-grid">
                <div className="step-card">
                  <div className="step-number">1</div>
                  <div className="step-icon">🎵</div>
                  <h4>좋아하는 곡 선택</h4>
                  <p>YouTube URL을 붙여넣거나 위의 샘플 트랙을 클릭하세요</p>
                </div>
                <div className="step-card">
                  <div className="step-number">2</div>
                  <div className="step-icon">🤖</div>
                  <h4>AI 분석</h4>
                  <p>AI가 곡의 BPM, 키, 분위기를 분석합니다</p>
                </div>
                <div className="step-card">
                  <div className="step-number">3</div>
                  <div className="step-icon">🎧</div>
                  <h4>비슷한 곡 발견</h4>
                  <p>당신의 취향에 맞는 새로운 음악을 추천받으세요</p>
                </div>
                <div className="step-card">
                  <div className="step-number">4</div>
                  <div className="step-icon">💾</div>
                  <h4>믹스셋 만들기</h4>
                  <p>마음에 드는 곡들로 DJ 믹스셋을 만들어보세요</p>
                </div>
              </div>
            </div>
          </section>
        )}

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
                  <button 
                    className={`action-btn secondary ${expandedWaveform === 'source' ? 'active' : ''}`}
                    onClick={() => toggleWaveform('source')}
                    title="Waveform 보기"
                  >
                    <svg viewBox="0 0 24 24" fill="none"><path d="M2 12h2M6 8v8M10 5v14M14 8v8M18 10v4M22 12h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </button>
                </div>
                
                {/* Source Track Waveform */}
                {expandedWaveform === 'source' && (
                  <div className="source-waveform">
                    <WaveformVisualizer
                      videoId={videoInfo.videoId}
                      url={videoInfo.url}
                      duration={videoInfo.duration || 180}
                      onSeek={(time) => handleWaveformSeek(time, { ...videoInfo, artist: videoInfo.uploader })}
                      compact={false}
                      color="primary"
                    />
                  </div>
                )}
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
                    <span className="dj-stat-value">
                      {filters.showFilters ? `${getFilteredRecommendations().length}/${recommendations.length}` : recommendations.length}
                    </span>
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
                  {Object.keys(trackAnalysis).length > 0 && (
                    <button 
                      className={`filter-btn ${filters.showFilters ? 'active' : ''}`}
                      onClick={() => setFilters(prev => ({ ...prev, showFilters: !prev.showFilters }))}
                    >
                      🎚️ 필터
                    </button>
                  )}
                </div>

                {/* B) Smart Filters Panel */}
                {filters.showFilters && Object.keys(trackAnalysis).length > 0 && (
                  <div className="filters-panel">
                    <div className="filter-group">
                      <label className="filter-label">
                        🎹 BPM Range: {filters.bpmMin} - {filters.bpmMax}
                      </label>
                      <div className="range-inputs">
                        <input 
                          type="range" 
                          min="60" 
                          max="200" 
                          value={filters.bpmMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, bpmMin: parseInt(e.target.value) }))}
                        />
                        <input 
                          type="range" 
                          min="60" 
                          max="200" 
                          value={filters.bpmMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, bpmMax: parseInt(e.target.value) }))}
                        />
                      </div>
                    </div>
                    <div className="filter-group">
                      <label className="filter-label">
                        ⚡ Energy: {filters.energyMin} - {filters.energyMax}
                      </label>
                      <div className="range-inputs">
                        <input 
                          type="range" 
                          min="1" 
                          max="10" 
                          value={filters.energyMin}
                          onChange={(e) => setFilters(prev => ({ ...prev, energyMin: parseInt(e.target.value) }))}
                        />
                        <input 
                          type="range" 
                          min="1" 
                          max="10" 
                          value={filters.energyMax}
                          onChange={(e) => setFilters(prev => ({ ...prev, energyMax: parseInt(e.target.value) }))}
                        />
                      </div>
                    </div>
                    <div className="filter-group">
                      <label className="filter-label">🎵 Genre</label>
                      <select 
                        value={filters.genre}
                        onChange={(e) => setFilters(prev => ({ ...prev, genre: e.target.value }))}
                        className="genre-select"
                      >
                        <option value="all">All Genres</option>
                        {getUniqueGenres().map(genre => (
                          <option key={genre} value={genre}>{genre}</option>
                        ))}
                      </select>
                    </div>
                    <button 
                      className="reset-filters-btn"
                      onClick={() => setFilters({ bpmMin: 0, bpmMax: 200, energyMin: 1, energyMax: 10, genre: 'all', showFilters: true })}
                    >
                      ↻ Reset
                    </button>
                  </div>
                )}

                {/* D) Energy Flow Graph */}
                {Object.keys(trackAnalysis).length > 0 && (
                  <div className="energy-flow-graph">
                    <div className="energy-flow-header">
                      <div className="energy-flow-label">⚡ Energy Flow</div>
                      <div className="energy-flow-desc">세트의 에너지 흐름을 시각화합니다. 높을수록 강렬한 곡!</div>
                    </div>
                    <div className="energy-flow-chart">
                      <div className="energy-y-axis">
                        <span>🔥</span>
                        <span>💃</span>
                        <span>😌</span>
                      </div>
                      <div className="energy-flow-bars">
                        {recommendations.map((rec, idx) => {
                          const analysis = trackAnalysis[rec.videoId]
                          const energy = analysis?.energy || 5
                          const energyLabel = energy >= 8 ? '🔥 Peak - 최고조!' : energy >= 6 ? '💃 High - 신나는 구간' : energy >= 4 ? '🕺 Mid - 중간 템포' : '😌 Chill - 차분한 구간'
                          const energyEmoji = energy >= 8 ? '🔥' : energy >= 6 ? '💃' : energy >= 4 ? '🕺' : '😌'
                          return (
                            <div key={idx} className="energy-bar-container">
                              <div className="energy-bar-tooltip">
                                <strong>{rec.title}</strong>
                                <div className="tooltip-energy">
                                  <span>{energyEmoji}</span>
                                  <span>Energy {energy}/10</span>
                                </div>
                                <span className="tooltip-label">{energyLabel}</span>
                              </div>
                              <div 
                                className="energy-bar" 
                                style={{ 
                                  height: `${energy * 10}%`,
                                  background: energy >= 8 ? '#EF4444' : energy >= 6 ? '#F59E0B' : energy >= 4 ? '#22D3EE' : '#8B5CF6'
                                }}
                              >
                                <span className="energy-value">{energy}</span>
                              </div>
                              <span className="energy-bar-num">{idx + 1}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div className="energy-legend">
                      <span className="legend-item"><span className="legend-dot peak"></span>Peak (8-10)</span>
                      <span className="legend-item"><span className="legend-dot high"></span>High (6-7)</span>
                      <span className="legend-item"><span className="legend-dot mid"></span>Mid (4-5)</span>
                      <span className="legend-item"><span className="legend-dot chill"></span>Chill (1-3)</span>
                    </div>
                  </div>
                )}

                <div className="track-list">
                  {getFilteredRecommendations().map((rec, idx) => {
                    const analysis = trackAnalysis[rec.videoId]
                    const prevTrack = idx > 0 ? getFilteredRecommendations()[idx - 1] : null
                    const prevAnalysis = prevTrack ? trackAnalysis[prevTrack.videoId] : null
                    const keyCompatible = prevAnalysis && analysis ? isKeyCompatible(prevAnalysis.key, analysis.key) : null
                    
                    return (
                    <div key={rec.videoId || idx} className="track-item">
                      <div className="track-num">{idx + 1}</div>
                      
                      {/* C) Inline Preview */}
                      <div className="track-thumb">
                        <img src={rec.thumbnail} alt={rec.title} />
                        <div 
                          className={`mini-play ${inlinePreview === rec.videoId ? 'playing' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setInlinePreview(inlinePreview === rec.videoId ? null : rec.videoId)
                          }}
                        >
                          {inlinePreview === rec.videoId ? (
                            <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          )}
                        </div>
                      </div>
                      
                      <div className="track-info">
                        <h4>{rec.title}</h4>
                        <p>{rec.artist}</p>
                        {/* DJ Info Tags with Harmonic Mixing Indicator */}
                        {analysis && (
                          <div className="track-dj-tags">
                            <span className="dj-tag bpm">🎹 {analysis.bpm}</span>
                            {/* A) Harmonic Mixing - Key with compatibility indicator */}
                            <span className={`dj-tag key ${keyCompatible === true ? 'compatible' : keyCompatible === false ? 'incompatible' : ''}`}>
                              🔑 {analysis.key}
                              {keyCompatible === true && <span className="key-match">✓</span>}
                              {keyCompatible === false && <span className="key-clash">⚠</span>}
                            </span>
                            <span className="dj-tag energy" data-energy={analysis.energy}>⚡ {analysis.energy}</span>
                            {analysis.genre && <span className="dj-tag genre">{analysis.genre}</span>}
                          </div>
                        )}
                        {/* Compatible keys hint */}
                        {analysis?.key && (
                          <div className="harmonic-hint">
                            호환 키: {getCompatibleKeys(analysis.key).filter(k => k !== analysis.key).join(', ')}
                          </div>
                        )}
                        
                        {/* Waveform Visualizer - Expanded View */}
                        {expandedWaveform === rec.videoId && (
                          <div className="track-waveform-container">
                            <WaveformVisualizer
                              videoId={rec.videoId}
                              url={rec.url}
                              duration={rec.duration || 180}
                              onSeek={(time) => handleWaveformSeek(time, rec)}
                              compact={false}
                              color="primary"
                            />
                          </div>
                        )}
                      </div>
                      
                      <div className="track-actions">
                        {/* Waveform toggle button */}
                        <button 
                          className={`track-btn waveform ${expandedWaveform === rec.videoId ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleWaveform(rec.videoId)
                          }}
                          title="Waveform 보기"
                        >
                          <svg viewBox="0 0 24 24" fill="none"><path d="M2 12h2M6 8v8M10 5v14M14 8v8M18 10v4M22 12h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                        {/* Full waveform modal button */}
                        <button 
                          className="track-btn waveform-expand"
                          onClick={(e) => {
                            e.stopPropagation()
                            openWaveformModal(rec)
                          }}
                          title="Waveform 확대"
                        >
                          <svg viewBox="0 0 24 24" fill="none"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        
                        {/* DJ Pro Buttons */}
                        <button 
                          className="track-btn loop"
                          onClick={(e) => {
                            e.stopPropagation()
                            setLoopExtractTrack(rec)
                            setLoopStart(0)
                            setLoopEnd(30)
                            setShowLoopExtractor(true)
                          }}
                          title="구간 추출"
                        >
                          <svg viewBox="0 0 24 24" fill="none"><path d="M17 2l4 4-4 4M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button 
                          className="track-btn stem"
                          onClick={(e) => {
                            e.stopPropagation()
                            setStemTrack(rec)
                            setStemProgress(null)
                            setStemResults(null)
                            setShowStemModal(true)
                          }}
                          title="Stem 분리"
                        >
                          <svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                        <button 
                          className="track-btn pitch"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPitchTrack(rec)
                            setPitchShift(0)
                            setShowPitchModal(true)
                          }}
                          title="키 변환"
                        >
                          <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                        </button>
                        
                        {/* New Advanced DJ Pro Buttons */}
                        <button 
                          className="track-btn structure"
                          onClick={(e) => {
                            e.stopPropagation()
                            setStructureTrack(rec)
                            setStructureData(null)
                            setShowStructureModal(true)
                          }}
                          title="구조 분석"
                        >
                          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/></svg>
                        </button>
                        <button 
                          className="track-btn tempo"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTempoTrack(rec)
                            setTargetBpm(trackAnalysis[rec.videoId]?.bpm || 128)
                            setShowTempoModal(true)
                          }}
                          title="템포 변환"
                        >
                          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                        <button 
                          className={`track-btn notes ${trackNotes[rec.videoId] ? 'has-note' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setNotesTrack(rec)
                            setNoteText(trackNotes[rec.videoId] || '')
                            setShowNotesModal(true)
                          }}
                          title={trackNotes[rec.videoId] ? '메모 보기/수정' : '메모 추가'}
                        >
                          <svg viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="2"/></svg>
                        </button>
                        <button 
                          className="track-btn chord"
                          onClick={(e) => {
                            e.stopPropagation()
                            setChordTrack(rec)
                            setChordData(null)
                            setShowChordModal(true)
                          }}
                          title="코드 분석"
                        >
                          <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2"/><circle cx="6" cy="18" r="3" fill="currentColor"/></svg>
                        </button>
                        <button 
                          className="track-btn smart-next"
                          onClick={(e) => {
                            e.stopPropagation()
                            getSmartNextTrack(rec)
                            setShowSmartNextModal(true)
                          }}
                          title="다음 트랙 추천"
                        >
                          <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        
                        {/* Full preview button */}
                        <button 
                          className="track-btn preview"
                          onClick={() => setPreviewTrack({ url: rec.url, title: `${rec.artist} - ${rec.title}` })}
                          title="Full Preview"
                        >
                          <svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg>
                        </button>
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
                  
                  {/* Inline audio preview player */}
                  {inlinePreview && (
                    <div className="inline-preview-player">
                      <iframe
                        src={`https://www.youtube.com/embed/${inlinePreview}?autoplay=1&start=30`}
                        allow="autoplay; encrypted-media"
                        style={{ display: 'none' }}
                      />
                      <div className="inline-preview-info">
                        <div className="preview-wave">
                          <span></span><span></span><span></span><span></span><span></span>
                        </div>
                        <span>🎧 미리듣기 중...</span>
                        <button onClick={() => setInlinePreview(null)}>■ 정지</button>
                      </div>
                    </div>
                  )}
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
                  
                  {/* Camelot Wheel Button */}
                  <button 
                    className="flow-btn camelot"
                    onClick={() => setShowCamelotWheel(true)}
                    title="Camelot Wheel - 하모닉 믹싱 가이드"
                  >
                    <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/></svg>
                    Camelot
                  </button>
                  
                  {/* Compare Button */}
                  <button 
                    className="flow-btn compare"
                    onClick={() => setShowCompareModal(true)}
                    title="두 트랙 비교"
                  >
                    <svg viewBox="0 0 24 24" fill="none"><path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Compare
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
            src={`https://www.youtube.com/embed/${previewTrack.url.split('v=')[1]?.split('&')[0]}?autoplay=1${previewTrack.startTime ? `&start=${previewTrack.startTime}` : ''}`}
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
        <div className="modal-overlay" onClick={() => {
          if (!mixsetProgress) {
            setShowMixsetModal(false)
            setMixPreviewTrack(null)
          }
        }}>
          <div className="modal mixset-modal" onClick={e => e.stopPropagation()}>
            <button 
              className="modal-close" 
              onClick={() => {
                if (!mixsetProgress || mixsetProgress.status === 'completed' || mixsetProgress.status === 'error') {
                  setShowMixsetModal(false)
                  setMixsetProgress(null)
                  setMixsetId(null)
                  setMixPreviewTrack(null)
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
                    <div className="mixset-preview-label">🎵 Track Order - 클릭하여 미리듣기</div>
                    {(djOrder?.orderedTracks || recommendations).slice(0, 10).map((track, idx) => {
                      const isPlaying = mixPreviewTrack === track.videoId
                      return (
                        <div 
                          key={track.videoId || idx} 
                          className={`mixset-track-item ${isPlaying ? 'playing' : ''}`}
                        >
                          <span className="mixset-track-num">{idx + 1}</span>
                          
                          {/* 미리듣기 버튼 */}
                          <button 
                            className={`mixset-preview-btn ${isPlaying ? 'playing' : ''}`}
                            onClick={() => {
                              if (isPlaying) {
                                setMixPreviewTrack(null)
                              } else {
                                setMixPreviewTrack(track.videoId)
                              }
                            }}
                            title={isPlaying ? '정지' : '미리듣기'}
                          >
                            {isPlaying ? (
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16"/>
                                <rect x="14" y="4" width="4" height="16"/>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            )}
                          </button>
                          
                          <div className="mixset-track-info">
                            <img 
                              src={track.thumbnail} 
                              alt={track.title} 
                              className="mixset-track-thumb"
                            />
                            <span className="mixset-track-name">{track.artist} - {track.title}</span>
                          </div>
                          
                          {idx < Math.min((djOrder?.orderedTracks || recommendations).length, 10) - 1 && (
                            <span className="mixset-fade">~{crossfadeDuration}s~</span>
                          )}
                        </div>
                      )
                    })}
                    
                    {/* 숨겨진 YouTube 오디오 플레이어 */}
                    {mixPreviewTrack && (
                      <div className="mix-preview-player">
                        <iframe
                          ref={mixPreviewRef}
                          src={`https://www.youtube.com/embed/${mixPreviewTrack}?autoplay=1&start=30`}
                          allow="autoplay; encrypted-media"
                          title="Mix Preview"
                        />
                        <div className="mix-preview-indicator">
                          <div className="playing-animation">
                            <span></span><span></span><span></span><span></span>
                          </div>
                          <span className="mix-preview-text">미리듣기 재생 중...</span>
                          <button 
                            className="mix-preview-stop"
                            onClick={() => setMixPreviewTrack(null)}
                          >
                            정지
                          </button>
                        </div>
                      </div>
                    )}
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

      {/* Waveform Modal */}
      {waveformModal && (
        <div className="modal-overlay waveform-modal-overlay" onClick={closeWaveformModal}>
          <div className="waveform-modal-content" onClick={e => e.stopPropagation()}>
            <div className="waveform-modal-header">
              <div className="waveform-modal-title">
                <div className="waveform-modal-thumb">
                  <img src={waveformModal.thumbnail} alt={waveformModal.title} />
                </div>
                <div className="waveform-modal-info">
                  <h3>{waveformModal.title}</h3>
                  <p>{waveformModal.artist || waveformModal.uploader}</p>
                  {trackAnalysis[waveformModal.videoId] && (
                    <div className="track-dj-tags" style={{ marginTop: '0.5rem' }}>
                      <span className="dj-tag bpm">🎹 {trackAnalysis[waveformModal.videoId].bpm} BPM</span>
                      <span className="dj-tag key">🔑 {trackAnalysis[waveformModal.videoId].key}</span>
                      <span className="dj-tag energy">⚡ {trackAnalysis[waveformModal.videoId].energy}</span>
                    </div>
                  )}
                </div>
              </div>
              <button className="waveform-modal-close" onClick={closeWaveformModal}>
                <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div className="waveform-modal-main">
              <WaveformVisualizer
                videoId={waveformModal.videoId}
                url={waveformModal.url}
                duration={waveformModal.duration || 180}
                onSeek={(time) => handleWaveformSeek(time, waveformModal)}
                isPlaying={waveformPlayback.isPlaying && waveformPlayback.videoId === waveformModal.videoId}
                currentTime={waveformPlayback.currentTime}
                compact={false}
                color="primary"
              />
            </div>

            <div className="waveform-modal-controls">
              <button 
                className="waveform-seek-btn"
                onClick={() => handleWaveformSeek(30, waveformModal)}
                title="30초로 이동"
              >
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 8l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><text x="14" y="16" fill="currentColor" fontSize="8">30</text></svg>
              </button>
              <button 
                className="waveform-play-btn"
                onClick={() => setPreviewTrack({ 
                  url: waveformModal.url, 
                  title: `${waveformModal.artist || waveformModal.uploader} - ${waveformModal.title}` 
                })}
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
              <button 
                className="waveform-seek-btn"
                onClick={() => handleWaveformSeek(60, waveformModal)}
                title="1분으로 이동"
              >
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 8l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><text x="4" y="16" fill="currentColor" fontSize="8">60</text></svg>
              </button>
            </div>

            <div className="waveform-modal-tips">
              <div className="waveform-tip">
                <span className="tip-icon">💡</span>
                <span className="tip-text">Waveform을 클릭하면 해당 위치에서 미리듣기가 시작됩니다</span>
              </div>
              <div className="waveform-tip">
                <span className="tip-icon">🎯</span>
                <span className="tip-text">DJ 믹싱 포인트를 찾아보세요: 인트로, 브레이크다운, 드롭</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== DJ PRO MODALS ==================== */}

      {/* Camelot Wheel Modal */}
      {showCamelotWheel && (
        <div className="modal-overlay" onClick={() => setShowCamelotWheel(false)}>
          <div className="modal camelot-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCamelotWheel(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon camelot">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>🎡 Camelot Wheel</h3>
                <p>하모닉 믹싱 가이드</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="camelot-wheel-container">
                <svg viewBox="0 0 300 300" className="camelot-wheel-svg">
                  {/* Outer ring (Major keys - B) */}
                  {[...Array(12)].map((_, i) => {
                    const angle = (i * 30 - 90) * Math.PI / 180;
                    const x = 150 + Math.cos(angle) * 120;
                    const y = 150 + Math.sin(angle) * 120;
                    const camelotKey = `${i + 1}B`;
                    const musicalKey = camelotToKey[camelotKey];
                    const hasTrack = recommendations.some(r => getTrackCamelot(r) === camelotKey);
                    const isCompatible = selectedTrackForBpmSync && getCompatibleKeys(getTrackCamelot(selectedTrackForBpmSync)).includes(camelotKey);
                    
                    return (
                      <g key={camelotKey}>
                        <circle 
                          cx={x} cy={y} r="22"
                          className={`camelot-key outer ${hasTrack ? 'has-track' : ''} ${isCompatible ? 'compatible' : ''}`}
                        />
                        <text x={x} y={y - 4} textAnchor="middle" className="camelot-label">{camelotKey}</text>
                        <text x={x} y={y + 10} textAnchor="middle" className="camelot-musical-key">{musicalKey}</text>
                      </g>
                    );
                  })}
                  
                  {/* Inner ring (Minor keys - A) */}
                  {[...Array(12)].map((_, i) => {
                    const angle = (i * 30 - 90) * Math.PI / 180;
                    const x = 150 + Math.cos(angle) * 70;
                    const y = 150 + Math.sin(angle) * 70;
                    const camelotKey = `${i + 1}A`;
                    const musicalKey = camelotToKey[camelotKey];
                    const hasTrack = recommendations.some(r => getTrackCamelot(r) === camelotKey);
                    const isCompatible = selectedTrackForBpmSync && getCompatibleKeys(getTrackCamelot(selectedTrackForBpmSync)).includes(camelotKey);
                    
                    return (
                      <g key={camelotKey}>
                        <circle 
                          cx={x} cy={y} r="18"
                          className={`camelot-key inner ${hasTrack ? 'has-track' : ''} ${isCompatible ? 'compatible' : ''}`}
                        />
                        <text x={x} y={y - 2} textAnchor="middle" className="camelot-label small">{camelotKey}</text>
                        <text x={x} y={y + 8} textAnchor="middle" className="camelot-musical-key small">{musicalKey}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="camelot-legend">
                <div className="legend-item"><span className="legend-dot has-track"></span> 현재 트랙 있음</div>
                <div className="legend-item"><span className="legend-dot compatible"></span> 믹싱 호환</div>
                <div className="legend-item"><span className="legend-dot outer"></span> 메이저 (B)</div>
                <div className="legend-item"><span className="legend-dot inner"></span> 마이너 (A)</div>
              </div>

              <div className="camelot-tips">
                <p>💡 <strong>하모닉 믹싱 팁:</strong></p>
                <ul>
                  <li>같은 번호 또는 ±1 번호끼리 믹스</li>
                  <li>A↔B 전환은 같은 번호에서만</li>
                  <li>에너지 부스트: +1 또는 +7</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loop Extractor Modal */}
      {showLoopExtractor && loopExtractTrack && (
        <div className="modal-overlay" onClick={() => setShowLoopExtractor(false)}>
          <div className="modal loop-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowLoopExtractor(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon loop">
                <svg viewBox="0 0 24 24" fill="none"><path d="M17 2l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 11v-1a4 4 0 014-4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 22l-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 13v1a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>🔁 Loop Extractor</h3>
                <p>구간 추출하여 다운로드</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="loop-track-info">
                <img src={loopExtractTrack.thumbnail} alt="" />
                <div>
                  <h4>{loopExtractTrack.title}</h4>
                  <p>{loopExtractTrack.artist || loopExtractTrack.uploader}</p>
                </div>
              </div>

              <div className="loop-time-inputs">
                <div className="time-input-group">
                  <label>시작 시간 (초)</label>
                  <input 
                    type="number" 
                    value={loopStart}
                    onChange={(e) => setLoopStart(Math.max(0, parseInt(e.target.value) || 0))}
                    min="0"
                    max={loopExtractTrack.duration || 300}
                  />
                  <span className="time-display">{formatDuration(loopStart)}</span>
                </div>
                <div className="time-input-group">
                  <label>끝 시간 (초)</label>
                  <input 
                    type="number" 
                    value={loopEnd}
                    onChange={(e) => setLoopEnd(Math.min(loopExtractTrack.duration || 300, parseInt(e.target.value) || 30))}
                    min="1"
                    max={loopExtractTrack.duration || 300}
                  />
                  <span className="time-display">{formatDuration(loopEnd)}</span>
                </div>
              </div>

              <div className="loop-duration-display">
                <span>추출 구간: </span>
                <strong>{formatDuration(loopEnd - loopStart)}</strong>
                <span className="loop-note">(최대 5분)</span>
              </div>

              <div className="loop-presets">
                <span>빠른 선택:</span>
                <button onClick={() => { setLoopStart(0); setLoopEnd(30); }}>인트로 30초</button>
                <button onClick={() => { setLoopStart(60); setLoopEnd(90); }}>1분-1분30초</button>
                <button onClick={() => { setLoopStart(Math.floor((loopExtractTrack.duration || 180) / 2) - 15); setLoopEnd(Math.floor((loopExtractTrack.duration || 180) / 2) + 15); }}>중간 30초</button>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="download-action-btn"
                onClick={() => extractLoop(loopExtractTrack, loopStart, loopEnd)}
                disabled={loopExtracting || loopEnd <= loopStart}
              >
                {loopExtracting ? (
                  <>추출 중...</>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    루프 추출 & 다운로드
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stem Separation Modal */}
      {showStemModal && stemTrack && (
        <div className="modal-overlay" onClick={() => !stemProgress && setShowStemModal(false)}>
          <div className="modal stem-modal" onClick={e => e.stopPropagation()}>
            <button 
              className="modal-close" 
              onClick={() => {
                setShowStemModal(false);
                setStemProgress(null);
                setStemResults(null);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon stem">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>🎚️ Stem Separation</h3>
                <p>보컬/악기 분리</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="stem-track-info">
                <img src={stemTrack.thumbnail} alt="" />
                <div>
                  <h4>{stemTrack.title}</h4>
                  <p>{stemTrack.artist || stemTrack.uploader}</p>
                </div>
              </div>

              {!stemProgress && !stemResults && (
                <div className="stem-info-box">
                  <h4>🎵 분리 가능한 스템:</h4>
                  <div className="stem-types">
                    <div className="stem-type">🎤 보컬</div>
                    <div className="stem-type">🎸 악기 (Instrumental)</div>
                  </div>
                  <p className="stem-note">
                    ⚠️ AI 기반 분리는 몇 분 소요될 수 있습니다
                  </p>
                </div>
              )}

              {stemProgress && stemProgress.status !== 'completed' && (
                <div className="stem-progress">
                  <div className="spinner-large"></div>
                  <h4>{stemProgress.message}</h4>
                  {stemProgress.progress > 0 && (
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${stemProgress.progress}%` }}></div>
                    </div>
                  )}
                </div>
              )}

              {stemResults && (
                <div className="stem-results">
                  <h4>✅ 분리 완료!</h4>
                  <div className="stem-downloads">
                    {stemResults.vocals && (
                      <a 
                        href={`${API_BASE}/download-stem/${stemProgress?.stemId}/vocals`}
                        className="stem-download-btn vocals"
                      >
                        🎤 보컬 다운로드
                      </a>
                    )}
                    {stemResults.instrumental && (
                      <a 
                        href={`${API_BASE}/download-stem/${stemProgress?.stemId}/instrumental`}
                        className="stem-download-btn instrumental"
                      >
                        🎸 악기 다운로드
                      </a>
                    )}
                    {stemResults.original && (
                      <a 
                        href={`${API_BASE}/download-stem/${stemProgress?.stemId}/original`}
                        className="stem-download-btn original"
                      >
                        📁 원본 다운로드
                      </a>
                    )}
                  </div>
                  {stemProgress?.note && (
                    <p className="stem-note">{stemProgress.note}</p>
                  )}
                </div>
              )}
            </div>

            {!stemProgress && !stemResults && (
              <div className="modal-footer">
                <button 
                  className="download-action-btn stem-btn"
                  onClick={() => separateStems(stemTrack)}
                >
                  <svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  스템 분리 시작
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pitch Shift Modal */}
      {showPitchModal && pitchTrack && (
        <div className="modal-overlay" onClick={() => !pitchProcessing && setShowPitchModal(false)}>
          <div className="modal pitch-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPitchModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon pitch">
                <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>🎹 Pitch Shift</h3>
                <p>키 변환 다운로드</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="pitch-track-info">
                <img src={pitchTrack.thumbnail} alt="" />
                <div>
                  <h4>{pitchTrack.title}</h4>
                  <p>{pitchTrack.artist || pitchTrack.uploader}</p>
                  {trackAnalysis[pitchTrack.videoId]?.key && (
                    <span className="current-key">현재 키: {trackAnalysis[pitchTrack.videoId].key}</span>
                  )}
                </div>
              </div>

              <div className="pitch-slider-container">
                <label>피치 조절 (반음 단위)</label>
                <input 
                  type="range"
                  min="-12"
                  max="12"
                  value={pitchShift}
                  onChange={(e) => setPitchShift(parseInt(e.target.value))}
                  className="pitch-slider"
                />
                <div className="pitch-value">
                  <span className={pitchShift < 0 ? 'negative' : pitchShift > 0 ? 'positive' : ''}>
                    {pitchShift > 0 ? '+' : ''}{pitchShift} 반음
                  </span>
                </div>
              </div>

              <div className="pitch-presets">
                <button onClick={() => setPitchShift(-5)} className={pitchShift === -5 ? 'active' : ''}>-5 (4도↓)</button>
                <button onClick={() => setPitchShift(-2)} className={pitchShift === -2 ? 'active' : ''}>-2</button>
                <button onClick={() => setPitchShift(0)} className={pitchShift === 0 ? 'active' : ''}>원본</button>
                <button onClick={() => setPitchShift(2)} className={pitchShift === 2 ? 'active' : ''}>+2</button>
                <button onClick={() => setPitchShift(5)} className={pitchShift === 5 ? 'active' : ''}>+5 (4도↑)</button>
                <button onClick={() => setPitchShift(7)} className={pitchShift === 7 ? 'active' : ''}>+7 (5도↑)</button>
              </div>

              <div className="pitch-info">
                <p>💡 템포는 유지하면서 키만 변경됩니다</p>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="download-action-btn pitch-btn"
                onClick={() => downloadWithPitchShift(pitchTrack, pitchShift)}
                disabled={pitchProcessing}
              >
                {pitchProcessing ? (
                  <>처리 중...</>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {pitchShift === 0 ? '원본 다운로드' : `${pitchShift > 0 ? '+' : ''}${pitchShift}반음 변환 다운로드`}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== NEW ADVANCED DJ PRO MODALS ==================== */}

      {/* Track Structure Analysis Modal */}
      {showStructureModal && structureTrack && (
        <div className="modal-overlay" onClick={() => setShowStructureModal(false)}>
          <div className="modal structure-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowStructureModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon structure">
                <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>📊 Track Structure</h3>
                <p>인트로/드롭/브레이크다운/아웃트로 분석</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="structure-track-info">
                <img src={structureTrack.thumbnail} alt="" />
                <div>
                  <h4>{structureTrack.title}</h4>
                  <p>{structureTrack.artist || structureTrack.uploader}</p>
                </div>
              </div>

              {structureLoading ? (
                <div className="structure-loading">
                  <div className="spinner-large"></div>
                  <p>트랙 구조 분석 중... (30초 정도 소요)</p>
                </div>
              ) : structureData ? (
                <div className="structure-results">
                  <div className="structure-timeline">
                    {structureData.sections.map((section, idx) => (
                      <div 
                        key={idx} 
                        className={`structure-section ${section.type}`}
                        style={{ 
                          width: `${((section.end - section.start) / structureData.duration) * 100}%` 
                        }}
                        title={`${section.type}: ${formatDuration(Math.round(section.start))} - ${formatDuration(Math.round(section.end))}`}
                      >
                        <span className="section-label">{section.type}</span>
                        <span className="section-time">{formatDuration(Math.round(section.start))}</span>
                      </div>
                    ))}
                  </div>

                  <div className="structure-legend">
                    <div className="legend-item"><span className="dot intro"></span> Intro</div>
                    <div className="legend-item"><span className="dot drop"></span> Drop</div>
                    <div className="legend-item"><span className="dot breakdown"></span> Breakdown</div>
                    <div className="legend-item"><span className="dot outro"></span> Outro</div>
                  </div>

                  <div className="structure-details">
                    <h4>🎯 믹싱 포인트 추천:</h4>
                    <ul>
                      {structureData.sections.map((section, idx) => (
                        <li key={idx}>
                          <strong>{section.type}</strong>: {formatDuration(Math.round(section.start))} ~ {formatDuration(Math.round(section.end))}
                          {section.type === 'intro' && ' - 믹스 인 포인트'}
                          {section.type === 'outro' && ' - 믹스 아웃 포인트'}
                          {section.type === 'breakdown' && ' - 트랜지션 포인트'}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="structure-start">
                  <p>트랙의 구조를 AI가 분석합니다:</p>
                  <ul>
                    <li>🎬 Intro (인트로)</li>
                    <li>🔥 Drop (드롭/클라이맥스)</li>
                    <li>🌊 Breakdown (브레이크다운)</li>
                    <li>🎭 Outro (아웃트로)</li>
                  </ul>
                  <button 
                    className="analyze-btn"
                    onClick={() => analyzeStructure(structureTrack)}
                  >
                    구조 분석 시작
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tempo Change Modal */}
      {showTempoModal && tempoTrack && (
        <div className="modal-overlay" onClick={() => !tempoProcessing && setShowTempoModal(false)}>
          <div className="modal tempo-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowTempoModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon tempo">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>⏱️ Tempo Change</h3>
                <p>피치 유지하면서 BPM 변경</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="tempo-track-info">
                <img src={tempoTrack.thumbnail} alt="" />
                <div>
                  <h4>{tempoTrack.title}</h4>
                  <p>{tempoTrack.artist || tempoTrack.uploader}</p>
                  {trackAnalysis[tempoTrack.videoId]?.bpm && (
                    <span className="current-bpm">현재: {trackAnalysis[tempoTrack.videoId].bpm} BPM</span>
                  )}
                </div>
              </div>

              <div className="tempo-controls">
                <div className="tempo-input-group">
                  <label>원본 BPM</label>
                  <input 
                    type="number" 
                    value={trackAnalysis[tempoTrack.videoId]?.bpm || 128}
                    readOnly
                    className="tempo-input"
                  />
                </div>
                <div className="tempo-arrow">→</div>
                <div className="tempo-input-group">
                  <label>목표 BPM</label>
                  <input 
                    type="number" 
                    value={targetBpm}
                    onChange={(e) => setTargetBpm(parseInt(e.target.value) || 128)}
                    min="60"
                    max="200"
                    className="tempo-input"
                  />
                </div>
              </div>

              <div className="tempo-presets">
                <span>프리셋:</span>
                {[120, 124, 126, 128, 130, 132, 140].map(bpm => (
                  <button 
                    key={bpm}
                    onClick={() => setTargetBpm(bpm)}
                    className={targetBpm === bpm ? 'active' : ''}
                  >
                    {bpm}
                  </button>
                ))}
              </div>

              <div className="tempo-change-display">
                {(() => {
                  const original = trackAnalysis[tempoTrack.videoId]?.bpm || 128
                  const change = ((targetBpm - original) / original * 100).toFixed(1)
                  return (
                    <span className={parseFloat(change) >= 0 ? 'positive' : 'negative'}>
                      {parseFloat(change) >= 0 ? '+' : ''}{change}% 변환
                    </span>
                  )
                })()}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="download-action-btn tempo-btn"
                onClick={() => downloadWithTempoChange(
                  tempoTrack, 
                  trackAnalysis[tempoTrack.videoId]?.bpm || 128, 
                  targetBpm
                )}
                disabled={tempoProcessing}
              >
                {tempoProcessing ? '처리 중...' : `${targetBpm} BPM으로 변환 & 다운로드`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Track Notes Modal */}
      {showNotesModal && notesTrack && (
        <div className="modal-overlay" onClick={() => setShowNotesModal(false)}>
          <div className="modal notes-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowNotesModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon notes">
                <svg viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>📝 Track Notes</h3>
                <p>개인 메모 저장</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="notes-track-info">
                <img src={notesTrack.thumbnail} alt="" />
                <div>
                  <h4>{notesTrack.title}</h4>
                  <p>{notesTrack.artist || notesTrack.uploader}</p>
                </div>
              </div>

              <textarea 
                className="notes-textarea"
                placeholder="믹싱 포인트, 특징, 분위기 등 메모를 입력하세요...

예시:
- 인트로 8마디 후 믹스인
- 드롭이 강렬함
- 여성 보컬
- 낮밤 다 가능"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </div>

            <div className="modal-footer">
              <button 
                className="download-action-btn notes-btn"
                onClick={() => {
                  saveTrackNote(notesTrack.videoId, noteText)
                  setShowNotesModal(false)
                }}
              >
                💾 메모 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chord Detection Modal */}
      {showChordModal && chordTrack && (
        <div className="modal-overlay" onClick={() => setShowChordModal(false)}>
          <div className="modal chord-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowChordModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon chord">
                <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>🎵 Chord Detection</h3>
                <p>AI 코드 진행 분석</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="chord-track-info">
                <img src={chordTrack.thumbnail} alt="" />
                <div>
                  <h4>{chordTrack.title}</h4>
                  <p>{chordTrack.artist || chordTrack.uploader}</p>
                </div>
              </div>

              {chordLoading ? (
                <div className="chord-loading">
                  <div className="spinner-large"></div>
                  <p>AI가 코드 진행을 분석 중...</p>
                </div>
              ) : chordData ? (
                <div className="chord-results">
                  <div className="chord-key">
                    <span className="label">키:</span>
                    <span className="value">{chordData.key}</span>
                  </div>

                  <div className="chord-progression-display">
                    <h4>코드 진행</h4>
                    <div className="chords">
                      {chordData.chords.map((chord, idx) => (
                        <span key={idx} className="chord">{chord}</span>
                      ))}
                    </div>
                    <div className="progression-notation">
                      {chordData.progression}
                    </div>
                  </div>

                  <div className="chord-details">
                    <div className="detail-item">
                      <span className="label">패턴:</span>
                      <span className="value">{chordData.pattern}</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">신뢰도:</span>
                      <span className={`value confidence-${chordData.confidence}`}>{chordData.confidence}</span>
                    </div>
                    {chordData.notes && (
                      <div className="detail-item notes">
                        <span className="label">노트:</span>
                        <span className="value">{chordData.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="chord-start">
                  <p>AI가 곡의 코드 진행을 추측합니다.</p>
                  <p className="chord-note">※ 곡 제목과 아티스트 정보를 기반으로 분석합니다</p>
                  <button 
                    className="analyze-btn"
                    onClick={() => detectChords(chordTrack)}
                  >
                    코드 분석 시작
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Track Comparison Modal */}
      {showCompareModal && (
        <div className="modal-overlay" onClick={() => setShowCompareModal(false)}>
          <div className="modal compare-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCompareModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon compare">
                <svg viewBox="0 0 24 24" fill="none"><path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 3l-7 7M3 21l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>⚖️ Track Comparison</h3>
                <p>두 트랙 비교 분석</p>
              </div>
            </div>

            <div className="modal-body">
              <div className="compare-selectors">
                <div className="compare-select">
                  <label>트랙 1</label>
                  <select 
                    value={compareTrack1?.videoId || ''}
                    onChange={(e) => {
                      const track = recommendations.find(r => r.videoId === e.target.value)
                      setCompareTrack1(track)
                    }}
                  >
                    <option value="">선택하세요</option>
                    {recommendations.map(rec => (
                      <option key={rec.videoId} value={rec.videoId}>
                        {rec.artist} - {rec.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="compare-vs">VS</div>
                <div className="compare-select">
                  <label>트랙 2</label>
                  <select 
                    value={compareTrack2?.videoId || ''}
                    onChange={(e) => {
                      const track = recommendations.find(r => r.videoId === e.target.value)
                      setCompareTrack2(track)
                    }}
                  >
                    <option value="">선택하세요</option>
                    {recommendations.map(rec => (
                      <option key={rec.videoId} value={rec.videoId}>
                        {rec.artist} - {rec.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {compareTrack1 && compareTrack2 && (
                <div className="compare-results">
                  <div className="compare-row header">
                    <div className="compare-cell"></div>
                    <div className="compare-cell track1">
                      <img src={compareTrack1.thumbnail} alt="" />
                      <span>{compareTrack1.title.substring(0, 20)}...</span>
                    </div>
                    <div className="compare-cell track2">
                      <img src={compareTrack2.thumbnail} alt="" />
                      <span>{compareTrack2.title.substring(0, 20)}...</span>
                    </div>
                  </div>
                  
                  <div className="compare-row">
                    <div className="compare-cell label">🎹 BPM</div>
                    <div className="compare-cell">{trackAnalysis[compareTrack1.videoId]?.bpm || '?'}</div>
                    <div className="compare-cell">{trackAnalysis[compareTrack2.videoId]?.bpm || '?'}</div>
                  </div>
                  
                  <div className="compare-row">
                    <div className="compare-cell label">🔑 Key</div>
                    <div className="compare-cell">{trackAnalysis[compareTrack1.videoId]?.key || '?'}</div>
                    <div className="compare-cell">{trackAnalysis[compareTrack2.videoId]?.key || '?'}</div>
                  </div>
                  
                  <div className="compare-row">
                    <div className="compare-cell label">⚡ Energy</div>
                    <div className="compare-cell">{trackAnalysis[compareTrack1.videoId]?.energy || '?'}</div>
                    <div className="compare-cell">{trackAnalysis[compareTrack2.videoId]?.energy || '?'}</div>
                  </div>
                  
                  <div className="compare-row">
                    <div className="compare-cell label">🎡 Camelot</div>
                    <div className="compare-cell">{getTrackCamelot(compareTrack1) || '?'}</div>
                    <div className="compare-cell">{getTrackCamelot(compareTrack2) || '?'}</div>
                  </div>

                  <div className="compare-compatibility">
                    {(() => {
                      const key1 = getTrackCamelot(compareTrack1)
                      const key2 = getTrackCamelot(compareTrack2)
                      const bpm1 = trackAnalysis[compareTrack1.videoId]?.bpm
                      const bpm2 = trackAnalysis[compareTrack2.videoId]?.bpm
                      
                      const keyCompatible = key1 && key2 && isKeyCompatible(key1, key2)
                      const bpmClose = bpm1 && bpm2 && Math.abs(bpm1 - bpm2) <= 5
                      
                      return (
                        <>
                          <div className={`compat-badge ${keyCompatible ? 'good' : 'bad'}`}>
                            {keyCompatible ? '✅ 키 호환' : '❌ 키 비호환'}
                          </div>
                          <div className={`compat-badge ${bpmClose ? 'good' : 'warning'}`}>
                            {bpmClose ? '✅ BPM 유사' : `⚠️ BPM 차이: ${Math.abs(bpm1 - bpm2) || '?'}`}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Smart Next Track Modal */}
      {showSmartNextModal && (
        <div className="modal-overlay" onClick={() => setShowSmartNextModal(false)}>
          <div className="modal smart-next-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSmartNextModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            <div className="modal-header">
              <div className="modal-icon smart-next">
                <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="modal-header-text">
                <h3>🎯 Smart Next Track</h3>
                <p>다음 트랙 AI 추천</p>
              </div>
            </div>

            <div className="modal-body">
              {smartNextLoading ? (
                <div className="smart-next-loading">
                  <div className="spinner-large"></div>
                  <p>최적의 다음 트랙을 찾는 중...</p>
                </div>
              ) : smartNextTracks.length > 0 ? (
                <div className="smart-next-results">
                  {smartNextTracks.map((track, idx) => (
                    <div key={track.videoId} className="smart-next-item">
                      <div className="smart-next-rank">#{idx + 1}</div>
                      <img src={track.thumbnail} alt="" />
                      <div className="smart-next-info">
                        <h4>{track.title}</h4>
                        <p>{track.artist}</p>
                        <div className="smart-next-reasons">
                          {track.reasons.map((reason, i) => (
                            <span key={i} className="reason-tag">{reason}</span>
                          ))}
                        </div>
                      </div>
                      <div className="smart-next-score">
                        <span className="score">{track.score}</span>
                        <span className="label">점</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="smart-next-empty">
                  <p>트랙을 선택한 후 "다음 트랙 추천" 버튼을 클릭하세요</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== END DJ PRO MODALS ==================== */}

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* History Modal */}
      <HistoryModal 
        isOpen={showHistoryModal} 
        onClose={() => setShowHistoryModal(false)} 
        userId={user?.id}
        initialTab={historyTab}
        onSelectTrack={handleSelectTrackFromHistory}
      />
    </div>
  )
}

export default App

