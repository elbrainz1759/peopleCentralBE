-- would_recommend (Q10, "Would you recommend Mercy Corps as a place to
-- work?") is declared @IsOptional() in CreateExitInterviewDto alongside
-- every other questionnaire field, but was the only one left NOT NULL in
-- the schema — any exit interview submission that didn't answer this one
-- specific question failed the entire request with ER_BAD_NULL_ERROR.
-- Found live via smoke test. Matches its sibling optional fields
-- (most_enjoyed, company_improvement, etc.), which are all nullable.
ALTER TABLE `exit_interviews`
  MODIFY COLUMN `would_recommend` VARCHAR(10) NULL;
