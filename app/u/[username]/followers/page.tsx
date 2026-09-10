"use client";

import FollowListPage from "@/components/FollowListPage";

export default function FollowersPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  return <FollowListPage params={params} mode="followers" />;
}
