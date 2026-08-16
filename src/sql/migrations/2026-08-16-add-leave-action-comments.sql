-- Adds comment columns for the review/approve/reject actions on `leaves`.
-- Additive and non-destructive: all three columns are nullable, no existing
-- data is touched. `leave_cancellations.reason` already covers cancellation.
--
-- Run manually against the target database (no migration runner in this repo):
--   mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < 2026-08-16-add-leave-action-comments.sql

ALTER TABLE `leaves`
  ADD COLUMN `review_comments`     TEXT NULL AFTER `date_reviewed`,
  ADD COLUMN `approval_comments`   TEXT NULL AFTER `date_approved`,
  ADD COLUMN `rejection_comments`  TEXT NULL AFTER `date_rejected`;
