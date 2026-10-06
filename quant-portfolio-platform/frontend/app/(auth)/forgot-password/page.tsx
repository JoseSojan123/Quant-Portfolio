"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, Button, Card, Field } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ message: string; dev_link: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent(await api<{ message: string; dev_link: string | null }>("/auth/forgot-password", { body: { email } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-7 shadow-lift sm:p-9">
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tightest text-ink">Reset your password</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Enter your email and we will send a reset link that is valid for one hour.</p>

      {sent ? (
        <div className="mt-5 space-y-4">
          <Alert kind="success">{sent.message}</Alert>
          {sent.dev_link ? (
            <Alert kind="info" title="Development build">
              No mail server is configured, so here is the link:{" "}
              <Link href={sent.dev_link.replace(/^https?:\/\/[^/]+/, "")} className="font-medium underline">
                reset your password
              </Link>
            </Alert>
          ) : null}
          <Link href="/login" className="block text-center text-sm font-medium text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          {error ? (
            <div className="mt-4">
              <Alert kind="error">{error}</Alert>
            </div>
          ) : null}
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Email" htmlFor="email">
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
            </Field>
            <Button type="submit" loading={busy} disabled={!email.includes("@")} className="w-full">
              Send reset link
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-ink-2">
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </Card>
  );
}
