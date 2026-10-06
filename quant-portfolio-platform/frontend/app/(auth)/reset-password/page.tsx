"use client";

import { Check, Eye, EyeOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Alert, Button, Card, Field } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { setUser } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "Contains a letter", ok: /[a-zA-Z]/.test(password) },
    { label: "Contains a number", ok: /\d/.test(password) },
  ];
  const valid = rules.every((r) => r.ok) && confirm === password && token.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: User }>("/auth/reset-password", { body: { token, password } });
      setUser(res.user);
      router.push(res.user.onboarded ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!token)
    return (
      <Card className="p-7 shadow-lift sm:p-9">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tightest text-ink">Reset link missing</h1>
        <p className="mt-2 text-sm text-ink-2">This page needs the link from your reset email.</p>
        <Link href="/forgot-password" className="mt-4 block text-sm font-medium text-brand-600 hover:underline">
          Request a new link
        </Link>
      </Card>
    );

  return (
    <Card className="p-7 shadow-lift sm:p-9">
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tightest text-ink">Choose a new password</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Setting a new password signs out every other device.</p>

      {error ? (
        <div className="mt-4">
          <Alert kind="error">
            {error}{" "}
            <Link href="/forgot-password" className="font-medium underline">
              Request a new link
            </Link>
          </Alert>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="New password" htmlFor="password">
          <div className="relative">
            <input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-11"
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
          <ul className="mt-2 space-y-1">
            {rules.map((r) => (
              <li key={r.label} className="flex items-center gap-1.5 text-xs text-ink-2">
                {r.ok ? <Check className="h-3.5 w-3.5 text-pos" /> : <X className="h-3.5 w-3.5 text-ink-3" />}
                {r.label}
              </li>
            ))}
          </ul>
        </Field>

        <Field label="Confirm new password" htmlFor="confirm" error={confirm.length > 0 && confirm !== password ? "Passwords do not match" : undefined}>
          <input id="confirm" type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" />
        </Field>

        <Button type="submit" loading={busy} disabled={!valid} className="w-full">
          Set new password
        </Button>
      </form>
    </Card>
  );
}
