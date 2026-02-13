import { PageComponent } from '@emkodev/emroute';

class ExamplePage extends PageComponent {
  override readonly name = 'example';

  override renderHTML(_args: this['RenderArgs']): string {
    return `<div class="example-index">
  <h2>Example Index</h2>
  <p>This is the exact /example page.</p>
  <ul>
    <li><a href="/example/foo">foo</a></li>
    <li><a href="/example/bar">bar</a></li>
    <li><a href="/example/deep/nested/path">deep/nested/path</a></li>
  </ul>
  <router-slot></router-slot>
</div>`;
  }

  override renderMarkdown(_args: this['RenderArgs']): string {
    return `## Example Index

This is the exact /example page.

- [foo](/example/foo)
- [bar](/example/bar)
- [deep/nested/path](/example/deep/nested/path)

\`\`\`router-slot
\`\`\``;
  }
}

export default new ExamplePage();
