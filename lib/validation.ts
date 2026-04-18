import { MembershipRole } from "@prisma/client";
import { z } from "zod";
import { allianceTagOptions } from "@/lib/constants";

function parseUtcTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  if (value === "24:00") {
    return 24 * 60;
  }

  const [hours, minutes] = value.split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters.")
    .max(40, "Username must be 40 characters or fewer.")
    .regex(/^[a-z0-9._-]+$/, "Username can only use letters, numbers, dots, underscores, and hyphens."),
  password: z.string().min(10, "Temporary password must be at least 10 characters."),
  workspaceId: z.string().min(1, "Workspace is required."),
  role: z.nativeEnum(MembershipRole)
});

export const updateUserSchema = z.object({
  userId: z.string().min(1),
  membershipId: z.string().min(1),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters.")
    .max(40, "Username must be 40 characters or fewer.")
    .regex(/^[a-z0-9._-]+$/, "Username can only use letters, numbers, dots, underscores, and hyphens."),
  password: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || value.length >= 10, "Password must be at least 10 characters when provided."),
  role: z.nativeEnum(MembershipRole),
  isActive: z.boolean()
});

export const playerSubmissionSchema = z.object({
  playerName: z.string().trim().min(1, "Player name is required.").max(80),
  allianceTag: z.enum(allianceTagOptions).optional().or(z.literal("")),
  generalSpeedups: z.coerce.number().min(0),
  researchSpeedups: z.coerce.number().min(0),
  constructionSpeedups: z.coerce.number().min(0),
  troopTrainingSpeedups: z.coerce.number().min(0),
  preferredStartUtc: z.string().regex(/^\d{2}:\d{2}$/),
  preferredEndUtc: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().trim().max(500).optional()
}).superRefine((value, ctx) => {
  const startMinutes = parseUtcTime(value.preferredStartUtc);
  const endMinutes = parseUtcTime(value.preferredEndUtc);

  if (startMinutes === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Preferred start must be a valid UTC time.",
      path: ["preferredStartUtc"]
    });
  }

  if (endMinutes === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Preferred end must be a valid UTC time.",
      path: ["preferredEndUtc"]
    });
  }

  if (startMinutes === null || endMinutes === null) {
    return;
  }

  if (value.preferredStartUtc === "24:00") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Preferred start cannot be 24:00.",
      path: ["preferredStartUtc"]
    });
  }

  if (startMinutes === endMinutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Preferred start and end cannot be the same time.",
      path: ["preferredEndUtc"]
    });
  }
});
