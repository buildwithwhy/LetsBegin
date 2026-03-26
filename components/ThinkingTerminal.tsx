"use client";

import { useRef, useEffect } from "react";

export function ThinkingTerminal({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);

  return (
    <pre
      ref={ref}
      style={{
        background: "#1C1C1E",
        color: "#8FBC8F",
        fontFamily: "'DM Mono', 'Fira Code', monospace",
        fontSize: 13,
        lineHeight: 1.6,
        padding: 20,
        borderRadius: 12,
        maxHeight: 320,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {text}
      <span style={{ animation: "blink 1s step-end infinite" }}>_</span>
      <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
    </pre>
  );
}
