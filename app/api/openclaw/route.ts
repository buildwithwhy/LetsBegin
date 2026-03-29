import { createClient } from "@supabase/supabase-js";
import { type DagNode, type Task, type Energy, getAllTasks, computeUnlocked, scoreTasks } from "@/lib/dag";

export const maxDuration = 30;

// --- Supabase server client using service key ---

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";
  if (!url || !key) return null;
  return createClient(url, key);
}

// --- Auth: resolve user from x-letsbegin-token header ---
// The token is the user's Supabase access token (JWT).

async function resolveUser(req: Request): Promise<{ userId: string } | null> {
  const token = req.headers.get("x-letsbegin-token");
  if (!token) return null;

  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;

  return { userId: data.user.id };
}

// --- Helpers ---

interface StoredPlan {
  id: string;
  user_id: string;
  brief: string;
  project_title: string;
  summary: string;
  nodes: DagNode[];
  done_ids: string[];
  done_subtask_ids: string[];
  priority?: "high" | "medium" | "low";
  created_at: string;
  updated_at: string;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function err(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

function getPendingTasks(plan: StoredPlan): Task[] {
  const doneSet = new Set(plan.done_ids || []);
  const updated = computeUnlocked(plan.nodes, doneSet);
  const all = getAllTasks(updated);
  return all.filter((t) => t.status === "pending");
}

function getScoredTasks(
  plan: StoredPlan,
  energy: Energy | null = null,
): { task: Task; score: number; reasons: string[] }[] {
  const doneSet = new Set(plan.done_ids || []);
  const updated = computeUnlocked(plan.nodes, doneSet);
  const allTasks = getAllTasks(updated);
  const pending = allTasks.filter((t) => t.status === "pending");
  return scoreTasks(pending, allTasks, energy, plan.priority || "medium");
}

function planSummary(plan: StoredPlan) {
  const allTasks = getAllTasks(plan.nodes);
  const doneCount = (plan.done_ids || []).length;
  const totalCount = allTasks.length;
  const pending = getPendingTasks(plan);
  return {
    id: plan.id,
    project_title: plan.project_title,
    summary: plan.summary,
    total_tasks: totalCount,
    done_tasks: doneCount,
    available_tasks: pending.length,
    progress_pct: totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0,
    updated_at: plan.updated_at,
  };
}

// ── GET: overview of all projects and recommended tasks ──

export async function GET(req: Request) {
  const auth = await resolveUser(req);
  if (!auth) return err("Unauthorized. Provide a valid token in x-letsbegin-token header.", 401);

  const sb = getSupabase()!;
  const { data: plans, error: plansErr } = await sb
    .from("plans")
    .select("*")
    .eq("user_id", auth.userId)
    .order("updated_at", { ascending: false });

  if (plansErr) return err("Failed to load plans: " + plansErr.message, 500);

  const storedPlans = (plans || []) as StoredPlan[];

  if (storedPlans.length === 0) {
    return json({
      ok: true,
      data: {
        projects: [],
        recommended_tasks: [],
        message: "No projects yet. Use quick_capture to create your first plan.",
      },
    });
  }

  // Cross-project scoring: gather all pending tasks with project context
  const allScored: { task: Task; score: number; reasons: string[]; project_id: string; project_title: string }[] = [];
  for (const plan of storedPlans) {
    const scored = getScoredTasks(plan);
    for (const s of scored) {
      allScored.push({
        ...s,
        project_id: plan.id,
        project_title: plan.project_title,
      });
    }
  }
  allScored.sort((a, b) => b.score - a.score);

  return json({
    ok: true,
    data: {
      projects: storedPlans.map(planSummary),
      recommended_tasks: allScored.slice(0, 5).map((s) => ({
        task_id: s.task.id,
        title: s.task.title,
        description: s.task.description,
        project_id: s.project_id,
        project_title: s.project_title,
        energy: s.task.energy,
        assignee: s.task.assignee,
        score: s.score,
        reasons: s.reasons,
      })),
    },
  });
}

// ── POST: actions ──

export async function POST(req: Request) {
  const auth = await resolveUser(req);
  if (!auth) return err("Unauthorized. Provide a valid token in x-letsbegin-token header.", 401);

  const sb = getSupabase()!;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body.");
  }

  const action = body.action as string;
  if (!action) return err("Missing 'action' field. Must be one of: next_task, complete_task, quick_capture, catch_up.");

  // Load all plans for the user (used by most actions)
  const { data: plans, error: plansErr } = await sb
    .from("plans")
    .select("*")
    .eq("user_id", auth.userId)
    .order("updated_at", { ascending: false });

  if (plansErr) return err("Failed to load plans: " + plansErr.message, 500);
  const storedPlans = (plans || []) as StoredPlan[];

  switch (action) {
    case "next_task": {
      if (storedPlans.length === 0) {
        return json({
          ok: true,
          data: { task: null, message: "No projects yet. Use quick_capture to create one." },
        });
      }

      const energy = (body.energy as Energy) || null;
      const allScored: { task: Task; score: number; reasons: string[]; project_id: string; project_title: string }[] = [];
      for (const plan of storedPlans) {
        const scored = getScoredTasks(plan, energy);
        for (const s of scored) {
          allScored.push({ ...s, project_id: plan.id, project_title: plan.project_title });
        }
      }
      allScored.sort((a, b) => b.score - a.score);

      if (allScored.length === 0) {
        return json({
          ok: true,
          data: { task: null, message: "All tasks are either done or blocked. Nice work!" },
        });
      }

      const top = allScored[0];
      return json({
        ok: true,
        data: {
          task: {
            task_id: top.task.id,
            title: top.task.title,
            description: top.task.description,
            project_id: top.project_id,
            project_title: top.project_title,
            energy: top.task.energy,
            assignee: top.task.assignee,
            score: top.score,
            reasons: top.reasons,
          },
        },
      });
    }

    case "complete_task": {
      const taskId = body.task_id as string;
      const projectId = body.project_id as string;
      if (!taskId || !projectId) return err("complete_task requires 'task_id' and 'project_id'.");

      const plan = storedPlans.find((p) => p.id === projectId);
      if (!plan) return err("Project not found.");

      const allTasks = getAllTasks(plan.nodes);
      const task = allTasks.find((t) => t.id === taskId);
      if (!task) return err("Task not found in project.");

      const doneIds = new Set(plan.done_ids || []);
      if (doneIds.has(taskId)) {
        return json({ ok: true, data: { already_done: true, message: `"${task.title}" was already marked done.` } });
      }

      doneIds.add(taskId);
      const { error: updateErr } = await sb
        .from("plans")
        .update({
          done_ids: Array.from(doneIds),
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)
        .eq("user_id", auth.userId);

      if (updateErr) return err("Failed to update: " + updateErr.message, 500);

      // Figure out what's now unlocked
      const updated = computeUnlocked(plan.nodes, doneIds);
      const nowPending = getAllTasks(updated).filter((t) => t.status === "pending" && !doneIds.has(t.id));
      const previouslyPending = getPendingTasks(plan).map((t) => t.id);
      const newlyUnlocked = nowPending.filter((t) => !previouslyPending.includes(t.id));

      return json({
        ok: true,
        data: {
          completed: task.title,
          project_title: plan.project_title,
          newly_unlocked: newlyUnlocked.map((t) => ({ task_id: t.id, title: t.title })),
          message: newlyUnlocked.length > 0
            ? `Done! "${task.title}" is complete. ${newlyUnlocked.length} new task${newlyUnlocked.length > 1 ? "s" : ""} unlocked.`
            : `Done! "${task.title}" is complete.`,
        },
      });
    }

    case "quick_capture": {
      const brief = body.brief as string;
      if (!brief) return err("quick_capture requires a 'brief' field with your project idea.");

      // Call the compile endpoint internally to generate a plan
      const baseUrl = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
      const protocol = req.headers.get("x-forwarded-proto") || "http";
      const compileUrl = `${protocol}://${baseUrl}/api/compile`;

      try {
        const compileRes = await fetch(compileUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief, attachments: [] }),
        });

        if (!compileRes.ok) return err("Failed to generate plan.", 500);

        // Parse the streaming response to extract the final plan
        const text = await compileRes.text();
        const lines = text.split("\n").filter(Boolean);

        let projectTitle = "";
        let summary = "";
        let nodes: DagNode[] = [];

        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.type === "plan") {
              projectTitle = event.plan.project_title || "";
              summary = event.plan.summary || "";
              nodes = event.plan.nodes || [];
            }
          } catch {
            // Skip unparseable lines
          }
        }

        if (!projectTitle || nodes.length === 0) {
          return err("Plan generation did not produce a valid result. Try a more detailed brief.", 500);
        }

        // Save to database
        const { data: newPlan, error: insertErr } = await sb
          .from("plans")
          .insert({
            user_id: auth.userId,
            brief,
            project_title: projectTitle,
            summary,
            nodes,
            done_ids: [],
            done_subtask_ids: [],
          })
          .select()
          .single();

        if (insertErr) return err("Failed to save plan: " + insertErr.message, 500);

        const allTasks = getAllTasks(nodes);
        const pending = getPendingTasks(newPlan as StoredPlan);

        return json({
          ok: true,
          data: {
            project_id: newPlan.id,
            project_title: projectTitle,
            summary,
            total_tasks: allTasks.length,
            ready_to_start: pending.length,
            message: `Created "${projectTitle}" with ${allTasks.length} tasks. ${pending.length} ready to start now.`,
          },
        });
      } catch (e) {
        return err("Failed to create plan: " + String(e), 500);
      }
    }

    case "catch_up": {
      if (storedPlans.length === 0) {
        return json({
          ok: true,
          data: {
            summary: "You have no projects yet. Send me a project idea and I'll plan it out for you.",
            projects: [],
          },
        });
      }

      const projectSummaries = storedPlans.map((plan) => {
        const allTasks = getAllTasks(plan.nodes);
        const doneCount = (plan.done_ids || []).length;
        const totalCount = allTasks.length;
        const pending = getPendingTasks(plan);
        const doneSet = new Set(plan.done_ids || []);
        const blocked = allTasks.filter((t) => t.status === "locked" || (!doneSet.has(t.id) && t.status !== "pending"));

        return {
          project_title: plan.project_title,
          project_id: plan.id,
          progress: `${doneCount}/${totalCount} tasks done (${totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0}%)`,
          available_now: pending.length,
          blocked: blocked.length,
        };
      });

      // Get top 3 recommended tasks across all projects
      const allScored: { task: Task; score: number; reasons: string[]; project_title: string }[] = [];
      for (const plan of storedPlans) {
        const scored = getScoredTasks(plan);
        for (const s of scored) {
          allScored.push({ ...s, project_title: plan.project_title });
        }
      }
      allScored.sort((a, b) => b.score - a.score);

      const totalDone = storedPlans.reduce((sum, p) => sum + (p.done_ids || []).length, 0);
      const totalTasks = storedPlans.reduce((sum, p) => sum + getAllTasks(p.nodes).length, 0);

      return json({
        ok: true,
        data: {
          summary: `${storedPlans.length} active project${storedPlans.length > 1 ? "s" : ""}. ${totalDone}/${totalTasks} tasks done overall (${totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0}%).`,
          projects: projectSummaries,
          focus_next: allScored.slice(0, 3).map((s) => ({
            title: s.task.title,
            project_title: s.project_title,
            reasons: s.reasons,
          })),
        },
      });
    }

    default:
      return err(`Unknown action: "${action}". Must be one of: next_task, complete_task, quick_capture, catch_up.`);
  }
}
