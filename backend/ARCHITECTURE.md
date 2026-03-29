# Backend Architecture — API Module Structure

## Overview

The backend API is organized into focused modules extracted from two originally monolithic files (`tasks.py` at 3,318 lines, `agent.py` at 2,283 lines). Each module has a single responsibility and clear dependency direction.

## Module Dependency Diagram

```
                    ┌──────────────┐
                    │   main.py    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐  (other routers)
        │ tasks.py │ │ agent.py │
        └────┬─────┘ └────┬─────┘
             │             │
     ┌───────┼───────┐    │
     │       │       │    ├── agent_permissions.py
     │       │       │    └── agent_messaging.py (sub-router)
     │       │       │
     │       │       └── task_comments_attachments.py (sub-router)
     │       │
     │       └── task_queries.py
     │
     └── task_notifications.py
```

## Modules

### `tasks.py` (2,090 lines)
**Role:** Task CRUD endpoints, SSE streaming, update logic, and status rules.
- Endpoints: list, create, update, delete, stream
- Contains: all task mutation logic, status gates, dependency reconciliation
- Imports from: task_queries, task_notifications, task_comments_attachments

### `agent.py` (1,741 lines)
**Role:** Agent-scoped board operations, task proxies, memory, approvals.
- Endpoints: board listing, task CRUD proxies, memory, heartbeat, approvals
- Contains: agent-specific task creation, cross-board task listing
- Imports from: agent_permissions, agent_messaging, tasks (as tasks_api)

### `task_queries.py` (525 lines)
**Role:** Read-only query helpers and response builders.
- Pure functions: parse_since, coerce_task_items, status_values
- DB queries: task_read_response, task_read_page, fetch_task_events
- Custom fields: organization_custom_field_definitions_for_board, task_custom_field_values_by_task_id
- **No imports from tasks.py or agent.py** (leaf module)

### `task_notifications.py` (414 lines)
**Role:** Agent/lead notification messaging for task events.
- Message formatting: assignment_notification_message, rework_notification_message
- Orchestrators: notify_agent_on_task_assign, notify_lead_on_task_create
- Gateway dispatch: send_agent_task_message, send_lead_task_message
- **No imports from tasks.py or agent.py** (leaf module)

### `task_comments_attachments.py` (487 lines)
**Role:** Comment and attachment endpoints (sub-router on tasks).
- Endpoints: create comment, list/upload/download/delete attachments
- Helpers: comment validation, mention targeting, mime detection
- Sub-router included in tasks.py router
- Imports from: task_notifications (for send_agent_task_message)

### `agent_permissions.py` (207 lines)
**Role:** Authorization guards for agent operations.
- Board access: guard_board_access, guard_lead_cross_board_access
- Task access: guard_task_access, guard_task_update_cross_board
- Board state: require_board_not_paused
- **No imports from agent.py or tasks.py** (leaf module)

### `agent_messaging.py` (426 lines)
**Role:** Gateway messaging endpoints (sub-router on agent).
- Endpoints: nudge_agent, ask_user_via_gateway_main, message/broadcast_gateway_board_lead
- Sub-router included in agent.py router
- Imports from: agent_permissions (for guard functions)

## Import Rules

1. **No circular imports.** Dependency flows downward only.
2. **Leaf modules** (task_queries, task_notifications, agent_permissions) import only from models, schemas, and services — never from other API modules.
3. **Sub-routers** (task_comments_attachments, agent_messaging) may import from leaf modules.
4. **Main modules** (tasks.py, agent.py) may import from any extracted module.
5. **Import aliases** preserve original call-site names (e.g., `task_read_response as _task_read_response`).
6. **Re-exports** in tasks.py maintain backward compatibility for agent.py proxy calls.

## Router Registration

```python
# main.py
api_v1.include_router(tasks_router)  # includes comments/attachments sub-router
api_v1.include_router(agent_router)  # includes messaging sub-router
```

## Testing

Unit tests for extracted modules in `tests/`:
- `test_task_queries_unit.py` — pure function tests (parse_since, coerce, status_values)
- `test_task_notifications_unit.py` — message formatting (truncation, assignment, rework)
- `test_task_comments_attachments_unit.py` — mime detection, actor helpers
- `test_agent_permissions_unit.py` — guard function logic (board/task/lead access)
