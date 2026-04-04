import { MembershipRole } from "@prisma/client";
import { z } from "zod";
import { allianceTagOptions } from "@/lib/constants";

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
}).refine(
  (value) => value.preferredStartUtc < value.preferredEndUtc,
  {
    message: "Preferred end must be after preferred start.",
    path: ["preferredEndUtc"]
  }
);
