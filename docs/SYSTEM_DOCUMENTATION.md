# VeriVerse System Documentation

## 1. Purpose

VeriVerse is a misinformation-aware social platform built on Next.js App Router. It allows users to publish claims, receive automated trust analysis, gather community voting, escalate sensitive content for expert review, appeal outcomes, and earn reputation and rewards through participation.

This document provides:

- a system-level architecture overview
- a product and workflow reference
- a data and trust-pipeline explanation
- an operations and testing reference
- a written record of the major work completed in the recent implementation cycle

Related documents:

- [API Reference](API_REFERENCE.md)
- [Product Requirements](PRODUCT_REQUIREMENTS.md)

This is documentation of the system and changes, not source code.

## 2. Technology Stack

- Framework: Next.js 16 App Router
- Language: TypeScript
- UI: React 19, Tailwind CSS 4, custom shared UI components
- Data store: MongoDB via Mongoose
- AI and grounding: OpenAI text responses, web search grounding, internal grounding
- Testing: Vitest for unit tests, Playwright for end-to-end tests
- HTTP client: Axios for several client-side pages, shared `api` client in `lib/apiClient.ts`

## 3. Workspace Structure

Top-level areas:

- `app/`: App Router pages and API routes
- `components/`: shared UI components
- `hooks/`: shared React hooks
- `lib/`: business logic, auth helpers, trust pipeline, shared clients
- `models/`: Mongoose schemas
- `scripts/`: backfill and admin utility scripts
- `tests/`: unit, e2e, setup, and test-support scripts
- `docs/`: project documentation

Important user-facing pages include:

- `app/feed/page.tsx`
- `app/profile/page.tsx`
- `app/account-management/page.tsx`
- `app/notifications/page.tsx`
- `app/leaderboard/page.tsx`
- `app/expert/page.tsx`
- `app/admin/**`
- `app/posts/[id]/page.tsx`
- `app/u/[username]/page.tsx`

Important backend/API areas include:

- `app/api/posts/**`
- `app/api/profile/**`
- `app/api/notifications/**`
- `app/api/expert/**`
- `app/api/admin/**`
- `app/api/access/route.ts`
- `app/api/login/route.ts`

## 4. Core Product Model

The platform revolves around these concepts:

- Users: publish content, vote, comment, follow, appeal, and manage safety relations.
- Posts: claims or information items that pass through AI scoring, grounding, community voting, and possibly expert review.
- Trust state: the evolving status of a post as it moves from initial evaluation to possible finalization.
- Reputation and rewards: incentives tied to user participation and outcomes.
- Notifications: per-user event delivery for moderation and trust outcomes.

## 5. Roles and Access Model

Supported roles:

- `user`: standard participant
- `expert`: can access expert-review queues and make expert decisions
- `admin`: can access admin dashboards, queues, analytics, exports, and oversight functions

Access control helpers are centered in `lib/` and are enforced both in UI routing and API handlers.

Important guard patterns:

- authenticated user checks
- admin-only route enforcement
- expert-only route enforcement
- deactivated-account blocking on authenticated routes and login

## 6. User-Facing System Areas

### 6.1 Feed

The feed is the main discovery and engagement surface.

Current feed behavior includes:

- display of author identity, reputation, avatar, and badges
- support for endorse and oppose voting
- repost and save actions
- grounded evidence summary rendering
- moderation summary and trust metrics
- link-through to post detail from vote summary and moderation panels
- current-user identity card linking back to profile

### 6.2 Profile and Account Management

The profile page is now primarily display-oriented.

Current profile behavior includes:

- avatar display
- bio display
- reputation, rewards, badges, moderation status, and suspension information
- quick actions for leaderboard, appeals, safety controls, rewards, reputation, and account management

Account editing has been consolidated into `app/account-management/page.tsx`.

Current account-management capabilities include:

- update username
- update bio
- upload or remove profile picture
- change password
- deactivate account
- permanently delete account with password confirmation and typed `DELETE` confirmation

### 6.3 Public Profile

Public profiles at `app/u/[username]/page.tsx` currently show:

- avatar
- username
- bio
- reputation
- reward points
- badges
- post history summary
- contradiction-aware AI signal display for public posts

### 6.4 Notifications

Notifications are now user-specific and operational.

Implemented behavior includes:

- fetch real notifications for the authenticated account
- unread count support
- mark-all-read support
- open-post actions from notifications
- unread badge rendering in the navbar

### 6.5 Leaderboard

The leaderboard has been modernized to match the newer shared page patterns and includes improved layout and profile navigation.

### 6.6 Safety Controls

Users can manage block and mute relations through the safety area. Feed access respects these relations when filtering visible content.

