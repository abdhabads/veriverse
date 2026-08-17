# VeriVerse API Reference

## 1. Purpose

This document describes the current HTTP API surface implemented under `app/api` in the VeriVerse workspace.

It is intended as a practical reference for:

- frontend integration
- admin and operational understanding
- testing and debugging
- future documentation work

This document reflects the current route structure and handler behavior at a high level. Exact response fields may evolve with implementation changes.

## 2. Conventions

### 2.1 Base Pattern

All endpoints are implemented as Next.js App Router route handlers under `app/api/**/route.ts`.

### 2.2 Common Response Shape

Many routes use a common JSON response convention:

- success:
  - `success: true`
  - endpoint-specific payload fields
- failure:
  - `success: false`
  - `message: string`
  - optional extra fields

Shared helpers for this pattern live in `lib/apiResponse.ts`.

### 2.3 Authentication Model

Depending on endpoint, access is one of:

- `Public`: no authenticated user required
- `Authenticated`: requires a logged-in user
- `Expert/Admin`: requires role `expert` or `admin`
- `Admin`: requires role `admin`

### 2.4 Data Semantics

Important trust-related post fields exposed by multiple endpoints include:

- `aiLabel`
- `aiRiskScore`
- `verificationScore`
- `groundingStatus`
- `groundingSummary`
- `groundingSources`
- `groundingConfidence`
- `contradictionCount`
- `supportCount`
- `needsExpertReview`
- `expertDecision`

## 3. Authentication and Session Endpoints

### `POST /api/register`

- Access: Public
- Purpose: create a new account
- Typical use: registration flow

### `POST /api/login`

- Access: Public
- Purpose: authenticate a user and establish session state
- Typical use: login form submission

### `POST /api/logout`

- Access: Authenticated session context
- Purpose: clear session state
- Typical use: logout action

### `GET /api/access`

- Access: Authenticated
- Purpose: return the currently accessible identity payload used by the frontend
- Notes: includes user identity data used for feed/profile bootstrap and blocks deactivated accounts

### `GET /api/me`

- Access: Authenticated
- Purpose: fetch the current authenticated user summary

## 4. Password and Account Recovery Endpoints

### `POST /api/password/forgot`

- Access: Public
- Purpose: begin password-reset flow

### `POST /api/password/reset`

- Access: Public with valid reset flow inputs
- Purpose: complete password reset

## 5. Profile and Account Management Endpoints

### `GET /api/profile`

- Access: Authenticated
- Purpose: fetch the current user profile and authored posts for the private profile page

### `PATCH /api/profile`

- Access: Authenticated
- Purpose: update profile fields
- Supported product usage currently includes:
  - username updates
  - bio updates
  - avatar URL or image-data updates

### `PATCH /api/profile/password`

- Access: Authenticated
- Purpose: change the current user password

### `PATCH /api/profile/account`

- Access: Authenticated
- Purpose: perform account-level actions
- Current action:
  - deactivate account

### `DELETE /api/profile/account`

- Access: Authenticated
- Purpose: permanently delete the current account and associated records

### `GET /api/account/safety`

- Access: Authenticated
- Purpose: fetch safety-related account state used by safety controls

## 6. Onboarding Endpoints

### `GET /api/onboarding`

- Access: Authenticated
- Purpose: fetch onboarding state

### `PATCH /api/onboarding`

- Access: Authenticated
- Purpose: update onboarding completion or onboarding-related profile state

## 7. Public User, Search, and Discovery Endpoints

### `GET /api/users/[username]`

- Access: Public
- Purpose: fetch a public user profile and that user’s posts

### `GET /api/search`

- Access: Public
- Purpose: search users, posts, and hashtags
- Query parameters:
  - `q`: search text
  - `type`: `all`, `users`, or `posts`

### `GET /api/topics/[tag]`

- Access: Public
- Purpose: fetch posts associated with a hashtag or topic tag

### `GET /api/leaderboard`

- Access: Public
- Purpose: fetch leaderboard data

## 8. Post Endpoints

### `GET /api/posts`

- Access: Public, with additional personalization when authenticated
- Purpose: fetch feed posts and feed sections
- Notes:
  - blocked and muted users are filtered when requester context is available
  - includes trust and engagement fields used by the feed

