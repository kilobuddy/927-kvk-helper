import Link from "next/link";

import { AppFrame } from "@/components/app-frame";
import { MembershipRole } from "@prisma/client";

import { formatAuditTimestamp } from "@/lib/audit";
import { createPrepWeekAction, deletePrepWeekAction, openLatestPrepWeekAction } from "./actions";
import { requireMembership } from "@/lib/auth";
import { hasPrepWeekEditLockColumn, prepWeekScalarSelect } from "@/lib/prep-week-lock";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const { user, membership } = await requireMembership();
  const includeEditLock = await hasPrepWeekEditLockColumn();
  const prepWeeks = await prisma.prepWeek.findMany({
    where: { workspaceId: membership.workspaceId },
    select: {
      ...prepWeekScalarSelect(includeEditLock),
      _count: {
        select: {
          submissions: true
        }
      }
    },
    orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }]
  });
  const canEdit = membership.role === MembershipRole.OWNER || membership.role === MembershipRole.EDITOR;
  const isOwner = membership.role === MembershipRole.OWNER;
  const auditLogs = canEdit
    ? await prisma.auditLog.findMany({
        where: { workspaceId: membership.workspaceId },
        include: {
          actorUser: true
        },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    : [];

  return (
    <AppFrame user={user} membership={membership}>
      <section className="page-header">
        <p className="eyebrow">Dashboard</p>
        <h1>Shared KvK workspace</h1>
        <p className="muted">
          Prep weeks and player submissions now live in the database. Owners manage prep weeks and users, editors can
          manage roster and schedule data, and viewers stay read-only.
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
            {isOwner ? (
              <Link href="/admin/users" className="button-secondary">
                Manage Users
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {isOwner ? (
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prepWeeks.map((prepWeek) => (
                <tr key={prepWeek.id}>
                  <td>{prepWeek.name}</td>
                  <td>{prepWeek.startsOn ? prepWeek.startsOn.toISOString().slice(0, 10) : "Not set"}</td>
                  <td>{prepWeek._count.submissions}</td>
                  <td>
                    <div className="inline-actions">
                      <Link href={`/prep-weeks/${prepWeek.id}`} className="button-secondary">
                        Open
                      </Link>
                      {isOwner ? (
                        <form action={deletePrepWeekAction}>
                          <input type="hidden" name="prepWeekId" value={prepWeek.id} />
                          <button className="button-danger" type="submit">
                            Delete
                          </button>
                        </form>
                      ) : null}
                    </div>
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

      {canEdit ? (
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
      ) : null}
    </AppFrame>
  );
}
