import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { Injectable } from '@nestjs/common';

const FRONTMATTER_RE = /^---[\s\S]*?---\s*/;
const WHITESPACE_RE = /\s+/g;

@Injectable()
export class MarketingSkillLoader {
  private resolveSkillsRoot(): string | null {
    const candidates = [`${process.cwd()}/.agents/skills`, `${process.cwd()}/../.agents/skills`];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  listInstalledSkillIds(): string[] {
    const root = this.resolveSkillsRoot();
    if (!root) return [];

    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(`${root}/${entry.name}/SKILL.md`))
      .map((entry) => entry.name)
      .sort();
  }

  loadSkillMarkdown(id: string): string | null {
    const root = this.resolveSkillsRoot();
    if (!root) return null;

    const skillPath = `${root}/${id}/SKILL.md`;
    if (!existsSync(skillPath)) {
      return null;
    }

    return readFileSync(skillPath, 'utf8');
  }

  loadSkillExcerpt(id: string, maxChars = 2200): string {
    const markdown = this.loadSkillMarkdown(id);
    if (!markdown) {
      return '';
    }

    const withoutFrontmatter = markdown.replace(FRONTMATTER_RE, '').trim();
    const cutoff = withoutFrontmatter.indexOf('\n## Related Skills');
    const scoped = cutoff >= 0 ? withoutFrontmatter.slice(0, cutoff) : withoutFrontmatter;
    return scoped.replace(WHITESPACE_RE, ' ').trim().slice(0, maxChars);
  }
}
