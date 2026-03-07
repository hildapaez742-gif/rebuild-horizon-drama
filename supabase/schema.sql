-- 重建地平线·短剧编剧台 数据表
-- 在 Supabase SQL Editor 中运行此文件

-- 项目表
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  name text not null default '未命名项目',
  status text not null default 'topic' check (status in ('topic','creating','writing','done')),
  target_platform text default 'douyin',
  context jsonb default '{}'::jsonb,
  outline jsonb default '{"characters":[],"emotion_wave":[],"payment_hooks":[],"twists":[],"confirmed":false}'::jsonb,
  messages jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 单集表
create table if not exists episodes (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  index int not null,
  content text default '',
  status text default 'pending' check (status in ('pending','generated','edited')),
  consistency_score real default 0,
  audit_flags jsonb default '[]'::jsonb,
  hook_type text default '',
  created_at timestamptz default now()
);

-- 物料表
create table if not exists materials (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade unique,
  titles jsonb default '[]'::jsonb,
  synopsis jsonb default '{}'::jsonb,
  episode_titles jsonb default '[]'::jsonb,
  promo_copies jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 索引
create index if not exists idx_projects_user on projects(user_id);
create index if not exists idx_episodes_project on episodes(project_id);

-- RLS 策略 (允许匿名访问，团队内部使用)
alter table projects enable row level security;
alter table episodes enable row level security;
alter table materials enable row level security;

create policy "Allow all on projects" on projects for all using (true) with check (true);
create policy "Allow all on episodes" on episodes for all using (true) with check (true);
create policy "Allow all on materials" on materials for all using (true) with check (true);
