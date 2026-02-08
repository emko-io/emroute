/**
 * Default Page Component
 *
 * Used for routes that have .html/.md files but no custom .page.ts file.
 * Inherits all defaults from PageComponent — no overrides needed.
 */

import { PageComponent } from './abstract.component.ts';

export class DefaultPageComponent extends PageComponent {}

export default new DefaultPageComponent();
