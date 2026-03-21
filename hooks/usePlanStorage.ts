"use client";

import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Plan, DagNode } from "@/lib/dag";

interface StoredPlan {
  id: string;
  brief: string;
  project_title: string;
  summary: string;
  nodes: DagNode[];
  done_ids: string[];
  done_subtask_ids: string[];
  created_at: string;
  updated_at: string;
}

export function usePlanStorage(userId: string | undefined) {
  const savePlan = useCallback(
    async (brief: string, plan: Plan, doneIds: Set<string>, doneSubtaskIds: Set<string>) => {
      if (!userId) return null;

      // Check if a plan for this brief already exists
      const { data: existing } = await supabase
        .from("plans")
        .select("id")
        .eq("user_id", userId)
        .eq("brief", brief)
        .limit(1);

      if (existing && existing.length > 0) {
        // Update existing plan
        const { data, error } = await supabase
          .from("plans")
          .update({
            project_title: plan.project_title,
            summary: plan.summary,
            nodes: plan.nodes,
            done_ids: Array.from(doneIds),
            done_subtask_ids: Array.from(doneSubtaskIds),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing[0].id)
          .select()
          .single();
        if (error) console.error("Update plan error:", error);
        return data;
      } else {
        // Insert new plan
        const { data, error } = await supabase
          .from("plans")
          .insert({
            user_id: userId,
            brief,
            project_title: plan.project_title,
            summary: plan.summary,
            nodes: plan.nodes,
            done_ids: Array.from(doneIds),
            done_subtask_ids: Array.from(doneSubtaskIds),
          })
          .select()
          .single();
        if (error) console.error("Insert plan error:", error);
        return data;
      }
    },
    [userId]
  );

  const loadPlans = useCallback(async (): Promise<StoredPlan[]> => {
    if (!userId) return [];
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("Load plans error:", error);
      return [];
    }
    return (data || []) as StoredPlan[];
  }, [userId]);

  const updateProgress = useCallback(
    async (planId: string, doneIds: Set<string>, doneSubtaskIds: Set<string>) => {
      if (!userId) return;
      const { error } = await supabase
        .from("plans")
        .update({
          done_ids: Array.from(doneIds),
          done_subtask_ids: Array.from(doneSubtaskIds),
          updated_at: new Date().toISOString(),
        })
        .eq("id", planId)
        .eq("user_id", userId);
      if (error) console.error("Update progress error:", error);
    },
    [userId]
  );

  const deletePlan = useCallback(
    async (planId: string) => {
      if (!userId) return;
      const { error } = await supabase
        .from("plans")
        .delete()
        .eq("id", planId)
        .eq("user_id", userId);
      if (error) console.error("Delete plan error:", error);
    },
    [userId]
  );

  return { savePlan, loadPlans, updateProgress, deletePlan };
}
