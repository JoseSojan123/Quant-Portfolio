"use client";

import { BadgeCheck, MailWarning } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, Badge, Button, Card, CardHead, Field, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import type { PortfolioSummary, User } from "@/lib/types";

export default function ProfilePage() {
  const { user, setUser, refresh, logout } = useAuth();
  const router = useRouter();
  const { data: portfolios } = useSWR<PortfolioSummary[]>("/portfolios");

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameDone, setNameDone] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState<string | null>(null);

  const [resendDone, setResendDone] = useState<string | null>(null);
  const [outBusy, setOutBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setName(user.full_name ?? "");
  }, [user]);

  if (!user) return <Skeleton className="h-96" />;

  async function saveName() {
    setSavingName(true);
    setError(null);
    try {
      const updated = await api<User>("/me", { method: "PATCH", body: { full_name: name.trim() } });
      setUser(updated);
      setNameDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword() {
    setError(null);
    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      const res = await api<{ message?: string }>("/auth/change-password", {
        method: "POST",
        body: { current_password: current, new_password: next },
      });
      setPwDone(res.message ?? "Password changed. Other sessions have been signed out.");
      setCurrent("");
      setNext("");
      setConfirm("");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPwBusy(false);
    }
  }

  async function resendVerification() {
    setError(null);
    if (!user) return;
    try {
      const res = await api<{ message?: string; dev_link?: string }>("/auth/resend-verification", {
        method: "POST",
        body: { email: user.email },
      });
      setResendDone(res.dev_link ? `Verification link (development only): ${res.dev_link}` : (res.message ?? "Verification email sent."));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function signOutEverywhere() {
    setOutBusy(true);
    setError(null);
    try {
      await api("/auth/logout-all", { method: "POST" });
      setUser(null);
      router.push("/login");
    } catch (e) {
      setError(errorMessage(e));
      setOutBusy(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      await api("/me", { method: "DELETE" });
      setUser(null);
      router.push("/");
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  const holdings = (portfolios ?? []).reduce((n, p) => n + p.holdings_count, 0);

  return (
    <>
      <PageHeader title="Profile and security" subtitle="Your account details, password and sessions." />

      {error ? <Alert kind="error">{error}</Alert> : null}

      {user.is_guest ? (
        <div className="mb-5">
          <Alert kind="warning" title="This is a demo account">
            Demo accounts are temporary and are deleted automatically. Create a real account to keep your portfolios, then
            re-enter your holdings there.
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHead title="Account" />
          <dl className="divide-y divide-line">
            {[
              ["Email", user.email],
              ["Member since", dateTime(user.created_at)],
              ["Last sign-in", user.last_login_at ? dateTime(user.last_login_at) : "this session"],
              ["Portfolios", `${(portfolios ?? []).length} with ${holdings} holdings in total`],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3.5 sm:px-6">
                <dt className="label min-w-[7.5rem]">{k}</dt>
                <dd className="text-sm text-ink">{v}</dd>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
              <dt className="label min-w-[7.5rem]">Email status</dt>
              <dd>
                {user.email_verified ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-pos">
                    <BadgeCheck className="h-4 w-4" aria-hidden />
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-2 text-sm text-warn">
                    <MailWarning className="h-4 w-4" aria-hidden />
                    Not verified
                    <Button variant="ghost" size="sm" onClick={resendVerification}>
                      Resend link
                    </Button>
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {resendDone ? (
            <div className="card-pad border-t border-hair">
              <p className="break-all text-xs text-ink-2">{resendDone}</p>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHead title="Your name" subtitle="Shown in the top bar and in greetings." />
          <div className="card-pad space-y-3">
            <Field label="Full name" htmlFor="name">
              <input
                id="name"
                className="input"
                value={name}
                maxLength={120}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameDone(false);
                }}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button onClick={saveName} loading={savingName} disabled={!name.trim() || name.trim() === user.full_name}>
                Save name
              </Button>
              {nameDone ? <span className="text-sm text-pos">Saved.</span> : null}
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Change password" subtitle="Changing it signs out every other device." />
          <div className="card-pad space-y-3">
            <Field label="Current password" htmlFor="cur">
              <input id="cur" type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="New password" htmlFor="new" hint="At least 10 characters, with a letter and a number.">
              <input id="new" type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Repeat new password" htmlFor="rep">
              <input id="rep" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            <Button onClick={changePassword} loading={pwBusy} disabled={!current || !next || !confirm}>
              Change password
            </Button>
            {pwDone ? <Alert kind="success" onClose={() => setPwDone(null)}>{pwDone}</Alert> : null}
          </div>
        </Card>

        <Card>
          <CardHead title="Sessions" subtitle="Sign out of this device, or of every device at once." />
          <div className="card-pad space-y-3">
            <p className="text-sm text-ink-2">
              Your session is a signed token in an httpOnly cookie. Signing out everywhere raises a version number on your
              account, which invalidates every token issued before now.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={async () => {
                  await logout();
                  router.push("/login");
                }}
              >
                Sign out
              </Button>
              <Button variant="secondary" onClick={signOutEverywhere} loading={outBusy}>
                Sign out everywhere
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <Card>
          <CardHead title="Delete account" subtitle="Permanent, and it takes your portfolios, holdings and saved runs with it." />
          <div className="card-pad space-y-3">
            <Field label={`Type DELETE to confirm`} htmlFor="del">
              <input id="del" className="input sm:max-w-xs" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="DELETE" />
            </Field>
            <Button variant="secondary" onClick={deleteAccount} loading={deleting} disabled={confirmDelete !== "DELETE"}>
              Delete my account
            </Button>
            <p className="text-xs text-ink-3">
              There is no undo and nothing is kept. <Badge kind="neutral">{holdings} holdings</Badge> will be removed.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
