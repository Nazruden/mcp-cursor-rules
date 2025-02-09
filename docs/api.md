# MCP Rules Server API Documentation

## Overview

The MCP Rules Server provides REST API endpoints for managing rule sources, including git repositories and local directories. This document describes the available endpoints and configuration options.

## Configuration

### Environment Variables

- `SOURCES_FILE_PATH`: Optional. Path to a JSON file for persisting sources configuration. When specified, the server will:
  - Load initial sources from this file on startup
  - Save any changes to sources in this file
  - Watch for external changes to this file and reload sources automatically

## API Endpoints

### List Sources

```http
GET /sources
```

Returns an array of all configured sources.

**Response**

- Status: 200 OK
- Body: Array of source objects

Example Response:

```json
[
  {
    "id": "repo1",
    "type": "git",
    "url": "https://github.com/example/rules.git"
  },
  {
    "id": "local1",
    "type": "local",
    "path": "/path/to/rules"
  }
]
```

### Add Source

```http
POST /sources
```

Adds a new rule source.

**Request Body**

- Must include an `id` field
- Can be either a git repository or local directory source

Example Request:

```json
{
  "id": "repo1",
  "type": "git",
  "url": "https://github.com/example/rules.git"
}
```

**Response**

- Status: 201 Created
- Body: Added source object

Error Responses:

- 400 Bad Request: When request body is missing required `id` field

### Update Source

```http
PUT /sources/:id
```

Updates an existing source by ID.

**Parameters**

- `id`: Source identifier

**Request Body**

- Updated source properties

**Response**

- Status: 200 OK
- Body: Updated source object

Error Responses:

- 404 Not Found: When source with specified ID doesn't exist

### Delete Source

```http
DELETE /sources/:id
```

Removes a source by ID.

**Parameters**

- `id`: Source identifier

**Response**

- Status: 200 OK
- Body: Removed source object

Error Responses:

- 404 Not Found: When source with specified ID doesn't exist

## File Watching

When using local directory sources or the external sources configuration file, the server automatically:

- Monitors for file changes
- Updates rule content when source files change
- Strips metadata headers from imported rules
- Reloads sources configuration when the external file changes

## Error Handling

All endpoints follow standard HTTP status codes:

- 200: Success
- 201: Resource created
- 400: Bad request (invalid input)
- 404: Resource not found
- 500: Server error

Error responses include a message field explaining the error:

```json
{
  "message": "Source must have an id"
}
```
