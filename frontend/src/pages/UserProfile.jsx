import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { 
  supabase, 
  getProfileByUsername,
  getProfile,
  getUserStats,
  getMixsets,
  isFollowing,
  followUser,
  unfollowUser,
  getFavorites
} from '../lib/supabase'
import './UserProfile.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function UserProfile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [currentUserProfile, setCurrentUserProfile] = useState(null)
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState({})
  const [mixsets, setMixsets] = useState([])
  const [favorites, setFavorites] = useState([])
  const [myFavorites, setMyFavorites] = useState([])
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)
  const [activeTab, setActiveTab] = useState('mixsets')
  
  // Similarity analysis state
  const [similarity, setSimilarity] = useState(null)
  const [analyzingSimilarity, setAnalyzingSimilarity] = useState(false)
  const [showSimilarityCard, setShowSimilarityCard] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setCurrentUser(session?.user ?? null)
      
      // Load current user's favorites and profile for similarity comparison
      if (session?.user) {
        const [myFavsResult, myProfileResult] = await Promise.all([
          getFavorites(session.user.id),
          getProfile(session.user.id)
        ])
        setMyFavorites(myFavsResult.data || [])
        setCurrentUserProfile(myProfileResult.data)
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    loadProfile()
  }, [username, currentUser])

  useEffect(() => {
    // Auto-analyze similarity when viewing another user's profile
    if (profile && currentUser && profile.id !== currentUser.id && favorites.length > 0 && myFavorites.length > 0 && !similarity) {
      analyzeSimilarity()
    }
  }, [profile, currentUser, favorites, myFavorites])

  const loadProfile = async () => {
    setLoading(true)
    setSimilarity(null) // Reset similarity when loading new profile
    
    // Try to get profile by username first, then by ID
    let profileData = null
    const { data: byUsername } = await getProfileByUsername(username)
    
    if (byUsername) {
      profileData = byUsername
    } else {
      // Try by ID
      const { data: byId } = await getProfile(username)
      profileData = byId
    }
    
    if (!profileData) {
      navigate('/community')
      return
    }
    
    setProfile(profileData)
    
    // Load user data
    const [statsResult, mixsetsResult, favoritesResult] = await Promise.all([
      getUserStats(profileData.id),
      getMixsets(profileData.id),
      getFavorites(profileData.id)
    ])
    
    setStats(statsResult)
    setMixsets((mixsetsResult.data || []).filter(m => m.is_public))
    setFavorites(favoritesResult.data || [])
    
    // Check if current user follows this profile
    if (currentUser && currentUser.id !== profileData.id) {
      const isFollowingResult = await isFollowing(currentUser.id, profileData.id)
      setFollowing(isFollowingResult)
    }
    
    setLoading(false)
  }

  const analyzeSimilarity = async () => {
    if (!currentUser || !profile || profile.id === currentUser.id) return
    if (myFavorites.length === 0 || favorites.length === 0) return
    
    setAnalyzingSimilarity(true)
    
    try {
      const response = await fetch(`${API_BASE}/analyze-similarity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myFavorites,
          theirFavorites: favorites,
          myProfile: currentUserProfile,
          theirProfile: profile
        })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setSimilarity(data)
        setShowSimilarityCard(true)
      }
    } catch (err) {
      console.error('Similarity analysis error:', err)
    } finally {
      setAnalyzingSimilarity(false)
    }
  }

  const handleFollow = async () => {
    if (!currentUser) return
    
    if (following) {
      await unfollowUser(currentUser.id, profile.id)
      setFollowing(false)
      setStats(prev => ({ ...prev, followers: (prev.followers || 1) - 1 }))
    } else {
      await followUser(currentUser.id, profile.id)
      setFollowing(true)
      setStats(prev => ({ ...prev, followers: (prev.followers || 0) + 1 }))
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR')
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="user-profile-loading">
        <div className="spinner-large"></div>
        <p>로딩 중...</p>
      </div>
    )
  }

  const isOwnProfile = currentUser?.id === profile?.id

  return (
    <div className="user-profile-page">
      {/* Header */}
      <header className="profile-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1>프로필</h1>
        <div className="header-spacer"></div>
      </header>

      {/* Profile Banner & Info */}
      <section className="profile-hero">
        <div className="profile-banner-bg"></div>
        <div className="profile-hero-content">
          <div className="profile-avatar-wrapper">
            <img 
              src={profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.display_name || 'DJ')}&background=8B5CF6&color=fff&size=150`} 
              alt="" 
            />
          </div>
          
          <div className="profile-details">
            <h2>{profile?.display_name || 'DJ'}</h2>
            {profile?.username && <p className="username">@{profile.username}</p>}
            {profile?.bio && <p className="bio">{profile.bio}</p>}
            
            {profile?.favorite_genres?.length > 0 && (
              <div className="genre-tags">
                {profile.favorite_genres.map((genre, idx) => (
                  <span key={idx} className="genre-tag">{genre}</span>
                ))}
              </div>
            )}
            
            <div className="profile-stats-row">
              <div className="stat-item">
                <span className="stat-value">{stats.favorites || 0}</span>
                <span className="stat-label">즐겨찾기</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.mixsets || 0}</span>
                <span className="stat-label">믹셋</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.followers || 0}</span>
                <span className="stat-label">팔로워</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.following || 0}</span>
                <span className="stat-label">팔로잉</span>
              </div>
            </div>
            
            {!isOwnProfile && currentUser && (
              <div className="profile-actions">
                <button 
                  className={`follow-btn ${following ? 'following' : ''}`}
                  onClick={handleFollow}
                >
                  {following ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      팔로잉
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 8v6M23 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      팔로우
                    </>
                  )}
                </button>
                
                {/* Similarity Score Badge */}
                {similarity && (
                  <button 
                    className="similarity-badge"
                    onClick={() => setShowSimilarityCard(!showSimilarityCard)}
                  >
                    <span className="similarity-score">{similarity.overallScore}%</span>
                    <span className="similarity-label">음악 궁합</span>
                  </button>
                )}
                
                {analyzingSimilarity && (
                  <div className="similarity-loading">
                    <div className="spinner-small"></div>
                    <span>분석 중...</span>
                  </div>
                )}
              </div>
            )}
            
            {isOwnProfile && (
              <Link to="/my" className="edit-btn">
                <svg viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                프로필 수정
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Similarity Analysis Card */}
      {showSimilarityCard && similarity && !isOwnProfile && (
        <section className="similarity-card">
          <button className="similarity-close" onClick={() => setShowSimilarityCard(false)}>
            <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
          
          <div className="similarity-header">
            <div className="similarity-emoji">
              {similarity.overallScore >= 80 ? '💕' : 
               similarity.overallScore >= 60 ? '🎵' : 
               similarity.overallScore >= 40 ? '🎧' : '🎶'}
            </div>
            <div className="similarity-main-score">
              <div className="score-circle" style={{ '--score': similarity.overallScore }}>
                <span className="score-value">{similarity.overallScore}</span>
                <span className="score-percent">%</span>
              </div>
              <div className="score-label">
                {similarity.compatibilityLevel === 'soulmate' && '🔥 음악 소울메이트!'}
                {similarity.compatibilityLevel === 'very_high' && '✨ 찰떡궁합'}
                {similarity.compatibilityLevel === 'high' && '👍 잘 맞아요'}
                {similarity.compatibilityLevel === 'medium' && '🎵 비슷한 점이 있어요'}
                {similarity.compatibilityLevel === 'low' && '🌈 다양한 취향'}
                {similarity.compatibilityLevel === 'different' && '🎨 새로운 음악 발견'}
              </div>
            </div>
          </div>

          <div className="similarity-bars">
            <div className="bar-item">
              <span className="bar-label">장르 매칭</span>
              <div className="bar-track">
                <div className="bar-fill genre" style={{ width: `${similarity.genreMatch}%` }}></div>
              </div>
              <span className="bar-value">{similarity.genreMatch}%</span>
            </div>
            <div className="bar-item">
              <span className="bar-label">분위기 매칭</span>
              <div className="bar-track">
                <div className="bar-fill vibe" style={{ width: `${similarity.vibeMatch}%` }}></div>
              </div>
              <span className="bar-value">{similarity.vibeMatch}%</span>
            </div>
            <div className="bar-item">
              <span className="bar-label">시대 매칭</span>
              <div className="bar-track">
                <div className="bar-fill era" style={{ width: `${similarity.eraMatch}%` }}></div>
              </div>
              <span className="bar-value">{similarity.eraMatch}%</span>
            </div>
          </div>

          <div className="similarity-summary">
            <p>{similarity.summary}</p>
          </div>

          {similarity.sharedGenres?.length > 0 && (
            <div className="shared-genres">
              <span className="section-label">🎵 공통 장르</span>
              <div className="genre-chips">
                {similarity.sharedGenres.map((genre, idx) => (
                  <span key={idx} className="genre-chip shared">{genre}</span>
                ))}
              </div>
            </div>
          )}

          {similarity.sharedTracksList?.length > 0 && (
            <div className="shared-tracks">
              <span className="section-label">❤️ 같이 좋아하는 곡 ({similarity.sharedTracks}개)</span>
              <div className="shared-tracks-list">
                {similarity.sharedTracksList.map((track, idx) => (
                  <div key={idx} className="shared-track-item">
                    <img src={track.thumbnail} alt="" />
                    <div className="track-info">
                      <span className="track-title">{track.title}</span>
                      <span className="track-artist">{track.artist}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="similarity-scores">
            <div className="score-item">
              <span className="score-icon">🎧</span>
              <span className="score-num">{similarity.djCompatibility}/10</span>
              <span className="score-desc">DJ 궁합</span>
            </div>
            <div className="score-item">
              <span className="score-icon">📋</span>
              <span className="score-num">{similarity.playlistPotential}/10</span>
              <span className="score-desc">협업 플리</span>
            </div>
          </div>

          {similarity.recommendation && (
            <div className="similarity-recommendation">
              <span className="rec-icon">💡</span>
              <p>{similarity.recommendation}</p>
            </div>
          )}

          {similarity.funFact && (
            <div className="similarity-funfact">
              <span className="fact-icon">✨</span>
              <p>{similarity.funFact}</p>
            </div>
          )}
        </section>
      )}

      {/* Tabs */}
      <nav className="profile-tabs">
        <button 
          className={activeTab === 'mixsets' ? 'active' : ''} 
          onClick={() => setActiveTab('mixsets')}
        >
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
          믹셋
        </button>
        <button 
          className={activeTab === 'favorites' ? 'active' : ''} 
          onClick={() => setActiveTab('favorites')}
        >
          <svg viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2"/></svg>
          즐겨찾기
        </button>
      </nav>

      {/* Content */}
      <main className="profile-content">
        {/* Mixsets Tab */}
        {activeTab === 'mixsets' && (
          <div className="mixsets-section">
            {mixsets.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/></svg>
                <p>공개된 믹셋이 없습니다</p>
              </div>
            ) : (
              <div className="mixsets-grid">
                {mixsets.map(mixset => (
                  <div key={mixset.id} className="mixset-card">
                    <div className="mixset-cover">
                      <img src={mixset.cover_image || mixset.tracks?.[0]?.thumbnail} alt="" />
                      <div className="mixset-overlay">
                        <span className="track-count">{mixset.tracks?.length || 0} tracks</span>
                      </div>
                    </div>
                    <div className="mixset-info">
                      <h4>{mixset.title}</h4>
                      {mixset.genre && <span className="genre">{mixset.genre}</span>}
                      <p className="meta">
                        <span>{formatDuration(mixset.total_duration)}</span>
                        <span>•</span>
                        <span>{mixset.likes_count || 0} ❤️</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Favorites Tab */}
        {activeTab === 'favorites' && (
          <div className="favorites-section">
            {favorites.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2"/></svg>
                <p>즐겨찾기가 없습니다</p>
              </div>
            ) : (
              <div className="favorites-grid">
                {favorites.map(fav => (
                  <div key={fav.id} className="favorite-card">
                    <div className="favorite-thumb">
                      <img src={fav.thumbnail} alt="" />
                      <a href={fav.url} target="_blank" rel="noopener noreferrer" className="play-overlay">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </a>
                    </div>
                    <div className="favorite-info">
                      <h4>{fav.title}</h4>
                      <p>{fav.uploader}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default UserProfile

