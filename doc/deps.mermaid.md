```mermaid
graph LR

%% Dependency graph — internal imports only
%% Legend: ──▶ value import, ---▶ type-only import

subgraph src ["src/"]
  src_index["src/index.ts"]
  src_type_route["src/type/route.type.ts"]
  src_type_widget["src/type/widget.type.ts"]
  src_type_markdown["src/type/markdown.type.ts"]
  src_type_logger["src/type/logger.type.ts"]
  src_comp_abstract["src/component/abstract.component.ts"]
  src_comp_page["src/component/page.component.ts"]
  src_comp_widget["src/component/widget.component.ts"]
  src_route_core["src/route/route.core.ts"]
  src_route_matcher["src/route/route.matcher.ts"]
  src_util_html["src/util/html.util.ts"]
  src_util_logger["src/util/logger.util.ts"]
  src_util_widget_resolve["src/util/widget-resolve.util.ts"]
  src_widget_registry["src/widget/widget.registry.ts"]
  src_widget_parser["src/widget/widget.parser.ts"]
  src_widget_page_title["src/widget/page-title.widget.ts"]
  src_widget_breadcrumb["src/widget/breadcrumb.widget.ts"]
  src_el_slot["src/element/slot.element.ts"]
  src_el_markdown["src/element/markdown.element.ts"]
  src_el_component["src/element/component.element.ts"]
  src_spa_mod["src/renderer/spa/mod.ts"]
  src_spa_html["src/renderer/spa/html.renderer.ts"]
  src_spa_hash["src/renderer/spa/hash.renderer.ts"]
  src_spa_base["src/renderer/spa/base.renderer.ts"]
  src_ssr_html["src/renderer/ssr/html.renderer.ts"]
  src_ssr_md["src/renderer/ssr/md.renderer.ts"]
  src_ssr_ssr["src/renderer/ssr/ssr.renderer.ts"]
  src_overlay_mod["src/overlay/mod.ts"]
  src_overlay_service["src/overlay/overlay.service.ts"]
  src_overlay_type["src/overlay/overlay.type.ts"]
  src_overlay_css["src/overlay/overlay.css.ts"]
end

subgraph server ["server/"]
  srv_emroute["server/emroute.server.ts"]
  srv_cli["server/cli.deno.ts"]
  srv_api_type["server/server-api.type.ts"]
  srv_gen_route["server/generator/route.generator.ts"]
  srv_gen_widget["server/generator/widget.generator.ts"]
  srv_gen_sitemap["server/generator/sitemap.generator.ts"]
  srv_gen_cli["server/generator/cli.ts"]
end

subgraph runtime ["runtime/"]
  rt_abstract["runtime/abstract.runtime.ts"]
  rt_deno_fs["runtime/deno/fs/deno-fs.runtime.ts"]
end

%% ─── src/index.ts ─────────────────────────────────────────────
src_index ---▶ src_type_route
src_index ---▶ src_type_widget
src_index ---▶ src_type_markdown
src_index --> src_type_logger
src_index --> src_comp_abstract
src_index --> src_comp_page
src_index --> src_comp_widget
src_index --> src_widget_registry
src_index --> src_route_core
src_index --> src_util_html

%% ─── src/component ────────────────────────────────────────────
src_comp_abstract ---▶ src_type_route
src_comp_abstract --> src_util_html
src_comp_page --> src_comp_abstract
src_comp_page --> src_util_html
src_comp_widget --> src_comp_abstract
src_comp_widget --> src_util_html

%% ─── src/route ────────────────────────────────────────────────
src_route_core ---▶ src_type_route
src_route_core ---▶ src_comp_abstract
src_route_core --> src_route_matcher
src_route_matcher ---▶ src_type_route

%% ─── src/widget ───────────────────────────────────────────────
src_widget_registry ---▶ src_comp_widget
src_widget_registry ---▶ src_type_widget
src_widget_parser ---▶ src_type_widget
src_widget_page_title --> src_comp_widget
src_widget_breadcrumb --> src_comp_widget
src_widget_breadcrumb --> src_util_html
src_widget_breadcrumb ---▶ src_comp_abstract
src_widget_breadcrumb --> src_route_core

%% ─── src/element ──────────────────────────────────────────────
src_el_slot --> src_util_html
src_el_markdown --> src_util_html
src_el_markdown ---▶ src_type_markdown
src_el_component ---▶ src_comp_abstract
src_el_component --> src_util_html

%% ─── src/renderer/spa ────────────────────────────────────────
src_spa_mod --> src_el_slot
src_spa_mod --> src_el_markdown
src_spa_mod --> src_el_component
src_spa_mod --> src_widget_registry
src_spa_mod --> src_spa_html
src_spa_mod --> src_spa_hash
src_spa_mod ---▶ src_type_widget
src_spa_mod --> src_comp_page
src_spa_mod --> src_comp_widget
src_spa_mod --> src_comp_abstract
src_spa_mod ---▶ src_type_route
src_spa_mod ---▶ src_type_markdown
src_spa_mod --> src_route_core
src_spa_mod --> src_util_html
src_spa_mod --> src_type_logger
src_spa_mod --> src_overlay_service
src_spa_mod ---▶ src_overlay_type
src_spa_mod --> src_widget_page_title
src_spa_mod --> src_widget_breadcrumb

src_spa_base ---▶ src_type_route
src_spa_base --> src_comp_page
src_spa_base --> src_route_core
src_spa_base --> src_util_logger

src_spa_html ---▶ src_type_route
src_spa_html ---▶ src_comp_abstract
src_spa_html --> src_el_component
src_spa_html --> src_route_core
src_spa_html --> src_util_html
src_spa_html --> src_util_logger
src_spa_html --> src_spa_base
src_spa_html --> src_comp_page

src_spa_hash ---▶ src_type_route
src_spa_hash ---▶ src_comp_abstract
src_spa_hash --> src_route_core
src_spa_hash --> src_util_html
src_spa_hash --> src_util_logger
src_spa_hash --> src_spa_base

%% ─── src/renderer/ssr ────────────────────────────────────────
src_ssr_ssr ---▶ src_type_route
src_ssr_ssr --> src_type_logger
src_ssr_ssr ---▶ src_comp_abstract
src_ssr_ssr --> src_comp_page
src_ssr_ssr --> src_route_core
src_ssr_ssr --> src_route_matcher
src_ssr_ssr ---▶ src_widget_registry

src_ssr_html ---▶ src_type_route
src_ssr_html ---▶ src_type_markdown
src_ssr_html ---▶ src_comp_page
src_ssr_html --> src_route_core
src_ssr_html --> src_util_html
src_ssr_html --> src_util_widget_resolve
src_ssr_html --> src_ssr_ssr

src_ssr_md ---▶ src_type_route
src_ssr_md ---▶ src_comp_page
src_ssr_md --> src_route_core
src_ssr_md --> src_util_html
src_ssr_md --> src_util_widget_resolve
src_ssr_md --> src_widget_parser
src_ssr_md --> src_ssr_ssr

%% ─── src/util ─────────────────────────────────────────────────
src_util_widget_resolve ---▶ src_comp_abstract
src_util_widget_resolve --> src_type_logger
src_util_widget_resolve ---▶ src_type_route
src_util_widget_resolve --> src_util_html

%% ─── src/overlay ──────────────────────────────────────────────
src_overlay_mod ---▶ src_overlay_type
src_overlay_mod --> src_overlay_service
src_overlay_service ---▶ src_overlay_type
src_overlay_service --> src_overlay_css

%% ─── server ───────────────────────────────────────────────────
srv_emroute --> src_route_core
srv_emroute --> src_ssr_html
srv_emroute --> src_ssr_md
srv_emroute ---▶ src_type_route
srv_emroute ---▶ src_type_widget
srv_emroute --> srv_gen_route
srv_emroute --> srv_gen_widget
srv_emroute --> src_widget_registry
srv_emroute ---▶ src_comp_widget
srv_emroute --> src_util_html
srv_emroute --> rt_abstract
srv_emroute ---▶ srv_api_type

srv_api_type ---▶ src_type_route
srv_api_type ---▶ src_type_markdown
srv_api_type ---▶ src_type_widget
srv_api_type ---▶ src_comp_abstract
srv_api_type ---▶ src_route_core
srv_api_type ---▶ src_widget_registry
srv_api_type ---▶ src_ssr_html
srv_api_type ---▶ src_ssr_md

srv_cli --> srv_emroute
srv_cli --> rt_deno_fs
srv_cli ---▶ src_type_widget
srv_cli ---▶ src_route_core
srv_cli ---▶ src_type_markdown
srv_cli --> srv_gen_route
srv_cli --> srv_gen_widget

srv_gen_route --> src_route_matcher
srv_gen_route ---▶ src_type_route
srv_gen_route ---▶ rt_abstract

srv_gen_widget ---▶ src_type_widget
srv_gen_widget ---▶ rt_abstract

srv_gen_sitemap --> src_util_html
srv_gen_sitemap ---▶ src_type_route

srv_gen_cli --> srv_gen_route
srv_gen_cli --> srv_gen_widget
srv_gen_cli --> rt_deno_fs
srv_gen_cli --> srv_emroute

%% ─── runtime ──────────────────────────────────────────────────
rt_deno_fs --> rt_abstract
```
