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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) return { error: { message: "Supabase not configured" } };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseConfigured) return;
    await supabase.auth.signOut();
  }, []);

  // If Supabase isn't configured, skip auth entirely
  const configured = supabaseConfigured;

  return { user, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut, configured };
}
