import { Logo } from "@/components/ui/logo";
import { SpaIllustration } from "@/components/ui/spa-illustration";

// Shared by /login and /change-password.
// Desktop: lilac illustration panel (~48%) on the left, form on the right.
// Mobile: logo + small arch on a lilac top section, form in a white bottom sheet.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-lilac-50 md:flex-row">
      {/* Illustration panel */}
      <section className="relative flex flex-col items-center px-6 pt-8 pb-10 md:w-[48%] md:items-stretch md:px-12 md:py-10 lg:px-16">
        <div className="md:self-start">
          <Logo variant="full" width={132} priority className="md:w-42" />
        </div>

        <div className="mt-6 flex flex-1 items-center justify-center md:mt-0">
          <div className="w-36 overflow-hidden rounded-arch sm:w-44 md:w-full md:max-w-85 lg:max-w-95">
            <SpaIllustration />
          </div>
        </div>

        <p className="hidden text-center font-display text-2xl font-medium italic text-plum-700 md:block">
          Where beauty takes a breath.
        </p>
      </section>

      {/* Form: bottom sheet on mobile, right column on desktop */}
      <main className="flex flex-1 flex-col rounded-t-sheet bg-surface px-6 pt-8 pb-10 md:items-center md:justify-center md:rounded-none md:px-12">
        <div className="w-full md:max-w-105">{children}</div>
      </main>
    </div>
  );
}
