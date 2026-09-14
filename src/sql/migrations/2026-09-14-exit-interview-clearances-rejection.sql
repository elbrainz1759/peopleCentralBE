-- exit_interview_clearances currently requires a check_list_item_id on every
-- row, so a department's comment was silently lost whenever no checklist
-- item was ticked (e.g. a rejection, or a stage with no configured items).
-- Make it nullable so a stage-level note/rejection can be recorded on its
-- own row, and add `action` so a row can represent a rejection, not just a
-- clearance.
ALTER TABLE `exit_interview_clearances`
  MODIFY COLUMN `check_list_item_id` INT NULL,
  ADD COLUMN `action` VARCHAR(10) NOT NULL DEFAULT 'Cleared' AFTER `department`;
