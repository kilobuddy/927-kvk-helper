-- Rename login identity from email to username while preserving existing values.
ALTER TABLE "User" RENAME COLUMN "email" TO "username";

-- Keep the unique constraint/index aligned with the new field name.
ALTER INDEX "User_email_key" RENAME TO "User_username_key";
