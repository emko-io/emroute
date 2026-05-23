/**
 * Browser entry for the PWA branch of the guide (/app/*).
 *
 * Sets the markdown renderer for `<mark-down>` elements, then boots the
 * client-side emroute runtime which takes over routing via the Navigation API.
 */

import { bootEmrouteApp, MarkdownElement } from '@emkodev/emroute/spa';
import { renderMarkdown } from '@emkodev/emkoma/render';

MarkdownElement.setRenderer({ render: renderMarkdown });

await bootEmrouteApp();
