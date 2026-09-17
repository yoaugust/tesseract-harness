import { InboxIcon, MessageSquarePlusIcon, PanelsTopLeftIcon } from "lucide-react";
import { Link, useLocation } from "@/lib/routing";
import { cn } from "@/lib/utils";

interface MobileCommandNavProps {
  onOpenSessions: () => void;
}

/** Phone-only command dock. Active chats intentionally hide it to maximize focus. */
export function MobileCommandNav({ onOpenSessions }: MobileCommandNavProps) {
  const location = useLocation();
  const homeActive = location.pathname === "/";
  const inboxActive = location.pathname === "/inbox";

  const itemClass = "mobile-command-nav-item";

  return (
    <nav className="mobile-command-nav md:hidden" aria-label="Mobile navigation">
      <Link
        to="/"
        className={itemClass}
        data-active={homeActive ? "true" : undefined}
        componentId="mobile_nav.new_session"
      >
        <MessageSquarePlusIcon className="size-4" />
        <span>New</span>
      </Link>
      <button
        type="button"
        className={cn(itemClass, "border-0")}
        onClick={onOpenSessions}
        data-testid="mobile-command-sessions"
      >
        <PanelsTopLeftIcon className="size-4" />
        <span>Sessions</span>
      </button>
      <Link
        to="/inbox"
        className={itemClass}
        data-active={inboxActive ? "true" : undefined}
        componentId="mobile_nav.inbox"
      >
        <InboxIcon className="size-4" />
        <span>Inbox</span>
      </Link>
    </nav>
  );
}
