import { PageComponent } from '@emkodev/emroute';

class ExampleCatchAllPage extends PageComponent {
  override readonly name = 'example-catch-all';

  override renderHTML({ params }: this['RenderArgs']): string {
    const path = params.path ?? '(none)';
    const rest = params.rest ?? '(none)';
    return `<div class="example-catch-all">
  <h2>Catch-All</h2>
  <p>path: <code>${path}</code></p>
  <p>rest: <code>${rest}</code></p>
  <p><a href="/html/example">Back to index</a></p>
</div>`;
  }

  override renderMarkdown({ params }: this['RenderArgs']): string {
    const path = params.path ?? '(none)';
    const rest = params.rest ?? '(none)';
    return `## Catch-All

path: \`${path}\`
rest: \`${rest}\`

[Back to index](/html/example)`;
  }
}

export default new ExampleCatchAllPage();
