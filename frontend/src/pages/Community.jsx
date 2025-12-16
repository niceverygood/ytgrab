import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { 
  supabase, 
  getEnhancedCommunityFeed,
  getPublicMixsets,
  likeMixset,
  unlikeMixset,
  isMixsetLiked,
  getPostComments,
  addPostComment,
  createPost,
  likePost,
  unlikePost,
  isPostLiked,
  deletePost,
  uploadMultipleMedia,
  getFavorites
} from '../lib/supabase'
import './Community.css'

function Community() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('feed') // feed, mixsets, trending
  const [feed, setFeed] = useState([])
  const [mixsets, setMixsets] = useState([])
  const [loading, setLoading] = useState(true)
  const [likedItems, setLikedItems] = useState({})
  const [comments, setComments] = useState({})
  const [commentTarget, setCommentTarget] = useState(null)
  const [newComment, setNewComment] = useState('')
  
  // Post creation states
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [postType, setPostType] = useState('text') // text, music, photo, video
  const [postContent, setPostContent] = useState('')
  const [selectedMusic, setSelectedMusic] = useState(null)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])
  const [isPosting, setIsPosting] = useState(false)
  const [userFavorites, setUserFavorites] = useState([])
  const [showMusicPicker, setShowMusicPicker] = useState(false)
  
  const fileInputRef = useRef(null)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      
      if (session?.user) {
        // Load user's favorites for music sharing
        const { data: favs } = await getFavorites(session.user.id)
        setUserFavorites(favs || [])
      }
    }
    
    checkAuth()
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })
    
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    
    if (activeTab === 'feed' || activeTab === 'trending') {
      const { data } = await getEnhancedCommunityFeed(50, false, user?.id)
      setFeed(data || [])
      
      // Check which items are liked by current user
      if (user && data) {
        const likeChecks = {}
        for (const item of data) {
          if (item.feedType === 'post') {
            likeChecks[`post-${item.id}`] = await isPostLiked(user.id, item.id)
          } else if (item.feedType === 'mixset') {
            likeChecks[`mixset-${item.id}`] = await isMixsetLiked(user.id, item.id)
          }
        }
        setLikedItems(likeChecks)
      }
    }
    
    if (activeTab === 'mixsets') {
      const { data } = await getPublicMixsets(30)
      setMixsets(data || [])
      
      // Check which mixsets are liked by current user
      if (user && data) {
        const likeChecks = {}
        for (const m of data) {
          likeChecks[`mixset-${m.id}`] = await isMixsetLiked(user.id, m.id)
        }
        setLikedItems(prev => ({ ...prev, ...likeChecks }))
      }
    }
    
    setLoading(false)
  }

  const handleLikeItem = async (itemType, itemId) => {
    if (!user) return
    
    const key = `${itemType}-${itemId}`
    
    if (likedItems[key]) {
      if (itemType === 'post') {
        await unlikePost(user.id, itemId)
      } else if (itemType === 'mixset') {
        await unlikeMixset(user.id, itemId)
      }
      setLikedItems(prev => ({ ...prev, [key]: false }))
      
      // Update count in feed
      setFeed(prev => prev.map(item => {
        if (item.id === itemId) {
          return { ...item, likes_count: Math.max((item.likes_count || 1) - 1, 0) }
        }
        return item
      }))
    } else {
      if (itemType === 'post') {
        await likePost(user.id, itemId)
      } else if (itemType === 'mixset') {
        await likeMixset(user.id, itemId)
      }
      setLikedItems(prev => ({ ...prev, [key]: true }))
      
      // Update count in feed
      setFeed(prev => prev.map(item => {
        if (item.id === itemId) {
          return { ...item, likes_count: (item.likes_count || 0) + 1 }
        }
        return item
      }))
    }
  }

  const loadComments = async (postId) => {
    const { data } = await getPostComments(postId)
    setComments(prev => ({
      ...prev,
      [postId]: data || []
    }))
  }

  const handleAddComment = async () => {
    if (!newComment.trim() || !commentTarget || !user) return
    
    const { data, error } = await addPostComment(
      user.id,
      commentTarget,
      newComment
    )
    
    if (!error && data) {
      setComments(prev => ({
        ...prev,
        [commentTarget]: [...(prev[commentTarget] || []), data]
      }))
      setNewComment('')
      
      // Update comments count
      setFeed(prev => prev.map(item => {
        if (item.id === commentTarget) {
          return { ...item, comments_count: (item.comments_count || 0) + 1 }
        }
        return item
      }))
    }
  }

  // File handling
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    
    // Validate file types
    const validTypes = postType === 'photo' 
      ? ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      : ['video/mp4', 'video/webm', 'video/quicktime']
    
    const validFiles = files.filter(f => validTypes.includes(f.type))
    
    if (validFiles.length !== files.length) {
      alert('일부 파일이 지원되지 않는 형식입니다.')
    }
    
    // Limit to 4 files for photos, 1 for video
    const maxFiles = postType === 'photo' ? 4 : 1
    const selectedFiles = validFiles.slice(0, maxFiles)
    
    setSelectedFiles(selectedFiles)
    
    // Create preview URLs
    const urls = selectedFiles.map(f => URL.createObjectURL(f))
    setPreviewUrls(urls)
  }

  const removeFile = (index) => {
    URL.revokeObjectURL(previewUrls[index])
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    setPreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  const handleSelectMusic = (music) => {
    setSelectedMusic(music)
    setShowMusicPicker(false)
  }

  const handleCreatePost = async () => {
    if (!user) return
    if (!postContent.trim() && !selectedMusic && selectedFiles.length === 0) {
      alert('내용을 입력해주세요.')
      return
    }
    
    setIsPosting(true)
    
    try {
      let mediaUrls = []
      
      // Upload files if any
      if (selectedFiles.length > 0) {
        const { urls, errors } = await uploadMultipleMedia(user.id, selectedFiles)
        if (errors) {
          console.error('Upload errors:', errors)
        }
        mediaUrls = urls
      }
      
      // Create post data
      const postData = {
        postType,
        content: postContent,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : null,
        mediaType: postType === 'photo' ? 'image' : postType === 'video' ? 'video' : null,
        isPublic: true
      }
      
      // Add music data if music type
      if (postType === 'music' && selectedMusic) {
        postData.videoId = selectedMusic.video_id
        postData.musicTitle = selectedMusic.title
        postData.musicArtist = selectedMusic.uploader
        postData.musicThumbnail = selectedMusic.thumbnail
        postData.musicUrl = selectedMusic.url
        postData.musicDuration = selectedMusic.duration
        postData.activityType = 'shared'
      }
      
      const { data, error } = await createPost(user.id, postData)
      
      if (error) {
        throw error
      }
      
      // Add to feed
      setFeed(prev => [{ ...data, feedType: 'post' }, ...prev])
      
      // Reset form
      setPostContent('')
      setSelectedMusic(null)
      setSelectedFiles([])
      setPreviewUrls([])
      setPostType('text')
      setShowCreatePost(false)
      
    } catch (err) {
      console.error('Post creation error:', err)
      alert('게시물 작성에 실패했습니다.')
    } finally {
      setIsPosting(false)
    }
  }

  const handleDeletePost = async (postId) => {
    if (!user || !window.confirm('정말 삭제하시겠습니까?')) return
    
    const { error } = await deletePost(postId, user.id)
    if (!error) {
      setFeed(prev => prev.filter(item => item.id !== postId))
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

  const getPostTypeIcon = (item) => {
    if (item.feedType === 'post') {
      switch (item.post_type) {
        case 'music': return '🎵'
        case 'photo': return '📷'
        case 'video': return '🎬'
        default: return '💬'
      }
    }
    if (item.feedType === 'favorite') return '❤️'
    if (item.feedType === 'mixset') return '💿'
    return '📝'
  }

  const getActivityLabel = (item) => {
    if (item.feedType === 'favorite') return '좋아하는 음악'
    if (item.feedType === 'mixset') return '믹셋 공유'
    if (item.feedType === 'post') {
      switch (item.activity_type) {
        case 'listened': return '들은 음악'
        case 'liked': return '좋아하는 음악'
        case 'shared': return '공유'
        case 'created': return '새 믹셋'
        default: return null
      }
    }
    return null
  }

  return (
    <div className="community-page">
      {/* Header */}
      <header className="community-header">
        <Link to="/" className="back-btn">
          <svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
        <h1>
          <span className="logo-icon">🎵</span>
          BeatFlo Community
        </h1>
        {user ? (
          <Link to="/my" className="my-page-link">
            <img src={user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=8B5CF6&color=fff`} alt="" />
          </Link>
        ) : (
          <div className="auth-prompt">로그인하고 참여하세요!</div>
        )}
      </header>

      {/* Create Post Button (Floating) */}
      {user && (
        <button 
          className="create-post-fab"
          onClick={() => setShowCreatePost(true)}
        >
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      )}

      {/* Create Post Modal */}
      {showCreatePost && (
        <div className="create-post-overlay" onClick={() => setShowCreatePost(false)}>
          <div className="create-post-modal" onClick={e => e.stopPropagation()}>
            <div className="create-post-header">
              <h3>새 게시물</h3>
              <button className="close-btn" onClick={() => setShowCreatePost(false)}>
                <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            
            {/* Post Type Selector */}
            <div className="post-type-selector">
              <button 
                className={postType === 'text' ? 'active' : ''}
                onClick={() => setPostType('text')}
              >
                <span>💬</span>
                글
              </button>
              <button 
                className={postType === 'music' ? 'active' : ''}
                onClick={() => setPostType('music')}
              >
                <span>🎵</span>
                음악
              </button>
              <button 
                className={postType === 'photo' ? 'active' : ''}
                onClick={() => setPostType('photo')}
              >
                <span>📷</span>
                사진
              </button>
              <button 
                className={postType === 'video' ? 'active' : ''}
                onClick={() => setPostType('video')}
              >
                <span>🎬</span>
                영상
              </button>
            </div>

            {/* Content Input */}
            <div className="post-content-input">
              <textarea
                placeholder={
                  postType === 'text' ? '무슨 생각을 하고 계신가요?' :
                  postType === 'music' ? '이 음악에 대해 말해주세요...' :
                  postType === 'photo' ? '사진과 함께 공유할 내용을 적어주세요...' :
                  '영상에 대한 설명을 적어주세요...'
                }
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                rows={4}
              />
            </div>

            {/* Music Picker */}
            {postType === 'music' && (
              <div className="music-picker-section">
                {selectedMusic ? (
                  <div className="selected-music">
                    <img src={selectedMusic.thumbnail} alt="" />
                    <div className="music-info">
                      <span className="music-title">{selectedMusic.title}</span>
                      <span className="music-artist">{selectedMusic.uploader}</span>
                    </div>
                    <button className="remove-music" onClick={() => setSelectedMusic(null)}>
                      <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"/></svg>
                    </button>
                  </div>
                ) : (
                  <button className="pick-music-btn" onClick={() => setShowMusicPicker(true)}>
                    <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2"/><circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                    즐겨찾기에서 음악 선택
                  </button>
                )}
                
                {/* Music Picker Modal */}
                {showMusicPicker && (
                  <div className="music-picker-modal">
                    <div className="music-picker-header">
                      <h4>음악 선택</h4>
                      <button onClick={() => setShowMusicPicker(false)}>
                        <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"/></svg>
                      </button>
                    </div>
                    <div className="music-picker-list">
                      {userFavorites.length === 0 ? (
                        <div className="no-favorites">
                          <p>즐겨찾기한 음악이 없습니다.</p>
                          <Link to="/">음악 검색하러 가기</Link>
                        </div>
                      ) : (
                        userFavorites.map(music => (
                          <div 
                            key={music.id} 
                            className="music-picker-item"
                            onClick={() => handleSelectMusic(music)}
                          >
                            <img src={music.thumbnail} alt="" />
                            <div className="music-info">
                              <span className="title">{music.title}</span>
                              <span className="artist">{music.uploader}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* File Upload */}
            {(postType === 'photo' || postType === 'video') && (
              <div className="file-upload-section">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept={postType === 'photo' ? 'image/*' : 'video/*'}
                  multiple={postType === 'photo'}
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                
                {previewUrls.length > 0 ? (
                  <div className={`file-previews ${postType}`}>
                    {previewUrls.map((url, idx) => (
                      <div key={idx} className="preview-item">
                        {postType === 'photo' ? (
                          <img src={url} alt="" />
                        ) : (
                          <video src={url} controls />
                        )}
                        <button className="remove-file" onClick={() => removeFile(idx)}>
                          <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"/></svg>
                        </button>
                      </div>
                    ))}
                    {postType === 'photo' && previewUrls.length < 4 && (
                      <button className="add-more" onClick={() => fileInputRef.current?.click()}>
                        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2"/></svg>
                      </button>
                    )}
                  </div>
                ) : (
                  <button 
                    className="upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg viewBox="0 0 24 24" fill="none">
                      {postType === 'photo' ? (
                        <path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5L5 21" stroke="currentColor" strokeWidth="2"/>
                      ) : (
                        <path d="M23 7l-7 5 7 5V7zM14 5H3a2 2 0 00-2 2v10a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2z" stroke="currentColor" strokeWidth="2"/>
                      )}
                    </svg>
                    {postType === 'photo' ? '사진 업로드 (최대 4장)' : '영상 업로드'}
                  </button>
                )}
              </div>
            )}

            {/* Post Actions */}
            <div className="create-post-actions">
              <button 
                className="cancel-btn"
                onClick={() => setShowCreatePost(false)}
              >
                취소
              </button>
              <button 
                className="post-btn"
                onClick={handleCreatePost}
                disabled={isPosting || (!postContent.trim() && !selectedMusic && selectedFiles.length === 0)}
              >
                {isPosting ? (
                  <>
                    <div className="spinner-small"></div>
                    게시 중...
                  </>
                ) : '게시하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <nav className="community-tabs">
        <button 
          className={activeTab === 'feed' ? 'active' : ''} 
          onClick={() => setActiveTab('feed')}
        >
          <svg viewBox="0 0 24 24" fill="none"><path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1M19 20a2 2 0 002-2V8a2 2 0 00-2-2h-5a2 2 0 00-2 2v10a2 2 0 002 2h5z" stroke="currentColor" strokeWidth="2"/></svg>
          피드
        </button>
        <button 
          className={activeTab === 'mixsets' ? 'active' : ''} 
          onClick={() => setActiveTab('mixsets')}
        >
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
          믹셋
        </button>
        <button 
          className={activeTab === 'trending' ? 'active' : ''} 
          onClick={() => setActiveTab('trending')}
        >
          <svg viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          트렌딩
        </button>
      </nav>

      {/* Content */}
      <main className="community-content">
        {loading ? (
          <div className="loading-state">
            <div className="spinner-large"></div>
            <p>로딩 중...</p>
          </div>
        ) : (
          <>
            {/* Feed Tab */}
            {(activeTab === 'feed' || activeTab === 'trending') && (
              <div className="feed-container">
                {feed.length === 0 ? (
                  <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M8 15s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    <h3>아직 활동이 없습니다</h3>
                    <p>첫 번째로 게시물을 올려보세요!</p>
                    {user && (
                      <button className="cta-btn" onClick={() => setShowCreatePost(true)}>
                        게시물 작성하기
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="feed-grid">
                    {feed.map((item, idx) => (
                      <div key={`${item.feedType}-${item.id}-${idx}`} className={`feed-card ${item.feedType} ${item.post_type || ''}`}>
                        {/* Card Header */}
                        <div className="feed-card-header">
                          <Link 
                            to={item.profiles?.username ? `/user/${item.profiles.username}` : `/user/${item.profiles?.id || item.user_id}`}
                            className="feed-author"
                          >
                            <img 
                              src={item.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.profiles?.display_name || 'DJ')}&background=8B5CF6&color=fff`} 
                              alt="" 
                            />
                            <div className="author-info">
                              <span className="author-name">{item.profiles?.display_name || 'DJ'}</span>
                              {getActivityLabel(item) && (
                                <span className="activity-label">{getActivityLabel(item)}</span>
                              )}
                            </div>
                          </Link>
                          <div className="feed-meta">
                            <span className="feed-type-icon">{getPostTypeIcon(item)}</span>
                            <span className="feed-time">{formatDate(item.created_at)}</span>
                            {user?.id === item.user_id && item.feedType === 'post' && (
                              <button 
                                className="delete-btn"
                                onClick={() => handleDeletePost(item.id)}
                              >
                                <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Text Content */}
                        {item.content && (
                          <div className="feed-card-text">
                            <p>{item.content}</p>
                          </div>
                        )}
                        
                        {/* Media Content */}
                        <div className="feed-card-content">
                          {/* Music */}
                          {(item.feedType === 'favorite' || item.post_type === 'music') && (
                            <div className="music-card">
                              <img src={item.thumbnail || item.music_thumbnail} alt="" className="music-thumb" />
                              <div className="music-overlay">
                                <a 
                                  href={item.url || item.music_url || `https://youtube.com/watch?v=${item.video_id}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="play-btn"
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                </a>
                              </div>
                              <div className="music-info">
                                <span className="music-title">{item.title || item.music_title}</span>
                                <span className="music-artist">{item.uploader || item.music_artist}</span>
                              </div>
                            </div>
                          )}
                          
                          {/* Photos */}
                          {item.post_type === 'photo' && item.media_urls && (
                            <div className={`photo-grid photos-${Math.min(item.media_urls.length, 4)}`}>
                              {item.media_urls.slice(0, 4).map((url, i) => (
                                <div key={i} className="photo-item">
                                  <img src={url} alt="" />
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Video */}
                          {item.post_type === 'video' && item.media_urls?.[0] && (
                            <div className="video-container">
                              <video src={item.media_urls[0]} controls />
                            </div>
                          )}
                          
                          {/* Mixset */}
                          {item.feedType === 'mixset' && (
                            <div className="mixset-preview">
                              <img src={item.cover_image || item.tracks?.[0]?.thumbnail} alt="" className="mixset-cover" />
                              <div className="mixset-overlay">
                                <span className="track-count">{item.tracks?.length || 0} tracks</span>
                                <span className="duration">{formatDuration(item.total_duration)}</span>
                              </div>
                              <div className="mixset-info">
                                <span className="mixset-title">{item.title}</span>
                                {item.genre && <span className="mixset-genre">{item.genre}</span>}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Actions */}
                        <div className="feed-card-actions">
                          <button 
                            className={`action-btn like ${likedItems[`${item.feedType === 'post' ? 'post' : item.feedType}-${item.id}`] ? 'liked' : ''}`}
                            onClick={() => handleLikeItem(item.feedType === 'post' ? 'post' : item.feedType, item.id)}
                          >
                            <svg viewBox="0 0 24 24" fill={likedItems[`${item.feedType === 'post' ? 'post' : item.feedType}-${item.id}`] ? 'currentColor' : 'none'}>
                              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2"/>
                            </svg>
                            {item.likes_count || 0}
                          </button>
                          
                          {item.feedType === 'post' && (
                            <button 
                              className={`action-btn comment ${commentTarget === item.id ? 'active' : ''}`}
                              onClick={() => {
                                if (!comments[item.id]) {
                                  loadComments(item.id)
                                }
                                setCommentTarget(commentTarget === item.id ? null : item.id)
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2"/></svg>
                              {item.comments_count || 0}
                            </button>
                          )}
                          
                          <button className="action-btn share">
                            <svg viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="2"/></svg>
                          </button>
                        </div>
                        
                        {/* Comments Section */}
                        {commentTarget === item.id && item.feedType === 'post' && (
                          <div className="feed-card-comments">
                            <div className="comments-list">
                              {(comments[item.id] || []).map(comment => (
                                <div key={comment.id} className="comment">
                                  <img src={comment.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.profiles?.display_name || 'User')}&background=8B5CF6&color=fff&size=28`} alt="" />
                                  <div className="comment-body">
                                    <div className="comment-header">
                                      <span className="comment-author">{comment.profiles?.display_name || 'User'}</span>
                                      <span className="comment-time">{formatDate(comment.created_at)}</span>
                                    </div>
                                    <p>{comment.content}</p>
                                  </div>
                                </div>
                              ))}
                              {(comments[item.id] || []).length === 0 && (
                                <div className="no-comments">아직 댓글이 없습니다.</div>
                              )}
                            </div>
                            {user && (
                              <div className="comment-input">
                                <img src={user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=8B5CF6&color=fff&size=28`} alt="" />
                                <input 
                                  type="text"
                                  placeholder="댓글 달기..."
                                  value={newComment}
                                  onChange={(e) => setNewComment(e.target.value)}
                                  onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                                />
                                <button onClick={handleAddComment} disabled={!newComment.trim()}>
                                  <svg viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2"/></svg>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Mixsets Tab */}
            {activeTab === 'mixsets' && (
              <div className="mixsets-container">
                {mixsets.length === 0 ? (
                  <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/></svg>
                    <h3>공개된 믹셋이 없습니다</h3>
                    <p>첫 번째 믹셋을 만들어 공유해보세요!</p>
                  </div>
                ) : (
                  <div className="mixsets-grid">
                    {mixsets.map(mixset => (
                      <div key={mixset.id} className="mixset-card">
                        <div className="mixset-cover">
                          <img src={mixset.cover_image || mixset.tracks?.[0]?.thumbnail} alt="" />
                          <div className="mixset-cover-overlay">
                            <span className="track-count">{mixset.tracks?.length || 0} tracks</span>
                            <span className="duration">{formatDuration(mixset.total_duration)}</span>
                          </div>
                        </div>
                        
                        <div className="mixset-body">
                          <Link 
                            to={mixset.profiles?.username ? `/user/${mixset.profiles.username}` : '#'}
                            className="mixset-author"
                          >
                            <img 
                              src={mixset.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(mixset.profiles?.display_name || 'DJ')}&background=8B5CF6&color=fff`} 
                              alt="" 
                            />
                            <span>{mixset.profiles?.display_name || 'DJ'}</span>
                          </Link>
                          
                          <h4>{mixset.title}</h4>
                          {mixset.description && <p>{mixset.description}</p>}
                          {mixset.genre && <span className="genre-tag">{mixset.genre}</span>}
                          
                          <div className="mixset-actions">
                            <button 
                              className={`like-btn ${likedItems[`mixset-${mixset.id}`] ? 'liked' : ''}`}
                              onClick={() => handleLikeItem('mixset', mixset.id)}
                            >
                              <svg viewBox="0 0 24 24" fill={likedItems[`mixset-${mixset.id}`] ? 'currentColor' : 'none'}>
                                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2"/>
                              </svg>
                              {mixset.likes_count || 0}
                            </button>
                            <span className="mixset-date">{formatDate(mixset.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default Community
