import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./utilities.css";
import "./style.css";
import "./dashboard.css";
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Deccan Drift · Growth Center",
  description: "Festival attendance, campaign performance and team actions.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={sans.variable}>
      <body className="antialiased tabular-nums">{children}</body>
    </html>
  );
}
