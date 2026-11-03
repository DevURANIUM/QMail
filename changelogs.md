# Changelog

Notable user-facing changes to Qmail.

## 2026-11-03

### UI follow-up

- Compact contact creation form with labeled fields, a smaller Add button and responsive mobile layout.

- Live Inbox and Sent search after a 300ms typing pause, without a Search button. Ignore stale responses and cancel pending work on clear/unmount.
- Themed rounded checkboxes with checked, mixed, focus and disabled states, plus native high-contrast fallback.
- Replies start with a clean editor; the original message sits in a collapsed, keyboard-accessible disclosure underneath. Quote text is preserved in sends and drafts.

### Added

- Search within sent mail, with reply and forward actions in mailbox rows and search results.
- Select visible sent messages and delete them together after confirmation; failed deletions remain available for retry.
- Reply from the sent-message view to the original recipient, with incoming replies honoring Reply-To and the matching sender alias.
- Safe quoted text for HTML-only messages.

### Fixed

- Connected the sent-row delete button to the existing attachment-aware deletion API.
- Connected delete, archive and read actions in global search results and remove deleted results immediately.
- Scope sent-mail searches before limiting results; prevent stale search responses after clearing.
- Expose row actions on mobile and keyboard focus, with keyboard-accessible message links.

## 2026-08-09

### Added

- **Passkey sign-in** — log in with Touch ID, Windows Hello, or a security key (FIDO2/WebAuthn); manage passkeys under Settings → Security
- **Full-text search** across subjects, message bodies, and addresses
- **Conversations** — replies are threaded and shown together in the email view
- **Drafts and scheduled send** — save drafts, or pick a time and mail is delivered automatically
- **Reply with quote and forwarding**, with original attachments included on forwards
- **Archive and labels** — keep the inbox clean, tag mail, and browse by label from the sidebar
- **Contacts** — address book with autocomplete in Compose; people you write to are added automatically
- **Delivery status on sent mail** — Delivered / Opened / Bounced badges
- **Push notifications** — get notified of new mail on any device; installable as an app (PWA)
- **Remote image blocking** — tracking-pixel protection with per-email reveal
- **Backups** — download any message as `.eml` or export the whole mailbox as mbox
- **Dark mode** — light, dark, or follow-system, switchable from the sidebar
- **Dashboard** — daily activity chart, recent messages, system status, and storage usage
- Optional **R2 storage for attachments**, raising the per-file limit from 5MB to 25MB

### Changed

- Redesigned interface: new inbox with date groups, sender avatars, message previews, and quick actions on hover; floating compose button; refreshed compose, settings, and login screens

### Security

- Hardened session handling, sanitized rendering of received HTML, stricter security headers, and rate-limited sign-in attempts