## 7. Trust and Verification System

### 7.1 High-Level Pipeline

When a post is created or edited, the platform evaluates it through a trust pipeline.

Main steps:

1. initial AI screening
2. web-grounded fact checking
3. internal grounding lookup
4. evidence summarization and metrics derivation
5. trust routing into unverified, flagged, or expert-review states
6. later community voting, expert review, appeals, and finalization

### 7.2 AI Risk Score

`aiRiskScore` is a risk-oriented score, not a truth score.

It is based on:

- misinformation classifier output
- safety moderation boosts
- web-grounding evidence adjustments
- internal-grounding adjustments
- contradiction-aware backend floor logic

Risk labels are mapped to:

- `safe`
- `suspicious`
- `needs_review`
- `high_risk`

Recent correction:

- contradicted claims are no longer allowed to remain effectively low-risk when grounding confidence is sufficiently strong

### 7.3 Verification Score

`verificationScore` is a separate evidence-strength score introduced to avoid overloading `aiRiskScore`.

It is intended to answer:

- how strong the available evidence is
- whether the evidence supports or contradicts the claim
- whether the system has enough grounding confidence to treat the assessment as meaningful

Current factors include:

- support count
- contradiction count
- grounding confidence
- contextual evidence bonus
- insufficient-evidence penalty

### 7.4 Grounding Metrics

Grounding outputs currently track:

- grounding status
- grounding summary
- grounding sources
- grounding confidence
- support count
- contradiction count
- contextual-source count

### 7.5 Community Trust Finalization

Community voting does not finalize on very low participation anymore.

Recent threshold hardening introduced stronger requirements for:

- minimum vote count
- minimum winning-side vote count
- minimum total weight
- minimum weighted delta
- minimum consensus ratio

These changes were covered by unit tests.

### 7.6 Expert Review

Expert review is triggered for:

- sensitive topics
- sensitive hashtags
- elevated AI risk
- contradiction plus sufficient escalation conditions
- sensitive claims with insufficient evidence

Expert-review outcomes now correctly persist and remove items from expert queues after review.

### 7.7 Grounded Evidence Rendering

Grounded evidence is now rendered through a shared UI component and appears both in feed and post detail.

The rendering improvements include:

- display even when sources exist but summary is weak or absent
- explicit insufficient-evidence state
- confidence, support, and contradiction stats
- clearer source ordering and stance visibility

## 8. Status Model for Posts

Posts can move through states such as:

- `unverified`
- `flagged`
- `under_expert_review`
- `under_appeal_review`
- `verified`
- `false`
- `disputed`

The system also tracks:

- `finalized`
- `trustDecisionVersion`
- `trustEvaluationState`
- `lastTrustEvaluatedAt`

Trust snapshots are used to preserve state history across trust-decision versions.

## 9. Data Model Overview

Important models include:

- `User`
- `Post`
- `Comment`
- `Vote`
- `Notification`
- `Appeal`
- `Report`
- `RewardLog`
- `ReputationLog`
- `AuditLog`
- `PostTrustSnapshot`
- `TrustEvent`
- `Follow`
- `SavedPost`
- `Repost`
- `UserRelation`

Notable user fields added or emphasized during recent work:

- `bio`
- `avatarUrl`
- `isDeactivated`
- `deactivatedAt`

Notable post fields added or emphasized during recent work:

- `expertDecision`
- `expertReviewedBy`
- `groundingStatus`
- `groundingSummary`
- `groundingSources`
- `groundingConfidence`
- `contradictionCount`
- `supportCount`
- `aiRiskScore`
- `verificationScore`

## 10. Admin and Expert System Areas

### 10.1 Admin Dashboard

The admin dashboard includes operational shortcuts and oversight views.

Recent refinements include:

- direct admin navbar routing to the dashboard
- action-row reordering by operational importance
- expert-review access moved from admin navbar to admin dashboard action area

### 10.2 Admin Queues and Trust Health

Admin queue and trust-health surfaces are designed to show:

- flagged posts
- expert-review load
- high-risk content
- trust analytics
- review context
- operational escalations

### 10.3 Export System

The admin export system supports:

- JSON export
- CSV export

Supported export areas include:

- users
- posts
- reports
- appeals
- audit logs
- rewards
- reputation logs
- trust summary

### 10.4 Expert Queue

The expert queue supports:

- loading content routed for expert review
- decision submission
- note submission
- queue removal after successful resolution

## 11. Notifications and Eventing

Notifications are created for important trust and moderation events, including finalization-related outcomes.

The notification system now supports:

- per-account records
- unread count tracking
- mark-all-read actions
- navbar unread badge display

## 12. Account Lifecycle Rules

