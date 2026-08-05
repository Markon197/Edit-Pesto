import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PestoBot",
  description: "A final proofing pass before publishing.",
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('pestobot-theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Runs before paint so a returning dark-mode visitor never sees a
            flash of the light theme. Static string, no user input. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
