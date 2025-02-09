# Story 1: Add Git Repository and Local Storage Integration for Rule Management

## Story

**As a** developer/admin
**I want** to integrate external git repositories and local drive storage for rule management in the MCP server
**so that** rules can be imported efficiently without metadata headers and managed effectively.

## Status

Draft

## Context

Our current MCP server implementation for agent rules needs enhancement to support multiple sources. By incorporating both remote git repositories and local directories as sources for rule files, we can offer greater flexibility. Imported rules from projects should have metadata headers stripped to maintain consistency and simplify indexing. This story addresses these needs while ensuring adherence to performance, security, and scalability standards outlined in the PRD.

## Estimation

Story Points: 3

## Acceptance Criteria

1. - [ ] The system provides REST API endpoints for managing git repository sources for rule files.
2. - [ ] The system supports configuration to include a local directory as a source for rule files.
3. - [ ] When importing rules from a project, the metadata header is removed so that only the rule content is stored.
4. - [ ] Unit tests achieve at least 80% coverage for the new functionalities.
5. - [ ] The system supports an optional configuration to specify a file path for storing repository/folder sources at server launch. When specified, the server should load, manage, and allow runtime editing of the sources file.

## Subtasks

1. - [ ] Design and implement REST API endpoints for managing git repository sources.
   1. - [ ] Create endpoint for adding a git repository.
   2. - [ ] Create endpoint for listing/managing git repository sources.
   3. - [ ] Create endpoints for updating and removing git repository settings.
2. - [ ] Develop configuration endpoints or file system watchers to support local drive storage.
   1. - [ ] Implement configuration for specifying a local directory as a source for rule files.
   2. - [ ] Develop a file system watcher to detect changes in local rule files.
   3. - [ ] Implement logic to import rule files and strip out metadata headers.
3. - [ ] Write comprehensive unit tests to ensure a minimum of 80% coverage.
4. - [ ] Update documentation to reflect new endpoints and functionality.
5. - [ ] Add functionality to support storing repository/folder sources in an external configuration file:
   1. - [ ] Implement a configuration parameter to specify the file path for sources at server launch.
   2. - [ ] Implement logic to load sources from the specified file during startup and persist changes at runtime.
   3. - [ ] Ensure the system monitors and applies updates from the file when edited.

## Constraints

- Must adhere to the performance, security, and scalability requirements as defined in the PRD.

## Dev Notes

- Use Node.js with Express and TypeScript as the backend stack.
- Integrate with the existing persistent storage for rule caching and indexing.
- Leverage Node.js libraries for git integration and file system monitoring.

## Progress Notes As Needed

- REST API endpoints for managing git repository and local drive storage sources have been fully implemented.
- Comprehensive unit tests have been developed using TDD, covering success cases and error scenarios (e.g., POST without id, PUT/DELETE for non-existent sources).
- All tests are passing, achieving the required test coverage.
- The project repository has been registered with Git; the initial commit has been prepared and will be pushed.
