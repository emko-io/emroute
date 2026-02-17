# emroute Developer Guide

A quick reference for building applications with emroute.

## Quick Start

```widget:code-block
{"language": "bash", "code": "mkdir my-app && cd my-app\ndeno init\ndeno add jsr:@emkodev/emroute", "filename": "terminal"}
```

Create your first route by adding a markdown file to `routes/`:

```widget:code-block
{"language": "markdown", "code": "# Hello World\nWelcome to my emroute app!", "filename": "routes/index.page.md"}
```

Save it as `routes/index.page.md` and start the dev server.

## File Conventions

| Pattern         | Purpose                   |
| --------------- | ------------------------- |
| `*.page.ts`     | TypeScript page component |
| `*.page.html`   | HTML template             |
| `*.page.md`     | Markdown content          |
| `*.page.css`    | Companion stylesheet      |
| `[param]`       | Dynamic route segment     |
| `*.error.ts`    | Error boundary            |
| `*.redirect.ts` | Redirect rule             |

## Rendering Modes

emroute renders every route three ways:

```widget:content-tab
{"tabs": "SPA|SSR HTML|SSR Markdown", "contents": "Client-side navigation with custom elements. Visit / for any route.|Pre-rendered HTML with widget expansion and hydration support. Visit /html/ prefix.|Plain markdown for LLMs, CLI tools, and text clients. Visit /md/ prefix."}
```

## Page Component

A page with data fetching and template rendering:

```widget:code-block
{"language": "typescript", "code": "import { PageComponent } from '@emkodev/emroute';\n\nclass MyPage extends PageComponent<{ id: string }, MyData> {\n  override readonly name = 'my-page';\n\n  override getData({ params }) {\n    return Promise.resolve({ title: `Item ${params.id}` });\n  }\n\n  override renderHTML({ data, context }) {\n    return context?.files?.html\n      ?.replaceAll('{{title}}', data?.title ?? '') ?? '';\n  }\n\n  override renderMarkdown({ data }) {\n    return `# ${data?.title}`;\n  }\n}\n\nexport default new MyPage();", "filename": "routes/items/[id].page.ts"}
```

## Widget Component

A reusable widget that renders everywhere:

```widget:code-block
{"language": "typescript", "code": "import { WidgetComponent } from '@emkodev/emroute';\n\nclass MyWidget extends WidgetComponent<{ label: string }, { text: string }> {\n  override readonly name = 'my-widget';\n\n  override getData({ params }) {\n    return Promise.resolve({ text: params.label });\n  }\n\n  override renderHTML({ data }) {\n    return `<span>${data?.text}</span>`;\n  }\n\n  override renderMarkdown({ data }) {\n    return `**${data?.text}**`;\n  }\n}\n\nexport const myWidget = new MyWidget();", "filename": "widgets/my-widget/my-widget.widget.ts"}
```

## Navigation

Browse the demo:

- [Home](/html/)
- [Articles](/html/articles)
- [Dashboard](/html/dashboard)
- [About](/html/about)
- [Projects](/html/projects)
