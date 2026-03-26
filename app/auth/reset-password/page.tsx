"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PRIMARY, BORDER, TEXT, TEXT_LIGHT, SURFACE } from "@/lib/styles";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Supabase will auto-detect the recovery token from the URL hash
  // and set the session when this page loads

  const handleReset = async () => {
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          maxWidth: 380, padding: "32px 24px", borderRadius: 14,
          background: SURFACE, border: `1px solid ${BORDER}`, textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#10003;</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 8 }}>Password updated!</h2>
          <p style={{ fontSize: 13, color: TEXT_LIGHT, marginBottom: 20 }}>You can now use your new password to sign in.</p>
          <a
            href="/"
            style={{
              display: "inline-block", padding: "10px 24px", borderRadius: 10,
              background: PRIMARY, color: "#fff", fontSize: 14, fontWeight: 600,
              textDecoration: "none", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        maxWidth: 380, width: "100%", padding: "32px 24px", borderRadius: 14,
        background: SURFACE, border: `1px solid ${BORDER}`, textAlign: "center",
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Set a new password</h2>
        <p style={{ fontSize: 13, color: TEXT_LIGHT, marginBottom: 20 }}>Enter your new password below.</p>

        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", fontSize: 14,
            fontFamily: "'DM Sans', sans-serif", borderRadius: 8,
            border: `1px solid ${BORDER}`, outline: "none",
            boxSizing: "border-box", marginBottom: 8,
          }}
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleReset()}
          style={{
            width: "100%", padding: "10px 12px", fontSize: 14,
            fontFamily: "'DM Sans', sans-serif", borderRadius: 8,
            border: `1px solid ${BORDER}`, outline: "none",
            boxSizing: "border-box", marginBottom: 12,
          }}
        />

        {error && (
          <div style={{ fontSize: 12, color: "#CF522E", marginBottom: 12 }}>{error}</div>
        )}

        <button
          onClick={handleReset}
          disabled={loading}
          style={{
            width: "100%", padding: "10px 16px", borderRadius: 10,
            border: "none", background: loading ? `${PRIMARY}80` : PRIMARY,
            color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {loading ? "Updating..." : "Update password"}
        </button>
      </div>
    </div>
  );
}
