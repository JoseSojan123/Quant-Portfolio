"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { Alert, Card, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setError("This page needs the verification link from your email.");
      return;
    }
    api<{ user: User }>("/auth/verify-email", { body: { token } })
      .then((res) => {
        setUser(res.user);
        router.replace(res.user.onboarded ? "/dashboard" : "/onboarding");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [token, router, setUser]);

  return (
    <Card className="p-7 shadow-lift sm:p-9">
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tightest text-ink">Verifying your email</h1>
      {error ? (
        <div className="mt-4 space-y-4">
          <Alert kind="error">{error}</Alert>
          <Link href="/login" className="block text-sm font-medium text-brand-600 hover:underline">
            Go to sign in and request a new link
          </Link>
        </div>
      ) : (
        <Spinner label="One moment" />
      )}
    </Card>
  );
}
