# Moderation Panel #39

## Goal
Build a moderation panel that supports two moderation scopes:

- Global moderators can moderate platform-wide.
- Community moderators can moderate only the communities where they have moderator access.

The panel must also clearly distinguish community owners from community moderators:

- Community owners can perform owner-only governance actions such as deleting the community, transferring ownership, or closing the community.
- Community moderators can perform only the moderation capabilities explicitly granted to them and must not be able to perform owner-only actions.

This task should align with the current data model in [schema.prisma](/C:/Users/samet/projects/arel_social/prisma/schema.prisma), especially:

- `GlobalModerator`
- `Community`
- `CommunityModerator`
- `CommunityRestriction`
- `ModLog`
- `Report`
- `Post`
- `Comment`
- `CommunityRule`

## Current Schema Notes

- A `Community` already has an `ownerId`.
- `CommunityModerator` already supports scoped permissions:
  - `canManageSettings`
  - `canManagePosts`
  - `canRestrictUsers`
- Community creators are currently auto-added as community moderators with all three flags enabled, but owner-only permissions are not modeled separately.
- `GlobalModerator` already exists and stores `permissions` as `Json`.
- `CommunityRestriction` supports `BAN` and `MUTE`.
- `ModLog` currently supports:
  - `REMOVE_POST`
  - `REMOVE_COMMENT`
  - `BAN_USER`
  - `MUTE_USER`
  - `UPDATE_SETTINGS`
- `Report` supports moderation review flow via `PENDING`, `RESOLVED`, and `DISMISSED`.

## Product Principles

- Moderation must be scope-aware.
- Destructive actions must be explicitly separated from routine moderation.
- Every moderator action must be auditable.
- The UI must never imply permission the user does not actually have.
- The backend must enforce all permissions even if the frontend hides controls.

## Roles

### 1. Global Moderator
Moderates the entire platform and can act across all communities.

Core powers:

- View all reports across all communities
- Moderate any post and comment
- Ban or mute users at community level in any community
- Review community safety and policy issues
- Close communities
- Reopen communities if product policy allows
- Ban communities from the platform if product policy requires it
- View moderation logs across communities

Constraints:

- Should not implicitly become owner of communities
- Should not use owner-only community management actions as a substitute for platform moderation unless explicitly allowed by policy

### 2. Community Moderator
Moderates only within assigned communities.

Core powers depend on assigned flags:

- `canManagePosts`
- `canRestrictUsers`
- `canManageSettings`

Constraints:

- Cannot moderate outside assigned communities
- Cannot delete a community
- Cannot transfer ownership
- Cannot close a community unless explicitly made owner or unless a future explicit permission is introduced
- Cannot modify owner-only governance controls

### 3. Community Owner
The owner is the governance authority for a specific community.

Core powers:

- All moderator capabilities in their own community
- Delete community
- Close community
- Reopen community if supported
- Transfer ownership
- Appoint or remove moderators
- Change high-risk community governance settings

Constraints:

- Owner powers apply only to their own community
- Owner powers are not inherited by ordinary community moderators

## Permission Matrix

| Capability | Global Moderator | Community Moderator | Community Owner |
| --- | --- | --- | --- |
| View moderation dashboard | Yes | Yes, own communities only | Yes, own community only |
| View reports | All communities | Assigned communities only | Own community |
| Remove post | Any community | If `canManagePosts` and assigned | Own community |
| Remove comment | Any community | If `canManagePosts` and assigned | Own community |
| Pin/unpin post | Any community if included in moderation policy | If `canManagePosts` and assigned | Own community |
| Review reported user | Any community | Assigned communities only | Own community |
| Mute user | Any community | If `canRestrictUsers` and assigned | Own community |
| Ban user from community | Any community | If `canRestrictUsers` and assigned | Own community |
| Manage rules | Any community if policy allows | If `canManageSettings` and assigned | Own community |
| Manage moderator roster | Only if product policy allows global override | No | Yes |
| Close community | Yes | No | Yes |
| Reopen community | Yes | No | Yes |
| Delete community | No by default unless explicitly required by policy | No | Yes |
| Transfer community ownership | No | No | Yes |
| View moderation logs | All communities | Assigned communities only | Own community |

