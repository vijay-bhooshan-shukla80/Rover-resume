import { ClerkProvider } from "@clerk/nextjs";
import localFont from "next/font/local";
import "./globals.css";
import "./ui-theme.css";
import "./ui-typography.css";
import { AppShell } from "@/components/AppShell";
import { validClerkPublishableKey } from "@/lib/clerk-keys";
import { clerkConfigured } from "@/lib/auth";
import { clerkAppearance } from "@/lib/clerk-appearance";

const uiInter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter-ui",
  weight: "100 900",
  style: "normal",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const metadata = {
  title: "AI Resume Maker",
  description: "AI resume builder with ATS optimization, editable exports, authentication, and premium downloads.",
};

export default function RootLayout({ children }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkEnabled = clerkConfigured();

  if (!validClerkPublishableKey(publishableKey)) {
    return (
      <html lang="en" className={uiInter.variable}>
        <body>
          <AppShell clerkEnabled={false}>{children}</AppShell>
        </body>
      </html>
    );
  }
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearance}>
      <html lang="en" className={uiInter.variable}>
        <body>
          <AppShell clerkEnabled={clerkEnabled}>{children}</AppShell>
        </body>
      </html>
    </ClerkProvider>
  );
}
