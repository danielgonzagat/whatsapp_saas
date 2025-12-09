# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0-rc1] - 2025-12-09

### Added
- **Autopilot**: Full autonomous sales agent with "Ghost Closer" and "Lead Unlocker" modes.
- **Flow Engine**: Visual flow builder with support for Media, Voice, and CRM actions.
- **WhatsApp Connection**: Multi-provider support (WPPConnect, Meta Cloud API, Evolution API).
- **Kloel Brain**: AI-powered workspace admin capable of creating flows, campaigns, and managing products via chat.
- **Frontend**: "Chat Prime" interface with history persistence, markdown support, and real-time streaming.

### Changed
- **Worker Architecture**: Unified worker for all job types (flow, campaign, autopilot, media, voice).
- **Database**: Optimized Prisma schema with indices for high-volume message processing.
- **Security**: Enforced `workspaceId` scoping on all critical queries.
- **Configuration**: Standardized `providerSettings` JSON structure for all integrations.

### Fixed
- **Worker Configs**: Removed hardcoded "auto" provider settings; now fetching real workspace configs.
- **Tool Responses**: Standardized JSON output for all AI tools.
- **Autopilot Toggle**: Fixed state persistence for enabling/disabling Autopilot.
- **WhatsApp Session**: Improved session restoration and QR code generation flow.

### Security
- **Rate Limiting**: Implemented daily limits for Autopilot contacts and workspaces.
- **Anti-Ban**: Added jitter and human-like delays to message sending.
