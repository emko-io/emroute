import { PageComponent } from '@emkodev/emroute';

class TasksPage extends PageComponent<{ id: string }, { tasks: string[] }> {
  override readonly name = 'tasks';

  override async getData({ params }: { params: { id: string } }) {
    return { tasks: [`Task A for ${params.id}`, `Task B for ${params.id}`] };
  }

  override renderHTML({ data, params }: {
    data: { tasks: string[] } | null;
    params: { id: string };
  }) {
    if (!data) return '<p>Loading tasks...</p>';
    const items = data.tasks.map((t) => `<li>${t}</li>`).join('');
    return `<h1>Tasks for ${params.id}</h1><ul class="task-list">${items}</ul>`;
  }

  override renderMarkdown({ data, params }: {
    data: { tasks: string[] } | null;
    params: { id: string };
  }) {
    if (!data) return '';
    return `# Tasks for ${params.id}\n\n${data.tasks.map((t) => `- ${t}`).join('\n')}`;
  }
}

export default new TasksPage();
