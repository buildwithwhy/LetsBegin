import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Types mirrored from the main app's lib/dag.ts
export type Energy = "high" | "medium" | "low";
export type Assignee = "agent" | "user" | "hybrid";
export type Status = "locked" | "pending" | "done" | "skipped";
export type AgentType = "builtin" | "claude-code" | "custom";
export type ActionType = "draft" | "post" | "send" | "deploy" | "research" | "review" | "build" | "decide";

export interface Subtask {
  id: string;
  title: string;
  assignee: "agent" | "user";
  depends_on: string[];
  parallel_with?: string[];
}

export interface Task {
  id: string;
  type: "task";
  title: string;
  description: string;
  assignee: Assignee;
  energy: Energy;
  status: Status;
  depends_on: string[];
  subtasks?: Subtask[];
  agent_type?: AgentType;
  action_type?: ActionType;
  has_wait_after?: boolean;
  wait_type?: "response" | "build" | "approval" | "processing" | "shipping" | "other";
  estimated_wait?: "minutes" | "hours" | "days" | "weeks";
  deadline?: string;
  notes?: string;
  started_at?: string;
  completed_at?: string;
}

export interface ParallelGroup {
  id: string;
  type: "parallel_group";
  children: Task[];
  status: Status;
  depends_on: string[];
}

export type DagNode = Task | ParallelGroup;

export interface Plan {
  project_title: string;
  summary: string;
  nodes: DagNode[];
}

export interface StoredPlan {
  id: string;
  user_id: string;
  brief: string;
  project_title: string;
  summary: string;
  nodes: DagNode[];
  done_ids: string[];
  done_subtask_ids: string[];
  created_at: string;
  updated_at: string;
}

// --- Supabase client ---

function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) environment variables."
    );
  }

  return createClient(url, key);
}

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!_client) {
    _client = getSupabaseClient();
  }
  return _client;
}

// --- Queries ---

export async function listAllPlans(): Promise<StoredPlan[]> {
  const { data, error } = await supabase()
    .from("plans")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to list plans: ${error.message}`);
  return (data || []) as StoredPlan[];
}

export async function getPlanById(id: string): Promise<StoredPlan | null> {
  const { data, error } = await supabase()
    .from("plans")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw new Error(`Failed to get plan: ${error.message}`);
  }
  return data as StoredPlan;
}

export async function updatePlan(
  id: string,
  updates: Partial<Pick<StoredPlan, "nodes" | "done_ids" | "done_subtask_ids">>
): Promise<StoredPlan> {
  const { data, error } = await supabase()
    .from("plans")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update plan: ${error.message}`);
  return data as StoredPlan;
}
