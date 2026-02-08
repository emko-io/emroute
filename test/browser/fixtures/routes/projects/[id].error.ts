import { PageComponent } from '@emkodev/emroute';

class ProjectErrorBoundary extends PageComponent {
  override readonly name = 'project-error';

  override renderHTML() {
    return '<h1>Project Error</h1><p class="error-msg">Something went wrong with this project.</p>';
  }

  override renderMarkdown() {
    return '# Project Error\n\nSomething went wrong with this project.';
  }
}

export default new ProjectErrorBoundary();
