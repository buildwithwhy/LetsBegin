"use client";

import { useEffect } from "react";
import { PRIMARY, TEXT, TEXT_LIGHT, SURFACE, BORDER, FONT } from "@/lib/styles";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: FONT,
        background: SURFACE,
      }}
    >
      <div
        style={{
          textAlign: "center",
          maxWidth: 400,
          padding: 40,
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          background: SURFACE,
        }}
      >
        <div
          style={{
            fontSize: 48,
            marginBottom: 16,
          }}
        >
          &#128533;
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: TEXT,
            margin: "0 0 8px 0",
            fontFamily: FONT,
          }}
        >
          Something went wrong
        </h2>
        <p
          style={{
            fontSize: 14,
            color: TEXT_LIGHT,
            margin: "0 0 24px 0",
            lineHeight: 1.5,
          }}
        >
          An unexpected error occurred. You can try again and things will
          probably be fine.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            border: "none",
            background: PRIMARY,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