## Required UX Structure

The moderation panel should support two entry modes:

- Global moderation panel
- Community moderation panel

Suggested navigation sections:

1. Overview
2. Reports Queue
3. Posts
4. Comments
5. Users
6. Restrictions
7. Moderation Log
8. Community Settings
9. Community Governance

Visibility rules:

- Global moderators see a platform-wide version of the panel.
- Community moderators see only the communities they moderate.
- Community owners see community governance sections that moderators cannot access.

## User Stories and Acceptance Criteria

### Epic 1: Access Control and Role-Aware Entry

#### Story 1.1
As a global moderator, I want to access a platform-wide moderation panel so that I can moderate all communities from one place.

Acceptance Criteria:

1. When a signed-in user has a `GlobalModerator` record, they can open the global moderation panel.
2. The panel lists reports, communities, posts, comments, users, and logs across all communities.
3. The global moderator can filter items by community, status, content type, and date.
4. The global moderator never needs to be a member or moderator of a community to see its moderation data.
5. Unauthorized users are blocked from this route server-side.

#### Story 1.2
As a community moderator, I want to access a moderation panel scoped only to my assigned communities so that I can safely moderate within my own area.

Acceptance Criteria:

1. When a signed-in user has one or more `CommunityModerator` records, they can open the moderation panel for those communities.
2. The panel only lists communities where the user is an assigned moderator.
3. The user cannot access reports, users, posts, comments, or logs for unrelated communities.
4. If the user attempts to access another community’s moderation route manually, the backend rejects the request.
5. The UI clearly shows which community the moderator is currently moderating.

#### Story 1.3
As a community owner, I want owner-only controls to be clearly separated from moderator controls so that governance actions are not confused with moderation actions.

Acceptance Criteria:

1. The UI presents owner-only actions in a separate section such as `Community Governance`.
2. Community moderators who are not owners do not see delete, close, reopen, or transfer ownership controls.
3. Community owners can still access standard moderation tools for their community.
4. Backend authorization checks distinguish owner-only actions from moderator actions.

### Epic 2: Permission-Aware UI

#### Story 2.1
As a moderator, I want to see only the actions I am allowed to perform so that I do not attempt invalid actions.

Acceptance Criteria:

1. If a community moderator lacks `canManagePosts`, post and comment moderation actions are hidden or disabled with clear explanation.
2. If a community moderator lacks `canRestrictUsers`, mute and ban actions are hidden or disabled with clear explanation.
3. If a community moderator lacks `canManageSettings`, rules and eligible settings controls are hidden or disabled.
4. Global moderators see the full action set allowed by global policy.
5. Disabled actions, if shown, include a clear permission explanation.

#### Story 2.2
As a moderator, I want the panel to communicate moderation scope and authority level so that I understand whether I am acting as a global moderator, a community moderator, or an owner.

Acceptance Criteria:

1. The panel header displays current role context.
2. For community pages, the panel shows whether the user is owner, moderator, or both.
3. The panel identifies the current community context when actions are community-bound.
4. Action confirmation dialogs show the scope of the action before submission.

### Epic 3: Reports Queue

#### Story 3.1
As a moderator, I want a report queue so that I can review flagged content and users efficiently.

Acceptance Criteria:

1. The queue includes `PENDING` reports by default.
2. Moderators can filter by:
   - report status
   - target type: post, comment, user
   - community
   - date range
3. Each report row includes:
   - reporter
   - community
   - reported target
   - linked rule if present
   - custom reason
   - created date
   - current status
4. Community moderators only see reports for their assigned communities.
5. Global moderators can see all reports.

