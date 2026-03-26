"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  type Plan,
  type DagNode,
  type Task,
  type Energy,
  type Assignee,
  type AgentType,
  type ActivityEvent,
  type TaskCategory,
  type ProjectPriority,
  getAllTasks,
  computeUnlocked,
  scoreTasks,
} from "@/lib/dag";
import { useAgentExecutor } from "@/hooks/useAgentExecutor";
import { useAuth } from "@/hooks/useAuth";
import { usePlanStorage } from "@/hooks/usePlanStorage";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { templates, type ProjectTemplate } from "@/lib/templates";
import {
  PRIMARY, BORDER, TEXT, TEXT_LIGHT, SURFACE, ENERGY_COLORS,
  type ExecutionMode, type Step, type ClarifyQuestion, type PriorResult,
  type UserToolConfig, type UserTool, TOOL_CAPABILITIES,
} from "@/lib/styles";
import { Header } from "@/components/Header";
import { ThinkingTerminal } from "@/components/ThinkingTerminal";
import { TaskCard, CATEGORY_ICONS, inferCategory } from "@/components/TaskCard";
import { DagView } from "@/components/DagView";
import { WelcomeBack } from "@/components/WelcomeBack";

export default function Home() {
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, signOut, configured: authConfigured } = useAuth();
  const { savePlan, loadPlans, deletePlan } = usePlanStorage(user?.id);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("dashboard");
  const [savedPlans, setSavedPlans] = useState<{ id: string; brief: string; project_title: string; summary: string; nodes: DagNode[]; done_ids: string[]; done_subtask_ids: string[]; priority: ProjectPriority; created_at: string; updated_at: string }[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [brief, setBrief] = useState("");
  const voiceInput = useVoiceInput(useCallback((text: string) => {
    setBrief((prev) => prev + (prev ? " " : "") + text);
  }, []));
  const [attachments, setAttachments] = useState<{ name: string; dataUrl: string }[]>([]);
  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [clarifyError, setClarifyError] = useState("");
  const [compileError, setCompileError] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [revealMode, setRevealMode] = useState<"onething" | "project">("onething");
  const [thinkingText, setThinkingText] = useState("");
  const [compileStatus, setCompileStatus] = useState("");
  const [compileStartTime, setCompileStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [energyFilter, setEnergyFilter] = useState<Energy | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<Assignee | "all">("all");
  const [doneSubtaskIds, setDoneSubtaskIds] = useState<Set<string>>(new Set());
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("letsbegin-execution-mode");
      if (saved === "api" || saved === "byo") return saved;
    }
    return "api";
  });
  const [userTools, setUserTools] = useState<UserToolConfig>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("letsbegin-user-tools");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { available: [] };
  });
  const [justMeMode, setJustMeMode] = useState(false);
  const [currentEnergy, setCurrentEnergy] = useState<Energy | null>(null);
  const [streak, setStreak] = useState(0);
  const [lastCompletedAt, setLastCompletedAt] = useState<number | null>(null);
  const [showEncouragement, setShowEncouragement] = useState<string | null>(null);
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const [undoToast, setUndoToast] = useState<{ id: string; title: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState<Assignee>("user");
  const [newTaskEnergy, setNewTaskEnergy] = useState<Energy>("medium");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [lastVisitAt, setLastVisitAt] = useState<number | null>(null);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [projectPriority, setProjectPriority] = useState<ProjectPriority>("medium");
  const [focusCategory, setFocusCategory] = useState<TaskCategory | "all">("all");
  const [detourDismissed, setDetourDismissed] = useState(false);

  const { execute, results, running, runningCount } = useAgentExecutor();

  // Load saved plans for dashboard
  useEffect(() => {
    if (user && step === "dashboard") {
      setDashboardLoading(true);
      loadPlans().then((plans) => {
        setSavedPlans(plans);
        setDashboardLoading(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, step]);

  // Persist userTools to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("letsbegin-user-tools", JSON.stringify(userTools));
    }
  }, [userTools]);

  // Persist executionMode to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("letsbegin-execution-mode", executionMode);
    }
  }, [executionMode]);

  const loadSavedPlan = useCallback((saved: typeof savedPlans[0]) => {
    setBrief(saved.brief);
    setPlan({
      project_title: saved.project_title,
      summary: saved.summary,
      nodes: saved.nodes,
    });
    setDoneIds(new Set(saved.done_ids));
    setDoneSubtaskIds(new Set(saved.done_subtask_ids));
    setSavedPlanId(saved.id);
    setProjectPriority(saved.priority || "medium");
    setFocusCategory("all");
    setDetourDismissed(false);
    // Read last visit timestamp for welcome-back recap
    const visitKey = `letsbegin-last-visit-${saved.id}`;
    const storedVisit = localStorage.getItem(visitKey);
    if (storedVisit) {
      const ts = parseInt(storedVisit, 10);
      const minutesAway = (Date.now() - ts) / 60000;
      setLastVisitAt(ts);
      setShowWelcomeBack(minutesAway >= 30);
    } else {
      setLastVisitAt(null);
      setShowWelcomeBack(false);
    }
    // Update last visit timestamp to now
    localStorage.setItem(visitKey, String(Date.now()));
    setStep("reveal");
  }, []);

  const startFromTemplate = useCallback((template: ProjectTemplate) => {
    setBrief(template.brief);
    if (template.justMeDefault) setJustMeMode(true);
    setStep("input");
  }, []);

  const startNewProject = useCallback(() => {
    if (plan && !confirm("Start a new project? Your current progress is saved.")) return;
    setBrief("");
    setPlan(null);
    setDoneIds(new Set());
    setDoneSubtaskIds(new Set());
    setSavedPlanId(null);
    setJustMeMode(false);
    setCurrentEnergy(null);
    setStreak(0);
    setShowBreakReminder(false);
    setFocusCategory("all");
    setDetourDismissed(false);
    setProjectPriority("medium");
    setStep("input");
  }, [plan]);

  const goToDashboard = useCallback(() => {
    setStep("dashboard");
  }, []);

  // Elapsed timer for compiling phase
  useEffect(() => {
    if (compileStartTime === null) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - compileStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [compileStartTime]);

  const allTasks = plan ? getAllTasks(plan.nodes) : [];
  const total = allTasks.length;
  const doneCount = allTasks.filter((t) => doneIds.has(t.id)).length;

  const currentNodes = plan ? computeUnlocked(plan.nodes, doneIds) : [];

  // Welcome-back recap data
  const welcomeBackData = useMemo(() => {
    if (!showWelcomeBack || !lastVisitAt || !plan) return null;
    const minutesAway = (Date.now() - lastVisitAt) / 60000;
    if (minutesAway < 30) return null;
    const tasks = getAllTasks(plan.nodes);
    const completedTasks = tasks.filter((t) => doneIds.has(t.id)).length;
    // Find tasks completed since last visit
    const completedSinceVisit = tasks.filter(
      (t) => t.completed_at && new Date(t.completed_at).getTime() > lastVisitAt
    );
    const lastCompleted = completedSinceVisit.sort(
      (a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()
    )[0];
    // Agent tasks that completed while away
    const agentCompletedTitles = completedSinceVisit
      .filter((t) => t.assignee === "agent")
      .map((t) => t.title);
    // Next task from scoring
    const unlocked = computeUnlocked(plan.nodes, doneIds);
    const pendingTasks = getAllTasks(unlocked).filter((t) => t.status === "pending");
    const pendingHuman = pendingTasks.filter((t) => t.assignee === "user" || t.assignee === "hybrid");
    const scored = scoreTasks(
      pendingHuman.length > 0 ? pendingHuman : pendingTasks,
      tasks,
      currentEnergy,
      projectPriority,
    );
    const topPriority = scored[0];
    return {
      minutesAway,
      totalTasks: tasks.length,
      completedTasks,
      lastCompletedTitle: lastCompleted?.title,
      nextTaskTitle: topPriority?.task.title,
      nextTaskReason: topPriority?.reasons[0],
      agentCompletedTitles,
    };
  }, [showWelcomeBack, lastVisitAt, plan, doneIds, currentEnergy, projectPriority]);

  // Encouragement messages for completing tasks
  const encouragements = [
    "Nice work! One down.",
    "You're making progress.",
    "That's done. On to the next.",
    "Steady progress. Keep going.",
    "Another one handled.",
    "You're on a roll.",
    "Well done. Take a breath if you need.",
    "That wasn't so bad, right?",
    "Progress feels good.",
    "One step closer.",
  ];
  const streakEncouragements = [
    "", // 0
    "", // 1
    "Two in a row!", // 2
    "Three tasks done. You're in the zone.", // 3
    "Four! Seriously impressive focus.", // 4
    "Five tasks straight. Consider a break soon.", // 5
  ];

  const markDone = useCallback(
    (id: string, notes?: string) => {
      setDoneIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      // Update plan with completion timestamp, notes, and activity
      setPlan((prev) => {
        if (!prev) return prev;
        const now = new Date().toISOString();
        const updateTask = (t: Task): Task => {
          if (t.id !== id) return t;
          const activity: ActivityEvent[] = [...(t.activity || []), { type: "completed", at: now }];
          if (notes) activity.splice(activity.length - 1, 0, { type: "note", text: notes, at: now });
          return { ...t, completed_at: now, notes: notes || t.notes, activity };
        };
        return {
          ...prev,
          nodes: prev.nodes.map((n): DagNode =>
            n.type === "task" ? updateTask(n) : { ...n, children: n.children.map(updateTask) }
          ),
        };
      });
      // Streak and encouragement tracking
      const now = Date.now();
      setStreak((prev) => {
        const newStreak = prev + 1;
        // Show break reminder after 5+ tasks
        if (newStreak >= 5) setShowBreakReminder(true);
        return newStreak;
      });
      setLastCompletedAt(now);
      // Pick an encouragement message
      setShowEncouragement(encouragements[Math.floor(Math.random() * encouragements.length)]);
      setTimeout(() => setShowEncouragement(null), 3000);
      // Show undo toast
      const task = allTasks.find((t) => t.id === id);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoToast({ id, title: task?.title || id });
      undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks]
  );

  const unmarkDone = useCallback((id: string) => {
    setDoneIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setPlan((prev) => {
      if (!prev) return prev;
      const updateTask = (t: Task): Task => {
        if (t.id !== id) return t;
        return { ...t, completed_at: undefined };
      };
      return {
        ...prev,
        nodes: prev.nodes.map((n): DagNode =>
          n.type === "task" ? updateTask(n) : { ...n, children: n.children.map(updateTask) }
        ),
      };
    });
    setUndoToast(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  const addNewTask = useCallback((title: string, description: string, assignee: Assignee, energy: Energy, deadline?: string) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const newTask: Task = {
        id: `custom-${Date.now()}`,
        type: "task",
        title,
        description,
        assignee,
        energy,
        status: "pending",
        depends_on: [],
        agent_type: assignee === "agent" ? "builtin" : undefined,
        deadline: deadline || undefined,
      };
      return { ...prev, nodes: [...prev.nodes, newTask] };
    });
  }, []);

  const editTask = useCallback((taskId: string, updates: { title?: string; description?: string; assignee?: Assignee; agent_type?: AgentType; deadline?: string }) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const updateTask = (t: Task): Task => {
        if (t.id !== taskId) return t;
        return { ...t, ...updates };
      };
      return {
        ...prev,
        nodes: prev.nodes.map((n): DagNode =>
          n.type === "task" ? updateTask(n) : { ...n, children: n.children.map(updateTask) }
        ),
      };
    });
  }, []);

  const addNote = useCallback((taskId: string, note: string) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const updateTask = (t: Task): Task => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          notes: note,
          activity: [...(t.activity || []), { type: "note" as const, text: note, at: now }],
        };
      };
      return {
        ...prev,
        nodes: prev.nodes.map((n): DagNode =>
          n.type === "task" ? updateTask(n) : { ...n, children: n.children.map(updateTask) }
        ),
      };
    });
  }, []);

  const toggleSubtask = useCallback((subtaskId: string) => {
    setDoneSubtaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(subtaskId)) next.delete(subtaskId);
      else next.add(subtaskId);
      return next;
    });
  }, []);

  // Track which agent tasks we've already kicked off
  const launchedAgentTasks = useRef<Set<string>>(new Set());

  // Auto-complete agent tasks when result is done
  useEffect(() => {
    for (const [taskId, result] of Object.entries(results)) {
      if (result.done && !result.error) {
        const task = allTasks.find((t) => t.id === taskId);
        if (task && task.assignee === "agent" && !doneIds.has(taskId)) {
          markDone(taskId);
        }
      }
    }
  }, [results, allTasks, doneIds, markDone]);

  // Auto-complete tasks when all subtasks are checked
  useEffect(() => {
    for (const task of allTasks) {
      if (doneIds.has(task.id)) continue;
      if (!task.subtasks || task.subtasks.length === 0) continue;
      const allSubtasksDone = task.subtasks.every((st) => doneSubtaskIds.has(st.id));
      if (allSubtasksDone) {
        markDone(task.id);
      }
    }
  }, [doneSubtaskIds, allTasks, doneIds, markDone]);

  // Auto-save plan and progress to Supabase
  useEffect(() => {
    if (!plan || !user) return;
    const timeout = setTimeout(() => {
      savePlan(brief, plan, doneIds, doneSubtaskIds, projectPriority).then((result) => {
        if (result?.id && !savedPlanId) setSavedPlanId(result.id);
      });
    }, 1000); // Debounce 1s
    return () => clearTimeout(timeout);
  }, [plan, doneIds, doneSubtaskIds, user, brief, savePlan, savedPlanId, projectPriority]);

  // Save last visit timestamp for new plans once savedPlanId is assigned
  useEffect(() => {
    if (!savedPlanId || step !== "reveal") return;
    const visitKey = `letsbegin-last-visit-${savedPlanId}`;
    if (!localStorage.getItem(visitKey)) {
      localStorage.setItem(visitKey, String(Date.now()));
    }
  }, [savedPlanId, step]);

  // Auto-run agent tasks when they become unblocked (API mode only)
  const currentTasksForAutoRun = getAllTasks(currentNodes);
  useEffect(() => {
    if (step !== "reveal" || !plan || executionMode === "byo") return;

    for (const task of currentTasksForAutoRun) {
      if (
        task.assignee === "agent" &&
        task.status === "pending" &&
        !results[task.id] &&
        !launchedAgentTasks.current.has(task.id)
      ) {
        launchedAgentTasks.current.add(task.id);
        // Stagger launches slightly to avoid hammering the API
        const agentType = task.agent_type;
        setTimeout(() => {
          execute(task.id, task.title, task.description, plan?.summary || brief, task.assignee, false, agentType);
        }, launchedAgentTasks.current.size * 500);
      }
    }
  }, [currentTasksForAutoRun, step, plan, results, execute, brief, executionMode]);

  const handleRunAgent = (task: Task, force?: boolean) => {
    launchedAgentTasks.current.add(task.id);
    // Track activity
    setPlan((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const updateTask = (t: Task): Task => {
        if (t.id !== task.id) return t;
        const event: ActivityEvent = { type: "agent_started", agent: t.agent_type || "builtin", model: "", at: now };
        return { ...t, started_at: t.started_at || now, activity: [...(t.activity || []), event] };
      };
      return {
        ...prev,
        nodes: prev.nodes.map((n): DagNode =>
          n.type === "task" ? updateTask(n) : { ...n, children: n.children.map(updateTask) }
        ),
      };
    });
    execute(task.id, task.title, task.description, plan?.summary || brief, task.assignee, force, task.agent_type);
  };

  const handleDecompose = useCallback(async (taskId: string, granularity: "normal" | "detailed" | "tiny") => {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task || !plan) return;

    const res = await fetch("/api/decompose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskTitle: task.title,
        taskDescription: task.description,
        projectContext: plan.summary || brief,
        currentSubtasks: task.subtasks,
        granularity,
      }),
    });

    if (!res.ok) return;

    const data = await res.json();
    if (!data.subtasks) return;

    // Convert API response subtasks to the Subtask format used in the plan
    const newSubtasks = data.subtasks.map((st: { id: string; title: string; assignee: "user" | "agent"; description?: string }) => ({
      id: st.id,
      title: st.description ? `${st.title} — ${st.description}` : st.title,
      assignee: st.assignee,
      depends_on: [] as string[],
    }));

    setPlan((prev) => {
      if (!prev) return prev;
      const updateTask = (t: Task): Task => {
        if (t.id !== taskId) return t;
        return { ...t, subtasks: newSubtasks };
      };
      return {
        ...prev,
        nodes: prev.nodes.map((n): DagNode =>
          n.type === "task" ? updateTask(n) : { ...n, children: n.children.map(updateTask) }
        ),
      };
    });
  }, [allTasks, plan, brief]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          { name: file.name, dataUrl: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClarify = async () => {
    setClarifyLoading(true);
    setClarifyError("");
    setQuestionIndex(0);
    setStep("clarify");
    try {
      const res = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setClarifyError(`Server returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
        setQuestions([]);
        return;
      }
      if (!res.ok || data.error) {
        setClarifyError(data.error || `HTTP ${res.status}`);
        setQuestions([]);
        return;
      }
      const qs = data.questions || [];
      setQuestions(qs);
      const initialAnswers: Record<string, string> = {};
      qs.forEach((q: ClarifyQuestion) => {
        initialAnswers[q.id] = "";
      });
      setAnswers(initialAnswers);
    } catch (err) {
      setClarifyError(String(err));
      setQuestions([]);
    } finally {
      setClarifyLoading(false);
    }
  };

  const buildEnrichedBrief = () => {
    let enriched = brief;
    const answered = Object.entries(answers).filter(([, v]) => v);
    if (answered.length > 0) {
      enriched += "\n\nAdditional context from user:";
      for (const [qId, answer] of answered) {
        const q = questions.find((q) => q.id === qId);
        if (q) enriched += `\n- ${q.question} → ${answer}`;
      }
    }
    if (justMeMode) {
      enriched += "\n\nIMPORTANT: The user wants to do EVERYTHING themselves — no AI agents. Make ALL tasks assignee 'user'. Break tasks into very concrete, small steps. This person may have executive function challenges, so: be specific, be encouraging, and make each step feel achievable.";
    }
    return enriched;
  };

  // Convert a plan to all-user tasks when in "just me" mode
  const convertToJustMe = (p: Plan): Plan => {
    const convertTask = (t: Task): Task => ({
      ...t,
      assignee: "user",
      agent_type: undefined,
    });
    return {
      ...p,
      nodes: p.nodes.map((n): DagNode =>
        n.type === "task" ? convertTask(n) : { ...n, children: n.children.map(convertTask) }
      ),
    };
  };

  const handleCompile = async () => {
    setStep("compiling");
    setThinkingText("");
    setCompileStatus("Thinking through your brief...");
    setCompileStartTime(Date.now());
    setCompileError("");
    setElapsed(0);

    const enrichedBrief = buildEnrichedBrief();

    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: enrichedBrief, attachments }),
      });

      const reader = res.body?.getReader();
      if (!reader) {
        setCompileError("Failed to connect to the server. Please try again.");
        setCompileStartTime(null);
        setStep("input");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.type === "thought") {
                setThinkingText((prev) => prev + event.text);
              } else if (event.type === "status") {
                setCompileStatus(event.text);
              } else if (event.type === "plan") {
                setCompileStartTime(null);
                const receivedPlan = justMeMode ? convertToJustMe(event.plan) : event.plan;
                setPlan(receivedPlan);
                setStep("reveal");
              } else if (event.type === "subtasks") {
                // Merge subtasks into the existing plan
                setPlan((prev) => {
                  if (!prev) return prev;
                  const subtaskMap = new Map<string, string[]>();
                  for (const t of event.tasks) {
                    subtaskMap.set(t.id, t.subtasks);
                  }
                  const updatedNodes = prev.nodes.map((node: DagNode) => {
                    if (node.type === "task" && subtaskMap.has(node.id)) {
                      return { ...node, subtasks: subtaskMap.get(node.id) };
                    }
                    if (node.type === "parallel_group") {
                      return {
                        ...node,
                        children: node.children.map((child: Task) =>
                          subtaskMap.has(child.id)
                            ? { ...child, subtasks: subtaskMap.get(child.id) }
                            : child
                        ),
                      };
                    }
                    return node;
                  });
                  return { ...prev, nodes: updatedNodes as DagNode[] };
                });
              } else if (event.type === "error") {
                console.error("Compile error:", event.text);
                setCompileStatus("error:" + (event.text || "Unknown error"));
                setCompileStartTime(null);
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } catch (streamErr) {
        console.error("Stream reading failed:", streamErr);
        setCompileError("Connection lost while building your plan. Please try again.");
        setCompileStartTime(null);
        setStep("input");
      }
    } catch (err) {
      console.error("Compile failed:", err);
      setCompileError("Failed to build plan: " + String(err));
      setCompileStartTime(null);
      setStep("input");
    }
  };

  const claudeCodeCount = allTasks.filter((t) => t.agent_type === "claude-code").length;
  const builtinAgentCount = allTasks.filter((t) => t.assignee === "agent" && t.agent_type !== "claude-code").length;
  const hybridCount = allTasks.filter((t) => t.assignee === "hybrid").length;
  const userCount = allTasks.filter((t) => t.assignee === "user").length;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header plan={plan} doneCount={doneCount} total={total} running={running} runningCount={runningCount} userEmail={user?.email} onSignOut={signOut} onDashboard={step !== "dashboard" ? goToDashboard : undefined} />

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
        {/* ─── DASHBOARD ─── */}
        {(user || !authConfigured) && step === "dashboard" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: TEXT, margin: 0 }}>
                Your projects
              </h1>
              <button
                onClick={startNewProject}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: 10,
                  background: PRIMARY,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                + New project
              </button>
            </div>

            {/* Active projects */}
            {dashboardLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: TEXT_LIGHT }}>Loading projects...</div>
            ) : savedPlans.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
                {savedPlans.map((saved) => {
                  const tasks = getAllTasks(saved.nodes);
                  const done = saved.done_ids?.length || 0;
                  const totalTasks = tasks.length;
                  const pct = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0;
                  const isComplete = done === totalTasks && totalTasks > 0;

                  return (
                    <div
                      key={saved.id}
                      onClick={() => loadSavedPlan(saved)}
                      style={{
                        background: SURFACE,
                        borderRadius: 12,
                        padding: "16px 20px",
                        border: `1px solid ${BORDER}`,
                        cursor: "pointer",
                        transition: "border-color 0.15s",
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: isComplete ? "#2DA44E" : TEXT, display: "flex", alignItems: "center", gap: 6 }}>
                          {isComplete && "\u2713 "}{saved.project_title || "Untitled project"}
                          {saved.priority && saved.priority !== "medium" && (
                            <span style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "1px 5px",
                              borderRadius: 4,
                              background: saved.priority === "high" ? "#CF522E18" : "#2DA44E18",
                              color: saved.priority === "high" ? "#CF522E" : "#2DA44E",
                            }}>
                              {saved.priority === "high" ? "HIGH" : "LOW"}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.4 }}>
                          {saved.summary?.slice(0, 100) || saved.brief?.slice(0, 100)}
                          {(saved.summary?.length || saved.brief?.length || 0) > 100 ? "..." : ""}
                        </div>
                        <div style={{ fontSize: 11, color: "#B0AFA8", marginTop: 4 }}>
                          Updated {new Date(saved.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: isComplete ? "#2DA44E" : PRIMARY }}>
                            {pct}%
                          </div>
                          <div style={{ fontSize: 11, color: TEXT_LIGHT }}>
                            {done}/{totalTasks} tasks
                          </div>
                          {/* Mini progress bar */}
                          <div style={{ width: 60, height: 4, background: BORDER, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: isComplete ? "#2DA44E" : PRIMARY, borderRadius: 2 }} />
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Delete this project?")) {
                              deletePlan(saved.id).then(() => {
                                setSavedPlans((prev) => prev.filter((p) => p.id !== saved.id));
                              });
                            }
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: TEXT_LIGHT,
                            fontSize: 16,
                            cursor: "pointer",
                            padding: "4px 6px",
                            borderRadius: 4,
                            opacity: 0.5,
                            transition: "opacity 0.15s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
                          title="Delete project"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ marginBottom: 32 }}>
                {/* Hero section for first-time visitors */}
                <div style={{
                  padding: "28px 24px",
                  borderRadius: 14,
                  background: `linear-gradient(135deg, ${PRIMARY}08, ${PRIMARY}03)`,
                  border: `1px solid ${PRIMARY}18`,
                  marginBottom: 24,
                }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: "0 0 8px 0" }}>
                    Describe anything. Get a smart plan.
                  </h2>
                  <p style={{ fontSize: 14, color: TEXT_LIGHT, lineHeight: 1.6, margin: "0 0 16px 0" }}>
                    Tell us what you want to accomplish in plain language. We&apos;ll break it into a dependency graph of tasks,
                    figure out what to do first, and route work to the right tools.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
                    {[
                      { icon: "\uD83E\uDDE0", title: "Bring your own AI", desc: "Use Claude Code, ChatGPT, Gemini \u2014 tools you already pay for" },
                      { icon: "\uD83C\uDFAF", title: "One thing at a time", desc: "Smart scheduling picks your best next task based on energy & deadlines" },
                      { icon: "\u26A1", title: "Agents do the rest", desc: "AI handles coding, writing, research \u2014 you handle the human parts" },
                      { icon: "\uD83D\uDDA4", title: "ADHD-friendly", desc: "Break tasks down further, focus mode, welcome-back recaps" },
                    ].map((f) => (
                      <div key={f.title} style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        background: SURFACE,
                        border: `1px solid ${BORDER}`,
                      }}>
                        <div style={{ fontSize: 18, marginBottom: 4 }}>{f.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{f.title}</div>
                        <div style={{ fontSize: 11, color: TEXT_LIGHT, lineHeight: 1.4 }}>{f.desc}</div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={startNewProject}
                    style={{
                      padding: "10px 24px",
                      border: "none",
                      borderRadius: 10,
                      background: PRIMARY,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Start your first project &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* Templates */}
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
                Quick start
              </h2>
              <p style={{ fontSize: 13, color: TEXT_LIGHT, marginBottom: 16 }}>
                Pick a template to get going fast. You can customize the brief before building.
              </p>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 10,
              }}>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => startFromTemplate(t)}
                    style={{
                      background: SURFACE,
                      borderRadius: 10,
                      padding: "14px 14px",
                      border: `1px solid ${BORDER}`,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "'DM Sans', sans-serif",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
                  >
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{t.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: TEXT_LIGHT, marginTop: 2, textTransform: "capitalize" }}>
                      {t.category}{t.justMeDefault ? " \u00B7 just you" : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── AUTH ─── */}
        {authConfigured && !authLoading && !user && (
          <div style={{ maxWidth: 380, margin: "60px auto", textAlign: "center" }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Welcome to LetsBegin</h2>
            <p style={{ color: "#787774", fontSize: 14, marginBottom: 24 }}>Sign in to save your plans and progress.</p>

            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                fontFamily: "'DM Sans', sans-serif",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 8,
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                fontFamily: "'DM Sans', sans-serif",
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 12,
              }}
            />

            {authError && (
              <div style={{ fontSize: 12, color: "#CF522E", marginBottom: 12 }}>{authError}</div>
            )}

            <button
              onClick={async () => {
                setAuthError("");
                const fn = authMode === "signin" ? signInWithEmail : signUpWithEmail;
                const { error } = await fn(authEmail, authPassword);
                if (error) setAuthError(error.message);
              }}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background: PRIMARY,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                marginBottom: 12,
              }}
            >
              {authMode === "signin" ? "Sign in" : "Create account"}
            </button>

            <button
              onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
              style={{
                background: "none",
                border: "none",
                color: PRIMARY,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {authMode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        )}

        {/* ─── INPUT ─── */}
        {(user || !authConfigured || authLoading) && step === "input" && (
          <div>
            <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 8, color: TEXT }}>
              What are we building?
            </h1>
            <p style={{ color: "#787774", fontSize: 16, marginBottom: 28, lineHeight: 1.6 }}>
              AI tools either do everything for you or leave you in a chat guessing
              what to do next. LetsBegin coordinates — Claude plans, agents like
              Claude Code handle the technical work, and you get guided through your
              part with every step visible and traceable.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: 14,
                marginBottom: 32,
              }}
            >
              {[
                {
                  num: "1",
                  title: "Describe it messy",
                  desc: "Paste your goal, attach screenshots. AI asks a few smart questions to understand your situation.",
                },
                {
                  num: "2",
                  title: "Get a dependency graph",
                  desc: "Claude builds a real plan — not a to-do list. It picks the right agent for each task and lets everything run in parallel.",
                },
                {
                  num: "3",
                  title: "Visible, traceable work",
                  desc: "Agents run in the background. Your tasks have notes, timestamps, and a full activity log — nothing gets lost.",
                },
              ].map((s) => (
                <div
                  key={s.num}
                  style={{
                    background: SURFACE,
                    borderRadius: 10,
                    padding: "16px 14px",
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: `${PRIMARY}14`,
                      color: PRIMARY,
                      fontSize: 13,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 8,
                    }}
                  >
                    {s.num}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              ))}
            </div>

            <details
              style={{
                marginBottom: 28,
                background: SURFACE,
                borderRadius: 10,
                border: `1px solid ${BORDER}`,
                padding: "0 16px",
              }}
            >
              <summary
                style={{
                  padding: "12px 0",
                  fontSize: 13,
                  fontWeight: 600,
                  color: PRIMARY,
                  cursor: "pointer",
                  listStyle: "none",
                }}
              >
                Not another chatbot &darr;
              </summary>
              <div style={{ paddingBottom: 16, fontSize: 13, color: "#787774", lineHeight: 1.7 }}>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>Unlike chat:</strong> Your project has structure. A progress bar, a
                  dependency graph, and a stable plan that doesn&apos;t regenerate every message.
                </p>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>Unlike coding agents:</strong> LetsBegin handles the whole project — not
                  just the code parts. Claude Code handles the technical tasks. You handle what
                  only you can do. Everything is visible and traceable.
                </p>
                <p style={{ margin: "0 0 10px" }}>
                  <strong>Unlike task managers:</strong> Tasks actually get done. Agents auto-execute
                  their work in the background while you focus on what only you can do.
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Designed for real humans:</strong> One task at a time. Step-by-step
                  guidance when you need it. Energy-aware task ordering. Built for people
                  with executive function challenges, not just productivity hackers. You can
                  even turn off all agents and use it as a pure human planning tool.
                </p>
              </div>
            </details>

            {compileError && (
              <div style={{
                padding: "12px 16px",
                borderRadius: 10,
                background: "#CF522E0c",
                border: "1px solid #CF522E30",
                color: "#CF522E",
                fontSize: 13,
                marginBottom: 16,
              }}>
                {compileError}
              </div>
            )}

            <div style={{ position: "relative" }}>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. Launch a landing page for my new product by end of week..."
                style={{
                  width: "100%",
                  minHeight: 140,
                  padding: 16,
                  paddingRight: 48,
                  fontSize: 15,
                  fontFamily: "'DM Sans', sans-serif",
                  borderRadius: 12,
                  border: `2px solid ${BORDER}`,
                  background: SURFACE,
                  outline: "none",
                  resize: "vertical",
                  lineHeight: 1.6,
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                onBlur={(e) => (e.target.style.borderColor = BORDER)}
              />
              {voiceInput.isSupported && (
                <button
                  onClick={voiceInput.listening ? voiceInput.stopListening : voiceInput.startListening}
                  title={voiceInput.listening ? "Stop dictation" : "Dictate your brief"}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: "none",
                    background: voiceInput.listening ? "#CF522E" : `${PRIMARY}14`,
                    color: voiceInput.listening ? "#fff" : PRIMARY,
                    fontSize: 16,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {voiceInput.listening ? "\u25A0" : "\uD83C\uDF99"}
                </button>
              )}
            </div>

            {/* Attachments */}
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileAdd}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: "6px 14px",
                  border: "1px dashed #ccc",
                  borderRadius: 8,
                  background: "transparent",
                  color: TEXT_LIGHT,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                + Attach images
              </button>
              {attachments.map((att, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: "#EDECE9",
                    fontSize: 12,
                    color: "#787774",
                  }}
                >
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }}
                  />
                  {att.name}
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    style={{
                      background: "none",
                      border: "none",
                      color: TEXT_LIGHT,
                      cursor: "pointer",
                      fontSize: 14,
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            {attachments.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: TEXT_LIGHT }}>
                Images will be analyzed to understand your project context.
              </div>
            )}

            {/* Just me mode toggle */}
            <div
              style={{
                marginTop: 20,
                padding: "14px 16px",
                borderRadius: 10,
                background: justMeMode ? `${PRIMARY}08` : SURFACE,
                border: `1px solid ${justMeMode ? PRIMARY + "30" : BORDER}`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onClick={() => setJustMeMode(!justMeMode)}
            >
              <div
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  background: justMeMode ? PRIMARY : BORDER,
                  position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    position: "absolute",
                    top: 2,
                    left: justMeMode ? 20 : 2,
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: justMeMode ? PRIMARY : TEXT }}>
                  Just me, no agents
                </div>
                <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.4 }}>
                  All tasks stay yours. Great for personal projects, executive function support, or when you just want a good plan to follow.
                </div>
              </div>
            </div>

            {/* AI Tools selector — what tools does the user have? */}
            {!justMeMode && (
              <div
                style={{
                  marginTop: 12,
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: userTools.available.length > 0 ? "#E8F0FE08" : SURFACE,
                  border: `1px solid ${userTools.available.length > 0 ? "#1967D230" : BORDER}`,
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: userTools.available.length > 0 ? "#1967D2" : TEXT, marginBottom: 4 }}>
                  What AI tools do you have?
                </div>
                <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.4, marginBottom: 10 }}>
                  Select the tools you already pay for. We&apos;ll route tasks to your tools to save API costs. Leave empty to use our API for everything.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(Object.keys(TOOL_CAPABILITIES) as UserTool[]).map((tool) => {
                    const cap = TOOL_CAPABILITIES[tool];
                    const isSelected = userTools.available.includes(tool);
                    return (
                      <button
                        key={tool}
                        onClick={() => {
                          setUserTools((prev) => {
                            const next = isSelected
                              ? prev.available.filter((t) => t !== tool)
                              : [...prev.available, tool];
                            const newMode = next.length > 0 ? "byo" : "api";
                            setExecutionMode(newMode);
                            return { ...prev, available: next as UserTool[] };
                          });
                        }}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 7,
                          border: `1.5px solid ${isSelected ? "#1967D2" : BORDER}`,
                          background: isSelected ? "#E8F0FE" : "transparent",
                          color: isSelected ? "#1967D2" : TEXT_LIGHT,
                          fontSize: 12,
                          fontWeight: isSelected ? 600 : 400,
                          cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif",
                          transition: "all 0.15s",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {cap.icon} {cap.label}
                      </button>
                    );
                  })}
                </div>
                {userTools.available.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#1967D2", fontWeight: 500 }}>
                    {userTools.available.length} tool{userTools.available.length !== 1 ? "s" : ""} selected — agent tasks will use your tools instead of our API
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleClarify}
              disabled={brief.trim().length < 10 || clarifyLoading}
              style={{
                marginTop: 16,
                padding: "12px 32px",
                border: "none",
                borderRadius: 10,
                background: (brief.trim().length < 10 || clarifyLoading) ? "#ccc" : PRIMARY,
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                cursor: (brief.trim().length < 10 || clarifyLoading) ? "not-allowed" : "pointer",
                opacity: clarifyLoading ? 0.6 : 1,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {clarifyLoading ? "Loading..." : "Continue \u2192"}
            </button>
          </div>
        )}

        {/* ─── CLARIFY ─── */}
        {step === "clarify" && (
          <div>
            {clarifyLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 40 }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    border: `3px solid ${PRIMARY}`,
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <span style={{ fontSize: 14, color: "#787774" }}>Generating questions...</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : questions.length > 0 ? (
              <div>
                {/* Progress dots */}
                <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
                  {questions.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: i === questionIndex ? 24 : 8,
                        height: 8,
                        borderRadius: 4,
                        background: i < questionIndex ? PRIMARY : i === questionIndex ? PRIMARY : BORDER,
                        opacity: i < questionIndex ? 0.4 : 1,
                        transition: "all 0.3s ease",
                      }}
                    />
                  ))}
                </div>

                {/* Current question */}
                {(() => {
                  const q = questions[questionIndex];
                  if (!q) return null;
                  return (
                    <div>
                      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, lineHeight: 1.4 }}>
                        {q.question}
                      </h2>

                      {q.type === "yes_no" && (
                        <div style={{ display: "flex", gap: 10 }}>
                          {["Yes", "No"].map((opt) => (
                            <button
                              key={opt}
                              onClick={() => {
                                setAnswers((prev) => ({ ...prev, [q.id]: opt }));
                                if (questionIndex < questions.length - 1) {
                                  setTimeout(() => setQuestionIndex((i) => i + 1), 200);
                                }
                              }}
                              style={{
                                padding: "12px 32px",
                                borderRadius: 10,
                                border: `2px solid ${answers[q.id] === opt ? PRIMARY : BORDER}`,
                                background: answers[q.id] === opt ? `${PRIMARY}0a` : "#fff",
                                color: answers[q.id] === opt ? PRIMARY : "#555",
                                fontSize: 15,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "'DM Sans', sans-serif",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {q.type === "choice" && q.options && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {q.options.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => {
                                setAnswers((prev) => ({ ...prev, [q.id]: opt }));
                                if (questionIndex < questions.length - 1) {
                                  setTimeout(() => setQuestionIndex((i) => i + 1), 200);
                                }
                              }}
                              style={{
                                padding: "12px 16px",
                                borderRadius: 10,
                                border: `2px solid ${answers[q.id] === opt ? PRIMARY : BORDER}`,
                                background: answers[q.id] === opt ? `${PRIMARY}0a` : "#fff",
                                color: answers[q.id] === opt ? PRIMARY : "#555",
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: "pointer",
                                fontFamily: "'DM Sans', sans-serif",
                                textAlign: "left",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {q.type === "short" && (
                        <input
                          type="text"
                          value={answers[q.id] || ""}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && questionIndex < questions.length - 1) {
                              setQuestionIndex((i) => i + 1);
                            }
                          }}
                          placeholder="Type your answer..."
                          autoFocus
                          style={{
                            width: "100%",
                            padding: "12px 14px",
                            fontSize: 15,
                            fontFamily: "'DM Sans', sans-serif",
                            borderRadius: 10,
                            border: `2px solid ${BORDER}`,
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                          onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
                          onBlur={(e) => (e.target.style.borderColor = BORDER)}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* Navigation */}
                <div style={{ display: "flex", gap: 12, marginTop: 28, alignItems: "center" }}>
                  {questionIndex > 0 && (
                    <button
                      onClick={() => setQuestionIndex((i) => i - 1)}
                      style={{
                        padding: "10px 20px",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 10,
                        background: SURFACE,
                        color: "#787774",
                        fontSize: 14,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      &larr; Back
                    </button>
                  )}
                  {questionIndex < questions.length - 1 ? (
                    <button
                      onClick={() => setQuestionIndex((i) => i + 1)}
                      style={{
                        padding: "10px 24px",
                        border: "none",
                        borderRadius: 10,
                        background: PRIMARY,
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      Next &rarr;
                    </button>
                  ) : (
                    <button
                      onClick={handleCompile}
                      disabled={compileStartTime !== null}
                      style={{
                        padding: "10px 28px",
                        border: "none",
                        borderRadius: 10,
                        background: compileStartTime !== null ? "#ccc" : PRIMARY,
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: compileStartTime !== null ? "not-allowed" : "pointer",
                        opacity: compileStartTime !== null ? 0.6 : 1,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      Build my plan &rarr;
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setAnswers({});
                      handleCompile();
                    }}
                    style={{
                      padding: "10px 16px",
                      border: "none",
                      borderRadius: 10,
                      background: "transparent",
                      color: "#aaa",
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Skip all
                  </button>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => setStep("input")}
                    style={{
                      padding: "10px 16px",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 10,
                      background: "transparent",
                      color: TEXT_LIGHT,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    &larr; Back to brief
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: "20px 0" }}>
                <p style={{ color: "#787774", fontSize: 14, marginBottom: 12 }}>
                  Couldn&apos;t generate questions — you can skip ahead or try again.
                </p>
                {clarifyError && (
                  <div style={{
                    fontSize: 11,
                    color: TEXT_LIGHT,
                    fontFamily: "'DM Mono', monospace",
                    background: "#f5f5f5",
                    padding: 10,
                    borderRadius: 8,
                    marginBottom: 16,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 100,
                    overflow: "auto",
                  }}>
                    {clarifyError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={handleCompile}
                    style={{
                      padding: "10px 24px",
                      border: "none",
                      borderRadius: 10,
                      background: PRIMARY,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Skip to plan &rarr;
                  </button>
                  <button
                    onClick={handleClarify}
                    style={{
                      padding: "10px 20px",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 10,
                      background: SURFACE,
                      color: "#787774",
                      fontSize: 14,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => setStep("input")}
                    style={{
                      padding: "10px 16px",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 10,
                      background: "transparent",
                      color: TEXT_LIGHT,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    &larr; Back to brief
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── COMPILING ─── */}
        {step === "compiling" && (
          <div>
            {compileStatus.startsWith("error:") ? (
              <div>
                <div style={{
                  background: SURFACE,
                  borderRadius: 12,
                  padding: 20,
                  border: `1px solid ${BORDER}`,
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "#CF522E" }}>
                    Plan generation failed
                  </div>
                  <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.5, fontFamily: "'DM Mono', monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto" }}>
                    {compileStatus.slice(6)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={handleCompile}
                    style={{
                      padding: "10px 24px",
                      border: "none",
                      borderRadius: 10,
                      background: PRIMARY,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => setStep("input")}
                    style={{
                      padding: "10px 20px",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 10,
                      background: SURFACE,
                      color: "#787774",
                      fontSize: 14,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Edit brief
                  </button>
                </div>
                {thinkingText && (
                  <div style={{ marginTop: 16 }}>
                    <ThinkingTerminal text={thinkingText} />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        border: `3px solid ${PRIMARY}`,
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{compileStatus}</span>
                  </div>
                  <span style={{ fontSize: 13, color: TEXT_LIGHT, fontVariantNumeric: "tabular-nums" }}>
                    {elapsed}s
                  </span>
                </div>
                <ThinkingTerminal text={thinkingText} />
              </div>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ─── REVEAL ─── */}
        {step === "reveal" && plan && (() => {
          // Find the "one thing" — smart scheduling + energy-aware
          const allCurrentTasks = getAllTasks(currentNodes);
          const pendingTasks = allCurrentTasks.filter((t) => t.status === "pending");
          const pendingHumanTasks = pendingTasks.filter(
            (t) => t.assignee === "user" || t.assignee === "hybrid"
          );
          // Score all pending tasks by project management best practices
          const scoredTasks = scoreTasks(
            pendingHumanTasks.length > 0 ? pendingHumanTasks : pendingTasks,
            allTasks,
            currentEnergy,
            projectPriority,
          );

          // Apply focus category filter
          const focusFilteredScored = focusCategory === "all"
            ? scoredTasks
            : scoredTasks.filter((sp) => inferCategory(sp.task) === focusCategory);
          // Fall back to top unfiltered task if no matches
          const effectiveScored = focusFilteredScored.length > 0 ? focusFilteredScored : scoredTasks;

          const topPriority = effectiveScored[0];
          const oneThingTask: Task | undefined = topPriority?.task;
          const oneThingReasons = topPriority?.reasons || [];
          const allDone = allCurrentTasks.every((t) => doneIds.has(t.id));

          // Categories present in current tasks
          const presentCategories = Array.from(new Set(
            allCurrentTasks
              .filter((t) => t.status === "pending")
              .map((t) => inferCategory(t))
          ));

          // Quick-detour: find a quick task with long wait to suggest
          const detourTask = !detourDismissed && oneThingTask ? (() => {
            const candidates = allCurrentTasks.filter((t) =>
              t.status === "pending" &&
              t.id !== oneThingTask.id &&
              t.has_wait_after &&
              (t.estimated_wait === "days" || t.estimated_wait === "weeks") &&
              t.energy === "low"
            );
            return candidates[0] || null;
          })() : null;

          return (
          <div>
            {/* Welcome back recap */}
            {welcomeBackData && showWelcomeBack && (
              <WelcomeBack
                minutesAway={welcomeBackData.minutesAway}
                totalTasks={welcomeBackData.totalTasks}
                completedTasks={welcomeBackData.completedTasks}
                lastCompletedTitle={welcomeBackData.lastCompletedTitle}
                nextTaskTitle={welcomeBackData.nextTaskTitle}
                nextTaskReason={welcomeBackData.nextTaskReason}
                agentCompletedTitles={welcomeBackData.agentCompletedTitles}
                onDismiss={() => {
                  setShowWelcomeBack(false);
                  if (savedPlanId) {
                    localStorage.setItem(`letsbegin-last-visit-${savedPlanId}`, String(Date.now()));
                  }
                }}
              />
            )}
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => setRevealMode("onething")}
                style={{
                  padding: "8px 18px",
                  borderRadius: 10,
                  border: revealMode === "onething" ? `2px solid ${PRIMARY}` : "2px solid #e8e6f0",
                  background: revealMode === "onething" ? `${PRIMARY}0a` : "#fff",
                  color: revealMode === "onething" ? PRIMARY : "#666",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                One Thing at a Time
              </button>
              <button
                onClick={() => setRevealMode("project")}
                style={{
                  padding: "8px 18px",
                  borderRadius: 10,
                  border: revealMode === "project" ? `2px solid ${PRIMARY}` : "2px solid #e8e6f0",
                  background: revealMode === "project" ? `${PRIMARY}0a` : "#fff",
                  color: revealMode === "project" ? PRIMARY : "#666",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Full Project
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 13, color: TEXT_LIGHT, alignSelf: "center" }}>
                {doneCount}/{total} done
              </span>
            </div>

            {/* Focus category filter */}
            {presentCategories.length > 1 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Focus</span>
                <button
                  onClick={() => setFocusCategory("all")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: focusCategory === "all" ? PRIMARY : BORDER,
                    color: focusCategory === "all" ? "#fff" : "#666",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  All
                </button>
                {presentCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFocusCategory(cat)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: focusCategory === cat ? PRIMARY : BORDER,
                      color: focusCategory === cat ? "#fff" : "#666",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                      textTransform: "capitalize",
                    }}
                  >
                    {CATEGORY_ICONS[cat]} {cat}
                  </button>
                ))}
              </div>
            )}

            {/* ─── ONE THING MODE ─── */}
            {revealMode === "onething" && (
              <div>
                {/* Encouragement toast */}
                {showEncouragement && (
                  <div style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: "#2DA44E12",
                    border: "1px solid #2DA44E30",
                    color: "#2DA44E",
                    fontSize: 14,
                    fontWeight: 500,
                    marginBottom: 16,
                    textAlign: "center",
                    animation: "fadeIn 0.3s ease",
                  }}>
                    {showEncouragement}
                    {streak >= 2 && streak <= 5 && (
                      <span style={{ display: "block", fontSize: 12, marginTop: 2, opacity: 0.8 }}>
                        {streakEncouragements[streak] || `${streak} tasks in a row!`}
                      </span>
                    )}
                    {streak > 5 && (
                      <span style={{ display: "block", fontSize: 12, marginTop: 2, opacity: 0.8 }}>
                        {streak} tasks straight. You&apos;re unstoppable.
                      </span>
                    )}
                  </div>
                )}

                {/* Break reminder */}
                {showBreakReminder && !showEncouragement && (
                  <div style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    background: "#D4A72C0a",
                    border: "1px solid #D4A72C25",
                    marginBottom: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#D4A72C" }}>
                        Nice streak! Maybe take a quick break?
                      </div>
                      <div style={{ fontSize: 12, color: TEXT_LIGHT }}>
                        You&apos;ve done {streak} tasks. A short break helps you stay focused.
                      </div>
                    </div>
                    <button
                      onClick={() => setShowBreakReminder(false)}
                      style={{
                        background: "none",
                        border: "none",
                        color: TEXT_LIGHT,
                        fontSize: 18,
                        cursor: "pointer",
                        padding: "0 4px",
                      }}
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Progress bar with streak dots */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: BORDER,
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${total > 0 ? (doneCount / total) * 100 : 0}%`,
                        height: "100%",
                        background: PRIMARY,
                        borderRadius: 3,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 13, color: TEXT_LIGHT, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {doneCount} of {total}
                  </span>
                </div>

                {/* Energy check-in (only show if multiple tasks available) */}
                {pendingHumanTasks.length > 1 && !allDone && (
                  <div style={{
                    marginBottom: 20,
                    padding: "12px 16px",
                    borderRadius: 10,
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                  }}>
                    <div style={{ fontSize: 13, color: TEXT_LIGHT, marginBottom: 8 }}>
                      How&apos;s your energy right now?
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {([
                        { level: "low" as Energy, label: "Low — give me something easy", color: "#2DA44E" },
                        { level: "medium" as Energy, label: "Okay — moderate is fine", color: "#D4A72C" },
                        { level: "high" as Energy, label: "Good — bring it on", color: "#CF522E" },
                      ]).map(({ level, label, color }) => (
                        <button
                          key={level}
                          onClick={() => setCurrentEnergy(level)}
                          style={{
                            flex: 1,
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: currentEnergy === level ? `2px solid ${color}` : `1px solid ${BORDER}`,
                            background: currentEnergy === level ? `${color}0a` : "transparent",
                            color: currentEnergy === level ? color : TEXT_LIGHT,
                            fontSize: 12,
                            fontWeight: currentEnergy === level ? 600 : 400,
                            cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                            transition: "all 0.15s",
                          }}
                        >
                          <span style={{ display: "block", width: 8, height: 8, borderRadius: "50%", background: color, margin: "0 auto 4px" }} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {allDone ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>&#x1F389;</div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>All done!</h2>
                    <p style={{ color: "#787774", fontSize: 15, marginBottom: 4 }}>
                      Every task in your plan is complete.
                    </p>
                    {streak > 0 && (
                      <p style={{ color: "#2DA44E", fontSize: 14, fontWeight: 500 }}>
                        You completed {streak} task{streak !== 1 ? "s" : ""} this session.
                      </p>
                    )}
                    <button
                      onClick={() => setRevealMode("project")}
                      style={{
                        marginTop: 16,
                        padding: "10px 24px",
                        border: `1px solid ${PRIMARY}`,
                        borderRadius: 10,
                        background: "transparent",
                        color: PRIMARY,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      View full project
                    </button>
                  </div>
                ) : oneThingTask ? (
                  <div>
                    {/* Gentle, focused header */}
                    <div style={{ fontSize: 14, color: TEXT_LIGHT, marginBottom: 4 }}>
                      {oneThingTask.assignee === "user" ? "Focus on this one thing:" : "Next up:"}
                    </div>
                    {/* Smart scheduling reasons */}
                    {oneThingReasons.length > 0 && (
                      <div style={{ fontSize: 11, color: PRIMARY, marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {oneThingReasons.map((reason, i) => (
                          <span key={i} style={{
                            padding: "2px 8px", borderRadius: 5,
                            background: `${PRIMARY}10`, fontSize: 11,
                          }}>
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}
                    {oneThingTask.energy && oneThingReasons.length === 0 && (
                      <div style={{ fontSize: 11, color: ENERGY_COLORS[oneThingTask.energy], marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: ENERGY_COLORS[oneThingTask.energy] }} />
                        {oneThingTask.energy === "low" ? "Quick one" : oneThingTask.energy === "medium" ? "Moderate effort" : "This one takes focus"}
                      </div>
                    )}
                    <TaskCard
                      task={oneThingTask}
                      result={results[oneThingTask.id]}
                      onMarkDone={markDone}
                      onRunAgent={handleRunAgent}
                      onAddNote={addNote}
                      projectSummary={plan?.summary || brief}
                      autoExpandSubtasks
                      doneSubtaskIds={doneSubtaskIds}
                      onToggleSubtask={toggleSubtask}
                      priorResults={allTasks
                        .filter((t) => results[t.id]?.done)
                        .map((t) => ({
                          title: t.title,
                          assignee: t.assignee,
                          output: results[t.id]?.finalOutput || results[t.id]?.steps
                            ?.filter((s) => s.type === "output")
                            .map((s) => s.type === "output" ? s.content : "")
                            .join("\n") || "",
                        }))}
                      allTasksList={allTasks}
                      executionMode={executionMode}
                      userTools={userTools}
                      onEditTask={editTask}
                      onDecompose={handleDecompose}
                      doneIds={doneIds}
                      currentNodes={currentNodes}
                    />

                    {/* "I'm stuck" button — opens chat with a gentler first message */}
                    {oneThingTask.assignee === "user" && (
                      <div style={{ marginTop: 12, textAlign: "center" }}>
                        <button
                          onClick={() => {
                            // This opens the task chat if not already open
                            const chatBtn = document.querySelector(`[data-task-chat="${oneThingTask.id}"]`) as HTMLButtonElement;
                            if (chatBtn) chatBtn.click();
                          }}
                          style={{
                            background: "none",
                            border: `1px dashed ${BORDER}`,
                            borderRadius: 8,
                            padding: "8px 16px",
                            fontSize: 12,
                            color: TEXT_LIGHT,
                            cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          Feeling stuck? Get help breaking this down further
                        </button>
                      </div>
                    )}

                    {/* Quick detour suggestion */}
                    {detourTask && (
                      <div style={{
                        marginTop: 14,
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: `1px dashed ${BORDER}`,
                        background: "#FAFAF9",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: "#D4A72C", fontWeight: 600, marginBottom: 3 }}>
                            Quick detour
                          </div>
                          <div style={{ fontSize: 12, color: TEXT_LIGHT, lineHeight: 1.4 }}>
                            {detourTask.title} &mdash; do this now to avoid a {detourTask.estimated_wait === "weeks" ? "multi-week" : "multi-day"} wait later
                          </div>
                        </div>
                        <button
                          onClick={() => setDetourDismissed(true)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#B0AFA8",
                            fontSize: 14,
                            cursor: "pointer",
                            padding: "0 2px",
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    )}

                    {/* What's happening in the background */}
                    {runningCount > 0 && (
                      <div
                        style={{
                          marginTop: 16,
                          padding: "12px 16px",
                          borderRadius: 10,
                          background: `${PRIMARY}08`,
                          border: `1px solid ${PRIMARY}20`,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: PRIMARY,
                            animation: "pulse 1.5s ease-in-out infinite",
                          }}
                        />
                        <span style={{ fontSize: 12, color: "#787774" }}>
                          {runningCount === 1 ? "Agent is working on a task" : `${runningCount} agents working`} in the background...
                        </span>
                      </div>
                    )}

                    {/* Up next preview */}
                    {(() => {
                      const pendingAfter = allCurrentTasks.filter(
                        (t) => t.status === "pending" && t.id !== oneThingTask.id && (t.assignee === "user" || t.assignee === "hybrid")
                      );
                      if (pendingAfter.length === 0) return null;
                      return (
                        <div style={{ marginTop: 24 }}>
                          <div style={{ fontSize: 12, color: "#B0AFA8", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Up next
                          </div>
                          {pendingAfter.slice(0, 2).map((t) => (
                            <div
                              key={t.id}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                background: SURFACE,
                                border: `1px solid ${BORDER}`,
                                marginBottom: 6,
                                fontSize: 13,
                                color: TEXT_LIGHT,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <span style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: ENERGY_COLORS[t.energy],
                              }} />
                              {t.title}
                            </div>
                          ))}
                          {pendingAfter.length > 2 && (
                            <div style={{ fontSize: 12, color: "#ccc", paddingLeft: 12 }}>
                              +{pendingAfter.length - 2} more
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div style={{ padding: "20px 0" }}>
                    <div style={{ textAlign: "center", marginBottom: 20 }}>
                      <div style={{ fontSize: 14, color: TEXT_LIGHT, marginBottom: 4 }}>
                        No tasks need your attention right now.
                      </div>
                      {runningCount > 0 && (
                        <div style={{ fontSize: 13, color: PRIMARY, fontWeight: 500 }}>
                          {runningCount === 1 ? "An agent is working on a task..." : `${runningCount} agents are working...`}
                        </div>
                      )}
                      {runningCount === 0 && (
                        <div style={{ fontSize: 13, color: TEXT_LIGHT }}>
                          Waiting for dependencies to unlock new tasks.
                        </div>
                      )}
                    </div>

                    {/* Show what agents are currently working on */}
                    {(() => {
                      const agentWorking = allCurrentTasks.filter(
                        (t) => t.assignee === "agent" && t.status === "pending" && results[t.id]
                      );
                      if (agentWorking.length === 0) return null;
                      return (
                        <div>
                          <div style={{ fontSize: 12, color: "#B0AFA8", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Agents working on
                          </div>
                          {agentWorking.map((t) => (
                            <div
                              key={t.id}
                              style={{
                                background: SURFACE,
                                border: `1px solid ${BORDER}`,
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 8,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRIMARY, animation: "pulse 1.5s ease-in-out infinite" }} />
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</span>
                              </div>
                              {results[t.id] && (
                                <div style={{
                                  fontSize: 12,
                                  color: TEXT_LIGHT,
                                  background: "#1C1C1E",
                                  borderRadius: 6,
                                  padding: 10,
                                  maxHeight: 80,
                                  overflow: "hidden",
                                  fontFamily: "'DM Mono', monospace",
                                }}>
                                  {results[t.id].steps
                                    .filter((s) => s.type === "thinking")
                                    .map((s) => s.type === "thinking" ? s.text : "")
                                    .join("")
                                    .slice(-200) || "Starting..."}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Show upcoming human tasks so user knows what's next */}
                    {(() => {
                      const lockedHumanTasks = allCurrentTasks.filter(
                        (t) => t.status === "locked" && (t.assignee === "user" || t.assignee === "hybrid")
                      );
                      if (lockedHumanTasks.length === 0) return null;
                      return (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ fontSize: 12, color: "#B0AFA8", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Coming up for you
                          </div>
                          {lockedHumanTasks.slice(0, 3).map((t) => (
                            <div
                              key={t.id}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                background: SURFACE,
                                border: `1px solid ${BORDER}`,
                                marginBottom: 6,
                                fontSize: 13,
                                color: TEXT_LIGHT,
                                opacity: 0.6,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              &#x1F512; {t.title}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
              </div>
            )}

            {/* ─── FULL PROJECT MODE ─── */}
            {revealMode === "project" && (
              <div>
                {/* Summary card */}
                <div
                  style={{
                    background: SURFACE,
                    borderRadius: 14,
                    padding: 22,
                    border: `1px solid ${BORDER}`,
                    marginBottom: 24,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                      {plan.project_title}
                    </h2>
                    <div style={{ display: "flex", gap: 2 }}>
                      {(["high", "medium", "low"] as const).map((p) => {
                        const labels = { high: "H", medium: "M", low: "L" };
                        const colors = { high: "#CF522E", medium: "#D4A72C", low: "#2DA44E" };
                        const isActive = projectPriority === p;
                        return (
                          <button
                            key={p}
                            onClick={() => setProjectPriority(p)}
                            title={`${p} priority`}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 5,
                              border: isActive ? `1.5px solid ${colors[p]}` : `1px solid ${BORDER}`,
                              background: isActive ? `${colors[p]}18` : "transparent",
                              color: isActive ? colors[p] : TEXT_LIGHT,
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: "pointer",
                              fontFamily: "'DM Sans', sans-serif",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {labels[p]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p style={{ fontSize: 14, color: "#787774", lineHeight: 1.6, marginBottom: 14 }}>
                    {plan.summary}
                  </p>
                  <div style={{ display: "flex", gap: 16, fontSize: 13, color: TEXT_LIGHT, flexWrap: "wrap", alignItems: "center" }}>
                    {claudeCodeCount > 0 && (
                      <span>
                        <strong style={{ color: "#C4841D" }}>{claudeCodeCount}</strong> Claude Code
                      </span>
                    )}
                    {builtinAgentCount > 0 && (
                      <span>
                        <strong style={{ color: PRIMARY }}>{builtinAgentCount}</strong> agent
                      </span>
                    )}
                    <span>
                      <strong style={{ color: "#C4841D" }}>{hybridCount}</strong> hybrid
                    </span>
                    <span>
                      <strong style={{ color: "#787774" }}>{userCount}</strong> you
                    </span>
                    <span>
                      <strong style={{ color: TEXT }}>{total}</strong> total
                    </span>
                    {executionMode === "byo" && userTools.available.length > 0 && (
                      <span
                        style={{
                          padding: "2px 8px", borderRadius: 5,
                          background: "#E8F0FE", color: "#1967D2",
                          fontSize: 11, fontWeight: 600,
                          cursor: "pointer",
                        }}
                        onClick={() => { setExecutionMode("api"); setUserTools({ available: [] }); }}
                        title="Click to switch to API mode (agents run automatically)"
                      >
                        Using your tools ({userTools.available.length}) — click to switch
                      </span>
                    )}
                    {executionMode === "api" && userTools.available.length === 0 && (claudeCodeCount > 0 || builtinAgentCount > 0) && (
                      <span
                        style={{
                          padding: "2px 8px", borderRadius: 5,
                          background: `${PRIMARY}14`, color: PRIMARY,
                          fontSize: 11, fontWeight: 600,
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setUserTools({ available: ["claude-code"] });
                          setExecutionMode("byo");
                        }}
                        title="Switch to BYO mode — use your own AI tools"
                      >
                        Have your own AI tools? Switch to BYO
                      </span>
                    )}
                  </div>
                </div>

                {/* Filters */}
                <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Effort</span>
                    {(["all", "high", "medium", "low"] as const).map((e) => (
                      <button
                        key={e}
                        onClick={() => setEnergyFilter(e)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: energyFilter === e ? (e === "all" ? PRIMARY : ENERGY_COLORS[e]) : BORDER,
                          color: energyFilter === e ? "#fff" : "#666",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          textTransform: "capitalize",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Who</span>
                    {([
                      { key: "all" as const, label: "All" },
                      { key: "agent" as const, label: "\u26A1 Agent" },
                      { key: "hybrid" as const, label: "\uD83E\uDD1D Hybrid" },
                      { key: "user" as const, label: "\uD83D\uDC64 You" },
                    ]).map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setAssigneeFilter(f.key)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: assigneeFilter === f.key ? PRIMARY : BORDER,
                          color: assigneeFilter === f.key ? "#fff" : "#666",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAddTask(!showAddTask)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: `1px dashed ${BORDER}`,
                      background: "transparent",
                      color: TEXT_LIGHT,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    + Add task
                  </button>
                </div>

                {showAddTask && (
                  <div style={{
                    background: SURFACE,
                    borderRadius: 10,
                    padding: 16,
                    border: `1px solid ${BORDER}`,
                    marginBottom: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}>
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Task title"
                      style={{
                        padding: "8px 10px", fontSize: 13, borderRadius: 6,
                        border: `1px solid ${BORDER}`, outline: "none",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    />
                    <textarea
                      value={newTaskDesc}
                      onChange={(e) => setNewTaskDesc(e.target.value)}
                      placeholder="Description (optional)"
                      style={{
                        padding: "8px 10px", fontSize: 12, borderRadius: 6,
                        border: `1px solid ${BORDER}`, outline: "none",
                        fontFamily: "'DM Sans', sans-serif", resize: "vertical",
                        minHeight: 40,
                      }}
                    />
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        value={newTaskAssignee}
                        onChange={(e) => setNewTaskAssignee(e.target.value as Assignee)}
                        style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${BORDER}`, fontFamily: "'DM Sans', sans-serif" }}
                      >
                        <option value="user">You</option>
                        <option value="agent">Agent</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                      <select
                        value={newTaskEnergy}
                        onChange={(e) => setNewTaskEnergy(e.target.value as Energy)}
                        style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${BORDER}`, fontFamily: "'DM Sans', sans-serif" }}
                      >
                        <option value="low">Low effort</option>
                        <option value="medium">Medium effort</option>
                        <option value="high">High effort</option>
                      </select>
                      <input
                        type="date"
                        value={newTaskDeadline}
                        onChange={(e) => setNewTaskDeadline(e.target.value)}
                        style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${BORDER}`, fontFamily: "'DM Sans', sans-serif" }}
                        title="Deadline (optional)"
                      />
                      <button
                        onClick={() => {
                          if (!newTaskTitle.trim()) return;
                          const dl = newTaskDeadline ? new Date(newTaskDeadline + "T23:59:59").toISOString() : undefined;
                          addNewTask(newTaskTitle.trim(), newTaskDesc.trim(), newTaskAssignee, newTaskEnergy, dl);
                          setNewTaskTitle("");
                          setNewTaskDesc("");
                          setNewTaskDeadline("");
                          setShowAddTask(false);
                        }}
                        disabled={!newTaskTitle.trim()}
                        style={{
                          padding: "6px 16px", border: "none", borderRadius: 6,
                          background: newTaskTitle.trim() ? PRIMARY : "#ccc",
                          color: "#fff", fontSize: 12, fontWeight: 600,
                          cursor: newTaskTitle.trim() ? "pointer" : "not-allowed",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setShowAddTask(false)}
                        style={{
                          padding: "6px 12px", border: "none", borderRadius: 6,
                          background: "transparent", color: TEXT_LIGHT, fontSize: 12,
                          cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* DAG view */}
                <DagView
                  nodes={currentNodes}
                  energyFilter={energyFilter}
                  assigneeFilter={assigneeFilter}
                  focusCategory={focusCategory}
                  results={results}
                  onMarkDone={markDone}
                  onRunAgent={handleRunAgent}
                  onAddNote={addNote}
                  projectSummary={plan?.summary || brief}
                  doneSubtaskIds={doneSubtaskIds}
                  onToggleSubtask={toggleSubtask}
                  allTasks={allTasks}
                  executionMode={executionMode}
                  userTools={userTools}
                  onEditTask={editTask}
                  onDecompose={handleDecompose}
                  doneIds={doneIds}
                  currentNodes={currentNodes}
                />
              </div>
            )}
          </div>
          );
        })()}
      </main>

      {/* Undo toast */}
      {undoToast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#37352F",
          color: "#fff",
          padding: "12px 20px",
          borderRadius: 10,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
          zIndex: 1000,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          <span>Task completed.</span>
          <button
            onClick={() => unmarkDone(undoToast.id)}
            style={{
              background: "none",
              border: "none",
              color: PRIMARY,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
