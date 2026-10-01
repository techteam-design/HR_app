import { redirect } from "next/navigation";

// The company-wide leave calendar is the Team calendar (every role, with
// what each role may see decided there). Kept so old links still work.
export default function LeaveCalendarReportPage() {
  redirect("/team-calendar");
}