#### Story 3.2
As a moderator, I want to review report details so that I can take the correct moderation action.

Acceptance Criteria:

1. Opening a report shows full context of the target entity.
2. For post reports, the panel shows title, author, community, status, and a preview.
3. For comment reports, the panel shows the comment body, author, parent post, and community.
4. For reported users, the panel shows user profile summary and recent relevant moderation history.
5. The panel shows linked community rules when `ruleId` exists.
6. The panel shows prior restrictions and prior mod logs relevant to the same target when available.

#### Story 3.3
As a moderator, I want to resolve or dismiss reports so that the queue stays accurate.

Acceptance Criteria:

1. A moderator can mark a report as `RESOLVED`.
2. A moderator can mark a report as `DISMISSED`.
3. Status changes are saved atomically.
4. The acting moderator is recorded in `ModLog` or equivalent audit detail.
5. The report no longer appears in the default pending queue after status change.

### Epic 4: Post Moderation

#### Story 4.1
As a moderator with post-management permission, I want to remove posts so that rule-breaking content is taken down.

Acceptance Criteria:

1. Moderators can remove a post without deleting the record.
2. Removing a post updates the existing post moderation fields consistently, including `status` and `isDeleted` as defined by product policy.
3. A removal reason can be recorded in moderation details.
4. The action writes a `ModLog` entry with `REMOVE_POST`.
5. Community moderators can only remove posts in their own assigned communities.
6. Global moderators can remove posts in any community.

#### Story 4.2
As a moderator with post-management permission, I want to review moderated posts so that I can audit or reverse decisions if product policy allows.

Acceptance Criteria:

1. The panel provides a list of removed posts.
2. Moderators can filter removed posts by community, moderator, date, and reason.
3. The panel links removed posts to related reports and mod logs.
4. If restoration is supported later, the design leaves room for a restore action.

#### Story 4.3
As a moderator, I want to pin or unpin important posts when permitted so that community announcements and urgent information stay visible.

Acceptance Criteria:

1. Pin/unpin is only available to authorized roles.
2. Community moderators need `canManagePosts` to use the action.
3. The action is restricted to the moderator’s own communities unless the actor is global.
4. The action is recorded in moderation logs if product decides pinning is an auditable moderation event.

### Epic 5: Comment Moderation

#### Story 5.1
As a moderator with post-management permission, I want to remove comments so that abusive or rule-breaking discussion can be moderated.

Acceptance Criteria:

1. Moderators can remove comments without physically deleting records.
2. The original thread structure remains intact after moderation.
3. A removal reason can be captured.
4. The action writes a `ModLog` entry with `REMOVE_COMMENT`.
5. Community moderators can act only inside their assigned communities.
6. Global moderators can act in any community.

#### Story 5.2
As a moderator, I want comment moderation actions to preserve investigative context so that appeals and audits are possible.

Acceptance Criteria:

1. The panel can show the parent post and comment thread location.
2. Moderators can see whether the comment was user-deleted or moderator-removed.
3. Moderation details remain accessible to authorized reviewers after removal.

### Epic 6: User Restrictions

#### Story 6.1
As a moderator with user-restriction permission, I want to mute a user in a community so that I can de-escalate harmful behavior without immediately banning them.

Acceptance Criteria:

1. A moderator can create a `CommunityRestriction` with type `MUTE`.
2. The moderator must provide or optionally provide a reason according to product decision, but the requirement must be consistent.
3. The restriction may include an optional expiration date.
4. The restriction is scoped to a single community.
5. The action writes a `ModLog` entry with `MUTE_USER`.
6. Community moderators can mute only within their assigned communities.
7. Global moderators can mute within any community.

#### Story 6.2
As a moderator with user-restriction permission, I want to ban a user from a community so that repeat or severe abuse can be stopped.

Acceptance Criteria:

