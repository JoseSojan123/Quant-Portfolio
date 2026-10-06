"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Spinner } from "@/components/ui";
import { useRequireAuth } from "@/lib/auth";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth();
  if (loading || !user)
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner label={loading ? "Loading your portfolio" : "Redirecting to sign in"} />
      </div>
    );
  return (
    <AppShell>
      <div id="main">{children}</div>
    </AppShell>
  );
}
