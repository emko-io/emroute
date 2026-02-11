/**
 * Element Ref Widget — Test Fixture
 *
 * Verifies that this.element is set by ComponentElement during the
 * browser lifecycle (getData and renderHTML).
 * On the server, this.element is undefined.
 */

import { WidgetComponent } from '@emkodev/emroute';

interface ElementRefData {
  hadElementDuringGetData: boolean;
  tagName: string | null;
}

class ElementRefWidget extends WidgetComponent<Record<string, never>, ElementRefData> {
  override readonly name = 'element-ref';

  override getData() {
    return Promise.resolve({
      hadElementDuringGetData: this.element !== undefined,
      tagName: this.element?.tagName?.toLowerCase() ?? null,
    });
  }

  override renderHTML({ data }: this['RenderArgs']) {
    if (!data) return '<p>Loading...</p>';
    const hadElementDuringRender = this.element !== undefined;
    return `<div class="element-ref-result"
  data-get-data="${data.hadElementDuringGetData}"
  data-render="${hadElementDuringRender}"
  data-tag="${data.tagName ?? ''}">
  <span class="get-data-ref">${data.hadElementDuringGetData}</span>
  <span class="render-ref">${hadElementDuringRender}</span>
  <span class="tag-name">${data.tagName ?? ''}</span>
</div>`;
  }

  override renderMarkdown() {
    return '';
  }
}

export const elementRefWidget = new ElementRefWidget();