### `POST /api/posts`

- Access: Authenticated
- Purpose: create a post
- Behavior:
  - validates content
  - rate limits post creation
  - runs trust pipeline and grounding
  - stores AI risk, verification, and routing state

### `PATCH /api/posts/[id]`

- Access: Authenticated author or admin
- Purpose: edit a post before it becomes ineligible for editing
- Restrictions include finalized, appealed, and expert-reviewed states

### `DELETE /api/posts/[id]`

- Access: Authenticated author or admin
- Purpose: delete a post

### `GET /api/posts/[id]/detail`

- Access: Public
- Purpose: fetch a post detail payload and its comments

### `POST /api/posts/[id]/vote`

- Access: Authenticated
- Purpose: cast a trust vote on a post
- Product meaning:
  - endorse or oppose claim accuracy

### `GET /api/posts/[id]/comments`

- Access: Public
- Purpose: fetch comments for a post

### `POST /api/posts/[id]/comments`

- Access: Authenticated
- Purpose: create a comment on a post
- Supports top-level comments and replies

## 9. Comment Endpoints

### `PATCH /api/comments/[id]`

- Access: Authenticated comment author or admin
- Purpose: edit a comment

### `DELETE /api/comments/[id]`

- Access: Authenticated comment author or admin
- Purpose: delete a comment

## 10. Social Interaction Endpoints

### `POST /api/follow`

- Access: Authenticated
- Purpose: follow or unfollow another user depending on payload and current state

### `GET /api/followers/[id]`

- Access: Public or authenticated consumer context
- Purpose: fetch follower-related user lists for a target user

### `POST /api/like`

- Access: Authenticated
- Purpose: like or unlike a post

### `POST /api/repost`

- Access: Authenticated
- Purpose: repost or unrepost a post

### `POST /api/save`

- Access: Authenticated
- Purpose: save or unsave a post

### `GET /api/saved`

- Access: Authenticated
- Purpose: fetch the current user’s saved posts

## 11. Relations and Safety Endpoints

### `POST /api/relations`

- Access: Authenticated
- Purpose: create or toggle a user relation such as block or mute

### `GET /api/relations/list`

- Access: Authenticated
- Purpose: list the current user’s block and mute relations

## 12. Reporting and Appeals Endpoints

### `POST /api/reports`

- Access: Authenticated
- Purpose: submit a report about content or behavior

### `POST /api/appeals`

- Access: Authenticated
- Purpose: submit an appeal for a relevant trust or moderation outcome

### `GET /api/appeals/me`

- Access: Authenticated
- Purpose: fetch the current user’s appeals

### `GET /api/my/appeals`

- Access: Authenticated
- Purpose: fetch the current user’s appeals through an alternate route namespace

## 13. Notifications Endpoints

### `GET /api/notifications`

- Access: Authenticated
- Purpose: fetch notifications for the current account
- Notes:
  - includes unread count support for the navbar and notifications page

### `PATCH /api/notifications`

- Access: Authenticated
- Purpose: mark notifications read or perform bulk notification updates

## 14. Reputation, Rewards, and User Metrics Endpoints

### `GET /api/reputation`

- Access: Authenticated
- Purpose: fetch reputation logs or reputation-related history for the current user

### `GET /api/rewards`

- Access: Authenticated
- Purpose: fetch reward logs or reward-related history for the current user

## 15. Expert Review Endpoints

### `GET /api/expert/queue`

- Access: Expert/Admin
- Purpose: fetch posts currently requiring expert review
- Notes:
  - excludes finalized and already-reviewed items

### `PATCH /api/expert/review/[id]`

- Access: Expert/Admin
- Purpose: submit expert review outcome for a queued post
- Supported decisions:
  - `verified`
  - `false`
  - `disputed`

## 16. Admin Overview and Analytics Endpoints

### `GET /api/admin/overview`

- Access: Admin
- Purpose: fetch admin dashboard overview metrics and high-level operational data

### `GET /api/admin/metrics`

- Access: Admin
- Purpose: fetch admin metric summaries

### `GET /api/admin/analytics`

