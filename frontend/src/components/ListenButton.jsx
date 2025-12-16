import { useState, useRef, useEffect } from 'react'
import './ListenButton.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function ListenButton({ onResults, onError }) {
  const [isListening, setIsListening] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [amplitude, setAmplitude] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [results, setResults] = useState(null)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const analyserRef = useRef(null)
  const animationRef = useRef(null)
  const countdownRef = useRef(null)

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      
      // Setup audio analyser for visualization
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      
      // Start amplitude visualization
      const updateAmplitude = () => {
        if (!analyserRef.current) return
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        setAmplitude(avg / 255)
        animationRef.current = requestAnimationFrame(updateAmplitude)
      }
      updateAmplitude()
      
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
    
    analyserRef.current = null
    setIsListening(false)
    setAmplitude(0)
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
                <div 
                  className="sound-wave"
                  style={{ '--amplitude': amplitude }}
                >
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                </div>
                <div className="listening-pulse" style={{ transform: `scale(${1 + amplitude * 0.5})` }}></div>
                <div className="mic-icon-large">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" fill="currentColor"/>
                    <path d="M19 10v2a7 7 0 01-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M12 19v4M8 23h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <h3>🎵 듣고 있어요...</h3>
                <p>음악이 들리는 곳에 기기를 가까이 대세요</p>
                <div className="countdown">{countdown}초</div>
                <p className="hint">버튼에서 손을 떼면 분석이 시작됩니다</p>
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

