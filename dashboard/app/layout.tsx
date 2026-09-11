import "./globals.css";
import type { Metadata } from "next";
import { Nav } from "./components/Nav";

export const metadata: Metadata = {
  title: "ECE Pipeline Dashboard",
  description: "Control panel for the early-childhood content pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <div className="brand">
              ECE Pipeline
              <small>Content control panel</small>
            </div>
            <Nav />
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
