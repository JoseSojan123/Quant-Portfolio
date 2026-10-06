"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Alert, Button, Card, Field, Toggle } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAuth();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [notice, setNotice] = useState<string | null>(params.get("verified") ? "Email verified. You can sign in now." : null);
  const [devLink, setDevLink] = useState<string | null>(null);

  const invalid = !email.includes("@") || password.length < 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNeedsVerify(false);
    try {
      const res = await api<{ user: User }>("/auth/login", { body: { email, password, remember_me: remember } });
      setUser(res.user);
      router.push(res.user.onboarded ? next : "/onboarding");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setNeedsVerify(true);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const res = await api<{ message: string; dev_link: string | null }>("/auth/resend-verification", { body: { email } });
      setNotice(res.message);
      setDevLink(res.dev_link);
      setNeedsVerify(false);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="p-7 shadow-lift sm:p-9">
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tightest text-ink">Sign in</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Welcome back. Your portfolios are private to your account.</p>

      {notice ? (
        <div className="mt-4">
          <Alert kind="success">
            {notice}
            {devLink ? (
              <>
                {" "}
                <Link href={devLink.replace(/^https?:\/\/[^/]+/, "")} className="font-medium underline">
                  Open the verification link
                </Link>
                <span className="block text-xs">(shown because this is a development build with no mail server)</span>
              </>
            ) : null}
          </Alert>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Alert kind="error">
            {error}
            {needsVerify ? (
              <>
                {" "}
                <button onClick={resend} className="font-medium underline">
                  Send a new verification link
                </button>
              </>
            ) : null}
          </Alert>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <div className="relative">
            <input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-11"
              placeholder="Your password"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-ink-3 hover:bg-black/[0.05] hover:text-ink-2"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Toggle checked={remember} onChange={setRemember} label="Keep me signed in" />
          <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={busy} disabled={invalid} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-2">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