1. A moderator can create a `CommunityRestriction` with type `BAN`.
2. The ban is scoped to a single community.
3. The panel prevents duplicate active bans for the same user in the same community.
4. The action writes a `ModLog` entry with `BAN_USER`.
5. Community moderators can ban only within assigned communities.
6. Global moderators can ban within any community.

#### Story 6.3
As a moderator, I want to review active and expired restrictions so that I can manage enforcement consistently.

Acceptance Criteria:

1. The panel lists active community restrictions.
2. Moderators can filter restrictions by type, community, user, moderator, and active or expired state.
3. Restriction detail includes reason, issued date, expiration date, and issuing moderator.
4. Community moderators only see restrictions in their communities.
5. Global moderators can see restrictions across all communities.

#### Story 6.4
As a moderator, I want to lift a mute or ban when appropriate so that enforcement can be corrected or expired manually.

Acceptance Criteria:

1. Authorized moderators can revoke active restrictions.
2. Revocation is auditable.
3. Revocation checks the same scope rules as creation.
4. Revoked restrictions no longer apply to community interactions.

### Epic 7: Community Settings Moderation

#### Story 7.1
As a moderator with `canManageSettings`, I want to manage rules from the panel so that community expectations stay current.

Acceptance Criteria:

1. Moderators with `canManageSettings` can add rules.
2. Moderators with `canManageSettings` can reorder rules.
3. If editing and deleting rules are included in scope, they follow the same permission checks.
4. Actions are scoped to the current community unless the actor is global.
5. Settings changes are logged with `UPDATE_SETTINGS` or more granular log actions if introduced.

#### Story 7.2
As a moderator without `canManageSettings`, I should not be able to alter community rules or settings.

Acceptance Criteria:

1. The panel does not expose rule-management forms to unauthorized moderators.
2. Direct backend calls fail with an authorization error.
3. The user receives a clear error message.

### Epic 8: Community Governance for Owners and Global Moderators

#### Story 8.1
As a community owner, I want to manage moderator assignments so that I can delegate moderation safely.

Acceptance Criteria:

1. Owners can add a moderator to their community.
2. Owners can remove a moderator from their community.
3. Owners can update moderator permissions:
   - `canManageSettings`
   - `canManagePosts`
   - `canRestrictUsers`
4. Owners cannot accidentally remove their own owner status through moderator editing.
5. Moderator roster changes are auditable.

#### Story 8.2
As a community owner, I want owner-only governance controls so that I can manage the lifecycle of my community.

Acceptance Criteria:

1. Owners can close a community.
2. Owners can reopen a closed community if the product supports reopening.
3. Owners can delete a community.
4. Owners can transfer ownership to another eligible user.
5. Each destructive action requires explicit confirmation.
6. Ordinary community moderators cannot access these controls.

#### Story 8.3
As a global moderator, I want to close unsafe communities so that platform-wide trust and safety issues can be handled quickly.

Acceptance Criteria:

1. Global moderators can close any community.
2. The action records reason, actor, target community, and timestamp.
3. Closed communities expose a clear public state according to product policy.
4. Community moderators of the closed community can still view the moderation state if policy allows, but cannot reopen unless also owner and policy permits.

#### Story 8.4
As a community moderator, I should not be able to delete, transfer, or close a community unless I am also the owner.

Acceptance Criteria:

1. Non-owner community moderators cannot see these actions.
2. Backend requests for these actions fail with authorization error.
3. Ownership status is checked independently from moderator status.

### Epic 9: Auditability and Moderation History

#### Story 9.1
As a moderator, I want all moderation actions logged so that decisions are reviewable and defensible.

Acceptance Criteria:

1. Every moderation action creates an audit record.
2. Each log includes:
   - acting moderator
   - community
   - action type
   - target entity
   - timestamp
   - structured details such as reason
3. Community moderators can only view logs for their own communities.
4. Global moderators can view logs for all communities.

#### Story 9.2
As a moderator, I want to filter the moderation log so that I can investigate incidents quickly.

Acceptance Criteria:

