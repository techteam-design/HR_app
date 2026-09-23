import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requireEmployee } from "@/server/auth.service";

export default async function ChangePasswordPage() {
  const employee = await requireEmployee({ allowPendingPasswordChange: true });

  return (
    <>
      <p className="eyebrow text-plum-700">Account security</p>
      <h1 className="mt-3 font-display text-page-title-mobile font-medium text-plum-900 md:text-page-title">
        Choose a new <em>password</em>
      </h1>
      <p className="mt-3 text-[15px] text-muted">
        {employee.mustChangePassword
          ? "Before you continue, please choose a new password."
          : "Choose a new password. Your other devices will be signed out."}
      </p>

      <div className="mt-8">
        <ChangePasswordForm />
      </div>
    </>
  );
}
