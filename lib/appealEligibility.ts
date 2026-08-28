/**
 * A post is normally only appealable once moderation has actually acted on
 * it (flagged/false/disputed). A "question"/"instruction" post never enters
 * those states - it's usually just "unverified" - so without this, a user
 * who believes their post WAS a genuine assertion and got wrongly
 * classified as a non-claim (and so silently skipped verification) would
 * have no way to contest that classification. This extends appeal
 * eligibility to cover exactly that case, without loosening it for
 * anything else.
 */
export function isPostAppealable(post: {
  status: string;
  contentType?: string;
}): boolean {
  const appealableStatuses = ["false", "flagged", "disputed"];
  if (appealableStatuses.includes(post.status)) {
    return true;
  }

  return post.contentType === "question" || post.contentType === "instruction";
}
