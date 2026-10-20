-- reject() has always written `rejected_by` in its UPDATE statement, but the
-- column was never actually added to the table — every leave rejection has
-- been failing with ER_BAD_FIELD_ERROR. Every sibling action (approve,
-- review, cancel) already tracks its actor the same way.
ALTER TABLE `leaves`
  ADD COLUMN `rejected_by` VARCHAR(100) NULL AFTER `rejection_comments`;