1. Logs can be filtered by community, moderator, action type, target type, target user, and date range.
2. Log items link back to related reports, posts, comments, or restrictions when available.
3. The list is ordered newest-first by default.

### Epic 10: Safety, Edge Cases, and Error Handling

#### Story 10.1
As the system, I want moderation actions to be enforced server-side so that hidden UI controls cannot be bypassed.

Acceptance Criteria:

1. Every moderation mutation verifies actor identity.
2. Every moderation mutation verifies actor scope.
3. Every moderation mutation verifies required permission flags.
4. Owner-only mutations verify ownership explicitly.
5. Global moderation mutations verify `GlobalModerator` status explicitly.

#### Story 10.2
As a moderator, I want clear feedback when an action is invalid so that I understand why it failed.

Acceptance Criteria:

1. The user sees a clear error for unauthorized actions.
2. The user sees a clear error when the target item no longer exists.
3. The user sees a clear error when the item has already been moderated and the action is no longer valid.
4. Mutation failures do not leave partial writes.

#### Story 10.3
As the system, I want concurrency-safe moderation actions so that two moderators cannot create inconsistent state.

Acceptance Criteria:

1. Duplicate active restrictions are prevented.
2. Report resolution is idempotent or conflict-aware.
3. Double-removal of the same content is handled safely.
4. Audit logs remain accurate under concurrent actions.

## Implementation Tasks

### A. Data Model and Migration Tasks

1. Add explicit community lifecycle status if needed for close and reopen flows.
2. Decide whether community closure and community deletion require new fields on `Community`.
3. Decide whether owner-only governance actions need dedicated log action types beyond `UPDATE_SETTINGS`.
4. Extend `ModActionType` if needed for:
   - `UNBAN_USER`
   - `UNMUTE_USER`
   - `PIN_POST`
   - `UNPIN_POST`
   - `ASSIGN_MODERATOR`
   - `REMOVE_MODERATOR`
   - `UPDATE_MODERATOR_PERMISSIONS`
   - `CLOSE_COMMUNITY`
   - `REOPEN_COMMUNITY`
   - `DELETE_COMMUNITY`
   - `TRANSFER_COMMUNITY_OWNERSHIP`
   - `RESOLVE_REPORT`
   - `DISMISS_REPORT`
5. Consider whether `GlobalModerator.permissions` should be normalized into structured booleans or an enum-backed policy layer for safer authorization.
6. Add any needed indexes for:
   - `Report.status`
   - `Report.communityId`
   - `CommunityRestriction.communityId`
   - `CommunityRestriction.userId`
   - `ModLog.communityId`
   - `ModLog.moderatorId`
   - `Post.communityId + status + isDeleted`
   - `Comment.postId + isDeleted`

### B. Authorization Layer Tasks

1. Create shared server-side permission helpers for:
   - is global moderator
   - is community moderator
   - is community owner
   - can manage posts
   - can restrict users
   - can manage settings
   - can perform owner-only governance
2. Centralize permission checks so route handlers and server actions do not duplicate logic.
3. Ensure global moderator authority can override community membership requirements where intended.
4. Ensure owner-only authority is not granted by moderator flags alone.

### C. Backend Moderation Action Tasks

1. Add server actions or route handlers for:
   - list reports
   - resolve report
   - dismiss report
   - remove post
   - remove comment
   - mute user
   - ban user
   - revoke mute or ban
   - list restrictions
   - list mod logs
   - assign moderator
   - remove moderator
   - update moderator permissions
   - close community
   - reopen community
   - delete community
   - transfer ownership
2. Make all moderation writes transactional where multiple tables are updated.
3. Write `ModLog` records consistently for every action.
4. Ensure `Report` status changes and related moderation actions can be linked.

### D. Frontend Panel Tasks

