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

