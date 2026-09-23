"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { signIn } from "@/lib/auth/auth-client";
import { loginSchema } from "@/validations/auth";

const GENERIC_ERROR = "Invalid email or password";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) {
      setError(GENERIC_ERROR);
      return;
    }

    setPending(true);
    const { error: signInError } = await signIn.email(parsed.data);
    if (signInError) {
      setPending(false);
      setError(
        signInError.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : GENERIC_ERROR,
      );
      return;
    }

    // The dashboard layout sends users who must change their password onward.
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          invalid={!!error}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          invalid={!!error}
        />
      </div>

      {error && <Alert>{error}</Alert>}

      <Button type="submit" fullWidth loading={pending} loadingText="Signing in…">
        Sign in
      </Button>
    </form>
  );
}