1. Create a moderation panel layout for global and community contexts.
2. Add a role-aware navigation shell.
3. Build a reports queue table with filters and detail drawer or page.
4. Build moderated content tables for posts and comments.
5. Build a user restrictions section.
6. Build a moderation log section.
7. Build a community settings section for rule management.
8. Build a community governance section visible only to owners and authorized global moderators.
9. Add confirmation modals for destructive and high-impact actions.
10. Add permission badges or explanatory labels so the UI explains why certain controls exist or do not exist.

### E. Community Owner Management Tasks

1. Add moderator roster management UI.
2. Add permission toggles for moderator capabilities.
3. Prevent owners from locking themselves out accidentally.
4. Define ownership transfer eligibility rules.
5. Define deletion flow behavior for related posts, reports, logs, and members.

### F. Community Closure Tasks

1. Define what “close community” means operationally.
2. Decide whether closed communities:
   - are read-only
   - hide posting
   - hide commenting
   - hide joining
   - remain visible publicly
3. Add backend enforcement for closed-community behavior.
4. Add public-facing messaging for closed communities.
5. Add reopen handling if supported.

### G. Testing Tasks

1. Add unit tests for authorization helpers.
2. Add integration tests for:
   - global moderator scope
   - community moderator scope
   - owner-only actions
   - cross-community access denial
   - report resolution
   - post removal
   - comment removal
   - mute and ban creation
   - restriction revocation
   - moderator assignment changes
   - community closure
   - ownership transfer
3. Add UI tests for role-based rendering.
4. Add regression tests ensuring community moderators cannot delete or transfer communities.

## Open Product Decisions

These should be resolved before implementation is finalized:

1. Can global moderators delete communities, or only close them?
2. Can global moderators manage community moderator rosters, or only intervene operationally?
3. Should closed communities be visible publicly or hidden?
4. Should post and comment restoration be included in this task or deferred?
5. Should moderators be able to edit or delete rules, or only add and reorder them for now?
6. Should report resolution require selecting a disposition reason?
7. Should user restrictions support permanent bans and temporary bans in the first version?
8. Should owner actions live inside the same moderation panel or in a separate governance area under community settings?

## Recommended Delivery Order

1. Authorization helpers and role model separation
2. Reports queue and moderation log
3. Post and comment moderation
4. User restrictions
5. Moderator roster management
6. Owner-only governance
7. Community closure flow
8. Hardening, audit coverage, and tests

## Git and Issue Planning

## Recommendation
You do not need a separate Git branch for every user story in this task.

For a feature this size, the best balance is:

- Keep one parent GitHub issue: `#39 Moderation Panel`
- Create sub-issues for the major implementation slices
- Use one main feature branch only if you are working alone and plan to merge in one larger pass
- Use child branches from `39-moderation-panel` only when a slice is large enough to be built, reviewed, and merged independently

This gives you traceability without turning the project into branch overhead.

## Suggested GitHub Structure

### Parent Issue

- `#39 Moderation Panel`

Purpose:

- Holds the product goal
- Links all child issues
- Tracks overall progress
- Documents scope, risks, and final rollout checklist

### Suggested Child Issues

Create sub-issues only for slices that are meaningful deliverables. Recommended breakdown:

1. `Moderation Panel: authorization and role separation`
2. `Moderation Panel: reports queue and report review`
3. `Moderation Panel: post and comment moderation actions`
4. `Moderation Panel: user restrictions and restriction history`
5. `Moderation Panel: moderation log and audit trail`
6. `Moderation Panel: moderator roster management`
7. `Moderation Panel: owner-only governance actions`
8. `Moderation Panel: community closure flow`
9. `Moderation Panel: test coverage and permission regressions`

This is enough to track dependency order and reviewable units without creating dozens of tiny issues.

## Suggested Dependency Chain

The stories do have dependencies, but they are mostly implementation dependencies rather than product dependencies.

Recommended dependency graph:

1. `authorization and role separation`
   This is the foundation for every other moderation action.
2. `reports queue and report review`
   Depends on authorization helpers and scoped data access.
