import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hsxxwjmwxhqruidxfkua.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeHh3am13eGhxcnVpZHhma3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3OTM5NjYsImV4cCI6MjA4MTM2OTk2Nn0.sIHdscHtZyJfVlP1PIXKi9MtxAL3K2FQK9-lPX_zKaU'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Auth helpers
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  })
  return { data, error }
}

export const signInWithGithub = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin
    }
  })
  return { data, error }
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Download history
export const saveDownload = async (userId, videoData) => {
  const { data, error } = await supabase
    .from('downloads')
    .insert({
      user_id: userId,
      video_id: videoData.videoId,
      title: videoData.title,
      thumbnail: videoData.thumbnail,
      uploader: videoData.uploader,
      duration: videoData.duration,
      format: videoData.format
    })
  return { data, error }
}

export const getDownloadHistory = async (userId) => {
  const { data, error } = await supabase
    .from('downloads')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  return { data, error }
}

// Favorites
export const addFavorite = async (userId, videoData) => {
  const { data, error } = await supabase
    .from('favorites')
    .insert({
      user_id: userId,
      video_id: videoData.videoId,
      title: videoData.title,
      thumbnail: videoData.thumbnail,
      uploader: videoData.uploader,
      duration: videoData.duration,
      url: videoData.url
    })
  return { data, error }
}

export const removeFavorite = async (userId, videoId) => {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('video_id', videoId)
  return { error }
}

export const getFavorites = async (userId) => {
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return { data, error }
}

export const isFavorite = async (userId, videoId) => {
  const { data, error } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('video_id', videoId)
    .single()
  return { isFavorite: !!data, error }
}

// Recommendation history
export const saveRecommendation = async (userId, sourceVideo, recommendations) => {
  const { data, error } = await supabase
    .from('recommendations')
    .insert({
      user_id: userId,
      source_title: sourceVideo.title,
      source_uploader: sourceVideo.uploader,
      recommendations: recommendations
    })
  return { data, error }
}

export const getRecommendationHistory = async (userId) => {
  const { data, error } = await supabase
    .from('recommendations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  return { data, error }
}

// Setlists (세트리스트)
export const createSetlist = async (userId, setlistData) => {
  const { data, error } = await supabase
    .from('setlists')
    .insert({
      user_id: userId,
      name: setlistData.name,
      description: setlistData.description || '',
      tracks: setlistData.tracks,
      total_duration: setlistData.totalDuration || 0
    })
    .select()
    .single()
  return { data, error }
}

export const getSetlists = async (userId) => {
  const { data, error } = await supabase
    .from('setlists')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  return { data, error }
}

export const getSetlist = async (setlistId) => {
  const { data, error } = await supabase
    .from('setlists')
    .select('*')
    .eq('id', setlistId)
    .single()
  return { data, error }
}

export const updateSetlist = async (setlistId, updates) => {
  const { data, error } = await supabase
    .from('setlists')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', setlistId)
    .select()
    .single()
  return { data, error }
}

export const deleteSetlist = async (setlistId) => {
  const { error } = await supabase
    .from('setlists')
    .delete()
    .eq('id', setlistId)
  return { error }
}

// ==================== COMMUNITY FEATURES ====================

// User Profiles
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return { data, error }
}

export const getProfileByUsername = async (username) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()
  return { data, error }
}

export const updateProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      ...updates,
      updated_at: new Date().toISOString()
    })
    .select()
    .single()
  return { data, error }
}

// Mixsets (Public shareable mixsets)
export const createMixset = async (userId, mixsetData) => {
  const { data, error } = await supabase
    .from('mixsets')
    .insert({
      user_id: userId,
      title: mixsetData.title,
      description: mixsetData.description || '',
      tracks: mixsetData.tracks,
      total_duration: mixsetData.totalDuration || 0,
      genre: mixsetData.genre || '',
      cover_image: mixsetData.coverImage || mixsetData.tracks[0]?.thumbnail,
      is_public: mixsetData.isPublic !== false
    })
    .select()
    .single()
  return { data, error }
}

