# ADR-0015 · setHTMLUnsafe for DOM Injection

**Status**: Accepted

Use `setHTMLUnsafe()` instead of `innerHTML` for SPA slot updates and
widget shadow root content.

## Why

`innerHTML` doesn't parse Declarative Shadow DOM templates — exactly the
thing emroute uses to ship SSR-rendered widgets to the browser. Without
DSD parsing, a widget's shadow tree would be lost on first hydration
swap.

`setHTMLUnsafe()` is the platform's intended successor: it parses DSD
correctly, accepts `TrustedHTML` for future CSP support, and signals
"this is intentional dynamic HTML" rather than the legacy `innerHTML`
which has always lied about what it does.

The "Unsafe" suffix is honest naming — you're saying "yes, this is HTML
the developer authored, render it." Same trust model, better behavior.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0015-set-html-unsafe.md)
