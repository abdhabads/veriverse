import { assertTrustTransition, TrustStatus } from "@/lib/trustTransitions";

type MinimalPost = {
  status: TrustStatus;
};

export function setPostTrustStatus(post: MinimalPost, nextStatus: TrustStatus) {
  assertTrustTransition(post.status, nextStatus);
  post.status = nextStatus;
}
