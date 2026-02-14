import { PageComponent } from '@emkodev/emroute';

class ProjectPage extends PageComponent<{ id: string }, { name: string }> {
  override readonly name = 'project';

  override getData({ params }: this['DataArgs']) {
    return Promise.resolve({ name: `Project ${params.id}` });
  }

  override renderHTML({ data, params }: this['RenderArgs']) {
    if (!data) return '<p>Loading...</p>';
    return `<h1>${data.name}</h1><p class="project-id">ID: ${params.id}</p><router-slot></router-slot>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']) {
    if (!data) return '';
    return `# ${data.name}\n\n\`\`\`router-slot\n\`\`\``;
  }
}

export default new ProjectPage();