The system now supports both soft deactivation and hard deletion.

### 12.1 Deactivation

Effects:

- user is signed out
- login is blocked
- authenticated endpoints reject the account
- account may be restorable later if a restore flow is implemented

### 12.2 Permanent Deletion

Effects:

- requires password
- requires typed `DELETE`
- removes the user and associated records across linked collections
- clears auth state

## 13. Scripts and Operational Utilities

Important scripts currently present include:

- `backfill:truth-pipeline`
- `backfill:moderation-source-links`
- `backfill:verification-score`
- `backfill:contradiction-risk`
- `seed:admin`
- admin promotion and expert utilities

Backfills introduced in the recent work:

- verification-score backfill for existing posts
- contradiction-risk backfill for existing posts and snapshots

## 14. Testing Status

Unit testing is active with Vitest.

Recent verified areas include:

- community trust threshold logic
- verification-score calculation
- contradiction-aware truth scoring

Known testing caveat from recent work:

- unit tests passed for the newly added trust-scoring logic
- full `npm test` continued into Playwright e2e failures that appear related to environment, login, or dev-server state rather than the trust-scoring additions

## 15. Operational Notes and Known Issues

### 15.1 Dev Server State

Recent sessions showed repeated local dev-server conflicts:

- port reuse issues
- multiple Next dev processes left running
- logs indicating another Next dev server already running

### 15.2 E2E Instability

Recent Playwright failures indicate:

- login/test-environment mismatches
- dev server origin or startup inconsistencies
- environment-specific instability rather than a direct failure in the newly added trust logic

### 15.3 Large File Edit Risk

During earlier work, some large page files exhibited stale appended content after edits. This was especially relevant on certain admin pages and required careful cleanup and diagnostics.

## 16. Record of Major Implemented Work

This section records the major system changes completed in the recent implementation cycle.

### 16.1 Navigation and UX Changes

- removed the admin dropdown from the navbar
- made admin a direct navbar route
- added notifications to navbar with unread badge
- moved leaderboard access from navbar to profile quick actions
- adjusted expert-review access placement for admin and expert roles

### 16.2 Feed and Profile Identity Improvements

- fixed current-user profile picture rendering on feed
- returned avatar, reputation, rewards, and badges from access payloads
- made feed identity card avatar and username route to profile
- moved profile editing controls out of the profile page into account management
- kept profile and public profile bio visible while moving editing controls elsewhere

### 16.3 Expert Review Fixes

- corrected expert-queue client routing
- corrected expert-review HTTP verb mismatch
- persisted expert-review fields in the post model
- removed reviewed items from expert queue properly
- excluded finalized content from expert queue

### 16.4 Notifications Work

- made notifications account-specific
- improved notifications page loading and empty states
- added mark-all-read support
- created notifications for trust-review outcomes
- surfaced unread counts in the navbar

### 16.5 Export System Work

- created the missing admin export API route
- added JSON export support
- added CSV export support
- added frontend actions to export either format

### 16.6 Trust Reliability Work

- hardened community trust finalization thresholds
- added unit coverage for threshold logic
- improved grounded-evidence rendering
- introduced verification score
- backfilled verification score onto existing posts
- prevented contradicted claims from being shown as safe in the UI
- added backend contradiction-aware scoring floors

### 16.7 Leaderboard and Presentation Work

- modernized leaderboard layout to match newer page patterns
- improved profile navigation from leaderboard
- simplified labels such as reputation and rewards

### 16.8 Feed Engagement and Detail Work

- changed vote language from accurate/inaccurate presentation to endorse/oppose in feed actions
- removed redundant endorse-like button
- removed view-detail button and made moderation and vote-summary panels the entry points to detail view
- repaired feed JSX corruption introduced during intermediate UI edits

### 16.9 Account Lifecycle and Security Work

- added deactivate-account support
- added permanent delete-account support
- blocked deactivated accounts from login and protected routes
- required typed `DELETE` before hard deletion
- created dedicated account-management page for edits and destructive actions
- moved username, bio, avatar, and password management into account management

## 17. Current State Summary

The current system state can be summarized as follows:

- AI risk and verification are now separated concepts
- contradicted content is presented more honestly in the UI
- trust scoring has stronger backend rules for contradiction evidence
- account management is consolidated into a dedicated page
- notifications, exports, expert review, and grounded evidence are all materially more complete than before

## 18. Recommended Next Steps

- add verification score to admin trust-health and export UIs everywhere it is useful
- optionally re-run full truth-pipeline reprocessing for older posts when fresh grounding evidence is desired
- stabilize the local dev and e2e environment so full test runs become reliable
- consider formalizing a distinct truth verdict badge separate from AI risk label
