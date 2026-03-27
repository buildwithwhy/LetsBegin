"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ExecutionMode, UserToolConfig, UserProfile } from "@/lib/styles";

export interface UserSettings {
  execution_mode: ExecutionMode;
  user_tools: UserToolConfig;
  user_profile: UserProfile;
  has_onboarded: boolean;
  focus_mode: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  execution_mode: "api",
  user_tools: { available: [] },
  user_profile: { mode: null, hasAiTools: false, setupMcp: false },
  has_onboarded: false,
  focus_mode: false,
};

export function useUserSettings(userId: string | undefined) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const settingsRef = useRef<UserSettings | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Load settings from Supabase on mount / userId change
  useEffect(() => {
    if (!userId) {
      setSettings(null);
      setLoaded(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (cancelled) return;

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows returned, which is expected for new users
        console.error("Load user settings error:", error);
      }

      if (data) {
        const loaded: UserSettings = {
          execution_mode: (data.execution_mode as ExecutionMode) ?? DEFAULT_SETTINGS.execution_mode,
          user_tools: (data.user_tools as UserToolConfig) ?? DEFAULT_SETTINGS.user_tools,
          user_profile: (data.user_profile as UserProfile) ?? DEFAULT_SETTINGS.user_profile,
          has_onboarded: (data.has_onboarded as boolean) ?? DEFAULT_SETTINGS.has_onboarded,
          focus_mode: (data.focus_mode as boolean) ?? DEFAULT_SETTINGS.focus_mode,
        };
        settingsRef.current = loaded;
        setSettings(loaded);
      } else {
        settingsRef.current = null;
        setSettings(null);
      }

      setLoading(false);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const saveSettings = useCallback(
    (partial: Partial<UserSettings>) => {
      if (!userIdRef.current) return;

      const merged: UserSettings = {
        ...(settingsRef.current ?? DEFAULT_SETTINGS),
        ...partial,
      };
      settingsRef.current = merged;
      setSettings(merged);

      // Debounce the actual DB write
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(async () => {
        const uid = userIdRef.current;
        if (!uid) return;

        const current = settingsRef.current ?? DEFAULT_SETTINGS;
        const { error } = await supabase
          .from("user_settings")
          .upsert(
            {
              user_id: uid,
              execution_mode: current.execution_mode,
              user_tools: current.user_tools,
              user_profile: current.user_profile,
              has_onboarded: current.has_onboarded,
              focus_mode: current.focus_mode,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

        if (error) {
          console.error("Save user settings error:", error);
        }
      }, 500);
    },
    [] // stable — uses refs internally
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return { settings, loading, saveSettings, loaded };
}
