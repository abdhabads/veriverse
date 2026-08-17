# VeriVerse Product Requirements Document

## 1. Document Purpose

This document defines the product requirements for VeriVerse as a misinformation-aware social platform. It is intended to capture what the system is supposed to do, for whom, why it exists, and which product rules and constraints govern its behavior.

This is a product document, not an implementation guide.

## 2. Product Summary

VeriVerse is a social platform for publishing, reviewing, and evaluating claims. It combines AI-assisted analysis, grounded evidence gathering, community voting, expert review, appeals, and reputation systems to help users assess information quality more responsibly than conventional social feeds.

The product is designed to balance three goals:

- enable open participation and discussion
- reduce misleading or harmful claim propagation
- build visible trust signals that are more nuanced than a simple true-or-false label

## 3. Problem Statement

Conventional social platforms optimize reach and engagement faster than they optimize truth evaluation. This creates several product problems:

- unsupported claims can spread rapidly
- users often cannot tell the difference between low-risk content and well-supported content
- moderation tools are often either too blunt or too opaque
- community-only voting is vulnerable to weak participation or social bias
- expert review is often absent or poorly integrated

VeriVerse addresses these problems by making trust evaluation a core product primitive rather than a secondary moderation afterthought.

## 4. Product Vision

Users should be able to:

- post claims and opinions in a social environment
- see evidence-oriented trust signals for content
- understand whether a post is low AI risk, weakly supported, contradicted, disputed, or finalized
- contribute to trust outcomes through voting and discussion
- escalate sensitive or contested content to expert review when needed
- build reputation through constructive participation

## 5. Primary Goals

### 5.1 User Goals

- help users interpret information quality more clearly
- reduce false confidence caused by vague AI labels
- give users meaningful ways to participate in trust formation
- create transparent identity, trust, and reward systems

### 5.2 Platform Goals

- identify risky or misleading claims early
- route sensitive claims to stronger review paths
- avoid premature finalization from weak community signals
- maintain auditability through snapshots, events, and logs
- support administrative oversight and exportability

## 6. Non-Goals

The current product does not aim to:

- guarantee absolute truth determination for every post
- replace expert review with AI
- treat low AI risk as a truth verdict
- fully automate appeals or final adjudication in all sensitive cases
- provide universal scientific or legal certainty from the model alone

## 7. Target Users

### 7.1 Standard Users

Standard users publish posts, vote, comment, save, repost, follow, manage safety controls, and track reputation and rewards.

### 7.2 Experts

Experts review escalated posts and submit expert outcomes such as verified, false, or disputed when automated or community pathways are insufficient.

### 7.3 Administrators

Admins manage platform operations, users, queues, appeals, exports, trust health, analytics, and oversight workflows.

## 8. Product Principles

- Truth signals must be explainable enough for users to interpret.
- Risk scoring and verification scoring must remain separate concepts.
- Sensitive claims require stronger review than ordinary low-stakes content.
- Community finalization must require meaningful consensus.
- Users must be able to inspect evidence and moderation reasons where available.
- Dangerous account actions must require strong confirmation.

## 9. User Roles and Permissions

### 9.1 User

Must be able to:

- register and log in
- create and edit posts before finalization
- vote endorse or oppose
- repost and save
- comment and reply
- view notifications
- manage profile and account settings
- submit or view appeals where supported
- manage block and mute relations

### 9.2 Expert

Must be able to:

- access expert review queues
- inspect AI and grounding context
- submit expert decisions
- remove resolved items from the active queue

### 9.3 Admin

Must be able to:

- access admin dashboard
- access queues, analytics, trust health, users, and appeals
- export system data in supported formats
- review operational health and recent high-risk content

## 10. Core Product Features

### 10.1 Identity and Account Management

The product must support:

- account registration and login
- profile display for avatar, username, bio, reputation, rewards, and badges
- account-management page for editing username, bio, avatar, and password
- deactivate-account flow
- permanent account deletion with strong confirmation

Requirements:

- deactivated accounts must be blocked from login
- authenticated routes must reject deactivated accounts
- destructive actions must require password confirmation
- permanent deletion must require explicit typed confirmation

### 10.2 Feed and Discovery

The feed must:

- display posts with author identity and trust context
- surface vote summary, moderation summary, grounded evidence, and relevant trust metrics
- support route-through to post detail
- show content in a form that distinguishes moderation risk from verification strength

### 10.3 Post Creation and Editing

When a post is created or edited, the system must:

- validate and normalize content
- evaluate the trust pipeline
- store AI risk, verification, and grounding outputs
- route the post into the appropriate review state
- reopen trust state appropriately when edited prior to finalization

### 10.4 Trust Signals

The system must represent at least these trust dimensions:

- AI risk score
- AI risk label
- verification score
- grounding confidence
- contradiction count
- support count
- moderation reasons
- post status

Requirement:

- the product must not imply that `AI: Safe` means the statement is true

### 10.5 Grounded Evidence

The system must:

- attempt web-grounded fact checking for eligible posts
- record grounding summary and source stance information
- distinguish support, contradiction, context, and unknown source stances
- render evidence even when summary quality is limited if useful sources exist

### 10.6 Community Voting

Users must be able to:

- endorse claims
- oppose claims
- see visible vote totals and weighted trust totals

Community finalization requirements:

