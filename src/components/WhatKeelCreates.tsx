'use client';
// "What Keel creates in this folder" on the Initialise screen (task R4, mockup 1b). A reference, not a step:
// every path Keel will create, what it is for and when, updated as the choices in the form change.
// Folders start closed; paths that depend on a choice are shown in another colour (docs/ui-guide.md FileTree).
import { useEffect, useMemo, useState } from 'react';
import { Card } from './ui/Card';
import { FileTree, type FileRow } from './ui/FileTree';
import { LinkButton } from './ui/LinkButton';
import { Tag, type TagTone } from './ui/Tag';
import styles from './WhatKeelCreates.module.css';

type When = 'Now' | 'As you approve' | 'At handoff';

interface Row {
  path: string;          // full path, e.g. ".keel/templates/"
  name: string;          // shown name, e.g. "templates/"
  purpose: string;
  when: When;
  dependent?: boolean;   // depends on a choice: zero to many files
  ignored?: boolean;     // kept out of git
  children?: Row[];
}

export interface CreatesLibrary {
  templates: string[];   // file names in .keel/templates
  agentKit: string[];    // file names in .keel/agent-kit
  styles: string[];      // file names in .keel/styles
  standards: { ref: string; id: string; name: string }[];
  templateNames: Record<string, string>;   // ref → "Standard intent v3"
  styleNames: Record<string, string>;      // ref → "Challenger"
}

interface Choices {
  title: string;
  description: string;
  intent: string;
  spec: string;
  plan: string;
  style: string;
  standards: string[];
}

const fileNameFor = (title: string) =>
  title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';

function readChoices(form: HTMLFormElement): Choices {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? '');
  return {
    title: text('title'), description: text('description'), intent: text('template'), spec: text('spec'), plan: text('plan'),
    style: text('style'), standards: data.getAll('standards').map(String),
  };
}

const file = (folder: string, name: string, purpose: string, when: When, extra: Partial<Row> = {}): Row =>
  ({ path: `${folder}${name}`, name, purpose, when, ...extra });

function folder(path: string, purpose: string, when: When, children: Row[], extra: Partial<Row> = {}): Row {
  const name = path.split('/').filter(Boolean).at(-1) ?? path;
  return { path, name: `${name}/`, purpose, when, children, ...extra };
}

function rowsFor(library: CreatesLibrary, choices: Choices): Row[] {
  const feature = `${fileNameFor(choices.title)}.feature`;
  const chosen = library.standards.filter((s) => choices.standards.includes(s.ref));
  // The review template becomes REVIEW.md; the other agent-kit files become subagents.
  const subagents = library.agentKit.filter((n) => !n.startsWith('review@'));
  return [
    folder('.keel/', 'Keel\'s config and libraries, committed with the project', 'Now', [
      file('.keel/', 'config.yml', `Project config: title, templates, style${chosen.length ? ', standards' : ''}`, 'Now'),
      file('.keel/', '.gitignore', 'Keeps .keel/cache out of git', 'Now'),
      folder('.keel/templates/', 'Document templates, copied from the library', 'Now', library.templates.map((n) => file('.keel/templates/', n, 'Template', 'Now'))),
      folder('.keel/agent-kit/', 'Subagents and the REVIEW.md template', 'Now', library.agentKit.map((n) => file('.keel/agent-kit/', n, n.startsWith('review@') ? 'Template for REVIEW.md' : 'Subagent template', 'Now'))),
      folder('.keel/styles/', 'Brainstorm styles', 'Now', library.styles.map((n) => file('.keel/styles/', n, 'Style', 'Now'))),
      folder('.keel/standards/', 'Standards the spec and plan are checked against', 'Now', library.standards.map((s) => file('.keel/standards/', `${s.ref}.md`, s.name, 'Now'))),
      folder('.keel/brainstorm/', 'The brainstorm transcript', 'Now', [file('.keel/brainstorm/', 'explore.md', choices.description ? 'Starts with your description' : 'The questions and your answers', 'Now')]),
      folder('.keel/mocks/', 'Mock references you attach (links, images, PDF, HTML)', 'As you approve', [file('.keel/mocks/', 'references.md', 'The list of mock references', 'As you approve', { dependent: true })], { dependent: true }),
      folder('.keel/generated/', 'What Keel last generated, for merging your edits on regeneration', 'As you approve', [file('.keel/generated/', 'docs/spec.md, docs/plan.md, …', 'Baselines', 'As you approve')]),
      folder('.keel/cache/', 'The run lock; ignored by git', 'Now', [file('.keel/cache/', 'run.json', 'Which Keel is running on this folder', 'Now', { ignored: true })], { ignored: true }),
    ]),
    folder('docs/', 'Intent, spec, plan and decisions', 'As you approve', [
      file('docs/', 'intent.md', `From ${library.templateNames[choices.intent] ?? 'the intent template'}`, 'As you approve'),
      file('docs/', 'spec.md', `From ${library.templateNames[choices.spec] ?? 'the spec template'}`, 'As you approve'),
      folder('docs/decisions/', 'Go, Park or No-go decisions', 'As you approve', [file('docs/decisions/', '0001-go.md', 'The decision record', 'As you approve')]),
      file('docs/', 'plan.md', `From ${library.templateNames[choices.plan] ?? 'the plan template'}`, 'As you approve'),
      file('docs/', 'traceability.json', 'Requirement IDs to tasks and scenarios', 'At handoff'),
    ]),
    folder('tasks/', 'One file per plan task', 'As you approve', [file('tasks/', 'T1.md, T2.md, …', 'Task files', 'As you approve')]),
    folder('features/', 'Acceptance scenarios; the agent writes the steps', 'As you approve', [
      file('features/', feature, 'Scenarios tagged with requirement IDs', 'As you approve'),
      folder('features/steps/', 'Failing step stubs', 'At handoff', [file('features/steps/', `${fileNameFor(choices.title)}.steps.ts`, 'One stub per step', 'At handoff')]),
    ]),
    file('', 'AGENTS.md', 'Instructions for any coding agent', 'At handoff'),
    file('', 'CLAUDE.md', 'Points Claude Code to AGENTS.md', 'At handoff'),
    file('', 'REVIEW.md', 'What a code review should report', 'At handoff', { dependent: true }),
    folder('.claude/', 'Subagents and standards as skills', 'At handoff', [
      folder('.claude/agents/', 'From the agent kit', 'At handoff', subagents.map((n) => file('.claude/agents/', n.replace(/@\d+\.md$/, '.md'), 'Subagent', 'At handoff', { dependent: true })), { dependent: true }),
      folder('.claude/skills/', 'One skill per chosen standard', 'At handoff', chosen.map((s) => file('.claude/skills/', `${s.id}/SKILL.md`, s.name, 'At handoff', { dependent: true })), { dependent: true }),
    ]),
    folder('.github/workflows/', 'CI that runs the checks and the scenarios', 'At handoff', [file('.github/workflows/', 'ci.yml', 'The CI workflow', 'At handoff')]),
  ];
}

