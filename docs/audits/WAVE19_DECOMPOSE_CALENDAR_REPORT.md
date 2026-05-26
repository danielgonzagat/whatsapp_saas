# Wave 19 — Decompose calendar.service.ts

> Authored by PI atomic subagent `w19-decompose-calendar` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted Google Calendar integration logic from `calendar.service.ts` (589 LOC) into a dedicated `calendar.google.helpers.ts` (258 LOC).

## What was extracted

**Cohesive group: Google Calendar integration**

Two private methods moved to `CalendarGoogleHelper`:

| Method | Lines moved | Description |
|---|---|---|
| `CalendarGoogleHelper.createEvent()` | ~95 | OAuth2 setup, Google Calendar API event insert |
| `CalendarGoogleHelper.listEvents()` | ~58 | OAuth2 setup, Google Calendar API event list |

Plus two internal types:
- `GoogleCalendarEventItem` — shape of raw Google Calendar API event
- `GoogleCalendarModule` — shape of the dynamically-imported `googleapis` module

## Line counts

| File | Before | After | Delta |
|---|---|---|---|
| `backend/src/calendar/calendar.service.ts` | 589 | 390 | −199 |
| `backend/src/calendar/calendar.google.helpers.ts` | — | 258 | +258 |
| **Net** | **589** | **648** | **+59** |

The net +59 is structural: the helper's exported interfaces (`GoogleCalendarEventParams`, `GoogleCalendarConfig`), class wrapper, constructor, and JSDoc add boilerplate that was previously implicit in the monolithic service.

## Files created

- `backend/src/calendar/calendar.google.helpers.ts` — `CalendarGoogleHelper` class with `createEvent()` and `listEvents()` methods

## Public API

**Unchanged.** All public methods preserved with identical signatures:
- `getCalendarConfig(workspaceId)` → `Promise<CalendarConfig | null>`
- `createEvent(workspaceId, event)` → `Promise<CalendarEvent>`
- `listEvents(workspaceId, startDate?, endDate?)` → `Promise<CalendarEvent[]>`
- `cancelEvent(workspaceId, eventId)` → `Promise<boolean>`
- `createAppointmentForContact(workspaceId, contactId, datetime, description?, durationMinutes?)` → `Promise<CalendarEvent>`

Exported interface `CalendarEvent` still exported from `calendar.service.ts`.

## Backend tsc

```
npm --prefix backend run typecheck
```

**PASS** — exit code 0, zero errors.

## Specs

| Spec | Result |
|---|---|
| `calendar/calendar.service.spec` | PASS — exit code 0 |
| `calendar/calendar.controller.spec` | PASS — exit code 0 |

## Architecture

```
calendar.service.ts (390 LOC)
├── CalendarEvent, CalendarConfig (interfaces)
├── CalendarService (public API)
│   ├── getCalendarConfig()
│   ├── createEvent()
│   ├── listEvents()
│   ├── cancelEvent()
│   ├── createAppointmentForContact()
│   ├── createGoogleCalendarEvent() ──delegates──▶ CalendarGoogleHelper.createEvent()
│   ├── listFromCalendarProvider()  ──delegates──▶ CalendarGoogleHelper.listEvents()
│   └── saveInternalEvent()
└── normalizeCalendarConfig()

calendar.google.helpers.ts (258 LOC)
├── GoogleCalendarEventParams, GoogleCalendarConfig (interfaces)
├── GoogleCalendarEventItem, GoogleCalendarModule (internal types)
└── CalendarGoogleHelper
    ├── createEvent(config, event) → Promise<CalendarEventParams | null>
    └── listEvents(config, startDate?, endDate?) → Promise<CalendarEventParams[]>
```

The `CalendarGoogleHelper` is instantiated in `CalendarService`'s constructor with `ConfigService` and `Logger` — same dependencies the inlined methods already used. Structural typing allows `CalendarEvent` / `CalendarConfig` objects to flow through without explicit type imports from the helper into the service file.