- finalization must not occur on trivial participation
- finalization must require stronger thresholds for vote count, weight, and consensus quality

### 10.7 Expert Review

The product must support escalation to expert review for:

- sensitive topics
- sensitive hashtags
- elevated AI risk
- contradiction-evidence scenarios
- sensitive claims with insufficient evidence

Expert outcomes must:

- persist on the post record
- remove resolved items from active expert queues
- notify affected users when appropriate

### 10.8 Appeals

The system must support appeal workflows for posts under relevant trust states, with admin visibility and operational handling.

### 10.9 Notifications

Notifications must be account-specific and support:

- unread tracking
- mark-all-read
- route-through to relevant posts
- display in a dedicated notifications page
- unread-count surfacing in the navbar

### 10.10 Reputation and Rewards

The platform must maintain:

- user reputation state
- reward point state
- corresponding logs or histories
- leaderboard visibility

### 10.11 Safety Controls

Users must be able to block or mute other users, and feed visibility must respect those relations.

### 10.12 Admin Operations and Exports

Admins must be able to:

- inspect trust-health and queue information
- access analytics and audit surfaces
- export supported data categories in JSON and CSV formats

## 11. Trust-Decision Requirements

### 11.1 AI Risk Requirements

The system must calculate a risk score for posts that reflects:

- misinformation-style risk
- policy and safety boosts
- evidence-based adjustments
- contradiction-aware backend floors

Requirements:

- contradicted claims must not remain effectively low-risk when contradiction evidence is sufficiently strong
- risk labels must map consistently to stored risk scores

### 11.2 Verification Requirements

The system must compute a separate `verificationScore` that reflects evidence strength rather than moderation risk.

Requirements:

- support evidence should improve verification score
- contradiction evidence should reduce verification score
- insufficient evidence should reduce verification score
- verification score must be available on stored posts and existing posts via backfill

### 11.3 Presentation Requirements

The UI must present truth-related signals clearly.

Requirements:

- contradicted claims must not display as safe in the UI
- risk and verification should be shown as separate ideas
- moderation reasons should be visible when available
- grounded evidence should be visible when available

## 12. Product Workflows

### 12.1 Post Lifecycle

1. user creates a post
2. AI screening and grounding run
3. trust metadata is stored
4. post is routed into a status such as unverified, flagged, or under expert review
5. community engagement occurs
6. expert review may occur if needed
7. appeal may occur if applicable
8. post may finalize with versioned trust state

### 12.2 Account Lifecycle

1. user registers or logs in
2. user manages profile through account management
3. user may deactivate account
4. deactivated users are blocked from login and protected routes
5. user may permanently delete account with stronger confirmation

### 12.3 Notification Workflow

1. system event occurs
2. per-user notification record is created
3. notification appears in the notifications page and unread count
4. user marks notifications as read or opens the related post

## 13. Functional Requirements Summary

The product must:

- support user, expert, and admin roles
- support authenticated profile and account management
- maintain distinct trust scores for risk and verification
- support grounded evidence inspection
- support community voting with stronger finalization thresholds
- support expert review and queue clearing
- support notifications with unread counts
- support exports in JSON and CSV
- support safe account deactivation and deletion
- support scripts for backfilling newly introduced trust fields onto older records

## 14. Data and Reporting Requirements

The product must store enough data to support:

- post trust state inspection
- trust snapshots and versioned history
- admin trust-health dashboards
- exports for oversight and analysis
- per-user notifications
- reputation and rewards history

## 15. Reliability and Safety Requirements

- The platform must fail safely when AI-dependent subsystems are unavailable, according to configured fail-open behavior.
- The platform must not silently treat low risk as verified truth.
- Sensitive or contradicted claims must escalate appropriately.
- Finalized content must resist unsafe editing.
- Queue processing must remove items that have already been resolved.

## 16. Usability Requirements

- Users must have a clear route from feed content to detailed trust context.
- Profile pages should emphasize display, while account-management pages should own editing actions.
- Leaderboard, rewards, reputation, and admin pages should follow a consistent modern shared layout.
- Notifications and expert-review destinations must be discoverable from the main navigation or relevant hub pages.

## 17. Success Criteria

The product should be considered successful when:

- false confidence from misleading `safe` labeling is reduced
- contradicted claims are visibly and operationally distinguished from low-risk content
- sensitive content is routed more reliably to expert review
- users can manage identity and account settings without confusion
- notifications and exports work as dependable operational tools
- trust finalization occurs on stronger participation and consensus signals

## 18. Out of Scope for This Version

- full automation of expert decisions
- guaranteed scientific correctness for all claims
- universal restoration flow for deactivated accounts
- complete stabilization of the current local e2e environment
- full admin-surface parity for every newly added trust field unless explicitly implemented

## 19. Open Product Questions

- Should the user-facing AI label eventually be replaced with a more explicit trust verdict badge?
- Should verification score be elevated above AI risk in the default feed presentation?
- Should contradiction evidence directly force certain status outcomes beyond risk-label escalation?
- Should admin and export surfaces show verification score everywhere by default?
- Should deactivated accounts have a formal restoration workflow?

## 20. Relationship to Other Documentation

- API surface and route inventory: [API Reference](API_REFERENCE.md)
- System-level architecture and implementation record: [System Documentation](SYSTEM_DOCUMENTATION.md)
- This PRD: product intent, scope, and requirements
