import Link from "next/link";

import { AppFrame } from "@/components/app-frame";
import { MembershipRole } from "@prisma/client";

import { formatAuditTimestamp } from "@/lib/audit";
import { createPrepWeekAction, openLatestPrepWeekAction } from "./actions";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const { user, membership } = await requireMembership();
  const prepWeeks = await prisma.prepWeek.findMany({
    where: { workspaceId: membership.workspaceId },
    include: {
      _count: {
        select: {
          submissions: true
        }
      }
    },
    orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }]
  });
  const auditLogs = await prisma.auditLog.findMany({
    where: { workspaceId: membership.workspaceId },
    include: {
      actorUser: true
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  const canEdit = membership.role === MembershipRole.OWNER || membership.role === MembershipRole.EDITOR;

  return (
    <AppFrame user={user} membership={membership}>
      <section className="page-header">
        <p className="eyebrow">Dashboard</p>
        <h1>Shared KvK workspace</h1>
        <p className="muted">
          Prep weeks and player submissions now live in the database. Editors can create and manage them, while viewers
          stay read-only.
        </p>
      </section>

      <section className="card stack">
        <div>
          <h2>Current access</h2>
          <p className="muted">Signed in as {user.displayName || user.username}.</p>
          <div className="inline-actions">
            <span className="pill">Role: {membership?.role || "No workspace role"}</span>
            <span className="pill">Status: {user.isActive ? "Active" : "Disabled"}</span>
          </div>
        </div>

        <div className="stack">
          <div className="inline-actions">
            {prepWeeks.length ? (
              <form action={openLatestPrepWeekAction}>
                <button className="button" type="submit">
                  Open Latest Prep Week
                </button>
              </form>
            ) : null}
            {canEdit ? (
              <Link href="/admin/users" className="button-secondary">
                Manage Users
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {canEdit ? (
        <section className="card">
          <h2>Create prep week</h2>
          <form action={createPrepWeekAction} className="form-grid two-col">
            <label>
              Prep week name
              <input name="name" type="text" placeholder="April KvK Prep Week" required />
            </label>
            <label>
              Start date
              <input name="startsOn" type="date" />
            </label>
            <div className="inline-actions">
              <button className="button" type="submit">
                Create Prep Week
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card">
        <h2>Prep weeks</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Start</th>
                <th>Submissions</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {prepWeeks.map((prepWeek) => (
                <tr key={prepWeek.id}>
                  <td>{prepWeek.name}</td>
                  <td>{prepWeek.startsOn ? prepWeek.startsOn.toISOString().slice(0, 10) : "Not set"}</td>
                  <td>{prepWeek._count.submissions}</td>
                  <td>
                    <Link href={`/prep-weeks/${prepWeek.id}`} className="button-secondary">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {!prepWeeks.length ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No prep weeks created yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Recent activity</h2>
        <div className="stack">
          {auditLogs.map((log) => (
            <div className="notice" key={log.id}>
              <strong>{log.summary}</strong>
              <div className="muted">
                {log.actorUser?.username || "System"} | {log.action} | {formatAuditTimestamp(log.createdAt)}
              </div>
            </div>
          ))}
          {!auditLogs.length ? <p className="muted">No audit activity yet.</p> : null}
        </div>
      </section>
    </AppFrame>
  );
}
