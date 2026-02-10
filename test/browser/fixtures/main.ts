import { ComponentElement, createSpaHtmlRouter, WidgetRegistry } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.ts';
import failingWidget from './widgets/failing/failing.widget.ts';
import { greetingWidget } from './widgets/greeting/greeting.widget.ts';
import { infoCardWidget } from './widgets/info-card/info-card.widget.ts';
import { counterHtmWidget } from './widgets/counter-htm/counter-htm.widget.ts';
import { counterVanillaWidget } from './widgets/counter-vanilla/counter-vanilla.widget.ts';
import { navWidget } from './widgets/nav/nav.widget.ts';
import { heroBannerWidget } from './widgets/hero-banner/hero-banner.widget.ts';
import { articleCardWidget } from './widgets/article-card/article-card.widget.ts';
import { statCardWidget } from './widgets/stat-card/stat-card.widget.ts';
import { recentArticleWidget } from './widgets/recent-article/recent-article.widget.ts';
import { tagCloudWidget } from './widgets/tag-cloud/tag-cloud.widget.ts';
import { searchFilterWidget } from './widgets/search-filter/search-filter.widget.ts';
import { contentTabWidget } from './widgets/content-tab/content-tab.widget.ts';
import { codeBlockWidget } from './widgets/code-block/code-block.widget.ts';

// Set up emko-md markdown renderer (side-effect import)
import './emko.renderer.ts';

// Create widget registry and register all widgets
const widgets = new WidgetRegistry();
widgets.add(failingWidget);
widgets.add(greetingWidget);
widgets.add(infoCardWidget);
widgets.add(counterHtmWidget);
widgets.add(counterVanillaWidget);
widgets.add(navWidget);
widgets.add(heroBannerWidget);
widgets.add(articleCardWidget);
widgets.add(statCardWidget);
widgets.add(recentArticleWidget);
widgets.add(tagCloudWidget);
widgets.add(searchFilterWidget);
widgets.add(contentTabWidget);
widgets.add(codeBlockWidget);

for (const widget of widgets) {
  ComponentElement.register(widget);
}

const router = await createSpaHtmlRouter(routesManifest);

(globalThis as Record<string, unknown>).__testRouter = router;
