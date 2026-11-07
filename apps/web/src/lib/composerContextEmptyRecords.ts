import type { ComposerDraftContextRecords } from "~/components/composerContextPresentation";

/**
 * The empty draft-context map, factored out so settings font previews (and
 * other leaf consumers) can depend on it without pulling in the entire
 * composer context presentation module — and with it ChatMarkdown and its
 * renderer dependencies.
 */
export const EMPTY_COMPOSER_CONTEXT_RECORDS: ComposerDraftContextRecords = new Map();
