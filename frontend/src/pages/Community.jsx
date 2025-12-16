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

// 더미 데이터 - 커뮤니티 분위기를 보여주기 위한 샘플
const DUMMY_FEED = [
  {
    id: 'dummy-1',
    feedType: 'post',
    post_type: 'music',
    user_id: 'dummy-user-1',
    content: '오늘 새벽 드라이브하면서 들은 트랙 🌙 Fred again.. 신곡 진짜 미쳤다',
    music_title: 'Danielle (smile on my face)',
    music_artist: 'Fred again..',
    music_thumbnail: 'https://i.ytimg.com/vi/7_zbN4jdXYA/hqdefault.jpg',
    music_url: 'https://youtube.com/watch?v=7_zbN4jdXYA',
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    likes_count: 47,
    comments_count: 12,
    profiles: {
      display_name: 'NightOwl_DJ',
      username: 'nightowl',
      avatar_url: 'https://ui-avatars.com/api/?name=NightOwl&background=EC4899&color=fff'
    }
  },
  {
    id: 'dummy-2',
    feedType: 'mixset',
    user_id: 'dummy-user-2',
    title: 'Sunset House Vibes 2024',
    description: '여름 석양이 생각나는 딥하우스 믹스 🌅',
    genre: 'Deep House',
    tracks: [
      { thumbnail: 'https://i.ytimg.com/vi/DkeiKbqa02g/hqdefault.jpg' },
      { thumbnail: 'https://i.ytimg.com/vi/psuRGfAajqI/hqdefault.jpg' },
      { thumbnail: 'https://i.ytimg.com/vi/XGSy3_Czz8k/hqdefault.jpg' },
    ],
    total_duration: 3847,
    cover_image: 'https://i.ytimg.com/vi/DkeiKbqa02g/maxresdefault.jpg',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    likes_count: 156,
    profiles: {
      display_name: 'DJ_Horizon',
      username: 'djhorizon',
      avatar_url: 'https://ui-avatars.com/api/?name=Horizon&background=8B5CF6&color=fff'
    }
  },
  {
    id: 'dummy-3',
    feedType: 'post',
    post_type: 'text',
    user_id: 'dummy-user-3',
    content: '다음 주 홍대 클럽에서 첫 공연이에요! 🎉 긴장되지만 열심히 준비했습니다. 오시는 분들 같이 놀아요~',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    likes_count: 89,
    comments_count: 34,
    profiles: {
      display_name: 'MINA',
      username: 'minaa_dj',
      avatar_url: 'https://ui-avatars.com/api/?name=MINA&background=22D3EE&color=fff'
    }
  },
  {
    id: 'dummy-4',
    feedType: 'post',
    post_type: 'music',
    user_id: 'dummy-user-4',
    content: '베이스 라인이 너무 좋아서 무한반복 중 🔊 이번 앨범 전체가 명작',
    music_title: 'Opus',
    music_artist: 'Eric Prydz',
    music_thumbnail: 'https://i.ytimg.com/vi/iRA82xLsb_w/hqdefault.jpg',
    music_url: 'https://youtube.com/watch?v=iRA82xLsb_w',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    likes_count: 234,
    comments_count: 56,
    profiles: {
      display_name: 'BassDrop',
      username: 'bassdrop',
      avatar_url: 'https://ui-avatars.com/api/?name=BD&background=F59E0B&color=fff'
    }
  },
  {
    id: 'dummy-5',
    feedType: 'favorite',
    user_id: 'dummy-user-5',
    title: 'Midnight City',
    uploader: 'M83',
    thumbnail: 'https://i.ytimg.com/vi/dX3k_QDnzHE/hqdefault.jpg',
    url: 'https://youtube.com/watch?v=dX3k_QDnzHE',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    likes_count: 312,
    profiles: {
      display_name: 'SynthWave_Seoul',
      username: 'synthwave',
      avatar_url: 'https://ui-avatars.com/api/?name=SW&background=6366F1&color=fff'
    }
  }
]

