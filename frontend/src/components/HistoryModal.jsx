import { useState, useEffect } from 'react'
import { getDownloadHistory, getFavorites, getRecommendationHistory, removeFavorite } from '../lib/supabase'
import './HistoryModal.css'

export default function HistoryModal({ isOpen, onClose, userId, initialTab = 'downloads' }) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [downloads, setDownloads] = useState([])
  const [favorites, setFavorites] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && userId) {
      loadData()
    }
  }, [isOpen, userId, activeTab])

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])

  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'downloads') {
        const { data } = await getDownloadHistory(userId)
        setDownloads(data || [])
      } else if (activeTab === 'favorites') {
        const { data } = await getFavorites(userId)
        setFavorites(data || [])
      } else if (activeTab === 'recommendations') {
        const { data } = await getRecommendationHistory(userId)
        setRecommendations(data || [])
      }
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveFavorite = async (videoId) => {
    await removeFavorite(userId, videoId)
    setFavorites(favorites.filter(f => f.video_id !== videoId))
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="history-modal-overlay" onClick={onClose}>
      <div className="history-modal" onClick={e => e.stopPropagation()}>
        <button className="history-modal-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <div className="history-tabs">
          <button 
            className={`history-tab ${activeTab === 'downloads' ? 'active' : ''}`}
            onClick={() => setActiveTab('downloads')}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            다운로드 기록
          </button>
          <button 
            className={`history-tab ${activeTab === 'favorites' ? 'active' : ''}`}
            onClick={() => setActiveTab('favorites')}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            즐겨찾기
          </button>
          <button 
            className={`history-tab ${activeTab === 'recommendations' ? 'active' : ''}`}
            onClick={() => setActiveTab('recommendations')}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            추천 기록
          </button>
        </div>

        <div className="history-content">
          {loading ? (
            <div className="history-loading">
              <span className="spinner"></span>
              <p>불러오는 중...</p>
            </div>
          ) : (
            <>
              {/* Downloads Tab */}
              {activeTab === 'downloads' && (
                <div className="history-list">
                  {downloads.length === 0 ? (
                    <div className="history-empty">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      <p>다운로드 기록이 없습니다</p>
                    </div>
                  ) : (
                    downloads.map((item) => (
                      <div key={item.id} className="history-item">
                        <div className="history-item-thumb">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={item.title} />
                          ) : (
                            <div className="thumb-placeholder">🎵</div>
                          )}
                          <span className="history-item-duration">{formatDuration(item.duration)}</span>
                        </div>
                        <div className="history-item-info">
                          <h4>{item.title}</h4>
                          <p>{item.uploader}</p>
                          <span className="history-item-meta">
                            <span className="format-badge">{item.format?.toUpperCase()}</span>
                            {formatDate(item.created_at)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Favorites Tab */}
              {activeTab === 'favorites' && (
                <div className="history-list">
                  {favorites.length === 0 ? (
                    <div className="history-empty">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      <p>즐겨찾기가 없습니다</p>
                    </div>
                  ) : (
                    favorites.map((item) => (
                      <div key={item.id} className="history-item">
                        <div className="history-item-thumb">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt={item.title} />
                          ) : (
                            <div className="thumb-placeholder">🎵</div>
                          )}
                          <span className="history-item-duration">{formatDuration(item.duration)}</span>
                        </div>
                        <div className="history-item-info">
                          <h4>{item.title}</h4>
                          <p>{item.uploader}</p>
                          <span className="history-item-meta">{formatDate(item.created_at)}</span>
                        </div>
                        <div className="history-item-actions">
                          <a 
                            href={item.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="history-action-btn play"
                            title="YouTube에서 보기"
                          >
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M10 16.5l6-4.5-6-4.5v9z" fill="currentColor"/>
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                            </svg>
                          </a>
                          <button 
                            className="history-action-btn remove"
                            onClick={() => handleRemoveFavorite(item.video_id)}
                            title="즐겨찾기에서 제거"
                          >
                            <svg viewBox="0 0 24 24" fill="none">
                              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Recommendations Tab */}
              {activeTab === 'recommendations' && (
                <div className="history-list recommendations-list">
                  {recommendations.length === 0 ? (
                    <div className="history-empty">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      <p>추천 기록이 없습니다</p>
                    </div>
                  ) : (
                    recommendations.map((item) => (
                      <div key={item.id} className="recommendation-history-item">
                        <div className="rec-history-header">
                          <div className="rec-history-source">
                            <span className="rec-label">원곡</span>
                            <h4>{item.source_title}</h4>
                            <p>{item.source_uploader}</p>
                          </div>
                          <span className="rec-history-date">{formatDate(item.created_at)}</span>
                        </div>
                        <div className="rec-history-songs">
                          <span className="rec-label">추천곡 ({item.recommendations?.length || 0}곡)</span>
                          <div className="rec-history-grid">
                            {item.recommendations?.slice(0, 5).map((rec, idx) => (
                              <div key={idx} className="rec-history-song">
                                <span className="rec-song-num">{idx + 1}</span>
                                <div className="rec-song-info">
                                  <span className="rec-song-title">{rec.title}</span>
                                  <span className="rec-song-artist">{rec.artist}</span>
                                </div>
                              </div>
                            ))}
                            {item.recommendations?.length > 5 && (
                              <span className="rec-more">+{item.recommendations.length - 5}곡 더</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}


