'use client';
// "What Keel creates in this folder" on the Initialise screen (task R4, mockup 1b). A reference, not a step:
// every path Keel will create, what it is for and when, updated as the choices in the form change.
// Folders start closed; paths that depend on a choice are shown in another colour.
import { Fragment, useEffect, useMemo, useState } from 'react';

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
      folder('.keel/cache/', 'The index and the run lock; ignored by git', 'Now', [file('.keel/cache/', 'index.db', 'Search index, rebuildable', 'Now', { ignored: true })], { ignored: true }),
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

function count(row: Row): number {
  return row.children ? row.children.reduce((n, c) => n + count(c), 0) : 1;
}

function allFolders(rows: Row[]): string[] {
  return rows.flatMap((r) => (r.children ? [r.path, ...allFolders(r.children)] : []));
}

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
  const toggle = (path: string) => setOpen((now) => {
    const next = new Set(now);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
  });

  const render = (row: Row, depth: number): React.ReactNode => {
    const isOpen = open.has(row.path);
    const className = [row.dependent ? 'dependent' : '', row.ignored ? 'ignored' : ''].filter(Boolean).join(' ') || undefined;
    return (
      <Fragment key={row.path}>
        <tr className={className}>
          <td style={{ paddingLeft: 12 + depth * 18 }}>
            {row.children ? (
              <button type="button" className="tree-toggle" aria-expanded={isOpen} onClick={() => toggle(row.path)}>
                {isOpen ? '▾' : '▸'} <code>{row.name}</code>{!isOpen && <span className="muted"> {count(row)} file{count(row) === 1 ? '' : 's'}</span>}
              </button>
            ) : <code>{row.name}</code>}
          </td>
          <td>{row.purpose}</td>
          <td>{row.when}</td>
        </tr>
        {row.children && isOpen && row.children.map((c) => render(c, depth + 1))}
      </Fragment>
    );
  };

  return (
    <section className="card" aria-labelledby="creates-heading">
      <h2 id="creates-heading">What Keel creates in this folder</h2>
      <ul className="creates-notes">
        <li><strong>The idea</strong>: {choices.title || 'the title'}{choices.description ? ' and the description' : ''} go into <code>.keel/brainstorm/explore.md</code> (1 file).</li>
        <li><strong>Intent template and style</strong>: {library.templateNames[choices.intent] ?? 'the intent template'} with {library.styleNames[choices.style] ?? 'the chosen style'} shape <code>docs/intent.md</code> (1 file, as you approve).</li>
        <li><strong>Document templates</strong>: {library.templateNames[choices.spec] ?? 'spec'} and {library.templateNames[choices.plan] ?? 'plan'} shape <code>docs/spec.md</code>, <code>docs/plan.md</code> and the task files (2 files and one per task).</li>
        <li><strong>Agent kit</strong>: {library.agentKit.filter((n) => !n.startsWith('review@')).length} subagents in <code>.claude/agents/</code> and <code>REVIEW.md</code> at handoff ({library.agentKit.length} files).</li>
        <li><strong>Standards</strong>: {chosen.length ? chosen.map((s) => s.name).join(', ') : 'none chosen'}, as skills in <code>.claude/skills/</code> at handoff ({chosen.length} file{chosen.length === 1 ? '' : 's'}).</li>
      </ul>
      <p className="muted creates-key"><span className="key dependent">Depends on your choices</span> zero to many files · <span className="key ignored">Ignored by git</span></p>
      <div className="flush-table">
        <table aria-label="Paths Keel creates">
          <thead>
            <tr>
              <th>Path <span className="table-actions">
                <button type="button" className="link" onClick={() => setOpen(new Set(allFolders(rows)))}>Expand all</button>
                {' · '}
                <button type="button" className="link" onClick={() => setOpen(new Set())}>Collapse all</button>
              </span></th>
              <th>What it is for</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>{rows.map((r) => render(r, 0))}</tbody>
        </table>
      </div>
      <p className="muted space-above" role="status">Initialise writes {initialiseFiles} files, all inside <code>.keel/</code>. Nothing else in the folder changes until you approve documents.</p>
    </section>
  );
}
