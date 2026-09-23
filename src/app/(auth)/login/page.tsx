import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";
import { SparkleDivider } from "@/components/ui/sparkle-divider";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;

  return (
    <>
      <p className="eyebrow text-plum-700">Team portal</p>
      <h1 className="mt-3 font-display text-page-title-mobile font-medium text-plum-900 md:text-page-title">
        Welcome <em>back</em>.<span className="hidden md:inline"> Sign in to continue.</span>
      </h1>

      {session === "expired" && (
        <Alert tone="notice" className="mt-6">
          Your session has ended. Please sign in again.
        </Alert>
      )}

      <div className="mt-8">
        <LoginForm />
      </div>

      <SparkleDivider className="mt-8" />

      <p className="mt-6 text-center text-sm text-muted">
        Forgot your password? Contact your HR admin.
      </p>
    </>
  );
}