3. `post and comment moderation actions`
   Depends on authorization and should connect into reports.
4. `user restrictions and restriction history`
   Depends on authorization and audit logging.
5. `moderation log and audit trail`
   Can start early, but should be finalized before higher-risk moderation actions are completed.
6. `moderator roster management`
   Depends on clear owner-vs-moderator rules.
7. `owner-only governance actions`
   Depends on role separation and audit patterns.
8. `community closure flow`
   Depends on governance rules and likely schema or policy decisions.
9. `test coverage and permission regressions`
   Depends on all implemented slices and should run throughout, not only at the end.

## Branch Strategy

### Option A: Best for Solo Work

Use:

- `development`
- `39-moderation-panel`

When to use it:

- You are the only developer on the feature
- You want minimal branch management
- You are comfortable shipping in a few larger commits or PRs

How to work:

1. Keep `39-moderation-panel` as the umbrella branch for issue `#39`
2. Commit in clearly named chunks tied to child issues
3. If your team allows it, open one PR from `39-moderation-panel` to `development`

This is acceptable, but traceability will mainly live in commit history and linked child issues rather than in separate branches.

### Option B: Best for Strong Traceability

Keep:

- `39-moderation-panel` as the integration branch

Create child branches from it only for major slices, for example:

- `39-authz-role-separation`
- `39-reports-queue`
- `39-content-moderation`
- `39-user-restrictions`
- `39-mod-log`
- `39-owner-governance`
- `39-community-closure`
- `39-tests`

When to use it:

- The work will take multiple days
- You want smaller reviewable PRs
- You want explicit mapping between issue, code, and dependency chain

How to work:

1. Branch `39-authz-role-separation` from `39-moderation-panel`
2. Merge it back into `39-moderation-panel`
3. Branch the next dependent slice from updated `39-moderation-panel`
4. Repeat until the umbrella branch is complete
5. Open the final PR from `39-moderation-panel` to `development`

This approach is my recommendation if you want traceability of “which story depends on which” without polluting `development`.

## What Not To Do

- Do not create one issue per acceptance criterion
- Do not create one branch per tiny UI tweak
- Do not split stories so finely that you spend more time managing GitHub than building the feature
- Do not branch unrelated work from `development` if it depends on unfinished moderation foundations in `39-moderation-panel`

## Practical Recommendation For Your Current Situation

Since you already have:

- GitHub issue `#39 Moderation Panel`
- branch `39-moderation-panel` from `development`

I recommend this exact setup:

1. Keep `#39` as the parent issue
2. Create 6 to 9 child issues from the major slices listed above
3. Keep `39-moderation-panel` as the umbrella integration branch
4. Create child branches only for the larger implementation slices
5. Name commits and PRs with the child issue reference for traceability

Example commit style:

- `feat(moderation): add scoped authorization helpers (#39)`
- `feat(moderation): add reports queue filters and detail view (#39)`
- `feat(moderation): add community restriction actions (#39)`

If you create child issues, even better:

- `feat(moderation): add scoped authorization helpers (refs #39, #40)`
- `feat(moderation): add reports review workflow (refs #39, #41)`

## Suggested Traceability Rules

To keep work understandable, use these rules consistently:

1. Every child issue should map to one meaningful deliverable
2. Every PR should close or reference one child issue
3. Every branch should exist only if the work is large enough to review independently
4. Every dependency should be documented in the child issue description
5. The parent issue should link all child issues and show their order

## Suggested Child Issue Template

For each child issue, document:

- Goal
- Scope
- Depends on
- Out of scope
- Acceptance criteria
- Branch name
- PR link

Example:

- Goal: Add shared authorization helpers for global moderator, community moderator, and owner checks
- Scope: server-side helpers, route protection, mutation guards
- Depends on: none
- Out of scope: reports UI, restriction UI
- Acceptance criteria: role checks exist and are used by moderation mutations
- Branch name: `39-authz-role-separation`

