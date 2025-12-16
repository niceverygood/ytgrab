import { useState, useEffect } from 'react'
import './PremiumFeatures.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// ==================== AI REMIX GENERATOR ====================
export function RemixGenerator({ track, onClose }) {
  const [remixTypes, setRemixTypes] = useState([])
  const [selectedType, setSelectedType] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(null)
  const [remixId, setRemixId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchRemixTypes()
  }, [])

  useEffect(() => {
    let interval
    if (remixId && generating) {
      interval = setInterval(checkProgress, 1000)
    }
    return () => clearInterval(interval)
  }, [remixId, generating])

  const fetchRemixTypes = async () => {
    try {
      const res = await fetch(`${API_BASE}/remix/types`)
      const data = await res.json()
      setRemixTypes(data.types || [])
    } catch (err) {
      console.error('Failed to fetch remix types:', err)
    }
  }

  const checkProgress = async () => {
    try {
      const res = await fetch(`${API_BASE}/remix/progress/${remixId}`)
      const data = await res.json()
      setProgress(data)
      
      if (data.status === 'completed') {
        setGenerating(false)
      } else if (data.status === 'error') {
        setGenerating(false)
        setError(data.error)
      }
    } catch (err) {
      console.error('Progress check error:', err)
    }
  }

  const startRemix = async (type) => {
    setSelectedType(type)
    setGenerating(true)
    setError(null)
    setProgress({ status: 'starting', progress: 0 })

    try {
      const res = await fetch(`${API_BASE}/remix/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: track.videoId,
          videoUrl: track.url,
          title: track.title,
          remixType: type.id
        })
      })
      const data = await res.json()
      setRemixId(data.remixId)
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  const downloadRemix = () => {
    if (progress?.downloadUrl) {
      window.open(`${API_BASE}${progress.downloadUrl.replace('/api', '')}`, '_blank')
    }
  }

  return (
    <div className="remix-generator">
      <div className="remix-header">
        <div className="remix-icon">🎛️</div>
        <div>
          <h3>AI 리믹스 생성기</h3>
          <p>{track.title}</p>
        </div>
        <button className="close-btn" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"/></svg>
        </button>
      </div>

      {!generating && !progress?.downloadUrl && (
        <div className="remix-types">
          <p className="section-label">버전 선택</p>
          <div className="types-grid">
            {remixTypes.map(type => (
              <button
                key={type.id}
                className={`type-card ${type.premium ? 'premium' : ''}`}
                onClick={() => startRemix(type)}
              >
                <span className="type-icon">{type.icon}</span>
                <span className="type-name">{type.name}</span>
                <span className="type-desc">{type.description}</span>
                {type.premium && <span className="premium-badge">PRO</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {generating && (
        <div className="remix-progress">
          <div className="progress-animation">
            <div className="progress-ring">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(139,92,246,0.2)" strokeWidth="8"/>
                <circle 
                  cx="50" cy="50" r="45" 
                  fill="none" 
                  stroke="url(#progressGradient)" 
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(progress?.progress || 0) * 2.83} 283`}
                  transform="rotate(-90 50 50)"
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#8B5CF6"/>
                    <stop offset="100%" stopColor="#EC4899"/>
                  </linearGradient>
                </defs>
              </svg>
              <div className="progress-text">
                <span className="progress-percent">{progress?.progress || 0}%</span>
                <span className="progress-status">{progress?.status === 'downloading' ? '다운로드 중' : '처리 중'}</span>
              </div>
            </div>
          </div>
          <h4>🎵 {selectedType?.name} 생성 중...</h4>
          <p>고품질 리믹스를 만들고 있어요. 잠시만 기다려주세요!</p>
        </div>
      )}

      {progress?.status === 'completed' && (
        <div className="remix-complete">
          <div className="complete-icon">✨</div>
          <h4>리믹스 완성!</h4>
          <p>{selectedType?.name} 버전이 준비되었습니다</p>
          <button className="download-remix-btn" onClick={downloadRemix}>
            <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2"/></svg>
            다운로드
          </button>
          <button className="another-remix-btn" onClick={() => { setProgress(null); setRemixId(null); }}>
            다른 버전 만들기
          </button>
        </div>
      )}

      {error && (
        <div className="remix-error">
          <p>❌ {error}</p>
          <button onClick={() => { setError(null); setGenerating(false); }}>다시 시도</button>
        </div>
      )}
    </div>
  )
}

