import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { 
  supabase, 
  getProfile, 
  updateProfile,
  getUserFeed,
  getUserStats,
  getMixsets,
  createMixset,
  getSimilarUsers,
  getFollowers,
  getFollowing,
  getFavorites,
  getDownloadHistory,
  getComments,
  addComment
} from '../lib/supabase'
import './MyPage.css'

function MyPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('feed') // feed, favorites, downloads, mixsets, similar
  const [feed, setFeed] = useState([])
  const [favorites, setFavorites] = useState([])
  const [downloads, setDownloads] = useState([])
  const [mixsets, setMixsets] = useState([])
  const [similarUsers, setSimilarUsers] = useState([])
  const [stats, setStats] = useState({})
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({
    display_name: '',
    username: '',
    bio: '',
    favorite_genres: ''
  })
  
  // Mixset upload modal
  const [showMixsetModal, setShowMixsetModal] = useState(false)
  const [mixsetForm, setMixsetForm] = useState({
    title: '',
    description: '',
    genre: '',
    tracks: [],
    isPublic: true
  })
  
  // Comments
  const [comments, setComments] = useState({})
  const [newComment, setNewComment] = useState('')
  const [commentTarget, setCommentTarget] = useState(null)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        navigate('/')
        return
      }
      setUser(session.user)
      await loadUserData(session.user.id)
      setLoading(false)
    }
    
    checkAuth()
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        navigate('/')
      }
    })
    
    return () => subscription.unsubscribe()
  }, [navigate])

  const loadUserData = async (userId) => {
    const [profileResult, feedResult, statsResult, mixsetsResult, similarResult, favoritesResult, downloadsResult] = await Promise.all([
      getProfile(userId),
      getUserFeed(userId),
      getUserStats(userId),
      getMixsets(userId),
      getSimilarUsers(userId),
      getFavorites(userId),
      getDownloadHistory(userId)
    ])
    
    if (profileResult.data) {
      setProfile(profileResult.data)
      setProfileForm({
        display_name: profileResult.data.display_name || '',
        username: profileResult.data.username || '',
        bio: profileResult.data.bio || '',
        favorite_genres: profileResult.data.favorite_genres?.join(', ') || ''
      })
    }
    
    setFeed(feedResult.data || [])
    setStats(statsResult)
    setMixsets(mixsetsResult.data || [])
    setSimilarUsers(similarResult.data || [])
    setFavorites(favoritesResult.data || [])
    setDownloads(downloadsResult.data || [])
  }

  const handleUpdateProfile = async () => {
    const updates = {
      display_name: profileForm.display_name,
      username: profileForm.username,
      bio: profileForm.bio,
      favorite_genres: profileForm.favorite_genres.split(',').map(g => g.trim()).filter(Boolean)
    }
    
    const { data, error } = await updateProfile(user.id, updates)
    if (!error && data) {
      setProfile(data)
      setEditingProfile(false)
    }
  }

  const handleCreateMixset = async () => {
    if (!mixsetForm.title || mixsetForm.tracks.length === 0) return
    
    const totalDuration = mixsetForm.tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
    
    const { data, error } = await createMixset(user.id, {
      ...mixsetForm,
      totalDuration
    })
    
    if (!error && data) {
      setMixsets([data, ...mixsets])
      setShowMixsetModal(false)
      setMixsetForm({ title: '', description: '', genre: '', tracks: [], isPublic: true })
    }
  }

  const loadComments = async (targetType, targetId) => {
    const { data } = await getComments(targetType, targetId)
    setComments(prev => ({
      ...prev,
      [`${targetType}-${targetId}`]: data || []
    }))
  }

  const handleAddComment = async () => {
    if (!newComment.trim() || !commentTarget) return
    
    const { data, error } = await addComment(
      user.id,
      commentTarget.type,
      commentTarget.id,
      newComment
    )
    
    if (!error && data) {
      const key = `${commentTarget.type}-${commentTarget.id}`
      setComments(prev => ({
        ...prev,
        [key]: [...(prev[key] || []), data]
      }))
      setNewComment('')
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    
    if (diff < 60000) return '방금 전'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`
    
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
      <div className="mypage-loading">
        <div className="spinner-large"></div>
        <p>로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="mypage">
      {/* Header */}
      <header className="mypage-header">
        <Link to="/" className="back-btn">
          <svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          홈으로
        </Link>
        <h1>
          <span className="logo-icon">🎵</span>
          BeatFlo
        </h1>
        <Link to="/community" className="community-link">
          <svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          커뮤니티
        </Link>
      </header>

      {/* Profile Section */}
      <section className="profile-section">
        <div className="profile-banner"></div>
        <div className="profile-content">
          <div className="profile-avatar">
            <img src={user?.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.display_name || user?.email)}&background=8B5CF6&color=fff`} alt="Avatar" />
          </div>
          
          <div className="profile-info">
            {editingProfile ? (
              <div className="profile-edit-form">
                <input 
                  type="text"
                  placeholder="Display Name"
                  value={profileForm.display_name}
                  onChange={(e) => setProfileForm({...profileForm, display_name: e.target.value})}
                />
                <input 
                  type="text"
                  placeholder="@username"
                  value={profileForm.username}
                  onChange={(e) => setProfileForm({...profileForm, username: e.target.value})}
                />
                <textarea 
                  placeholder="자기소개..."
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm({...profileForm, bio: e.target.value})}
                />
                <input 
                  type="text"
                  placeholder="좋아하는 장르 (쉼표로 구분)"
                  value={profileForm.favorite_genres}
                  onChange={(e) => setProfileForm({...profileForm, favorite_genres: e.target.value})}
                />
                <div className="edit-actions">
                  <button className="save-btn" onClick={handleUpdateProfile}>저장</button>
                  <button className="cancel-btn" onClick={() => setEditingProfile(false)}>취소</button>
                </div>
              </div>
            ) : (
              <>
                <h2>{profile?.display_name || user?.user_metadata?.name || 'DJ'}</h2>
                {profile?.username && <p className="username">@{profile.username}</p>}
                {profile?.bio && <p className="bio">{profile.bio}</p>}
                {profile?.favorite_genres?.length > 0 && (
                  <div className="genres">
                    {profile.favorite_genres.map((genre, idx) => (
                      <span key={idx} className="genre-tag">{genre}</span>
                    ))}
                  </div>
                )}
                <button className="edit-profile-btn" onClick={() => setEditingProfile(true)}>
                  <svg viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  프로필 수정
                </button>
              </>
            )}
          </div>
          
          <div className="profile-stats">
            <div className="stat-item">
              <span className="stat-value">{stats.favorites || 0}</span>
              <span className="stat-label">즐겨찾기</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.downloads || 0}</span>
              <span className="stat-label">다운로드</span>
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
        </div>
      </section>

      {/* Tabs */}
      <nav className="mypage-tabs">
        <button 
          className={activeTab === 'feed' ? 'active' : ''} 
          onClick={() => setActiveTab('feed')}
        >
          <svg viewBox="0 0 24 24" fill="none"><path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1M19 20a2 2 0 002-2V8a2 2 0 00-2-2h-5a2 2 0 00-2 2v10a2 2 0 002 2h5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          피드
        </button>
        <button 
          className={activeTab === 'favorites' ? 'active' : ''} 
          onClick={() => setActiveTab('favorites')}
        >
          <svg viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          즐겨찾기
        </button>
        <button 
          className={activeTab === 'downloads' ? 'active' : ''} 
          onClick={() => setActiveTab('downloads')}
        >
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          다운로드
        </button>
        <button 
          className={activeTab === 'mixsets' ? 'active' : ''} 
          onClick={() => setActiveTab('mixsets')}
        >
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
          믹셋
        </button>
        <button 
          className={activeTab === 'similar' ? 'active' : ''} 
          onClick={() => setActiveTab('similar')}
        >
          <svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          유사 DJ
        </button>
      </nav>

      {/* Content */}
      <main className="mypage-content">
        {/* Feed Tab */}
        {activeTab === 'feed' && (
          <div className="feed-container">
            {feed.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M8 15s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <h3>아직 활동이 없습니다</h3>
                <p>음악을 검색하고 즐겨찾기를 추가해보세요!</p>
                <Link to="/" className="start-btn">시작하기</Link>
              </div>
            ) : (
              <div className="feed-list">
                {feed.map((item, idx) => (
                  <div key={`${item.type}-${item.id}-${idx}`} className={`feed-item ${item.type}`}>
                    <div className="feed-item-header">
                      <span className={`feed-type-badge ${item.type}`}>
                        {item.type === 'favorite' && '❤️ 즐겨찾기'}
                        {item.type === 'download' && '⬇️ 다운로드'}
                        {item.type === 'mixset' && '💿 믹셋'}
                      </span>
                      <span className="feed-time">{formatDate(item.created_at)}</span>
                    </div>
                    
                    <div className="feed-item-content">
                      <img src={item.thumbnail || item.cover_image} alt="" className="feed-thumb" />
                      <div className="feed-info">
                        <h4>{item.title}</h4>
                        <p>{item.uploader || item.description || ''}</p>
                        {item.duration && <span className="duration">{formatDuration(item.duration)}</span>}
                      </div>
                    </div>
                    
                    <div className="feed-item-actions">
                      <button 
                        className="comment-toggle"
                        onClick={() => {
                          const key = `${item.type}-${item.id}`
                          if (!comments[key]) {
                            loadComments(item.type, item.id)
                          }
                          setCommentTarget(commentTarget?.id === item.id ? null : { type: item.type, id: item.id })
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        댓글
                      </button>
                    </div>
                    
                    {/* Comments Section */}
                    {commentTarget?.id === item.id && (
                      <div className="comments-section">
                        <div className="comments-list">
                          {(comments[`${item.type}-${item.id}`] || []).map(comment => (
                            <div key={comment.id} className="comment">
                              <img src={comment.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.profiles?.display_name || 'User')}&background=8B5CF6&color=fff&size=32`} alt="" />
                              <div className="comment-content">
                                <span className="comment-author">{comment.profiles?.display_name || 'User'}</span>
                                <p>{comment.content}</p>
                                <span className="comment-time">{formatDate(comment.created_at)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="comment-input">
                          <input 
                            type="text"
                            placeholder="댓글을 입력하세요..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                          />
                          <button onClick={handleAddComment}>
                            <svg viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Favorites Tab */}
        {activeTab === 'favorites' && (
          <div className="favorites-container">
            {favorites.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2"/></svg>
                <h3>즐겨찾기가 없습니다</h3>
                <p>마음에 드는 곡에 하트를 눌러보세요!</p>
              </div>
            ) : (
              <div className="grid-list">
                {favorites.map(fav => (
                  <div key={fav.id} className="grid-item">
                    <div className="grid-thumb">
                      <img src={fav.thumbnail} alt="" />
                      <a href={fav.url} target="_blank" rel="noopener noreferrer" className="play-overlay">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </a>
                    </div>
                    <div className="grid-info">
                      <h4>{fav.title}</h4>
                      <p>{fav.uploader}</p>
                      <span className="date">{formatDate(fav.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Downloads Tab */}
        {activeTab === 'downloads' && (
          <div className="downloads-container">
            {downloads.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2"/></svg>
                <h3>다운로드 기록이 없습니다</h3>
                <p>음악을 다운로드해보세요!</p>
              </div>
            ) : (
              <div className="grid-list">
                {downloads.map(dl => (
                  <div key={dl.id} className="grid-item">
                    <div className="grid-thumb">
                      <img src={dl.thumbnail} alt="" />
                      <span className="format-badge">{dl.format}</span>
                    </div>
                    <div className="grid-info">
                      <h4>{dl.title}</h4>
                      <p>{dl.uploader}</p>
                      <span className="date">{formatDate(dl.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mixsets Tab */}
        {activeTab === 'mixsets' && (
          <div className="mixsets-container">
            <div className="mixsets-header">
              <h3>내 믹셋</h3>
              <button className="create-mixset-btn" onClick={() => setShowMixsetModal(true)}>
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                새 믹셋 만들기
              </button>
            </div>
            
            {mixsets.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                <h3>믹셋이 없습니다</h3>
                <p>나만의 믹셋을 만들어 공유해보세요!</p>
              </div>
            ) : (
              <div className="mixset-grid">
                {mixsets.map(mixset => (
                  <div key={mixset.id} className="mixset-card">
                    <div className="mixset-cover">
                      <img src={mixset.cover_image || mixset.tracks?.[0]?.thumbnail} alt="" />
                      <div className="mixset-overlay">
                        <span className="track-count">{mixset.tracks?.length || 0} tracks</span>
                        {mixset.is_public ? (
                          <span className="public-badge">🌐 Public</span>
                        ) : (
                          <span className="private-badge">🔒 Private</span>
                        )}
                      </div>
                    </div>
                    <div className="mixset-info">
                      <h4>{mixset.title}</h4>
                      <p>{mixset.description || ''}</p>
                      {mixset.genre && <span className="genre-tag">{mixset.genre}</span>}
                      <div className="mixset-meta">
                        <span>{formatDuration(mixset.total_duration)}</span>
                        <span>{mixset.likes_count || 0} ❤️</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Similar Users Tab */}
        {activeTab === 'similar' && (
          <div className="similar-container">
            <h3>🎵 비슷한 음악 취향을 가진 DJ들</h3>
            <p className="similar-subtitle">당신과 같은 곡을 좋아하는 사람들입니다</p>
            
            {similarUsers.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/></svg>
                <h3>아직 비슷한 DJ가 없습니다</h3>
                <p>더 많은 곡을 즐겨찾기에 추가하면<br/>비슷한 취향의 DJ를 찾을 수 있어요!</p>
              </div>
            ) : (
              <div className="similar-users-list">
                {similarUsers.map(simUser => (
                  <Link 
                    key={simUser.id} 
                    to={`/user/${simUser.username || simUser.id}`}
                    className="similar-user-card"
                  >
                    <img src={simUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(simUser.display_name || 'DJ')}&background=8B5CF6&color=fff`} alt="" />
                    <div className="similar-user-info">
                      <h4>{simUser.display_name || 'DJ'}</h4>
                      {simUser.username && <p>@{simUser.username}</p>}
                    </div>
                    <div className="match-score">
                      <span className="score">{simUser.matchCount}</span>
                      <span className="label">곡 일치</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Mixset Modal */}
      {showMixsetModal && (
        <div className="modal-overlay" onClick={() => setShowMixsetModal(false)}>
          <div className="modal mixset-create-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowMixsetModal(false)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            
            <div className="modal-header">
              <h3>💿 새 믹셋 만들기</h3>
              <p>나만의 믹셋을 만들어 공유하세요</p>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>믹셋 제목</label>
                <input 
                  type="text"
                  placeholder="예: Summer Vibes 2024"
                  value={mixsetForm.title}
                  onChange={(e) => setMixsetForm({...mixsetForm, title: e.target.value})}
                />
              </div>
              
              <div className="form-group">
                <label>설명</label>
                <textarea 
                  placeholder="믹셋에 대한 설명..."
                  value={mixsetForm.description}
                  onChange={(e) => setMixsetForm({...mixsetForm, description: e.target.value})}
                />
              </div>
              
              <div className="form-group">
                <label>장르</label>
                <input 
                  type="text"
                  placeholder="예: House, Techno, EDM"
                  value={mixsetForm.genre}
                  onChange={(e) => setMixsetForm({...mixsetForm, genre: e.target.value})}
                />
              </div>
              
              <div className="form-group">
                <label>트랙 추가</label>
                <p className="form-hint">즐겨찾기에서 트랙을 선택하세요</p>
                <div className="track-selector">
                  {favorites.map(fav => (
                    <div 
                      key={fav.id}
                      className={`selectable-track ${mixsetForm.tracks.find(t => t.video_id === fav.video_id) ? 'selected' : ''}`}
                      onClick={() => {
                        const exists = mixsetForm.tracks.find(t => t.video_id === fav.video_id)
                        if (exists) {
                          setMixsetForm({
                            ...mixsetForm,
                            tracks: mixsetForm.tracks.filter(t => t.video_id !== fav.video_id)
                          })
                        } else {
                          setMixsetForm({
                            ...mixsetForm,
                            tracks: [...mixsetForm.tracks, {
                              video_id: fav.video_id,
                              title: fav.title,
                              uploader: fav.uploader,
                              thumbnail: fav.thumbnail,
                              duration: fav.duration,
                              url: fav.url
                            }]
                          })
                        }
                      }}
                    >
                      <img src={fav.thumbnail} alt="" />
                      <span>{fav.title}</span>
                      {mixsetForm.tracks.find(t => t.video_id === fav.video_id) && (
                        <svg className="check-icon" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </div>
                  ))}
                </div>
                <p className="selected-count">{mixsetForm.tracks.length}개 선택됨</p>
              </div>
              
              <div className="form-group checkbox">
                <label>
                  <input 
                    type="checkbox"
                    checked={mixsetForm.isPublic}
                    onChange={(e) => setMixsetForm({...mixsetForm, isPublic: e.target.checked})}
                  />
                  <span>🌐 공개 (커뮤니티에 공유)</span>
                </label>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="create-btn"
                onClick={handleCreateMixset}
                disabled={!mixsetForm.title || mixsetForm.tracks.length === 0}
              >
                믹셋 생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MyPage

