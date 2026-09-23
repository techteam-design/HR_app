import { notFound } from "next/navigation";

import { PlaceholderPanel } from "@/components/layout/page-placeholder";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { ArchCard, Card } from "@/components/ui/card";
import { DateTile } from "@/components/ui/date-tile";
import { PlusIcon } from "@/components/ui/icons";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { PageHeader } from "@/components/ui/page-header";
import { SparkleDivider } from "@/components/ui/sparkle-divider";
import { SpaIllustration } from "@/components/ui/spa-illustration";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata = { title: "Design preview" };

// Development-only catalogue of the design system components.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-section-title font-medium text-plum-900">{title}</h2>
      {children}
    </section>
  );
}

const upcoming = [
  {
    month: "Oct",
    day: 14,
    title: "Annual leave",
    detail: "14–16 Oct · 3 days",
    status: "approved" as const,
    tile: "dark" as const,
  },
  {
    month: "Nov",
    day: 3,
    title: "Unpaid leave",
    detail: "3 Nov · Half day (morning)",
    status: "pending" as const,
    tile: "light" as const,
    unpaid: true,
  },
];

export default function DesignPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-14 px-4 py-10 md:px-10">
      <PageHeader
        title={
          <>
            Good afternoon, <em>Maria</em>
          </>
        }
        action={
          <ButtonLink href="#">
            <PlusIcon width={18} height={18} />
            Apply for leave
          </ButtonLink>
        }
      />

      <Section title="Leave balances (ArchCard)">
        <div className="grid gap-4 sm:grid-cols-3">
          <ArchCard
            tint="lilac"
            label="Annual leave"
            value={9}
            caption="of 12 days left"
            note="Includes 2 carried forward"
            progress={9 / 12}
          />
          <ArchCard tint="blush" label="Medical (MC)" value={13} caption="of 14 days left" progress={13 / 14} />
          <ArchCard tint="sage" label="Unpaid" value={7} caption="of 7 days left" progress={7 / 7} />
        </div>
      </Section>

      <Section title="Upcoming leave (DateTile + StatusBadge)">
        <Card className="divide-y divide-border p-0 sm:p-0">
          {upcoming.map((item) => (
            <div key={item.title} className="flex items-center gap-4 p-4 sm:p-5">
              <DateTile month={item.month} day={item.day} variant={item.tile} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-plum-900">{item.title}</p>
                <p className="text-[13px] text-muted">{item.detail}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {item.unpaid && <StatusBadge status="unpaid" />}
                <StatusBadge status={item.status} />
              </div>
            </div>
          ))}
        </Card>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="approved" />
          <StatusBadge status="pending" />
          <StatusBadge status="rejected" />
          <StatusBadge status="cancelled" />
          <StatusBadge status="unpaid" />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button loading loadingText="Saving…">
            Save
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
        <div className="max-w-sm">
          <Button fullWidth>Full width</Button>
        </div>
      </Section>

      <Section title="Inputs">
        <Card className="grid max-w-xl gap-5">
          <div className="space-y-2">
            <Label htmlFor="preview-email">Email</Label>
            <Input id="preview-email" type="email" placeholder="name@example.com" />
            <FieldHint>We&apos;ll never share it.</FieldHint>
          </div>
          <div className="space-y-2">
            <Label htmlFor="preview-password">New password</Label>
            <Input
              id="preview-password"
              type="password"
              defaultValue="short"
              invalid
              aria-describedby="preview-password-error"
            />
            <FieldError id="preview-password-error">
              New password must be at least 12 characters
            </FieldError>
          </div>
          <Alert>Invalid email or password</Alert>
          <Alert tone="notice">Your session has ended. Please sign in again.</Alert>
        </Card>
      </Section>

      <Section title="Avatar, logo, divider">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name="Maria Santos" size="sm" />
          <Avatar name="Chua Mei Ling" size="md" />
          <Avatar name="Aisha Rahman" size="lg" />
          <Logo variant="mono" width={84} />
          <Logo variant="full" width={160} />
        </div>
        <SparkleDivider className="max-w-sm" />
      </Section>

      <Section title="Spa illustration">
        <div className="w-56 overflow-hidden rounded-arch">
          <SpaIllustration />
        </div>
      </Section>

      <Section title="Page placeholder">
        <PlaceholderPanel
          title="Leave policies"
          sprint="Sprint 2"
          description="Entitlements, eligibility, notice and carry-forward rules per leave type."
        />
      </Section>

      <Section title="Type scale">
        <div className="space-y-3">
          <p className="eyebrow text-plum-700">Eyebrow label</p>
          <p className="font-display text-page-title-mobile font-medium md:text-page-title">
            Page title with an <em className="text-plum-700 italic">accent</em>
          </p>
          <p className="font-display text-section-title font-medium">Section title</p>
          <p className="text-[15px]">Body text in Montserrat, 15px.</p>
          <p className="text-[13px] text-muted">Small muted text, 13px.</p>
        </div>
      </Section>
    </main>
  );
}
