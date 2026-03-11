---
trigger: always_on
---

# Google Apps Script Stack Rules

This project uses Google Apps Script as backend technology.

## General platform guidelines

Assume the application runs in Google Workspace.

Multiple users may access the application concurrently.

Prefer stable and maintainable solutions compatible with Apps Script limitations.


## Server vs client responsibilities

Business logic must remain on the server (Apps Script).

Client code (HTML / JavaScript) should only handle:

- UI rendering
- user interactions
- calling backend functions

Never rely on client validation for critical business rules.


## Google Sheets as database

Treat Google Sheets as a structured datastore.

Each sheet should behave like a table with:

- header row
- consistent columns
- unique identifiers

Never rely on row position alone.

Centralize column indexes in configuration.


## Spreadsheet efficiency

Spreadsheet operations are expensive.

Prefer:

- bulk reads
- processing in memory
- batch writes

Avoid:

getRange() inside loops  
setValue() inside loops


## Data access layer

All spreadsheet operations must go through repositories.

Controllers and services must not access spreadsheets directly.

Repositories should expose functions like:

- listResources()
- getReservationById()
- createReservation()
- updateReservation()


## Concurrency

Multiple users may attempt concurrent operations.

Use LockService when modifying shared resources such as reservations or capacities.

Ensure that capacity checks and writes happen atomically.


## Authentication

Use Google Workspace identity when possible.

Derive user identity on the server using:

Session.getActiveUser().getEmail()

Never trust client-provided identity.


## Authorization

Verify permissions before performing actions such as:

- creating reservations
- modifying reservations
- deleting resources
- administrative operations


## Data validation

Validate all incoming parameters from the client.

Check:

- required fields
- types
- ranges
- logical constraints


## HTML Service

Keep HTML Service pages simple.

Separate:

- HTML
- CSS
- client JavaScript

Use google.script.run for backend communication.


## Configuration

Centralize configuration such as:

- spreadsheet ID
- sheet names
- time slots
- system constants


## Logging

Log important operations such as:

- reservation creation
- reservation updates
- authorization failures
- unexpected errors

Logs must not contain sensitive data.