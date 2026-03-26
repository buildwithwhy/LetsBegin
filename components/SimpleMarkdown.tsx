"use client";

import React from "react";
import { PRIMARY } from "@/lib/styles";

export function SimpleMarkdown({ text, color }: { text: string; color?: string }) {
  const lines = text.split("\n");
  return (
    <span>
      {lines.map((line, li) => {
        const isNumberedList = /^\d+\.\s/.test(line);
        const isBullet = /^[-*]\s/.test(line);
        const content = isNumberedList || isBullet ? line.replace(/^(\d+\.\s|[-*]\s)/, "") : line;
        const prefix = isNumberedList ? line.match(/^(\d+\.)\s/)?.[1] + " " : isBullet ? "\u2022 " : "";

        const rendered = inlineMarkdown(content, color);

        return (
          <span key={li}>
            {li > 0 && <br />}
            {(isNumberedList || isBullet) && (
              <span style={{ fontWeight: 500 }}>{prefix}</span>
            )}
            {rendered}
          </span>
        );
      })}
    </span>
  );
}

export function inlineMarkdown(text: string, color?: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code`, and [text](url)
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // **bold**
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      // `code`
      parts.push(
        <code
          key={match.index}
          style={{
            background: color === "#fff" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)",
            padding: "1px 4px",
            borderRadius: 3,
            fontSize: "0.9em",
          }}
        >
          {match[4]}
        </code>
      );
    } else if (match[5] && match[6]) {
      // [text](url)
      parts.push(
        <a
          key={match.index}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: color === "#fff" ? "#c4b5fd" : PRIMARY, textDecoration: "underline" }}
        >
          {match[5]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
