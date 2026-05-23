# ADR-0010 · Raw Attributes for Widget Params

**Status**: Accepted

Widget params are plain HTML attributes. Kebab-case in HTML maps to
camelCase in TypeScript. Each value is `JSON.parse`'d with a string
fallback.

```html
<widget-counter start="0" max-value="10"></widget-counter>
```

```typescript
override getData({ params }) {
  // params.start === 0  (parsed as number)
  // params.maxValue === 10
}
```

## Why

`<widget-counter data-params='{"start":0,"maxValue":10}'>` is verbose
and un-HTML-like — exactly the kind of escape hatch that screams
"framework." Custom elements don't render anything of their own, so
arbitrary attribute names don't collide with native behavior (`title`,
`class`, etc. still work normally on the parent).

HTML normalizes attribute names to lowercase, so `courseId` becomes
`courseid` in markup. Always write attributes in lowercase in HTML;
emroute camel-cases them on the way in.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0010-data-params-over-individual-attributes.md)
