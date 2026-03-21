import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

// Create a dummy client if env vars aren't set (build time / no Supabase)
export const supabase: SupabaseClient = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : createClient("https://placeholder.supabase.co", "placeholder-key");

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// SQL to run in Supabase dashboard (SQL Editor):
//
// create table plans (
//   id uuid default gen_random_uuid() primary key,
//   user_id uuid references auth.users(id) on delete cascade not null,
//   brief text not null,
//   project_title text,
//   summary text,
//   nodes jsonb not null default '[]',
//   done_ids text[] not null default '{}',
//   done_subtask_ids text[] not null default '{}',
//   created_at timestamptz default now(),
//   updated_at timestamptz default now()
// );
//
// alter table plans enable row level security;
//
// create policy "Users can read own plans"
//   on plans for select using (auth.uid() = user_id);
//
// create policy "Users can insert own plans"
//   on plans for insert with check (auth.uid() = user_id);
//
// create policy "Users can update own plans"
//   on plans for update using (auth.uid() = user_id);
//
// create policy "Users can delete own plans"
//   on plans for delete using (auth.uid() = user_id);
