# API Documentation

## Overview

This API Gateway provides a Backend-as-a-Service (BaaS) platform. It supports two levels of operations:
1.  **Platform Level**: For developers/admins to manage projects (Create projects, get API keys).
2.  **Project Level**: For end-users and applications within a specific project (Auth, DB, Storage).

## Base URL

All routes are prefixed with `/v1`.

### Authentication

There are two types of authentication:

1.  **Platform Authorization (`Authorization: Bearer <token>`)**
    *   Used for managing projects and platform-level resources.
    *   Obtained via `/v1/platform/auth/token`.

2.  **Project Authorization (`x-api-key: <key>` or `Authorization: Bearer <user_token>`)**
    *   **`x-api-key`**: Used to identify the **Project Context**. Required for initializing interaction with a project (e.g., signing up a user, public data access).
    *   **`Authorization: Bearer <token>`**: Used for **End-User Authentication** within a project. obtained via `/v1/auth/project/login`.

---

## 1. Platform Authentication
*Manage your developer account.*

### Register Developer
Create a new platform account.

*   **Endpoint**: `POST /v1/platform/auth/signup`
*   **Auth**: Public

**Request Body:**
```json
{
  "email": "dev@example.com",
  "password": "secureValues123"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "user_...",
      "email": "dev@example.com"
    }
  }
}
```

### Platform Login
Login to get a Platform Access Token.

*   **Endpoint**: `POST /v1/platform/auth/token`
*   **Auth**: Public

**Request Body:**
```json
{
  "email": "dev@example.com",
  "password": "secureValues123"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "access_token": "eyJhbGciOi...",
    "expires_in": 3600
  }
}
```

---

## 2. Project Management
*Create and manage your projects. Requires Platform Token.*

### Create Project
Provisions a new project, database, and API Key.

*   **Endpoint**: `POST /v1/projects`
*   **Auth**: `Authorization: Bearer <platform_token>`

**Request Body:**
```json
{
  "name": "My Cool App"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "id": "proj_...",
    "name": "My Cool App",
    "api_key": "pk_...",
    "message": "Project created and database created"
  }
}
```
*Save the `api_key`! It is needed for all Project Level interactions.*

### Get Project Details
*   **Endpoint**: `GET /v1/projects/:id`
*   **Auth**: `Authorization: Bearer <platform_token>`

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "id": "proj_...",
    "status": "active",
    "meta": {
      "name": "My Cool App",
      "owner_id": "...",
      "created_at": "..."
    }
  }
}
```

---

## 3. Project End-User Auth
*Authentication for users WITHIN a project.*
*Requires `x-api-key` header to identify the project.*

### Project User Signup
Register a user for your app.

*   **Endpoint**: `POST /v1/auth/project/signup`
*   **Headers**: `x-api-key: <project_api_key>`

**Request Body:**
```json
{
  "email": "user@app.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "id": "user_...",
    "email": "user@app.com",
    "name": "John Doe",
    "role": "user",
    "message": "User registered successfully"
  }
}
```

### Project User Login
Login a user to get a User Session Token.

*   **Endpoint**: `POST /v1/auth/project/login`
*   **Headers**: `x-api-key: <project_api_key>`

**Request Body:**
```json
{
  "email": "user@app.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "access_token": "eyJ...",
    "expires_in": 604800,
    "user": {
      "id": "user_...",
      "email": "user@app.com",
      "name": "John Doe",
      "role": "user",
      "created_at": "..."
    }
  }
}
```

### Get Current User
*   **Endpoint**: `GET /v1/auth/project/me`
*   **Headers**:
    *   `x-api-key`: `<project_api_key>`
    *   `Authorization`: `Bearer <user_session_token>`

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "user_...",
      "email": "user@app.com",
      "role": "user",
      "created_at": "..."
    }
  }
}
```

---

## 4. Database (SQL-like)
*Interact with the project's SQLite database.*

### Create Table
*   **Endpoint**: `POST /v1/db/tables`
*   **Headers**: `x-api-key: <project_api_key>` (Usually Service Role/Admin, pending policy implementation)

**Request Body:**
```json
{
  "name": "posts",
  "schema": {
    "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
    "title": "TEXT NOT NULL",
    "content": "TEXT",
    "user_id": "TEXT"
  }
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "message": "Table 'posts' created successfully",
    "table": "posts",
    "schema": { ... }
  }
}
```

### Create Row (Insert)
*   **Endpoint**: `POST /v1/db/:table`
*   **Headers**:
    *   `x-api-key`: `<project_api_key>`
    *   `Authorization`: `Bearer <user_token>` (Optional - will auto-inject `user_id` if present in schema)

**Request Body:**
```json
{
  "title": "Hello World",
  "content": "This is my first post"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "data": {
      "id": 1,
      "title": "Hello World",
      "content": "This is my first post",
      "user_id": "user_..."
    },
    "operation": "INSERT",
    "table": "posts"
  }
}
```

### List Rows
*   **Endpoint**: `GET /v1/db/:table`
*   **Headers**:
    *   `x-api-key`: `<project_api_key>`
    *   `Authorization`: `Bearer <user_token>` (Optional - automatically filters by `user_id` if table has that column)

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "data": [
      {
        "id": 1,
        "title": "Hello World",
        ...
      }
    ],
    "meta": {
      "count": 1
    }
  }
}
```

---

## 5. Storage
*File uploads.*

### Get Signed Upload URL
*   **Endpoint**: `POST /v1/storage/upload/sign`
*   **Headers**:
    *   `x-api-key`: `<project_api_key>`
    *   `Authorization`: `Bearer <user_token>`

**Request Body:**
```json
{
  "filename": "avatar.png",
  "contentType": "image/png",
  "size": 10240
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "uploadUrl": "https://storage.example.com/proj_.../user_.../avatar.png?signature=...",
    "key": "proj_.../user_.../avatar.png"
  }
}
```

---

## Error Response Format
All errors follow this format:

```json
{
  "status": "error",
  "error": {
    "message": "Description of the error",
    "code": "ERROR_CODE",
    "details": "..."
  }
}
```
