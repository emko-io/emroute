# Toast Templates

## Summary

Toast service should use `<template>` for content structure instead of hardcoding DOM in JS. Consumers own the template, service clones and fills slots.

## Design

### Template (consumer HTML)

```html
<template id="overlay-toast">
  <span data-toast-message></span>
  <button data-toast-confirm hidden></button>
  <button data-toast-reject hidden></button>
</template>
```

### CSS handles type differentiation via `::before` content

```css
[data-overlay-toast]::before {
  margin-right: 8px;
}
[data-toast-type='success']::before {
  content: '✓';
  color: green;
}
[data-toast-type='error']::before {
  content: '✗';
  color: red;
}
[data-toast-type='warning']::before {
  content: '⚠';
  color: orange;
}
[data-toast-type='info']::before {
  content: 'ℹ';
  color: blue;
}
```

### API

```ts
// Convenience methods — clone template, fill message, set type
toast.success('Item saved!')
toast.error('Something went wrong')
toast.warning('Unsaved changes')
toast.info('New version available')

// All toast methods return a ToastHandle with id
const handle = toast.success('Saving...')
handle.id        // number (performance.now timestamp)
handle.dismiss() // graceful CSS exit
handle.update({ message: 'Saved!', type: 'success', timeout: 5000 })

// Try/catch pattern — loading → success/error → auto-dismiss
const t = toast({ type: 'info', message: 'Uploading...', timeout: 0 })
try {
  await upload()
  t.update({ message: 'Uploaded!', type: 'success', timeout: 5000 })
} catch {
  t.update({ message: 'Upload failed', type: 'error', timeout: 5000 })
}

// Confirmation toast — manual dismiss, resolves on button click
toast({
  type: 'warning',
  message: 'Delete item?',
  confirm: 'Delete',
  reject: 'Cancel',
})  // returns Promise<boolean>

// Escape hatch — full control, no template
toast({ render(el) { ... } })
```

### ToastHandle

```ts
interface ToastHandle {
  id: number; // performance.now() timestamp
  dismiss(): void; // graceful CSS exit
  update(opts: {
    message?: string; // change text via data-toast-message slot
    type?: string; // change data-toast-type (CSS icon/color updates)
    timeout?: number; // switch from manual (0) to auto-dismiss
  }): void;
}
```

`update()` re-triggers the CSS animation when `timeout` changes from 0 to a
value. Sets `--overlay-toast-duration` and restarts `overlay-toast-auto`
keyframe. Type change swaps `data-toast-type` attribute — CSS `::before`
updates instantly.

### Slots

- `data-toast-message` — text content
- `data-toast-confirm` — confirm button (hidden by default, service unhides + labels)
- `data-toast-reject` — reject button (hidden by default, service unhides + labels)

### Behavior

- Service clones `<template id="overlay-toast">` from DOM
- Falls back to creating spans if no template found
- Confirmation toast uses `timeout: 0` (manual dismiss)
- Confirm/reject resolve a `Promise<boolean>`
- Declarative (server-rendered flash) reuses same structure inline

## Proposal: Worker-based Service

Move overlay logic into a Service Worker. Main thread keeps a thin DOM adapter
that listens for `postMessage` and manipulates elements. Benefits:

- **Any context can fire toasts** — workers, iframes, nested widgets post a
  message, main thread handles DOM
- **Service Worker intercepts WebSocket messages** — server push events (deploy
  notifications, real-time alerts, chat) become toasts without any page-level JS
- **Queue management off main thread** — deduplication, rate limiting, priority
  ordering happen in the worker
- **Survives navigation** — Service Worker persists across page loads, can queue
  toasts for the next page (flash messages without server-side session state)

### Architecture

```
Service Worker (persistent)
  ├── WebSocket listener → postMessage to client
  ├── Toast queue / dedup / rate limit
  └── fetch handler (intercept API responses → toast on error)

Main thread DOM adapter (thin)
  ├── navigator.serviceWorker.onmessage → clone template, append to container
  └── overlay.toast() → postMessage to SW → SW processes → posts back
```

### Message format

```ts
// Client → SW
{ type: 'toast', payload: { type: 'success', message: 'Saved!' } }

// SW → Client (after queue/dedup)
{ type: 'show-toast', payload: { id: 123, type: 'success', message: 'Saved!' } }

// SW → Client (from WebSocket)
{ type: 'show-toast', payload: { id: 456, type: 'info', message: 'New deploy' } }
```

## Depends on

Overlay service with CSS-driven toast lifecycle (completed).
