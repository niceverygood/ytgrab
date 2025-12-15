-- YTGrab Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Downloads table (다운로드 기록)
create table if not exists downloads (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  video_id text not null,
  title text not null,
  thumbnail text,
  uploader text,
  duration integer,
  format text default 'mp4',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Favorites table (즐겨찾기)
create table if not exists favorites (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  video_id text not null,
  title text not null,
  thumbnail text,
  uploader text,
  duration integer,
  url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, video_id)
);

-- Recommendations table (추천 기록)
create table if not exists recommendations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  source_title text not null,
  source_uploader text,
  recommendations jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Row Level Security (RLS) 활성화
alter table downloads enable row level security;
alter table favorites enable row level security;
alter table recommendations enable row level security;

-- RLS Policies for downloads
create policy "Users can view own downloads"
  on downloads for select
  using (auth.uid() = user_id);

create policy "Users can insert own downloads"
  on downloads for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own downloads"
  on downloads for delete
  using (auth.uid() = user_id);

-- RLS Policies for favorites
create policy "Users can view own favorites"
  on favorites for select
  using (auth.uid() = user_id);

create policy "Users can insert own favorites"
  on favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
  on favorites for delete
  using (auth.uid() = user_id);

-- RLS Policies for recommendations
create policy "Users can view own recommendations"
  on recommendations for select
  using (auth.uid() = user_id);

create policy "Users can insert own recommendations"
  on recommendations for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own recommendations"
  on recommendations for delete
  using (auth.uid() = user_id);

-- Indexes for better performance
create index if not exists downloads_user_id_idx on downloads(user_id);
create index if not exists downloads_created_at_idx on downloads(created_at desc);
create index if not exists favorites_user_id_idx on favorites(user_id);
create index if not exists favorites_video_id_idx on favorites(video_id);
create index if not exists recommendations_user_id_idx on recommendations(user_id);
create index if not exists recommendations_created_at_idx on recommendations(created_at desc);

