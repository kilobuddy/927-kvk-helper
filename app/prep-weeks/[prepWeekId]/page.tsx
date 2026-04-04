import Link from "next/link";
import { DayMode, MembershipRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { AppFrame } from "@/components/app-frame";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { allianceTagOptions } from "@/lib/constants";
import {
  bulkCreateSubmissionsAction,
  createSubmissionAction,
  deleteSubmissionAction,
  generateScheduleAction,
  updateDayModeAction,
  updateSlotAssignmentAction,
  updateSubmissionAction
} from "./actions";
import { requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildEligibleOptionsForSlot,
  buildOverflowForDay,
  computeDaySchedule,
  formatDays,
  formatWindowLabel,
  getDayModeLabel,
  getModeSpeedupKey,
  isSubmissionEligibleForSlot,
  mergeManualAssignments
} from "@/lib/scheduler";

const hourlyOptions = Array.from({ length: 25 }, (_, index) => `${String(index).padStart(2, "0")}:00`);
const dayModeOptions = [
  DayMode.CONSTRUCTION,
  DayMode.RESEARCH,
  DayMode.GENERAL,
  DayMode.TROOP_TRAINING,
  DayMode.AUTO_APPROVE
];

function submissionsPlural(count: number) {
  return count === 1 ? "" : "s";
}

export default async function PrepWeekPage({
  params
}: {
  params: Promise<{ prepWeekId: string }>;
}) {
  const { prepWeekId } = await params;
  const { user, membership } = await requireMembership();
  const canEdit = membership.role === MembershipRole.OWNER || membership.role === MembershipRole.EDITOR;

  const prepWeek = await prisma.prepWeek.findFirst({
    where: {
      id: prepWeekId,
      workspaceId: membership.workspaceId
    },
    include: {
      submissions: {
        include: {
          createdBy: true
        },
        orderBy: [{ playerName: "asc" }]
      },
      days: {
        include: {
          slots: {
            include: {
              submission: true
            },
            orderBy: { slotIndex: "asc" }
          }
        },
        orderBy: { dayNumber: "asc" }
      }
    }
  });

  if (!prepWeek) {
    notFound();
  }

  return (
    <AppFrame user={user} membership={membership}>
      <section className="page-header">
        <p className="eyebrow">Prep Week</p>
        <h1>{prepWeek.name}</h1>
        <p className="muted">
          Shared database-backed player submissions. {canEdit ? "You can edit this roster." : "You have read-only access."}
        </p>
        <div className="inline-actions">
          <Link href="/dashboard" className="button-secondary">
            Back to Dashboard
          </Link>
          {prepWeek.startsOn ? <span className="pill">Starts: {prepWeek.startsOn.toISOString().slice(0, 10)}</span> : null}
        </div>
      </section>

      {canEdit ? (
        <section className="builder-shell">
          <div className="builder-layout">
            <div className="builder-main">
              <p className="eyebrow">Roster</p>
              <h2>Player submissions</h2>
              <section className="card" style={{ marginTop: 16 }}>
                <strong>Add player</strong>
                <div className="muted" style={{ marginTop: 4, marginBottom: 16 }}>Create one submission manually.</div>

                <form action={createSubmissionAction.bind(null, prepWeek.id)} className="form-grid two-col">
                  <label style={{ gridColumn: "1 / -1" }}>
                    Player / alliance
                    <div className="split-input">
                      <select name="allianceTag" defaultValue="">
                        <option value="">Select alliance</option>
                        {allianceTagOptions.map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
                          </option>
                        ))}
                      </select>
                      <input name="playerName" type="text" required />
                    </div>
                  </label>
                  <label>
                    General days
                    <input name="generalSpeedups" type="number" min="0" step="0.5" required />
                  </label>
                  <label>
                    Research days
                    <input name="researchSpeedups" type="number" min="0" step="0.5" required />
                  </label>
                  <label>
                    Construction days
                    <input name="constructionSpeedups" type="number" min="0" step="0.5" required />
                  </label>
                  <label>
                    Troop training days
                    <input name="troopTrainingSpeedups" type="number" min="0" step="0.5" required />
                  </label>
                  <label>
                    Preferred start UTC (24-hour)
                    <select name="preferredStartUtc" defaultValue="00:00">
                      {hourlyOptions.slice(0, -1).map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Preferred end UTC (24-hour)
                    <select name="preferredEndUtc" defaultValue="02:00">
                      {hourlyOptions.slice(1).map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="muted helper-copy" style={{ gridColumn: "1 / -1" }}>
                    Times use 24-hour UTC in 1-hour intervals. Use `00:00` to `24:00` for full-day availability.
                  </p>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Notes
                    <input name="notes" type="text" placeholder="Optional notes" />
                  </label>
                  <div className="inline-actions" style={{ gridColumn: "1 / -1" }}>
                    <button className="button" type="submit">
                      Add Player
                    </button>
                  </div>
                </form>
              </section>

              <section className="card" style={{ marginTop: 16 }}>
                <strong>Quick paste</strong>
                <div className="muted" style={{ marginTop: 4, marginBottom: 16 }}>Bulk import player lines into this prep week.</div>

                <p className="muted" style={{ marginBottom: 12 }}>
                  One player per line. Supported formats:
                  <br />
                  <code>name,alliance,general,research,construction,troops,start,end,optional notes</code>
                  <br />
                  <code>[HEL]Kilo,13,12,13,22,00:00,01:00,optional notes</code>
                </p>
                <form action={bulkCreateSubmissionsAction.bind(null, prepWeek.id)} className="form-grid">
                  <label>
                    Bulk player lines
                    <textarea
                      className="builder-textarea"
                      name="bulkInput"
                      rows={8}
                      placeholder={`Kilo,HEL,13,12,13,22,00:00,01:00\nTkilrey,SKY,68,8,15,22,00:00,01:00`}
                    />
                  </label>
                  <div className="inline-actions">
                    <button className="button-secondary" type="submit">
                      Import Lines
                    </button>
                  </div>
                </form>
              </section>
            </div>

            <aside className="builder-side">
              <p className="eyebrow">Prep Days</p>
              <h2>Priority rules</h2>
              <div className="stack">
                {prepWeek.days.map((day) => (
                  <details className="day-rule-card" key={day.id}>
                    <summary className="space-between" style={{ cursor: "pointer", listStyle: "none" }}>
                      <div>
                        <div className="day-rule-title">{day.label}</div>
                        <div className="muted">{getDayModeLabel(day.mode)}</div>
                      </div>
                      <span className="button-secondary">Edit</span>
                    </summary>
                    <form action={updateDayModeAction.bind(null, prepWeek.id)} style={{ marginTop: 14 }}>
                      <input type="hidden" name="prepDayId" value={day.id} />
                      <label>
                        Day mode
                        <AutoSubmitSelect
                          name="mode"
                          defaultValue={day.mode}
                          options={dayModeOptions.map((mode) => ({
                            label: getDayModeLabel(mode),
                            value: mode
                          }))}
                        />
                      </label>
                    </form>
                  </details>
                ))}
              </div>
              <form action={generateScheduleAction.bind(null, prepWeek.id)} style={{ marginTop: 18 }}>
                <button className="button" type="submit">
                  Generate Schedule
                </button>
              </form>
              <p className="muted helper-copy" style={{ marginTop: 16 }}>
                Each player can hold at most one slot per day. If nobody is available for a slot, it stays open.
              </p>
            </aside>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Prep day rules</h2>
          <div className="inline-actions">
            {prepWeek.days.map((day) => (
              <span className="pill" key={day.id}>
                Day {day.dayNumber}: {getDayModeLabel(day.mode)}
              </span>
            ))}
          </div>
        </section>
      )}

      <details className="card">
        <summary className="space-between" style={{ cursor: "pointer", listStyle: "none" }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Player submissions</h2>
            <p className="muted">{prepWeek.submissions.length} saved player{submissionsPlural(prepWeek.submissions.length)}</p>
          </div>
          <span className="button-secondary">View</span>
        </summary>

        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>General</th>
                <th>Research</th>
                <th>Construction</th>
                <th>Troops</th>
                <th>UTC Window</th>
                <th>Notes</th>
                <th>Saved By</th>
                {canEdit ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {prepWeek.submissions.map((submission) => (
                canEdit ? (
                  <tr key={submission.id}>
                    <td>
                      <strong>
                        {submission.allianceTag ? `[${submission.allianceTag}]` : ""}
                        {submission.playerName}
                      </strong>
                    </td>
                    <td>{String(submission.generalSpeedups)}</td>
                    <td>{String(submission.researchSpeedups)}</td>
                    <td>{String(submission.constructionSpeedups)}</td>
                    <td>{String(submission.troopTrainingSpeedups)}</td>
                    <td>{formatWindowLabel(submission.preferredStartUtc, submission.preferredEndUtc)}</td>
                    <td>{submission.notes || "-"}</td>
                    <td>{submission.createdBy.displayName || submission.createdBy.username}</td>
                    <td>
                      {(() => {
                        const formId = `submission-${submission.id}`;

                        return (
                          <details>
                            <summary className="button-secondary" style={{ display: "inline-block", cursor: "pointer" }}>
                              Edit
                            </summary>
                            <div style={{ minWidth: 320, marginTop: 12 }}>
                              <form id={formId} action={updateSubmissionAction.bind(null, prepWeek.id, submission.id)} className="form-grid">
                                <label>
                                  Player / alliance
                                  <div className="split-input">
                                    <select name="allianceTag" defaultValue={submission.allianceTag || ""}>
                                      <option value="">No tag</option>
                                      {allianceTagOptions.map((tag) => (
                                        <option key={tag} value={tag}>
                                          {tag}
                                        </option>
                                      ))}
                                    </select>
                                    <input name="playerName" type="text" defaultValue={submission.playerName} />
                                  </div>
                                </label>
                                <label>
                                  General days
                                  <input name="generalSpeedups" type="number" min="0" step="0.5" defaultValue={String(submission.generalSpeedups)} />
                                </label>
                                <label>
                                  Research days
                                  <input name="researchSpeedups" type="number" min="0" step="0.5" defaultValue={String(submission.researchSpeedups)} />
                                </label>
                                <label>
                                  Construction days
                                  <input
                                    name="constructionSpeedups"
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    defaultValue={String(submission.constructionSpeedups)}
                                  />
                                </label>
                                <label>
                                  Troop training days
                                  <input
                                    name="troopTrainingSpeedups"
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    defaultValue={String(submission.troopTrainingSpeedups)}
                                  />
                                </label>
                                <label>
                                  Preferred start UTC
                                  <select name="preferredStartUtc" defaultValue={submission.preferredStartUtc}>
                                    {hourlyOptions.slice(0, -1).map((time) => (
                                      <option key={time} value={time}>
                                        {time}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Preferred end UTC
                                  <select name="preferredEndUtc" defaultValue={submission.preferredEndUtc}>
                                    {hourlyOptions.slice(1).map((time) => (
                                      <option key={time} value={time}>
                                        {time}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Notes
                                  <input name="notes" type="text" defaultValue={submission.notes || ""} placeholder="Optional notes" />
                                </label>
                                <div className="inline-actions">
                                  <button className="button-secondary" type="submit">
                                    Save
                                  </button>
                                </div>
                              </form>
                              <form action={deleteSubmissionAction.bind(null, prepWeek.id, submission.id)} style={{ marginTop: 10 }}>
                                <button className="button-danger" type="submit">
                                  Delete
                                </button>
                              </form>
                            </div>
                          </details>
                        );
                      })()}
                    </td>
                  </tr>
                ) : (
                  <tr key={submission.id}>
                    <td>
                      <strong>
                        {submission.allianceTag ? `[${submission.allianceTag}]` : ""}
                        {submission.playerName}
                      </strong>
                    </td>
                    <td>{String(submission.generalSpeedups)}</td>
                    <td>{String(submission.researchSpeedups)}</td>
                    <td>{String(submission.constructionSpeedups)}</td>
                    <td>{String(submission.troopTrainingSpeedups)}</td>
                    <td>{formatWindowLabel(submission.preferredStartUtc, submission.preferredEndUtc)}</td>
                    <td>{submission.notes || "-"}</td>
                    <td>{submission.createdBy.displayName || submission.createdBy.username}</td>
                  </tr>
                )
              ))}
              {!prepWeek.submissions.length ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="muted">
                    No submissions saved yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>

      <section className="card">
        <div className="space-between">
          <div>
            <h2>Schedule</h2>
            <p className="muted">
              Generate and store a schedule from the current roster. Viewers can read schedules but cannot edit them.
            </p>
          </div>
          {canEdit ? (
            <form action={generateScheduleAction.bind(null, prepWeek.id)}>
              <button className="button" type="submit">
                Generate Schedule
              </button>
            </form>
          ) : null}
        </div>

        <div className="stack">
          {prepWeek.days.map((day) => {
            const computed = computeDaySchedule(day, prepWeek.submissions);
            const speedupKey = getModeSpeedupKey(day.mode);
            const renderedSlots = computed.autoApprove
              ? []
              : mergeManualAssignments(
                  computed.slots.map((slot) => ({
                    ...slot,
                    manual: false
                  })),
                  day.slots,
                  prepWeek.submissions,
                  day.mode
                );
            const assignedIds = new Set(
              renderedSlots.filter((slot) => slot.submission).map((slot) => slot.submission!.id)
            );
            const assignedSlotBySubmissionId = new Map(
              renderedSlots
                .filter((slot) => slot.submission)
                .map((slot) => [slot.submission!.id, slot.label] as const)
            );
            const overflow = computed.autoApprove ? [] : buildOverflowForDay(day.mode, prepWeek.submissions, assignedIds);

            return (
              <section className="card schedule-card" key={day.id}>
                <div className="inline-actions" style={{ justifyContent: "space-between", width: "100%" }}>
                  <div>
                    <h3>{day.label}</h3>
                    <p className="muted">Priority: {getDayModeLabel(day.mode)}</p>
                  </div>
                  {!computed.autoApprove && day.slots.length === 0 ? (
                    <span className="pill">Preview only until generated</span>
                  ) : null}
                </div>

                {computed.autoApprove ? (
                  <div className="notice warning">
                    Whoever applies in game will get it. No castle slot schedule is generated for this day.
                  </div>
                ) : (
                  <>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Slot</th>
                            <th>Assigned</th>
                            <th>Details</th>
                            {canEdit ? <th>Edit</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {renderedSlots.map((slot) => {
                            const eligibleOptions = buildEligibleOptionsForSlot(
                              prepWeek.submissions,
                              renderedSlots.map((item) => ({
                                slotIndex: item.slotIndex,
                                submission: item.submission
                              })),
                              slot.slotIndex,
                              day.mode
                            );

                            return (
                              <tr key={`${day.id}-${slot.slotIndex}`}>
                                <td>{slot.label}</td>
                                <td>
                                  <strong>{slot.submission ? `${slot.submission.allianceTag ? `[${slot.submission.allianceTag}]` : ""}${slot.submission.playerName}` : "Open slot"}</strong>
                                  {slot.manual ? <div className="muted">Manual override</div> : null}
                                </td>
                                <td>
                                  {slot.submission ? (
                                    <>
                                      <div>{speedupKey ? `${getDayModeLabel(day.mode)}: ${formatDays(slot.focusValue || 0)} days` : null}</div>
                                      <div className="muted">
                                        Preferred {formatWindowLabel(slot.submission.preferredStartUtc, slot.submission.preferredEndUtc)}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="muted">No assignment yet.</span>
                                  )}
                                </td>
                                {canEdit ? (
                                  <td>
                                    <details>
                                      <summary className="button-secondary" style={{ display: "inline-block", cursor: "pointer" }}>
                                        Edit
                                      </summary>
                                      <form
                                        action={updateSlotAssignmentAction.bind(null, prepWeek.id)}
                                        className="inline-actions"
                                        style={{ marginTop: 12 }}
                                      >
                                        <input type="hidden" name="prepDayId" value={day.id} />
                                        <input type="hidden" name="slotIndex" value={slot.slotIndex} />
                                        <AutoSubmitSelect
                                          name="submissionId"
                                          defaultValue={slot.submission?.id || ""}
                                          options={[
                                            { label: "Open slot", value: "" },
                                            ...eligibleOptions.map((submission) => ({
                                              label:
                                                (submission.allianceTag ? `[${submission.allianceTag}]` : "") +
                                                submission.playerName +
                                                (assignedSlotBySubmissionId.get(submission.id) &&
                                                assignedSlotBySubmissionId.get(submission.id) !== slot.label
                                                  ? ` (currently ${assignedSlotBySubmissionId.get(submission.id)})`
                                                  : "") +
                                                (!isSubmissionEligibleForSlot(slot.slotIndex, submission)
                                                  ? " (outside preferred UTC)"
                                                  : ""),
                                              value: submission.id
                                            }))
                                          ]}
                                        />
                                      </form>
                                    </details>
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="notice">
                      <strong>Unassigned players</strong>
                      <div className="inline-actions" style={{ marginTop: 10 }}>
                        {overflow.length ? (
                          overflow.map((submission) => (
                            <span
                              className="pill"
                              key={submission.id}
                              title={`General: ${formatDays(submission.generalSpeedups)} | Research: ${formatDays(submission.researchSpeedups)} | Construction: ${formatDays(submission.constructionSpeedups)} | Troops: ${formatDays(submission.troopTrainingSpeedups)} | Preferred: ${formatWindowLabel(submission.preferredStartUtc, submission.preferredEndUtc)}`}
                            >
                              {(submission.allianceTag ? `[${submission.allianceTag}]` : "") + submission.playerName}
                            </span>
                          ))
                        ) : (
                          <span className="muted">No overflow for this day.</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </AppFrame>
  );
}
