// "What Keel found" on Initialise (REQ-012, CR-0010; mock source Start.dc.html): the local scan of the folder, the
// case it is, and for an existing project the path, the files the assistant may read, the agent files and their
// rules. Nothing outside .keel/ is written until the user acts; nothing is sent to a model before Initialise.
import type { Handover } from '@/lib/readiness/accept';
import type { FolderScan } from '@/lib/repo/scan';
import type { FoundRule } from '@/lib/standards/from-agent-files';
import { ButtonLink } from './ui/Button';
import { Card } from './ui/Card';
import { DataTable } from './ui/DataTable';
import { Notice } from './ui/Notice';
import { OptionCard, OptionGrid } from './ui/OptionCard';
import { Tag } from './ui/Tag';
import styles from './FolderFound.module.css';

const CASE: Record<FolderScan['kase'], { tag: string; line: string }> = {
  new: { tag: 'New project', line: 'This is a new project: there is no code here yet. Keel starts with a blank Explore.' },
  keel: { tag: 'Keel project', line: 'This folder already uses Keel.' },
  existing: { tag: 'Existing project', line: 'This is an existing project with code and no AI agent files. Keel can record what exists first, then plan the next change on top of it.' },
  'existing-ai': { tag: 'Existing project with its own AI setup', line: 'This is an existing project with its own AI setup. Keel keeps your agent files and works with them.' },
};

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`);

export function FoundCard({ scan }: { scan: FolderScan }) {
  const facts = [
    scan.git.repo ? `Git repository · ${scan.git.commits} commit${scan.git.commits === 1 ? '' : 's'}${scan.git.contributors ? ` · ${scan.git.contributors} contributor${scan.git.contributors === 1 ? '' : 's'}` : ''}` : 'Not a git repository yet: Keel will run git init.',
    ...(scan.stack ? [`Code: ${scan.stack} · ${scan.codeFiles} code file${scan.codeFiles === 1 ? '' : 's'}${scan.manifests.length ? ` · ${scan.manifests.join(', ')}` : ''}`] : []),
    ...(scan.docs.length ? [`Docs: ${scan.docs.slice(0, 4).join(', ')}${scan.docs.length > 4 ? ` and ${scan.docs.length - 4} more` : ''}`] : []),
    ...(scan.tests ? [`Tests: ${scan.tests} file${scan.tests === 1 ? '' : 's'}`] : []),
    ...(scan.agentFiles.length ? [`AI agent files: ${scan.agentFiles.join(', ')}`] : []),
    ...(scan.specTools.length ? [`Specs: ${scan.specTools.join(', ')}`] : []),
    ...(scan.usedFolders.length ? [`Already used: ${scan.usedFolders.map((f) => `${f}/`).join(', ')}`] : []),
  ];
  return (
    <Card title="What Keel found" meta="A local scan of file names and manifests. Nothing was sent anywhere and nothing was written." actions={<Tag tone={scan.kase === 'new' ? 'accent' : 'warn'}>{CASE[scan.kase].tag}</Tag>}>
      <div className={styles.stack}>
        <p role="status" className={styles.line}>{CASE[scan.kase].line}</p>
        <ul className={styles.facts}>{facts.map((f) => <li key={f}>{f}</li>)}</ul>
        {scan.truncated && <p className={styles.muted}>The folder has more than 10,000 files; Keel looked at the first 10,000.</p>}
        {/* Optional and on demand (CR-0015): the check never runs by itself. */}
        <Notice kind="info" title="Want to know how ready this folder is for coding agents?" label="AI readiness"
          actions={<ButtonLink href="/readiness" small>Check AI readiness</ButtonLink>}>
          A local scan against the Keel standard, then a model review of the gaps. It runs only when you ask.
        </Notice>
      </div>
    </Card>
  );
}

/** Accepted advice from an AI readiness report (CR-0015): what Initialise preselects, and the tasks for the baseline plan. */
export function FromReadiness({ handover }: { handover: Handover }) {
  return (
    <Card title="From the AI readiness report" meta={`Accepted advice from ${handover.report}. Nothing is written until you initialise.`}>
      <div className={styles.stack}>
        {handover.matched.length > 0 && (
          <ul className={styles.facts} aria-label="Covered by Initialise and handoff">
            {handover.matched.map((m) => <li key={m.title}>{m.title}: {m.how}.</li>)}
          </ul>
        )}
        {handover.tasks.length > 0 && <p className={styles.line}>{handover.tasks.length} more {handover.tasks.length === 1 ? 'item becomes a task' : 'items become tasks'} in the plan, under &quot;From the readiness report&quot;: {handover.tasks.map((t) => t.title).join('; ')}.</p>}
      </div>
    </Card>
  );
}

/** The path for an existing project, the files to share, the agent files and the proposed rules: inside the form. */
export function ExistingProject({ scan, rules, adoptRules = false }: { scan: FolderScan; rules: FoundRule[]; adoptRules?: boolean }) {
  const total = scan.shareable.reduce((n, f) => n + f.size, 0);
  return (
    <>
      <Card title={<span id="path-heading">How to start</span>} meta="Both paths are suggestions you can change in Explore.">
        <OptionGrid radio labelledBy="path-heading" columns="two">
          <OptionCard label="Record what exists, then plan the next change" title="Record what exists, then plan the next change" recommended
            summary="The assistant drafts a baseline: the intent sections, the requirements as built, and the current stack as decisions. You trim and approve it; the next idea is a change request on top."
            control={<input type="radio" name="path" value="baseline" defaultChecked />} />
          <OptionCard label="Treat the next feature as the project" title="Treat the next feature as the project"
            summary="The intent covers only the new feature. The existing code is context and constraints."
            control={<input type="radio" name="path" value="feature" />} />
        </OptionGrid>
      </Card>

      <Card title="Let the assistant read these files" meta={`For the baseline only. ${scan.shareable.length} file${scan.shareable.length === 1 ? '' : 's'}, ${kb(total)} in all. Untick any file, or send none and fill the sections yourself. Nothing is sent before you initialise.`}>
        <div className={styles.stack}>
          {scan.shareable.length === 0 ? <p className={styles.muted}>No README, manifest or docs to read. The baseline starts from the stack only.</p> : (
            <DataTable label="Files the assistant would read" columns={['', 'File', 'Why', 'Size']}
              rows={scan.shareable.map((f) => ({ key: f.path, label: f.path, cells: [
                <input key="c" type="checkbox" name="share" value={f.path} defaultChecked aria-label={`Share ${f.path}`} />,
                <code key="p">{f.path}</code>, f.why, kb(f.size),
              ] }))} />
          )}
          <label className={styles.check}><input type="checkbox" name="noShare" /> Send no file; I will fill the sections myself</label>
        </div>
      </Card>

      {scan.kase === 'existing-ai' && (
        <Card title="Your agent files" meta="Kept. Keel never replaces them.">
          <div className={styles.stack}>
            <ul className={styles.facts}>
              {scan.agentFiles.map((f) => (
                <li key={f}><code>{f}</code>: {f === 'AGENTS.md' ? 'Keel adds its instructions between keel:start and keel:end markers at handoff; your text stays as it is.'
                  : f === 'CLAUDE.md' ? 'Keel adds one line pointing to AGENTS.md, if it is missing.'
                  : f === '.claude/' ? 'Subagents with the same name as Keel\'s become handoff choices.'
                  : 'Read for rules; not changed.'}</li>
              ))}
            </ul>
            {scan.usedFolders.length > 0 && <Notice kind="warning" title={`${scan.usedFolders.map((f) => `${f}/`).join(', ')} already hold files`}>Keel writes its documents to docs/, tasks/ and features/ next to them. Keeping Keel&apos;s files in other folders is not available yet.</Notice>}
          </div>
        </Card>
      )}

      {rules.length > 0 && (
        <Card title={<span id="rules-heading">Rules found in your agent files</span>} meta="Tick the ones to keep as a project standard, Project conventions v1, which the spec, plan and coding agent follow.">
          <ul className={styles.rules} aria-labelledby="rules-heading">
            {rules.map((r) => (
              <li key={r.rule}><label className={styles.check}><input type="checkbox" name="rules" value={r.rule} aria-label={r.rule} defaultChecked={adoptRules} /> <span>{r.rule}</span> <span className={styles.muted}>from {r.source}</span></label></li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