// ==================== TREND PREDICTION ENGINE ====================
export function TrendPredictor({ track, onClose }) {
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    analyzeTrend()
  }, [])

  const analyzeTrend = async () => {
    try {
      const res = await fetch(`${API_BASE}/trends/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: track.videoId,
          title: track.title,
          artist: track.uploader,
          genre: track.genre || 'Electronic'
        })
      })
      const data = await res.json()
      if (data.success) {
        setPrediction(data.prediction)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getTrendIcon = (category) => {
    switch (category) {
      case 'viral_potential': return '🚀'
      case 'rising': return '📈'
      case 'stable': return '➡️'
      case 'declining': return '📉'
      case 'sleeper_hit': return '💤'
      default: return '📊'
    }
  }

  const getScoreColor = (score) => {
    if (score >= 80) return '#10B981'
    if (score >= 60) return '#F59E0B'
    if (score >= 40) return '#EF4444'
    return '#6B7280'
  }

  return (
    <div className="trend-predictor">
      <div className="trend-header">
        <div className="trend-icon">🔮</div>
        <div>
          <h3>트렌드 예측</h3>
          <p>{track.title}</p>
        </div>
        <button className="close-btn" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"/></svg>
        </button>
      </div>

      {loading && (
        <div className="trend-loading">
          <div className="loading-animation">
            <div className="pulse-ring"></div>
            <div className="pulse-ring delay-1"></div>
            <div className="pulse-ring delay-2"></div>
            <span>🔮</span>
          </div>
          <h4>AI가 트렌드를 분석 중...</h4>
          <p>차트 진입 가능성, 바이럴 잠재력을 계산하고 있어요</p>
        </div>
      )}

      {prediction && (
        <div className="trend-results">
          <div className="trend-category">
            <span className="category-icon">{getTrendIcon(prediction.trendCategory)}</span>
            <span className="category-text">
              {prediction.trendCategory === 'viral_potential' && '바이럴 가능성 높음'}
              {prediction.trendCategory === 'rising' && '상승세'}
              {prediction.trendCategory === 'stable' && '안정적'}
              {prediction.trendCategory === 'declining' && '하락세'}
              {prediction.trendCategory === 'sleeper_hit' && '숨은 명곡'}
            </span>
          </div>

          <div className="score-cards">
            <div className="score-card">
              <div className="score-circle" style={{ '--score-color': getScoreColor(prediction.chartPotential) }}>
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8"/>
                  <circle 
                    cx="50" cy="50" r="45" 
                    fill="none" 
                    stroke="var(--score-color)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${prediction.chartPotential * 2.83} 283`}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <span className="score-value">{prediction.chartPotential}</span>
              </div>
              <span className="score-label">차트 가능성</span>
            </div>
            <div className="score-card">
              <div className="score-circle" style={{ '--score-color': getScoreColor(prediction.viralPotential) }}>
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8"/>
                  <circle 
                    cx="50" cy="50" r="45" 
                    fill="none" 
                    stroke="var(--score-color)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${prediction.viralPotential * 2.83} 283`}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <span className="score-value">{prediction.viralPotential}</span>
              </div>
              <span className="score-label">바이럴 가능성</span>
            </div>
          </div>

          <div className="prediction-details">
            <div className="detail-item">
              <span className="detail-label">📅 예상 피크</span>
              <span className="detail-value">{prediction.peakTimeframe}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">🎯 타겟층</span>
              <span className="detail-value">{prediction.targetAudience?.join(', ')}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">🎵 최적 플레이</span>
              <span className="detail-value">{prediction.bestPlayContext?.join(', ')}</span>
            </div>
          </div>

          <div className="prediction-recommendation">
            <h5>💡 DJ 추천</h5>
            <p>{prediction.recommendation}</p>
          </div>

          <div className="key-factors">
            <h5>✅ 성공 요인</h5>
            <div className="tags">
              {prediction.keyFactors?.map((factor, i) => (
                <span key={i} className="tag success">{factor}</span>
              ))}
            </div>
          </div>

          {prediction.risks?.length > 0 && (
            <div className="risk-factors">
              <h5>⚠️ 리스크</h5>
              <div className="tags">
                {prediction.risks.map((risk, i) => (
                  <span key={i} className="tag risk">{risk}</span>
                ))}
              </div>
            </div>
          )}

          <div className="hashtags">
            <h5>#️⃣ 추천 해시태그</h5>
            <div className="hashtag-list">
              {prediction.hashtagSuggestions?.map((tag, i) => (
                <span key={i} className="hashtag">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="trend-error">
          <p>❌ {error}</p>
          <button onClick={analyzeTrend}>다시 분석</button>
        </div>
      )}
    </div>
  )
}

// ==================== DJ PLAYLIST SPY ====================
export function DJPlaylistSpy({ onClose, onTrackSelect }) {
  const [activeTab, setActiveTab] = useState('djs') // djs, venues, rising
  const [popularDJs, setPopularDJs] = useState([])
  const [venues, setVenues] = useState([])
  const [selectedDJ, setSelectedDJ] = useState(null)
  const [selectedVenue, setSelectedVenue] = useState(null)
  const [djTracks, setDjTracks] = useState(null)
  const [venueTracks, setVenueTracks] = useState(null)
  const [risingTracks, setRisingTracks] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPopularDJs()
    fetchVenues()
  }, [])

  const fetchPopularDJs = async () => {
    try {
      const res = await fetch(`${API_BASE}/spy/popular-djs`)
      const data = await res.json()
      setPopularDJs(data.djs || [])
    } catch (err) {
      console.error('Failed to fetch DJs:', err)
    }
  }

  const fetchVenues = async () => {
    try {
      const res = await fetch(`${API_BASE}/spy/venues`)
      const data = await res.json()
      setVenues(data.venues || [])
    } catch (err) {
      console.error('Failed to fetch venues:', err)
    }
  }

  const spyDJ = async (dj) => {
    setSelectedDJ(dj)
    setLoading(true)
    setDjTracks(null)

    try {
      const res = await fetch(`${API_BASE}/spy/dj-tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ djName: dj.name, timeframe: 'month' })
      })
      const data = await res.json()
      if (data.success) {
        setDjTracks(data)
      }
    } catch (err) {
      console.error('DJ spy error:', err)
    } finally {
      setLoading(false)
    }
  }

  const spyVenue = async (venue) => {
    setSelectedVenue(venue)
    setLoading(true)
    setVenueTracks(null)

    try {
      const res = await fetch(`${API_BASE}/spy/venue-trends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue: venue.name, timeframe: 'month' })
      })
      const data = await res.json()
      if (data.success) {
        setVenueTracks(data)
      }
    } catch (err) {
      console.error('Venue spy error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchRising = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/trends/rising`)
      const data = await res.json()
      if (data.success) {
        setRisingTracks(data)
      }
    } catch (err) {
      console.error('Rising tracks error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'rising' && !risingTracks) {
      fetchRising()
    }
  }, [activeTab])

  return (
    <div className="dj-spy">
      <div className="spy-header">
        <div className="spy-icon">🕵️</div>
        <div>
          <h3>글로벌 DJ 플레이리스트 스파이</h3>
          <p>전 세계 DJ들의 플레이리스트를 엿보세요</p>
        </div>
        <button className="close-btn" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"/></svg>
        </button>
      </div>

      <div className="spy-tabs">
        <button className={activeTab === 'djs' ? 'active' : ''} onClick={() => setActiveTab('djs')}>
          <span>🎧</span> 인기 DJ
        </button>
        <button className={activeTab === 'venues' ? 'active' : ''} onClick={() => setActiveTab('venues')}>
          <span>🏛️</span> 클럽/페스티벌
        </button>
        <button className={activeTab === 'rising' ? 'active' : ''} onClick={() => setActiveTab('rising')}>
          <span>📈</span> 떠오르는 트랙
        </button>
      </div>

      <div className="spy-content">
        {/* DJs Tab */}
        {activeTab === 'djs' && !selectedDJ && (
          <div className="dj-list">
            {popularDJs.map((dj, i) => (
              <div key={i} className="dj-card" onClick={() => spyDJ(dj)}>
                <div className="dj-avatar">
                  {dj.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                </div>
                <div className="dj-info">
                  <span className="dj-name">{dj.name}</span>
                  <span className="dj-genres">{dj.genres.join(' • ')}</span>
                  <span className="dj-followers">{dj.followers} followers</span>
                </div>
                <div className="spy-btn">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="2"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke="currentColor" strokeWidth="2"/></svg>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'djs' && selectedDJ && (
          <div className="dj-detail">
            <button className="back-btn" onClick={() => { setSelectedDJ(null); setDjTracks(null); }}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2"/></svg>
              뒤로
            </button>

            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>{selectedDJ.name}의 플레이리스트 분석 중...</p>
              </div>
            ) : djTracks && (
              <>
                <div className="dj-profile">
                  <div className="profile-avatar">
                    {selectedDJ.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                  </div>
                  <div className="profile-info">
                    <h4>{djTracks.dj?.name}</h4>
                    <p>{djTracks.dj?.style}</p>
                    <div className="profile-stats">
                      <span>🎵 평균 BPM: {djTracks.dj?.avgBPM}</span>
                      <span>🎧 {djTracks.dj?.genres?.join(', ')}</span>
                    </div>
                  </div>
                </div>

                <h5>최근 플레이한 트랙</h5>
                <div className="track-list">
                  {djTracks.recentTracks?.map((track, i) => (
                    <div key={i} className="track-item" onClick={() => onTrackSelect?.(track)}>
                      <span className="track-rank">{i + 1}</span>
                      <div className="track-info">
                        <span className="track-title">{track.title}</span>
                        <span className="track-artist">{track.artist}</span>
                        <div className="track-meta">
                          <span>🔄 {track.playCount}회</span>
                          <span>🎯 {track.setPosition}</span>
                          <span>💿 {track.bpm} BPM</span>
                        </div>
                      </div>
                      {track.isUnreleased && <span className="unreleased-badge">미발매</span>}
                    </div>
                  ))}
                </div>

                {djTracks.hiddenGems?.length > 0 && (
                  <div className="hidden-gems">
                    <h5>💎 숨겨진 보석</h5>
                    <div className="gems-list">
                      {djTracks.hiddenGems.map((gem, i) => (
                        <span key={i} className="gem-tag">{gem}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Venues Tab */}
        {activeTab === 'venues' && !selectedVenue && (
          <div className="venue-list">
            {venues.map((venue, i) => (
              <div key={i} className="venue-card" onClick={() => spyVenue(venue)}>
                <div className="venue-type-icon">
                  {venue.type === 'club' && '🏛️'}
                  {venue.type === 'festival' && '🎪'}
                  {venue.type === 'radio' && '📻'}
                </div>
                <div className="venue-info">
                  <span className="venue-name">{venue.name}</span>
                  <span className="venue-location">{venue.location}</span>
                  <span className="venue-genres">{venue.genres.join(' • ')}</span>
                </div>
                <div className="spy-btn">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="2"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke="currentColor" strokeWidth="2"/></svg>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'venues' && selectedVenue && (
          <div className="venue-detail">
            <button className="back-btn" onClick={() => { setSelectedVenue(null); setVenueTracks(null); }}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2"/></svg>
              뒤로
            </button>

            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>{selectedVenue.name}의 트렌드 분석 중...</p>
              </div>
            ) : venueTracks && (
              <>
                <div className="venue-profile">
                  <h4>{venueTracks.venue?.name}</h4>
                  <p>{venueTracks.venue?.location} • {venueTracks.venue?.type}</p>
                  <div className="venue-stats">
                    <span>👥 {venueTracks.venue?.capacity}명</span>
                    <span>🔊 {venueTracks.venue?.soundSystem}</span>
                    <span>⏰ {venueTracks.peakHours}</span>
                  </div>
                </div>

                <h5>🔥 트렌딩 트랙</h5>
                <div className="track-list">
                  {venueTracks.trendingTracks?.map((track, i) => (
                    <div key={i} className="track-item" onClick={() => onTrackSelect?.(track)}>
                      <span className="track-rank">#{track.rank}</span>
                      <div className="track-info">
                        <span className="track-title">{track.title}</span>
                        <span className="track-artist">{track.artist}</span>
                        <div className="track-meta">
                          <span>🔄 {track.playCount}회</span>
                          <span>⏰ {track.peakTime}</span>
                          <span>💿 {track.bpm} BPM</span>
                        </div>
                      </div>
                      {track.crowdFavorite && <span className="favorite-badge">🔥</span>}
                    </div>
                  ))}
                </div>

                <div className="genre-breakdown">
                  <h5>장르 분포</h5>
                  <div className="genre-bars">
                    {Object.entries(venueTracks.genreBreakdown || {}).map(([genre, percent]) => (
                      <div key={genre} className="genre-bar">
                        <span className="genre-name">{genre}</span>
                        <div className="bar-container">
                          <div className="bar-fill" style={{ width: `${percent}%` }}></div>
                        </div>
                        <span className="genre-percent">{percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Rising Tab */}
        {activeTab === 'rising' && (
          <div className="rising-tracks">
            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>떠오르는 트랙 분석 중...</p>
              </div>
            ) : risingTracks && (
              <>
                <div className="rising-intro">
                  <h5>📈 곧 터질 트랙들</h5>
                  <p>AI가 예측한 다음 히트곡을 미리 발견하세요</p>
                </div>

                <div className="rising-list">
                  {risingTracks.risingTracks?.map((track, i) => (
                    <div key={i} className="rising-item" onClick={() => onTrackSelect?.(track)}>
                      <div className="rising-header">
                        <span className="rising-title">{track.title}</span>
                        <span className="confidence-badge">{track.confidence}% 확신</span>
                      </div>
                      <span className="rising-artist">{track.artist} • {track.genre}</span>
                      
                      <div className="rising-metrics">
                        <div className="metric">
                          <span className="metric-label">현재</span>
                          <span className="metric-value">{track.currentPopularity}</span>
                        </div>
                        <div className="metric-arrow">→</div>
                        <div className="metric peak">
                          <span className="metric-label">예상 피크</span>
                          <span className="metric-value">{track.predictedPeak}</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">D-Day</span>
                          <span className="metric-value">{track.daysUntilPeak}일</span>
                        </div>
                      </div>

                      <div className="rising-signals">
                        {track.signals?.map((signal, j) => (
                          <span key={j} className="signal-tag">✓ {signal}</span>
                        ))}
                      </div>

                      <div className="rising-action">
                        <span className="action-text">💡 {track.recommendedAction}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default { RemixGenerator, TrendPredictor, DJPlaylistSpy }

