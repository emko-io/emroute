# Widgets in Markdown

This page tests **server-side widget rendering** inside markdown content.

## How it works

When served via **SSR Markdown** (`/md/widgets`), the fenced widget blocks
below are parsed by `parseWidgetBlocks()` and replaced with each widget's
`renderMarkdown()` output. The result is plain text — no HTML, no custom
elements.

When served via **SSR HTML** (`/html/widgets`), the markdown is first
rendered to HTML by the markdown renderer. Fenced widget blocks become
`<widget-*>` custom elements (via `processFencedWidgets()`). Then
`resolveWidgetTags()` calls `getData()` + `renderHTML()` on each widget
and injects the rendered content with a `data-ssr` attribute.

When served via **SPA** (`/widgets`), the `<mark-down>` element renders
markdown client-side, converting fenced blocks to `<widget-*>` elements.
The custom elements then call `getData()` + `renderHTML()` on the client.

## Greeting Widget (no params)

```widget:greeting
{}
```

## Greeting Widget (with name param)

```widget:greeting
{"name": "Developer"}
```

## Info Card Widget

```widget:info-card
{"title": "Widget Rendering", "description": "This card was rendered by the server.", "badge": "SSR"}
```

## Failing Widget (error handling)

This widget throws in `getData()`. The SSR Markdown renderer catches the
error and replaces the block with the widget's `renderMarkdownError()` output.

```widget:failing
{}
```
