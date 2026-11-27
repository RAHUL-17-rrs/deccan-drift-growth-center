import type { Metadata } from "next";
import "./utilities.css";
import "./style.css";
import "./dashboard.css";
export const metadata: Metadata = {
  title: "Deccan Drift · Growth Center",
  description: "Festival attendance, campaign performance and team actions.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="antialiased tabular-nums">{children}</body>
    </html>
  );
}
