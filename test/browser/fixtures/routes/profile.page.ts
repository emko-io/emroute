import { PageComponent, type PageContext } from '@emkodev/emroute';

interface ProfileData {
  name: string;
  role: string;
  bio: string;
}

class ProfilePage extends PageComponent<Record<string, string>, ProfileData> {
  override readonly name = 'profile';

  override async getData() {
    return { name: 'Alice', role: 'Engineer', bio: 'Builds things.' };
  }

  override getTitle({ data }: { data: ProfileData | null }) {
    return data ? `${data.name} — Profile` : 'Profile';
  }

  override renderHTML(
    { data, context }: {
      data: ProfileData | null;
      params: Record<string, string>;
      context?: PageContext;
    },
  ) {
    const template = context?.files?.html ?? '<h1>Profile</h1>';
    if (!data) return template;
    return template
      .replaceAll('{{name}}', data.name)
      .replaceAll('{{role}}', data.role)
      .replaceAll('{{bio}}', data.bio);
  }

  override renderMarkdown({ data }: { data: ProfileData | null }) {
    if (!data) return '# Profile';
    return `# ${data.name}\n\n**${data.role}** — ${data.bio}`;
  }
}

export default new ProfilePage();
