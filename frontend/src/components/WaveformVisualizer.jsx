import { useState, useEffect, useRef, useCallback } from 'react'
import './WaveformVisualizer.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function WaveformVisualizer({ 
  videoId, 
  url, 
  duration = 180,
  onSeek,
  isPlaying = false,
  currentTime = 0,
  compact = false,
  color = 'primary'
}) {
  const [waveform, setWaveform] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hoverPosition, setHoverPosition] = useState(null)
  const [hoverTime, setHoverTime] = useState(null)
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const animationRef = useRef(null)

  // Color schemes
  const colorSchemes = {
    primary: {
      gradient: ['#8B5CF6', '#06B6D4'],
      played: '#A78BFA',
      bg: 'rgba(139, 92, 246, 0.1)'
    },
    accent: {
      gradient: ['#22D3EE', '#06B6D4'],
      played: '#67E8F9',
      bg: 'rgba(34, 211, 238, 0.1)'
    },
    pink: {
      gradient: ['#EC4899', '#F472B6'],
      played: '#F9A8D4',
      bg: 'rgba(236, 72, 153, 0.1)'
    },
    energy: {
      gradient: ['#EF4444', '#F59E0B', '#22D3EE'],
      played: '#FCD34D',
      bg: 'rgba(251, 191, 36, 0.1)'
    }
  }

  const scheme = colorSchemes[color] || colorSchemes.primary

  // Fetch waveform data
  const fetchWaveform = useCallback(async () => {
    if (!videoId && !url) return
    
    setLoading(true)
    setError(null)

    try {
      // Start waveform generation
      const response = await fetch(`${API_BASE}/waveform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, url })
      })

      const data = await response.json()

      if (data.waveform) {
        // Cached result
        setWaveform(data.waveform)
        setLoading(false)
        return
      }

      if (!data.waveformId) {
        throw new Error('Failed to start waveform generation')
      }

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progressRes = await fetch(`${API_BASE}/waveform-progress/${data.waveformId}`)
          const progressData = await progressRes.json()

          if (progressData.status === 'completed' && progressData.waveform) {
            clearInterval(pollInterval)
            setWaveform(progressData.waveform)
            setLoading(false)
          } else if (progressData.status === 'error') {
            clearInterval(pollInterval)
            setError(progressData.error || 'Waveform generation failed')
            setLoading(false)
          }
        } catch (err) {
          console.error('Waveform poll error:', err)
        }
      }, 1000)

      // Timeout after 60 seconds
      setTimeout(() => {
        clearInterval(pollInterval)
        if (loading) {
          setLoading(false)
          setError('Waveform generation timed out')
        }
      }, 60000)

    } catch (err) {
      console.error('Waveform fetch error:', err)
      setError(err.message)
      setLoading(false)
    }
  }, [videoId, url])

  // Draw waveform on canvas
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !waveform?.peaks) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()

    // Set canvas size with device pixel ratio for sharp rendering
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height
    const peaks = waveform.peaks
    const barCount = peaks.length
    const barWidth = width / barCount
    const barGap = compact ? 1 : 2
    const actualBarWidth = Math.max(1, barWidth - barGap)

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Calculate played progress
    const playedRatio = currentTime / (waveform.duration || duration)

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0)
    scheme.gradient.forEach((color, i) => {
      gradient.addColorStop(i / (scheme.gradient.length - 1), color)
    })

    // Draw bars
    peaks.forEach((peak, i) => {
      const x = i * barWidth
      const barHeight = Math.max(2, peak * height * 0.9)
      const y = (height - barHeight) / 2

      // Determine if this bar is played
      const barProgress = i / barCount
      const isPlayed = barProgress < playedRatio

      // Set color based on played state
      if (isPlayed) {
        ctx.fillStyle = scheme.played
      } else if (hoverPosition !== null && barProgress <= hoverPosition) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      } else {
        ctx.fillStyle = gradient
      }

      // Draw rounded bar
      const radius = Math.min(actualBarWidth / 2, 3)
      ctx.beginPath()
      ctx.roundRect(x, y, actualBarWidth, barHeight, radius)
      ctx.fill()
    })

    // Draw playhead
    if (isPlaying && playedRatio > 0 && playedRatio < 1) {
      const playheadX = playedRatio * width
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(playheadX - 1, 0, 2, height)
      
      // Glow effect
      ctx.shadowColor = scheme.gradient[0]
      ctx.shadowBlur = 10
      ctx.fillRect(playheadX - 1, 0, 2, height)
      ctx.shadowBlur = 0
    }

    // Draw hover indicator
    if (hoverPosition !== null) {
      const hoverX = hoverPosition * width
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(hoverX, 0)
      ctx.lineTo(hoverX, height)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [waveform, currentTime, duration, hoverPosition, isPlaying, compact, scheme])

  // Handle mouse events
  const handleMouseMove = (e) => {
    const container = containerRef.current
    if (!container || !waveform) return

    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const position = x / rect.width
    
    setHoverPosition(Math.max(0, Math.min(1, position)))
    setHoverTime(position * (waveform.duration || duration))
  }

  const handleMouseLeave = () => {
    setHoverPosition(null)
    setHoverTime(null)
  }

  const handleClick = (e) => {
    const container = containerRef.current
    if (!container || !waveform || !onSeek) return

    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const position = x / rect.width
    const seekTime = position * (waveform.duration || duration)
    
    onSeek(seekTime)
  }

  // Format time display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Animation loop for smooth playhead
  useEffect(() => {
    if (isPlaying && waveform) {
      const animate = () => {
        drawWaveform()
        animationRef.current = requestAnimationFrame(animate)
      }
      animationRef.current = requestAnimationFrame(animate)
    } else {
      drawWaveform()
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, waveform, drawWaveform])

  // Redraw on resize
  useEffect(() => {
    const handleResize = () => drawWaveform()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawWaveform])

  // Initial fetch when videoId changes
  useEffect(() => {
    if (videoId || url) {
      fetchWaveform()
    }
  }, [videoId, url, fetchWaveform])

  return (
    <div 
      className={`waveform-visualizer ${compact ? 'compact' : ''} ${loading ? 'loading' : ''}`}
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{ '--waveform-bg': scheme.bg }}
    >
      {loading ? (
        <div className="waveform-loading">
          <div className="waveform-loading-bars">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="loading-bar" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
          <span>분석 중...</span>
        </div>
      ) : error ? (
        <div className="waveform-error">
          <span>⚠️</span>
          <button onClick={fetchWaveform}>재시도</button>
        </div>
      ) : waveform ? (
        <>
          <canvas ref={canvasRef} className="waveform-canvas" />
          {hoverTime !== null && !compact && (
            <div 
              className="waveform-tooltip"
              style={{ left: `${hoverPosition * 100}%` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
          {!compact && (
            <div className="waveform-time">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(waveform.duration || duration)}</span>
            </div>
          )}
        </>
      ) : (
        <div className="waveform-placeholder">
          <button className="load-waveform-btn" onClick={fetchWaveform}>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Waveform 로드
          </button>
        </div>
      )}
    </div>
  )
}

export default WaveformVisualizer

