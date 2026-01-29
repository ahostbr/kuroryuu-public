---
description: Manage Kuroryuu inbox messages
argument-hint: [action] [args...]
allowed-tools: Read, Bash
---

Manage inbox messages for multi-agent coordination.

## Actions

Parse `$ARGUMENTS` to determine action:

### List Messages (default)
`/k-inbox` or `/k-inbox list`
```
k_inbox(action="list", filter="status:new")
```

### Send Message
`/k-inbox send <to> <subject> <body>`
```
k_inbox(
  action="send",
  to="<agent_id or role>",
  subject="<subject>",
  body="<message body>"
)
```

### Read Message
`/k-inbox read <message_id>`
```
k_inbox(action="read", message_id="<id>")
```

### Claim Message
`/k-inbox claim <message_id>`
```
k_inbox(action="claim", message_id="<id>")
```

### Complete Message
`/k-inbox complete <message_id>`
```
k_inbox(action="complete", message_id="<id>")
```

## Gateway Alternative

- List: GET `http://127.0.0.1:8200/v1/inbox?filter=...`
- Send: POST `http://127.0.0.1:8200/v1/inbox`
- Read: GET `http://127.0.0.1:8200/v1/inbox/<id>`
- Claim: POST `http://127.0.0.1:8200/v1/inbox/<id>/claim`
- Complete: POST `http://127.0.0.1:8200/v1/inbox/<id>/complete`

## Filters

- `status:new` - Unclaimed messages
- `status:claimed` - In-progress messages
- `to:me` - Messages for current agent
- `to:leader` - Messages for leader
- `priority:high` - High priority only

## Usage Examples

- `/k-inbox` - List new messages
- `/k-inbox send worker-1 "Task" "Please implement feature X"`
- `/k-inbox claim msg_12345`
- `/k-inbox complete msg_12345`
