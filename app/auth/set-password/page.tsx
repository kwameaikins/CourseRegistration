'use client';

// Where an invite or password-recovery link lands (see lib/auth/callback.ts).
// An invited Supabase Auth user has no password at all, so without this screen
// they are signed in exactly once and can never use /login again.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// Stricter than Supabase's minimum_password_length (6, supabase/config.toml)
// on purpose — staff accounts reach payments and participant PII.
const MIN_PASSWORD_LENGTH = 8;

export default function SetPasswordPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The callback route established the session moments ago; if it is missing
  // the link was expired or already used.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setHasSession(Boolean(data.user)))
      .finally(() => setCheckingSession(false));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('The two passwords do not match.');
      return;
    }

    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(error.message || 'Could not set your password. Please try again.');
      setSubmitting(false);
      return;
    }

    // The root page forwards to this role's default landing page.
    router.push('/');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set Your Password</CardTitle>
          <CardDescription>Course Registration Management</CardDescription>
        </CardHeader>
        <CardContent>
          {checkingSession ? (
            <p className="text-sm text-muted-foreground">Checking your link…</p>
          ) : !hasSession ? (
            <div className="space-y-4">
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                This link has expired or has already been used. Ask an administrator to re-send
                your invitation, or request a new password reset.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/auth/forgot-password">Request a password reset</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {errorMessage}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Saving…' : 'Set password and continue'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
