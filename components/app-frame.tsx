import Link from "next/link";
import { MembershipRole } from "@prisma/client";

import { signOutAction } from "@/lib/auth-actions";

type AppFrameProps = {
  user: {
    username: string;
    displayName: string | null;
  };
  membership: {
    role: string;
  } | null;
  children: React.ReactNode;
};

export function AppFrame({ user, membership, children }: AppFrameProps) {
  const role = membership?.role || "NO_ACCESS";
  const isOwner = membership?.role === MembershipRole.OWNER;

  return (
    <main className="app-shell">
      <nav className="nav-bar">
        <div>
          <div className="nav-brand">KvK Prep Helper</div>
          <div className="muted">
            {user.displayName || user.username} | {role}
          </div>
        </div>
        <div className="nav-links">
          <Link href="/dashboard" className="button-secondary">
            Dashboard
          </Link>
          {isOwner ? (
            <Link href="/admin/users" className="button-secondary">
              Users
            </Link>
          ) : null}
          <form action={signOutAction}>
            <button className="button-secondary" type="submit">
              Sign Out
            </button>
          </form>
        </div>
      </nav>
      {children}
    </main>
  );
}