- Access: Admin
- Purpose: fetch analytics data for administrative dashboards

### `GET /api/admin/trust-analytics`

- Access: Admin
- Purpose: fetch trust-oriented analytics, counts, and recent trust-related content data

### `GET /api/admin/trust-health`

- Access: Admin
- Purpose: fetch trust-health status, high-risk indicators, and operational trust signals

### `GET /api/admin/queues`

- Access: Admin
- Purpose: fetch admin queue data such as flagged and escalated posts

## 17. Admin User and Moderation Endpoints

### `GET /api/admin/users`

- Access: Admin
- Purpose: fetch admin-visible user directory data

### `PATCH /api/admin/users/[id]`

- Access: Admin
- Purpose: update a user’s moderation or administrative state

### `GET /api/admin/reports`

- Access: Admin
- Purpose: fetch reports for moderation review

### `PATCH /api/admin/reports/[id]`

- Access: Admin
- Purpose: resolve or update an individual report

### `GET /api/admin/appeals`

- Access: Admin
- Purpose: fetch appeals for administrative review

### `PATCH /api/admin/appeals/[id]`

- Access: Admin
- Purpose: resolve or update an individual appeal

### `GET /api/admin/audit`

- Access: Admin
- Purpose: fetch audit log data

## 18. Admin Export Endpoint

### `GET /api/admin/export`

- Access: Admin
- Purpose: export platform data in downloadable form
- Supported query parameters:
  - `type`: one of
    - `users`
    - `posts`
    - `reports`
    - `appeals`
    - `audit`
    - `rewards`
    - `reputation`
    - `trust-summary`
  - `format`: `json` or `csv`
- Notes:
  - returns file downloads with `Content-Disposition`
  - trust-summary export includes metrics and recent high-risk post data

## 19. Endpoint Summary by Access Level

### Public

- `POST /api/register`
- `POST /api/login`
- `POST /api/password/forgot`
- `POST /api/password/reset`
- `GET /api/users/[username]`
- `GET /api/search`
- `GET /api/topics/[tag]`
- `GET /api/leaderboard`
- `GET /api/posts`
- `GET /api/posts/[id]/detail`
- `GET /api/posts/[id]/comments`

### Authenticated

- `POST /api/logout`
- `GET /api/access`
- `GET /api/me`
- `GET /api/profile`
- `PATCH /api/profile`
- `PATCH /api/profile/password`
- `PATCH /api/profile/account`
- `DELETE /api/profile/account`
- `GET /api/account/safety`
- `GET /api/onboarding`
- `PATCH /api/onboarding`
- `POST /api/posts`
- `PATCH /api/posts/[id]`
- `DELETE /api/posts/[id]`
- `POST /api/posts/[id]/vote`
- `POST /api/posts/[id]/comments`
- `PATCH /api/comments/[id]`
- `DELETE /api/comments/[id]`
- `POST /api/follow`
- `POST /api/like`
- `POST /api/repost`
- `POST /api/save`
- `GET /api/saved`
- `POST /api/relations`
- `GET /api/relations/list`
- `POST /api/reports`
- `POST /api/appeals`
- `GET /api/appeals/me`
- `GET /api/my/appeals`
- `GET /api/notifications`
- `PATCH /api/notifications`
- `GET /api/reputation`
- `GET /api/rewards`

### Expert/Admin

- `GET /api/expert/queue`
- `PATCH /api/expert/review/[id]`

### Admin

- `GET /api/admin/overview`
- `GET /api/admin/metrics`
- `GET /api/admin/analytics`
- `GET /api/admin/trust-analytics`
- `GET /api/admin/trust-health`
- `GET /api/admin/queues`
- `GET /api/admin/users`
- `PATCH /api/admin/users/[id]`
- `GET /api/admin/reports`
- `PATCH /api/admin/reports/[id]`
- `GET /api/admin/appeals`
- `PATCH /api/admin/appeals/[id]`
- `GET /api/admin/audit`
- `GET /api/admin/export`

## 20. Related Documentation

- [Product Requirements](PRODUCT_REQUIREMENTS.md)
- [System Documentation](SYSTEM_DOCUMENTATION.md)
