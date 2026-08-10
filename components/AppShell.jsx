"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/Navbar";

export function AppShell({ children, clerkEnabled = true }) {
  const pathname = usePathname();
  const showNavbar = pathname !== "/";

  return (
    <>
      {showNavbar ? <Navbar clerkEnabled={clerkEnabled} /> : null}
      {children}
    </>
  );
}
