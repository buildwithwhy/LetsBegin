import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LetsBegin",
  description: "Human-agent coordination layer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily: "'DM Sans', sans-serif",
          background: "#f8f7ff",
          color: "#1a1a2e",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
