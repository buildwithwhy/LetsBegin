"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") {
        // Supabase detected a recovery token — redirect to reset page
        window.location.href = "/auth/reset-password";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabaseConfigured) return { error: { message: "Supabase not configured" } };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabaseConfigured) return { error: { message: "Supabase not configured" } };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    return { error };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabaseConfigured) return { error: { message: "Supabase not configured" } };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback?type=recovery` : undefined,
    });
    return { error };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) return { error: { message: "Supabase not configured" } };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
      },
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseConfigured) return;
    await supabase.auth.signOut();
  }, []);

  const configured = supabaseConfigured;

  return { user, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword, signOut, configured };
}
