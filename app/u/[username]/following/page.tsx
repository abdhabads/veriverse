"use client";

import FollowListPage from "@/components/FollowListPage";

export default function FollowingPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  return <FollowListPage params={params} mode="following" />;
}