/** Top-level folders show their whole path, e.g. ".github/workflows/". */
function topNames(rows: Row[]): Row[] {
  return rows.map((r) => (r.children ? { ...r, name: r.path } : r));
}

function allFolders(rows: Row[]): string[] {
  return rows.flatMap((r) => (r.children ? [r.path, ...allFolders(r.children)] : []));
}

const WHEN_TONE: Record<When, TagTone> = { Now: 'accent', 'As you approve': 'neutral', 'At handoff': 'handoff' };

function toFileRow(row: Row): FileRow {
  return {
    path: row.path, name: row.name, what: row.purpose, when: <Tag tone={WHEN_TONE[row.when]}>{row.when}</Tag>,
    kind: row.ignored ? 'ignored' : row.dependent ? 'dependent' : 'plain', children: row.children?.map(toFileRow),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function WhatKeelCreates({ formId, library }: { formId: string; library: CreatesLibrary }) {
  const [choices, setChoices] = useState<Choices>({ title: '', description: '', intent: '', spec: '', plan: '', style: '', standards: [] });
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const update = () => setChoices(readChoices(form));
    update();
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    return () => {
      form.removeEventListener('input', update);
      form.removeEventListener('change', update);
    };
  }, [formId]);

  const rows = useMemo(() => topNames(rowsFor(library, choices)), [library, choices]);
  const initialiseFiles = 2 + library.templates.length + library.agentKit.length + library.styles.length + library.standards.length + 1;
  const chosen = library.standards.filter((s) => choices.standards.includes(s.ref));
  const subagents = library.agentKit.filter((n) => !n.startsWith('review@')).length;
  const tiles: [string, string, string][] = [
    ['The idea', `${choices.title || 'The title'}${choices.description ? ' and the description' : ''} go into .keel/brainstorm/explore.md and start the brainstorm.`, '1 file'],
    ['Intent template and style', `${library.templateNames[choices.intent] ?? 'The intent template'} with ${library.styleNames[choices.style] ?? 'the chosen style'} shape docs/intent.md.`, '1 file, as you approve'],
    ['Document templates', `${library.templateNames[choices.spec] ?? 'The spec'} and ${library.templateNames[choices.plan] ?? 'the plan'} shape docs/spec.md, docs/plan.md and the tasks.`, '2 files and one per task'],
    ['Agent kit', `${plural(subagents, 'subagent')} in .claude/agents/ and REVIEW.md for the coding agent.`, `${plural(library.agentKit.length, 'file')} at handoff`],
    ['Standards', chosen.length ? `${chosen.map((c) => c.name).join(', ')}, as skills in .claude/skills/.` : 'None chosen yet. Each becomes a skill in .claude/skills/.', `${plural(chosen.length, 'file')} at handoff`],
  ];

  return (
    <Card title="What Keel creates in this folder">
      <div className={styles.body}>
        <p className={styles.intro}>Your choices below decide which files Keel writes. Initialise only creates <code>.keel/</code>. Documents follow as you approve them, and the agent files at Handoff. The file list is a reference: open a folder to see what is inside.</p>
        <div className={styles.tiles}>
          {tiles.map(([title, text, count]) => (
            <div key={title} className={styles.tile}><strong>{title}</strong><span>{text}</span><span className={styles.count}>{count}</span></div>
          ))}
        </div>
        <FileTree label="Paths Keel creates" rows={rows.map(toFileRow)} legend={['plain', 'dependent', 'ignored']}
          legendExtra={<span className={styles.when}>When: <Tag tone="accent">Now</Tag> <Tag>As you approve</Tag> <Tag tone="handoff">At handoff</Tag></span>}
          headerActions={<><LinkButton onClick={() => setOpen(new Set(allFolders(rows)))}>Expand all</LinkButton><LinkButton onClick={() => setOpen(new Set())}>Collapse all</LinkButton></>}
          isOpen={(path) => open.has(path)}
          onToggle={(path, isOpen) => setOpen((now) => {
            if (now.has(path) === isOpen) return now;
            const next = new Set(now);
            if (isOpen) next.add(path);
            else next.delete(path);
            return next;
          })} />
        <p className={styles.note} role="status">Initialise writes {initialiseFiles} files, all inside <code>.keel/</code>, as one Keel commit. Nothing else in the folder changes until you approve a document or write the handoff.</p>
      </div>
    </Card>
  );
}
