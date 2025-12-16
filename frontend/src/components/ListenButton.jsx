import { useState, useRef, useEffect, useCallback } from 'react'
import './ListenButton.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// 원형 파형에 사용할 바 개수
const NUM_BARS = 64

function ListenButton({ onResults, onError }) {
  const [isListening, setIsListening] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [amplitude, setAmplitude] = useState(0)
  const [frequencyData, setFrequencyData] = useState(new Array(NUM_BARS).fill(0))
  const [showModal, setShowModal] = useState(false)
  const [results, setResults] = useState(null)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationRef = useRef(null)
  const countdownRef = useRef(null)
  const canvasRef = useRef(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening()
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      streamRef.current = stream
      
      // Setup audio analyser for visualization
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256 // 128 frequency bins
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      analyserRef.current = analyser
      
      // Start frequency visualization
      const updateVisualization = () => {
        if (!analyserRef.current) return
        
        const bufferLength = analyserRef.current.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        analyserRef.current.getByteFrequencyData(dataArray)
        
        // Sample frequency data for our bars
        const step = Math.floor(bufferLength / NUM_BARS)
        const newFreqData = []
        for (let i = 0; i < NUM_BARS; i++) {
          const idx = i * step
          // Average a few bins for smoother visualization
          let sum = 0
          for (let j = 0; j < step && idx + j < bufferLength; j++) {
            sum += dataArray[idx + j]
          }
          newFreqData.push((sum / step) / 255)
        }
        setFrequencyData(newFreqData)
        
        // Calculate overall amplitude
        const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength
        setAmplitude(avg / 255)
        
        // Draw circular visualizer on canvas
        drawCircularVisualizer(newFreqData, avg / 255)
        
        animationRef.current = requestAnimationFrame(updateVisualization)
      }
      updateVisualization()
      
      // Setup media recorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          await analyzeAudio(audioBlob)
        }
      }
      
      mediaRecorder.start(100) // Collect data every 100ms
      setIsListening(true)
      setShowModal(true)
      
      // Start countdown (max 15 seconds)
      let count = 15
      setCountdown(count)
      countdownRef.current = setInterval(() => {
        count--
        setCountdown(count)
        if (count <= 0) {
          stopListening()
        }
      }, 1000)
      
    } catch (err) {
      console.error('Microphone access error:', err)
      onError?.('마이크 접근 권한이 필요합니다')
    }
  }
  
  // 원형 오디오 비주얼라이저 그리기
  const drawCircularVisualizer = useCallback((freqData, amp) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) / 2 - 60
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Draw outer glow based on amplitude
    const glowRadius = radius + 30 + amp * 50
    const gradient = ctx.createRadialGradient(centerX, centerY, radius - 20, centerX, centerY, glowRadius)
    gradient.addColorStop(0, `rgba(139, 92, 246, ${0.1 + amp * 0.3})`)
    gradient.addColorStop(0.5, `rgba(236, 72, 153, ${0.05 + amp * 0.2})`)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2)
    ctx.fill()
    
    // Draw pulsing circles
    for (let i = 3; i >= 0; i--) {
      const pulseRadius = radius - 30 + (i * 15) + amp * 20
      ctx.beginPath()
      ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(139, 92, 246, ${0.1 - i * 0.02})`
      ctx.lineWidth = 1
      ctx.stroke()
    }
    
    // Draw frequency bars in a circle
    const barCount = freqData.length
    const angleStep = (Math.PI * 2) / barCount
    
    for (let i = 0; i < barCount; i++) {
      const angle = i * angleStep - Math.PI / 2 // Start from top
      const barHeight = 20 + freqData[i] * 80
      
      // Calculate gradient color based on frequency
      const hue = 280 + (i / barCount) * 60 // Purple to Pink gradient
      const saturation = 70 + freqData[i] * 30
      const lightness = 50 + freqData[i] * 20
      
      // Inner point
      const x1 = centerX + Math.cos(angle) * (radius - 10)
      const y1 = centerY + Math.sin(angle) * (radius - 10)
      
      // Outer point
      const x2 = centerX + Math.cos(angle) * (radius + barHeight)
      const y2 = centerY + Math.sin(angle) * (radius + barHeight)
      
      // Draw bar
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${0.6 + freqData[i] * 0.4})`
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.stroke()
      
      // Draw inner mirror bar (smaller)
      const innerBarHeight = 10 + freqData[i] * 30
      const x3 = centerX + Math.cos(angle) * (radius - 15)
      const y3 = centerY + Math.sin(angle) * (radius - 15)
      const x4 = centerX + Math.cos(angle) * (radius - 15 - innerBarHeight)
      const y4 = centerY + Math.sin(angle) * (radius - 15 - innerBarHeight)
      
      ctx.beginPath()
      ctx.moveTo(x3, y3)
      ctx.lineTo(x4, y4)
      ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${0.3 + freqData[i] * 0.3})`
      ctx.lineWidth = 2
      ctx.stroke()
    }
    
    // Draw center circle
    const centerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 50 + amp * 10)
    centerGradient.addColorStop(0, `rgba(139, 92, 246, ${0.8 + amp * 0.2})`)
    centerGradient.addColorStop(0.7, `rgba(236, 72, 153, ${0.5 + amp * 0.3})`)
    centerGradient.addColorStop(1, 'rgba(139, 92, 246, 0.1)')
    
    ctx.beginPath()
    ctx.arc(centerX, centerY, 45 + amp * 10, 0, Math.PI * 2)
    ctx.fillStyle = centerGradient
    ctx.fill()
    
    // Draw mic icon in center
    ctx.fillStyle = 'white'
    ctx.font = `${24 + amp * 4}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🎤', centerX, centerY)
  }, [])

  const stopListening = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    analyserRef.current = null
    setIsListening(false)
    setAmplitude(0)
    setFrequencyData(new Array(NUM_BARS).fill(0))
    setCountdown(0)
  }

  const analyzeAudio = async (audioBlob) => {
    setIsAnalyzing(true)
    
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      
      const response = await fetch(`${API_BASE}/listen-and-find`, {
        method: 'POST',
        body: formData
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed')
      }
      
      setResults(data)
      onResults?.(data)
      
    } catch (err) {
      console.error('Analysis error:', err)
      onError?.(err.message)
      setShowModal(false)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handlePointerDown = (e) => {
    e.preventDefault()
    if (!isListening && !isAnalyzing) {
      startListening()
    }
  }

  const handlePointerUp = (e) => {
    e.preventDefault()
    if (isListening) {
      stopListening()
    }
  }

  const closeModal = () => {
    stopListening()
    setShowModal(false)
    setResults(null)
  }

  const handleSelectTrack = (track) => {
    onResults?.({ selectedTrack: track, ...results })
    closeModal()
  }

  return (
    <>
      <button 
        className={`listen-button ${isListening ? 'listening' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
        title="꾹 눌러서 음악 인식"
      >
        <div className="listen-icon">
          {isListening ? (
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" fill="currentColor"/>
              <path d="M19 10v2a7 7 0 01-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M12 19v4M8 23h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="currentColor" strokeWidth="2"/>
              <path d="M19 10v2a7 7 0 01-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M12 19v4M8 23h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </div>
        <span className="listen-text">
          {isListening ? '듣는 중...' : '음악 인식'}
        </span>
      </button>

      {/* Listening Modal */}
      {showModal && (
        <div className="listen-modal-overlay" onClick={closeModal}>
          <div className="listen-modal" onClick={e => e.stopPropagation()}>
            <button className="listen-modal-close" onClick={closeModal}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            {isListening && (
              <div className="listening-state">
                {/* 원형 오디오 비주얼라이저 */}
                <div className="circular-visualizer-container">
                  <canvas 
                    ref={canvasRef}
                    width={350}
                    height={350}
                    className="circular-visualizer"
                  />
                  
                  {/* CSS 기반 백업 파형 (캔버스 지원 안될 때) */}
                  <div className="circular-wave-fallback" style={{ '--amp': amplitude }}>
                    {frequencyData.map((val, i) => (
                      <div 
                        key={i}
                        className="wave-bar-circular"
                        style={{
                          '--index': i,
                          '--total': NUM_BARS,
                          '--value': val,
                          transform: `rotate(${(i / NUM_BARS) * 360}deg)`,
                          height: `${30 + val * 80}px`,
                          opacity: 0.5 + val * 0.5
                        }}
                      />
                    ))}
                    <div className="center-pulse" style={{ transform: `scale(${1 + amplitude * 0.3})` }}>
                      <span className="mic-emoji">🎤</span>
                    </div>
                  </div>
                </div>
                
                {/* 진폭 표시 바 */}
                <div className="amplitude-meter">
                  <div className="amplitude-bar" style={{ width: `${amplitude * 100}%` }} />
                  <span className="amplitude-label">입력 레벨</span>
                </div>
                
                <h3>🎵 듣고 있어요...</h3>
                <p>음악이 들리는 곳에 기기를 가까이 대세요</p>
                
                <div className="countdown-container">
                  <svg className="countdown-ring" viewBox="0 0 100 100">
                    <circle 
                      cx="50" cy="50" r="45" 
                      fill="none" 
                      stroke="rgba(139, 92, 246, 0.2)" 
                      strokeWidth="4"
                    />
                    <circle 
                      cx="50" cy="50" r="45" 
                      fill="none" 
                      stroke="url(#countdownGradient)" 
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${(countdown / 15) * 283} 283`}
                      transform="rotate(-90 50 50)"
                    />
                    <defs>
                      <linearGradient id="countdownGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor="#EC4899" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="countdown">{countdown}</div>
                </div>
                
                <p className="hint">
                  <span className="hint-icon">💡</span>
                  버튼에서 손을 떼거나 카운트다운이 끝나면 분석 시작
                </p>
                
                <button className="stop-btn" onClick={stopListening}>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  분석 시작
                </button>
              </div>
            )}

            {isAnalyzing && (
              <div className="analyzing-state">
                <div className="spinner-large"></div>
                <h3>🔍 음악 분석 중...</h3>
                <p>AI가 음악의 특성을 분석하고 있습니다</p>
              </div>
            )}

            {results && !isAnalyzing && !isListening && (
              <div className="results-state">
                <div className="analysis-summary">
                  <h3>🎧 분석 결과</h3>
                  
                  <div className="analysis-tags">
                    <span className="analysis-tag genre">{results.analysis.genre}</span>
                    {results.analysis.subGenre && (
                      <span className="analysis-tag subgenre">{results.analysis.subGenre}</span>
                    )}
                    <span className="analysis-tag mood">{results.analysis.mood}</span>
                    <span className="analysis-tag bpm">{results.analysis.bpm} BPM</span>
                    <span className="analysis-tag energy">에너지 {results.analysis.energy}/10</span>
                  </div>

                  {results.analysis.characteristics?.length > 0 && (
                    <div className="characteristics">
                      {results.analysis.characteristics.map((char, idx) => (
                        <span key={idx} className="char-tag">{char}</span>
                      ))}
                    </div>
                  )}

                  {results.analysis.suggestedArtists?.length > 0 && (
                    <div className="suggested-artists">
                      <span className="label">비슷한 아티스트:</span>
                      {results.analysis.suggestedArtists.slice(0, 3).map((artist, idx) => (
                        <span key={idx} className="artist-tag">{artist}</span>
                      ))}
                    </div>
                  )}
                </div>

                {results.recommendations?.length > 0 && (
                  <div className="listen-recommendations">
                    <h4>🎵 유사한 음악</h4>
                    <div className="recommendation-list">
                      {results.recommendations.map((track, idx) => (
                        <div 
                          key={track.videoId} 
                          className="recommendation-item"
                          onClick={() => handleSelectTrack(track)}
                        >
                          <img src={track.thumbnail} alt="" />
                          <div className="track-info">
                            <span className="track-title">{track.title}</span>
                            <span className="track-artist">{track.artist}</span>
                          </div>
                          <button className="select-btn">
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="modal-actions">
                  <button className="retry-btn" onClick={() => {
                    setResults(null)
                    startListening()
                  }}>
                    <svg viewBox="0 0 24 24" fill="none"><path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    다시 듣기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default ListenButton


