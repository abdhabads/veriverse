import type { Metadata } from "next";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
// Side-effect import: registers the "User" model with Mongoose before
// .populate("author") below runs. Without this, a Server Component render
// that hasn't otherwise loaded models/User.ts yet throws MissingSchemaError,
// which generateMetadata's own catch then silently turns into the generic
// fallback - discovered live: a real post's metadata was falling back to
// "Post | VeriVerse" instead of the actual author-attributed title.
import "@/models/User";
import { isValidObjectId } from "@/lib/validation";
import { buildCanonicalUrl } from "@/lib/siteConfig";
import PostPageClient from "./PostPageClient";

const DESCRIPTION_TRUNCATE_LENGTH = 160;

// Deterministic, word-boundary-aware truncation - mirrors the Claim page's
// own truncateForTitle helper in spirit, applied here to Post content.
function truncateForDescription(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}…`;
}

// Metadata field groups (title/description, openGraph, twitter) each merge
// independently against the root layout's defaults - setting only the
// top-level title/description here would leave openGraph/twitter silently
// inheriting the root layout's generic "VeriVerse" values instead of this
// fallback's own text. Every branch below returns the full shape so no
// field group is left half-overridden.
function buildFallbackMetadata(canonicalUrl?: string): Metadata {
  const title = "Post | VeriVerse";
  const description = "This post could not be found.";
  return {
    title,
    description,
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    openGraph: { title, description, type: "article", ...(canonicalUrl ? { url: canonicalUrl } : {}) },
    twitter: { card: "summary", title, description },
  };
}

type RouteParams = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return buildFallbackMetadata();
  }

  const canonicalUrl = buildCanonicalUrl(`/posts/${id}`);

  try {
    await connectDB();
    // Smallest direct query metadata needs - content + author username only,
    // never the full post-detail payload (comments, votes, evidence, etc.).
    const post = await Post.findById(id).select("content author").populate("author", "username");
    if (!post) {
      return buildFallbackMetadata(canonicalUrl);
    }

    const username = post.author?.username || "a VeriVerse user";
    const title = `Post by ${username} | VeriVerse`;
    const description = `"${truncateForDescription(post.content, DESCRIPTION_TRUNCATE_LENGTH)}" — see verification context on VeriVerse.`;

    return {
      title,
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        type: "article",
      },
      twitter: {
        card: "summary",
        title,
        description,
      },
    };
  } catch {
    return buildFallbackMetadata(canonicalUrl);
  }
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { id } = await params;
  return <PostPageClient id={id} />;
}
