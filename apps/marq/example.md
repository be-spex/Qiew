# Marq example

A document with the things Markdown files usually contain. Use **Ctrl+F** to search, the toolbar to copy or export it, and follow the links below.

## Text

Plain paragraphs with *emphasis*, **strong text**, ~~strikethrough~~, `inline code` and a [link to the be spex website](https://bespex.github.io). Anchors work too: jump to [the table](#table).

> A quote can carry a thought – or a warning.
>
> — someone, somewhere

## Lists

1. First step
2. Second step
   - nested item
   - another one
3. Third step

- [x] Checked task
- [ ] Open task

## Code

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

```diff
- old line
+ new line
```

## Table

| Viewer | File type | Shows |
| ------ | --------- | ----- |
| Marq   | `.md`     | rendered Markdown |
| Jayq   | `.json`   | a foldable tree |
| Xaq    | `.xml`    | indented, coloured XML |
| Cusq   | `.csv`    | a sortable table |

## Other documents

Links to other Markdown files open in place, with back and forward in the toolbar – for example [the Qiew README](../../README.md).

## Wide content

The text stays in its column, wide things break out of it (or switch to full width with Ctrl+Shift+B).

| Name | Description | Owner | Status | Created | Updated | Region | Environment | Cost centre | Ticket | Notes |
| ---- | ----------- | ----- | ------ | ------- | ------- | ------ | ----------- | ----------- | ------ | ----- |
| alpha | The first service in the long list of services | team-a | running | 2026-01-01 | 2026-11-01 | eu-central-1 | production | CC-1001 | NMS-10001 | Nothing special about this one at all |
| beta | The second service in the long list of services | team-b | stopped | 2026-02-01 | 2026-10-01 | eu-west-1 | staging | CC-1002 | NMS-10002 | Waiting for the next release window |

```mermaid
flowchart LR
  A[Client] --> B[Gateway] --> C[Auth] --> D[Router] --> E[Service A] --> F[Cache] --> G[Database] --> H[Queue] --> I[Worker] --> J[Storage] --> K[Notifier]
```

---

*The end.*
