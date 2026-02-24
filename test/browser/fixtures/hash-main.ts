import { ComponentElement, createHashRouter } from '@emkodev/emroute/spa';
import { PageComponent } from '@emkodev/emroute';
import { widgetsManifest } from 'emroute:widgets';

// Register discovered widgets (same as auto-generated entry)
for (const entry of widgetsManifest.widgets) {
  const mod = await widgetsManifest.moduleLoaders![entry.modulePath]() as Record<string, unknown>;
  for (const exp of Object.values(mod)) {
    if (exp && typeof exp === 'object' && 'getData' in exp) {
      const widgetFiles = (exp as { files?: Record<string, string> }).files;
      const files = widgetFiles ? { ...entry.files, ...widgetFiles } : entry.files;
      ComponentElement.register(exp as Parameters<typeof ComponentElement.register>[0], files);
      break;
    }
  }
}

// ── Hash route page components ──────────────────────────────────────

class DashboardPage extends PageComponent {
  override readonly name = 'hash-dashboard';

  override renderHTML() {
    return '<h1>Dashboard</h1><p>Welcome to the dashboard</p>';
  }

  override getTitle() {
    return 'Dashboard';
  }
}

class SettingsPage extends PageComponent {
  override readonly name = 'hash-settings';

  override renderHTML() {
    return '<h1>Settings</h1><p>App settings here</p>';
  }

  override getTitle() {
    return 'Settings';
  }
}

class UserPage extends PageComponent<{ id: string }> {
  override readonly name = 'hash-user';

  override renderHTML({ params }: this['RenderArgs']) {
    return `<h1>User ${params.id}</h1><p>Profile for user ${params.id}</p>`;
  }

  override getTitle({ params }: this['RenderArgs']) {
    return `User ${params.id}`;
  }
}

class LayoutPage extends PageComponent {
  override readonly name = 'hash-layout';

  override renderHTML() {
    return '<div class="hash-layout"><h2>Layout</h2><router-slot></router-slot></div>';
  }
}

class NestedPage extends PageComponent {
  override readonly name = 'hash-nested';

  override renderHTML() {
    return '<h3>Nested Content</h3><p>Inside the layout</p>';
  }

  override getTitle() {
    return 'Nested';
  }
}

// ── Set up hash router ──────────────────────────────────────────────

await createHashRouter({
  routes: [
    { pattern: '/', loader: () => Promise.resolve({ default: new DashboardPage() }) },
    { pattern: '/settings', loader: () => Promise.resolve({ default: new SettingsPage() }) },
    { pattern: '/users/:id', loader: () => Promise.resolve({ default: new UserPage() }) },
    { pattern: '/nested', loader: () => Promise.resolve({ default: new LayoutPage() }) },
    { pattern: '/nested/child', loader: () => Promise.resolve({ default: new NestedPage() }) },
  ],
});
