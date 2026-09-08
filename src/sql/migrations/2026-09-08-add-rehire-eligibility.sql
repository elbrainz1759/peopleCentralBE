-- Adds rehire-eligibility fields, captured by the supervisor at their exit
-- clearance step. Both nullable — additive, no existing data touched.
-- These are confidential: the backend redacts them from any response that
-- isn't going to HR/Superadmin (see exit-interviews.controller.ts).
--
-- Run manually against the target database (no migration runner in this repo):
--   mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < 2026-09-08-add-rehire-eligibility.sql

ALTER TABLE `exit_interviews`
  ADD COLUMN `rehire_eligible` VARCHAR(3) NULL AFTER `supervisor_cleared_date`,
  ADD COLUMN `rehire_ineligible_reason` TEXT NULL AFTER `rehire_eligible`;
