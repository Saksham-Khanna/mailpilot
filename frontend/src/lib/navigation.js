import { Inbox, LayoutDashboard, ScrollText, Send, Settings, Target } from "lucide-react";

export const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, implemented: true },
  { id: "inbox", label: "Inbox", icon: Inbox, implemented: true },
  { id: "opportunities", label: "Opportunities", icon: Target, implemented: true, blurb: "Job and internship opportunities extracted from your email will be listed here." },
  { id: "drafts", label: "Reply Drafts", icon: Send, implemented: true, blurb: "Reply drafts written from your resume will wait here for your review." },
  { id: "logs", label: "Activity Logs", icon: ScrollText, implemented: true, blurb: "An audit trail of everything the agent does, including every approved send." },
  { id: "settings", label: "Settings", icon: Settings, implemented: true, blurb: "Manage your account, connected services, and application preferences." },
];