export const getMixsets = async (userId) => {
  const { data, error } = await supabase
    .from('mixsets')
    .select(`
      *,
      profiles:user_id (username, avatar_url, display_name)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return { data, error }
}

export const getPublicMixsets = async (limit = 20) => {
  const { data, error } = await supabase
    .from('mixsets')
    .select(`
      *,
      profiles:user_id (username, avatar_url, display_name)
    `)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

export const getMixset = async (mixsetId) => {
  const { data, error } = await supabase
    .from('mixsets')
    .select(`
      *,
      profiles:user_id (username, avatar_url, display_name)
    `)
    .eq('id', mixsetId)
    .single()
  return { data, error }
}

export const likeMixset = async (userId, mixsetId) => {
  const { data, error } = await supabase
    .from('mixset_likes')
    .insert({
      user_id: userId,
      mixset_id: mixsetId
    })
  
  if (!error) {
    // Increment like count
    await supabase.rpc('increment_mixset_likes', { mixset_id: mixsetId })
  }
  return { data, error }
}

export const unlikeMixset = async (userId, mixsetId) => {
  const { error } = await supabase
    .from('mixset_likes')
    .delete()
    .eq('user_id', userId)
    .eq('mixset_id', mixsetId)
  
  if (!error) {
    // Decrement like count
    await supabase.rpc('decrement_mixset_likes', { mixset_id: mixsetId })
  }
  return { error }
}

export const isMixsetLiked = async (userId, mixsetId) => {
  const { data } = await supabase
    .from('mixset_likes')
    .select('id')
    .eq('user_id', userId)
    .eq('mixset_id', mixsetId)
    .single()
  return !!data
}

// Comments
export const addComment = async (userId, targetType, targetId, content, parentId = null) => {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      user_id: userId,
      target_type: targetType, // 'mixset', 'favorite', 'download'
      target_id: targetId,
      content,
      parent_id: parentId
    })
    .select(`
      *,
      profiles:user_id (username, avatar_url, display_name)
    `)
    .single()
  return { data, error }
}

export const getComments = async (targetType, targetId) => {
  const { data, error } = await supabase
    .from('comments')
    .select(`
      *,
      profiles:user_id (username, avatar_url, display_name)
    `)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: true })
  return { data, error }
}

export const deleteComment = async (commentId, userId) => {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId)
  return { error }
}

// Community Feed
export const getCommunityFeed = async (limit = 30) => {
  // Get public favorites, downloads, and mixsets
  const [favoritesResult, mixsetsResult] = await Promise.all([
    supabase
      .from('favorites')
      .select(`
        *,
        profiles:user_id (username, avatar_url, display_name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('mixsets')
      .select(`
        *,
        profiles:user_id (username, avatar_url, display_name)
      `)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit)
  ])
  
  // Combine and sort by date
  const feed = [
    ...(favoritesResult.data || []).map(item => ({ ...item, type: 'favorite' })),
    ...(mixsetsResult.data || []).map(item => ({ ...item, type: 'mixset' }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  
  return { data: feed.slice(0, limit), error: null }
}

// User Feed (personal activity)
export const getUserFeed = async (userId, limit = 30) => {
  const [favoritesResult, downloadsResult, mixsetsResult] = await Promise.all([
    supabase
      .from('favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('downloads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('mixsets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
  ])
  
  const feed = [
    ...(favoritesResult.data || []).map(item => ({ ...item, type: 'favorite' })),
    ...(downloadsResult.data || []).map(item => ({ ...item, type: 'download' })),
    ...(mixsetsResult.data || []).map(item => ({ ...item, type: 'mixset' }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  
  return { data: feed.slice(0, limit), error: null }
}

// Similar Users (based on shared favorites)
export const getSimilarUsers = async (userId, limit = 10) => {
  // Get user's favorite video IDs
  const { data: userFavorites } = await supabase
    .from('favorites')
    .select('video_id')
    .eq('user_id', userId)
  
  if (!userFavorites || userFavorites.length === 0) {
    return { data: [], error: null }
  }
  
  const videoIds = userFavorites.map(f => f.video_id)
  
  // Find users who also liked these videos
  const { data: similarFavorites } = await supabase
    .from('favorites')
    .select(`
      user_id,
      profiles:user_id (id, username, avatar_url, display_name)
    `)
    .in('video_id', videoIds)
    .neq('user_id', userId)
  
  if (!similarFavorites) {
    return { data: [], error: null }
  }
  
  // Count matches per user
  const userMatches = {}
  similarFavorites.forEach(fav => {
    if (!fav.profiles) return
    const uid = fav.user_id
    if (!userMatches[uid]) {
      userMatches[uid] = {
        ...fav.profiles,
        matchCount: 0
      }
    }
    userMatches[uid].matchCount++
  })
  
  // Sort by match count and return top users
  const similarUsers = Object.values(userMatches)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, limit)
  
  return { data: similarUsers, error: null }
}

// Follow system
export const followUser = async (followerId, followingId) => {
  const { data, error } = await supabase
    .from('follows')
    .insert({
      follower_id: followerId,
      following_id: followingId
    })
  return { data, error }
}

export const unfollowUser = async (followerId, followingId) => {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
  return { error }
}

export const isFollowing = async (followerId, followingId) => {
  const { data } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single()
  return !!data
}

export const getFollowers = async (userId) => {
  const { data, error } = await supabase
    .from('follows')
    .select(`
      follower:follower_id (id, username, avatar_url, display_name)
    `)
    .eq('following_id', userId)
  return { data: data?.map(f => f.follower) || [], error }
}

export const getFollowing = async (userId) => {
  const { data, error } = await supabase
    .from('follows')
    .select(`
      following:following_id (id, username, avatar_url, display_name)
    `)
    .eq('follower_id', userId)
  return { data: data?.map(f => f.following) || [], error }
}

// User stats
export const getUserStats = async (userId) => {
  const [favorites, downloads, mixsets, followers, following, posts] = await Promise.all([
    supabase.from('favorites').select('id', { count: 'exact' }).eq('user_id', userId),
    supabase.from('downloads').select('id', { count: 'exact' }).eq('user_id', userId),
    supabase.from('mixsets').select('id', { count: 'exact' }).eq('user_id', userId),
    supabase.from('follows').select('id', { count: 'exact' }).eq('following_id', userId),
    supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', userId),
    supabase.from('posts').select('id', { count: 'exact' }).eq('user_id', userId)
  ])
  
  return {
    favorites: favorites.count || 0,
    downloads: downloads.count || 0,
    mixsets: mixsets.count || 0,
    followers: followers.count || 0,
    following: following.count || 0,
    posts: posts.count || 0
  }
}

// ==================== POSTS SYSTEM ====================

// Create a new post
export const createPost = async (userId, postData) => {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      post_type: postData.postType || 'text',
      content: postData.content,
      video_id: postData.videoId,
      music_title: postData.musicTitle,
      music_artist: postData.musicArtist,
      music_thumbnail: postData.musicThumbnail,
      music_url: postData.musicUrl,
      music_duration: postData.musicDuration,
      media_urls: postData.mediaUrls,
      media_type: postData.mediaType,
      mixset_id: postData.mixsetId,
      activity_type: postData.activityType,
      is_public: postData.isPublic !== false
    })
    .select(`
      *,
      profiles:user_id (id, username, avatar_url, display_name)
    `)
    .single()
  return { data, error }
}

// Get posts feed (community or following)
export const getPostsFeed = async (options = {}) => {
  const { limit = 30, offset = 0, userId = null, followingOnly = false } = options
  
  let query = supabase
    .from('posts')
    .select(`
      *,
      profiles:user_id (id, username, avatar_url, display_name)
    `)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  
  if (followingOnly && userId) {
    // Get following IDs first
    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
    
    if (following && following.length > 0) {
      const followingIds = following.map(f => f.following_id)
      query = query.in('user_id', followingIds)
    }
  }
  
  const { data, error } = await query
  return { data, error }
}

// Get user's posts
export const getUserPosts = async (userId, limit = 30) => {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      profiles:user_id (id, username, avatar_url, display_name)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

// Get single post
export const getPost = async (postId) => {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      profiles:user_id (id, username, avatar_url, display_name)
    `)
    .eq('id', postId)
    .single()
  return { data, error }
}

// Update post
export const updatePost = async (postId, userId, updates) => {
  const { data, error } = await supabase
    .from('posts')
    .update({
      content: updates.content,
      is_public: updates.isPublic,
      updated_at: new Date().toISOString()
    })
    .eq('id', postId)
    .eq('user_id', userId)
    .select()
    .single()
  return { data, error }
}

// Delete post
export const deletePost = async (postId, userId) => {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', userId)
  return { error }
}

// Like a post
export const likePost = async (userId, postId) => {
  const { data, error } = await supabase
    .from('post_likes')
    .insert({
      user_id: userId,
      post_id: postId
    })
  
  if (!error) {
    await supabase.rpc('increment_post_likes', { post_id: postId })
  }
  return { data, error }
}

// Unlike a post
export const unlikePost = async (userId, postId) => {
  const { error } = await supabase
    .from('post_likes')
    .delete()
    .eq('user_id', userId)
    .eq('post_id', postId)
  
  if (!error) {
    await supabase.rpc('decrement_post_likes', { post_id: postId })
  }
  return { error }
}

// Check if post is liked
export const isPostLiked = async (userId, postId) => {
  const { data } = await supabase
    .from('post_likes')
    .select('id')
    .eq('user_id', userId)
    .eq('post_id', postId)
    .single()
  return !!data
}

// Get post likes
export const getPostLikes = async (postId) => {
  const { data, error } = await supabase
    .from('post_likes')
    .select(`
      *,
      profiles:user_id (id, username, avatar_url, display_name)
    `)
    .eq('post_id', postId)
  return { data, error }
}

// Add comment to post
export const addPostComment = async (userId, postId, content, parentId = null) => {
  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      user_id: userId,
      post_id: postId,
      content,
      parent_id: parentId
    })
    .select(`
      *,
      profiles:user_id (id, username, avatar_url, display_name)
    `)
    .single()
  
  if (!error) {
    await supabase.rpc('increment_post_comments', { post_id: postId })
  }
  return { data, error }
}

// Get post comments
export const getPostComments = async (postId) => {
  const { data, error } = await supabase
    .from('post_comments')
    .select(`
      *,
      profiles:user_id (id, username, avatar_url, display_name)
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  return { data, error }
}

// Delete post comment
export const deletePostComment = async (commentId, userId, postId) => {
  const { error } = await supabase
    .from('post_comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId)
  
  if (!error) {
    await supabase.rpc('decrement_post_comments', { post_id: postId })
  }
  return { error }
}

// ==================== MEDIA UPLOAD ====================

// Upload media to Supabase Storage
export const uploadMedia = async (userId, file, bucket = 'post-media') => {
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    })
  
  if (error) {
    return { url: null, error }
  }
  
  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName)
  
  return { url: publicUrl, error: null }
}

// Upload multiple media files
export const uploadMultipleMedia = async (userId, files, bucket = 'post-media') => {
  const results = await Promise.all(
    files.map(file => uploadMedia(userId, file, bucket))
  )
  
  const urls = results.filter(r => r.url).map(r => r.url)
  const errors = results.filter(r => r.error).map(r => r.error)
  
  return { urls, errors: errors.length > 0 ? errors : null }
}

// Delete media from storage
export const deleteMedia = async (url, bucket = 'post-media') => {
  // Extract path from URL
  const urlObj = new URL(url)
  const path = urlObj.pathname.split(`/${bucket}/`)[1]
  
  if (!path) return { error: 'Invalid URL' }
  
  const { error } = await supabase.storage
    .from(bucket)
    .remove([path])
  
  return { error }
}

// ==================== ENHANCED COMMUNITY FEED ====================

// Get enhanced community feed with posts, favorites, and mixsets
export const getEnhancedCommunityFeed = async (limit = 30, followingOnly = false, userId = null) => {
  // Get posts
  const postsResult = await getPostsFeed({ limit, followingOnly, userId })
  
  // Get recent public favorites
  const { data: favoritesData } = await supabase
    .from('favorites')
    .select(`
      *,
      profiles:user_id (id, username, avatar_url, display_name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  // Get recent public mixsets
  const { data: mixsetsData } = await supabase
    .from('mixsets')
    .select(`
      *,
      profiles:user_id (id, username, avatar_url, display_name)
    `)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  // Combine all items
  const posts = (postsResult.data || []).map(item => ({ ...item, feedType: 'post' }))
  const favorites = (favoritesData || []).map(item => ({ ...item, feedType: 'favorite' }))
  const mixsets = (mixsetsData || []).map(item => ({ ...item, feedType: 'mixset' }))
  
  // Merge and sort by date
  const feed = [...posts, ...favorites, ...mixsets]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
  
  return { data: feed, error: null }
}

// Share music as a post (listened/liked)
export const shareMusicAsPost = async (userId, musicData, activityType = 'listened', content = '') => {
  return createPost(userId, {
    postType: 'music',
    content,
    videoId: musicData.videoId,
    musicTitle: musicData.title,
    musicArtist: musicData.uploader || musicData.artist,
    musicThumbnail: musicData.thumbnail,
    musicUrl: musicData.url,
    musicDuration: musicData.duration,
    activityType
  })
}

// Share mixset as a post
export const shareMixsetAsPost = async (userId, mixsetId, content = '') => {
  return createPost(userId, {
    postType: 'mixset_share',
    content,
    mixsetId,
    activityType: 'shared'
  })
}

