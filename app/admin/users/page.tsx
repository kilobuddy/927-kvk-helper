import { MembershipRole } from "@prisma/client";

import { AppFrame } from "@/components/app-frame";
import { createUserAction, updateUserRoleAction } from "./actions";
import { ensureOwner, getCurrentMembership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminUsersPage() {
  const owner = await ensureOwner();
  const currentMembership = await getCurrentMembership(owner.id);

  const [workspaces, memberships] = await Promise.all([
    prisma.workspace.findMany({
      orderBy: { name: "asc" }
    }),
    prisma.membership.findMany({
      include: {
        user: true,
        workspace: true
      },
      orderBy: [{ workspace: { name: "asc" } }, { user: { username: "asc" } }]
    })
  ]);

  return (
    <AppFrame user={owner} membership={currentMembership}>
      <section className="page-header">
        <p className="eyebrow">Admin</p>
        <h1>User Management</h1>
        <p className="muted">
          Only the owner can create accounts. Editors can modify scheduling data. Viewers stay read-only.
        </p>
      </section>

      <section className="card">
        <h2>Create user</h2>
        {workspaces.length ? null : (
          <div className="notice warning">
            Create a workspace first or seed one in the database before adding users.
          </div>
        )}
        <form action={createUserAction} className="form-grid two-col">
          <label>
            Username
            <input name="username" type="text" required />
          </label>
          <label>
            Temporary password
            <input name="password" type="password" minLength={10} required />
          </label>
          <label>
            Workspace
            <select name="workspaceId" defaultValue={workspaces[0]?.id} required>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Role
            <select name="role" defaultValue={MembershipRole.VIEWER}>
              <option value={MembershipRole.EDITOR}>EDITOR</option>
              <option value={MembershipRole.VIEWER}>VIEWER</option>
              <option value={MembershipRole.OWNER}>OWNER</option>
            </select>
          </label>
          <div className="inline-actions">
            <button className="button" type="submit" disabled={!workspaces.length}>
              Create Account
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Users</h2>
        <div className="stack">
          {memberships.map((membership) => (
            <details className="card" key={membership.id}>
              <summary className="space-between" style={{ cursor: "pointer", listStyle: "none" }}>
                <div>
                  <strong>{membership.user.username}</strong>
                  <div className="muted">
                    {membership.role} | {membership.user.isActive ? "Active" : "Disabled"}
                  </div>
                </div>
                <span className="button-secondary">Edit</span>
              </summary>

              <form action={updateUserRoleAction} className="form-grid two-col" style={{ marginTop: 16 }}>
                <input type="hidden" name="userId" value={membership.userId} />
                <input type="hidden" name="membershipId" value={membership.id} />

                <label>
                  Username
                  <input name="username" type="text" defaultValue={membership.user.username} />
                </label>
                <label>
                  New password
                  <input name="password" type="password" minLength={10} placeholder="Leave blank to keep current" />
                </label>
                <label>
                  Access role
                  <select name="role" defaultValue={membership.role}>
                    <option value={MembershipRole.OWNER}>OWNER</option>
                    <option value={MembershipRole.EDITOR}>EDITOR</option>
                    <option value={MembershipRole.VIEWER}>VIEWER</option>
                  </select>
                </label>
                <label>
                  Status
                  <select name="isActive" defaultValue={String(membership.user.isActive)}>
                    <option value="true">Active</option>
                    <option value="false">Disabled</option>
                  </select>
                </label>
                <div className="inline-actions" style={{ gridColumn: "1 / -1" }}>
                  <button className="button-secondary" type="submit">
                    Save User
                  </button>
                </div>
              </form>
            </details>
          ))}

          {!memberships.length ? <p className="muted">No users found yet.</p> : null}
        </div>
      </section>
    </AppFrame>
  );
}
