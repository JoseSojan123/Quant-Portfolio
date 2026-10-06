"use client";

import { Check, Eye, EyeOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Card, Field } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

type Signup = { user: User | null; message: string | null; dev_link: string | null; requires_verification: boolean };

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Signup | null>(null);

  const rules = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "Contains a letter", ok: /[a-zA-Z]/.test(password) },
    { label: "Contains a number", ok: /\d/.test(password) },
  ];
  const match = confirm.length > 0 && confirm === password;
  const valid = name.trim().length > 0 && email.includes("@") && rules.every((r) => r.ok) && match && terms;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<Signup>("/auth/signup", {
        body: { full_name: name.trim(), email, password, accept_terms: terms },
      });
      if (res.user) {
        setUser(res.user);
        router.push("/onboarding");
        return;
      }
      setDone(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="p-7 shadow-lift sm:p-9">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tightest text-ink">Check your email</h1>
        <p className="mt-2 text-sm text-ink-2">
          We sent a verification link to <span className="font-medium text-ink">{email}</span>. Open it to finish creating your
          account, then you will be taken to onboarding.
        </p>
        {done.dev_link ? (
          <div className="mt-4">
            <Alert kind="info" title="Development build">
              No mail server is configured, so here is the link:{" "}
              <Link href={done.dev_link.replace(/^https?:\/\/[^/]+/, "")} className="font-medium underline">
                verify this account
              </Link>
            </Alert>
          </div>
        ) : null}
        <p className="mt-5 text-sm text-ink-2">
          Wrong address?{" "}
          <button onClick={() => setDone(null)} className="font-medium text-brand-600 hover:underline">
            Go back
          </button>
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-7 shadow-lift sm:p-9">
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tightest text-ink">Create your account</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">You will enter your holdings manually. We never ask for brokerage credentials.</p>

      {error ? (
        <div className="mt-4">
          <Alert kind="error">{error}</Alert>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="Full name" htmlFor="name">
          <input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Your full name" />
        </Field>

        <Field label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
        </Field>

        <Field label="Password" htmlFor="password">
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

        <Field label="Confirm password" htmlFor="confirm" error={confirm.length > 0 && !match ? "Passwords do not match" : undefined}>
          <input
            id="confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input"
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-2">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line accent-brand-600" />
          <span>
            I understand this is an educational project, that nothing here is investment advice, and I accept the terms and
            privacy notice on the{" "}
            <Link href="/about" className="font-medium text-brand-600 hover:underline">
              about page
            </Link>
            .
          </span>
        </label>

        <Button type="submit" loading={busy} disabled={!valid} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-2">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