const DUMMY_MIXSETS = [
  {
    id: 'mixset-1',
    title: '🌃 Seoul Night Drive Mix',
    description: '서울 야경과 함께하는 드라이브 믹스. 시티팝부터 하우스까지.',
    genre: 'City Pop / House',
    tracks: [
      { thumbnail: 'https://i.ytimg.com/vi/XGSy3_Czz8k/hqdefault.jpg', title: 'Plastic Love' },
      { thumbnail: 'https://i.ytimg.com/vi/3nlSDxvt6JU/hqdefault.jpg', title: 'Stay With Me' },
      { thumbnail: 'https://i.ytimg.com/vi/DkeiKbqa02g/hqdefault.jpg', title: 'Deep End' },
      { thumbnail: 'https://i.ytimg.com/vi/qN-SdXXKfp8/hqdefault.jpg', title: 'Midnight' },
    ],
    total_duration: 4523,
    cover_image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=400',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    likes_count: 423,
    profiles: {
      display_name: 'DJ_Horizon',
      username: 'djhorizon',
      avatar_url: 'https://ui-avatars.com/api/?name=Horizon&background=8B5CF6&color=fff'
    }
  },
  {
    id: 'mixset-2',
    title: '⚡ Peak Time Techno',
    description: '새벽 3시, 클럽의 절정. 하드 테크노 세트.',
    genre: 'Techno',
    tracks: [
      { thumbnail: 'https://i.ytimg.com/vi/JWZlYM0rqC8/hqdefault.jpg', title: 'Drumcode' },
      { thumbnail: 'https://i.ytimg.com/vi/hVAKC2WBXVM/hqdefault.jpg', title: 'Exhale' },
      { thumbnail: 'https://i.ytimg.com/vi/QI8qD4wZJQE/hqdefault.jpg', title: 'Industrial' },
    ],
    total_duration: 5234,
    cover_image: 'https://images.unsplash.com/photo-1574169208507-84376144848b?w=400',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    likes_count: 567,
    profiles: {
      display_name: 'TechnoKing',
      username: 'technoking',
      avatar_url: 'https://ui-avatars.com/api/?name=TK&background=EF4444&color=fff'
    }
  },
  {
    id: 'mixset-3',
    title: '🌴 Tropical Sunset',
    description: '해변에서 듣기 좋은 트로피컬 하우스 모음',
    genre: 'Tropical House',
    tracks: [
      { thumbnail: 'https://i.ytimg.com/vi/2ZBtPf7FOoM/hqdefault.jpg', title: 'Lean On' },
      { thumbnail: 'https://i.ytimg.com/vi/dkx9-xJI8BI/hqdefault.jpg', title: 'Ocean' },
    ],
    total_duration: 3156,
    cover_image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    likes_count: 289,
    profiles: {
      display_name: 'BeachVibes',
      username: 'beachvibes',
      avatar_url: 'https://ui-avatars.com/api/?name=BV&background=10B981&color=fff'
    }
  },
  {
    id: 'mixset-4',
    title: '🎹 Lo-Fi Study Session',
    description: '집중력 높여주는 로파이 비트. 공부할 때 틀어두세요.',
    genre: 'Lo-Fi Hip Hop',
    tracks: [
      { thumbnail: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg', title: 'Lofi Girl' },
      { thumbnail: 'https://i.ytimg.com/vi/lTRiuFIWV54/hqdefault.jpg', title: 'Chill Beats' },
    ],
    total_duration: 7200,
    cover_image: 'https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?w=400',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    likes_count: 891,
    profiles: {
      display_name: 'StudyMode',
      username: 'studymode',
      avatar_url: 'https://ui-avatars.com/api/?name=SM&background=A855F7&color=fff'
    }
  }
]

const DUMMY_TRENDING = [
  {
    id: 'trend-1',
    feedType: 'post',
    post_type: 'music',
    user_id: 'dummy-user-t1',
    content: '🔥 이 트랙 진짜 핫함. 요즘 클럽마다 이 노래 안 트는 곳 없음',
    music_title: 'Rumble',
    music_artist: 'Skrillex, Fred again.., Flowdan',
    music_thumbnail: 'https://i.ytimg.com/vi/hXd6u9o6dYY/hqdefault.jpg',
    music_url: 'https://youtube.com/watch?v=hXd6u9o6dYY',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    likes_count: 1247,
    comments_count: 234,
    profiles: {
      display_name: 'ClubCritic',
      username: 'clubcritic',
      avatar_url: 'https://ui-avatars.com/api/?name=CC&background=DC2626&color=fff'
    }
  },
  {
    id: 'trend-2',
    feedType: 'mixset',
    user_id: 'dummy-user-t2',
    title: '🏆 Ultra Korea 2024 Recap',
    description: '울트라 코리아 라이브에서 인상 깊었던 트랙 모음',
    genre: 'EDM / Festival',
    tracks: [
      { thumbnail: 'https://i.ytimg.com/vi/mRD0-GxqHVo/hqdefault.jpg' },
      { thumbnail: 'https://i.ytimg.com/vi/IcrbM1l_BoI/hqdefault.jpg' },
      { thumbnail: 'https://i.ytimg.com/vi/auzfTPp4moA/hqdefault.jpg' },
    ],
    total_duration: 6234,
    cover_image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    likes_count: 2341,
    profiles: {
      display_name: 'FestivalHunter',
      username: 'festivalhunter',
      avatar_url: 'https://ui-avatars.com/api/?name=FH&background=7C3AED&color=fff'
    }
  },
  {
    id: 'trend-3',
    feedType: 'post',
    post_type: 'text',
    user_id: 'dummy-user-t3',
    content: '💿 DJ 시작한 지 1년 됐는데 드디어 첫 정규 공연 잡았어요! Beatflo에서 트랙 찾으면서 공부했는데 정말 도움 많이 됐습니다. 감사해요 여러분 🙏',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    likes_count: 567,
    comments_count: 89,
    profiles: {
      display_name: 'RookieDJ',
      username: 'rookiedj',
      avatar_url: 'https://ui-avatars.com/api/?name=RD&background=059669&color=fff'
    }
  },
  {
    id: 'trend-4',
    feedType: 'favorite',
    user_id: 'dummy-user-t4',
    title: 'One More Time',
    uploader: 'Daft Punk',
    thumbnail: 'https://i.ytimg.com/vi/FGBhQbmPwH8/hqdefault.jpg',
    url: 'https://youtube.com/watch?v=FGBhQbmPwH8',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    likes_count: 4521,
    profiles: {
      display_name: 'ClassicElectronic',
      username: 'classicelectro',
      avatar_url: 'https://ui-avatars.com/api/?name=CE&background=0EA5E9&color=fff'
    }
  }
]

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
    
    if (activeTab === 'feed') {
      const { data } = await getEnhancedCommunityFeed(50, false, user?.id)
      // 실제 데이터가 없으면 더미 데이터 사용
      setFeed((data && data.length > 0) ? data : DUMMY_FEED)
      
      // Check which items are liked by current user
      if (user && data && data.length > 0) {
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
    
    if (activeTab === 'trending') {
      const { data } = await getEnhancedCommunityFeed(50, false, user?.id)
      // 트렌딩은 좋아요순 정렬된 더미 데이터 또는 실제 데이터
      if (data && data.length > 0) {
        const sorted = [...data].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0))
        setFeed(sorted)
      } else {
        setFeed(DUMMY_TRENDING)
      }
    }
    
    if (activeTab === 'mixsets') {
      const { data } = await getPublicMixsets(30)
      // 실제 데이터가 없으면 더미 데이터 사용
      setMixsets((data && data.length > 0) ? data : DUMMY_MIXSETS)
      
      // Check which mixsets are liked by current user
      if (user && data && data.length > 0) {
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
                {/* 탭 설명 헤더 */}
                <div className="tab-intro">
                  {activeTab === 'feed' ? (
                    <>
                      <h2>🎵 커뮤니티 피드</h2>
                      <p>DJ들의 음악 이야기와 새로운 트랙을 발견하세요</p>
                    </>
                  ) : (
                    <>
                      <h2>🔥 지금 인기있는</h2>
                      <p>커뮤니티에서 가장 핫한 트랙과 믹셋</p>
                    </>
                  )}
                </div>
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
                {/* 믹셋 탭 소개 */}
                <div className="tab-intro">
                  <h2>💿 DJ 믹셋</h2>
                  <p>DJ들이 직접 큐레이션한 플레이리스트와 믹셋을 즐겨보세요</p>
                </div>
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
