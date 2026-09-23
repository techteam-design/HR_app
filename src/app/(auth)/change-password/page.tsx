import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requireEmployee } from "@/server/auth.service";

export default async function ChangePasswordPage() {
  const employee = await requireEmployee({ allowPendingPasswordChange: true });

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Change password</h1>
      <p className="mt-1 text-sm text-slate-600">
        {employee.mustChangePassword
          ? "Before you continue, please choose a new password."
          : "Choose a new password. Your other devices will be signed out."}
      </p>

      <div className="mt-6">
        <ChangePasswordForm />
      </div>
    </>
  );
}
