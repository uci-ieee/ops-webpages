import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPS Submissions",
  description: "Project submissions for UCI IEEE Open Project Space",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
