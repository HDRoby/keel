// "/" (CR-0004, mockup 1b): a folder without .keel opens on Initialise; an initialised one goes to its
// current stage. Initialise sets title, description, author, templates per kind, style and standards.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { redirect } from 'next/navigation';
import { adoptAction, startAction } from '@/app/(project)/actions';
import { findKeelDocuments } from '@/lib/store/adopt';
import { Icon } from '@/components/Icons';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { OptionCard, OptionGrid } from '@/components/ui/OptionCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tag } from '@/components/ui/Tag';
import css from './initialise.module.css';
import { StandardsPicker } from '@/components/StandardsPicker';
import { WhatKeelCreates, type CreatesLibrary } from '@/components/WhatKeelCreates';
import { parseSections } from '@/lib/brainstorm/sections';
import { listStyles } from '@/lib/brainstorm/styles';
import { projectState } from '@/lib/gates/approvals';
import { stageGates } from '@/lib/gates/rules';
import { previewRoot } from '@/lib/seed';
import { defaultAuthor } from '@/lib/settings/settings';
import { listStandards } from '@/lib/standards/library';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';
import { listTemplates, parseTemplateRef, readTemplate, templateName, templateOptions } from '@/lib/templates/library';

export const dynamic = 'force-dynamic';

const DEFAULTS = { intent: 'standard-intent@4', spec: 'requirements-and-design-spec@2', plan: 'implementation-plan@2' };
const FORM_ID = 'initialise';

function mdFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
}

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; title?: string; description?: string }> }) {
  const { error, title, description } = await searchParams;
  const store = serverStore();
  const project = readProject(store.root);
  if (project.ok) {
    // The furthest stage that is open: where the work is now.
    redirect(`/${stageGates(projectState(store)).filter((g) => g.available).at(-1)?.stage ?? 'explore'}`);
  }

  const library = previewRoot();
  const withSections = (t: { ref: string; name: string }) => {
    const ref = parseTemplateRef(t.ref);
    const content = ref ? readTemplate(library, ref.id, ref.version) : undefined;
    const sections = content?.ok ? parseSections(content.value.content) : [];
    return { ...t, sections: sections.map((s) => `${s.heading}${s.required ? '*' : ''}`).join(', ') };
  };
  const intents = templateOptions(library, 'intent', 'latest').map(withSections);
  const specs = templateOptions(library, 'spec', 'latest').map(withSections);
  const plans = templateOptions(library, 'plan', 'latest').filter((t) => !t.ref.startsWith('task@')).map(withSections);
  const brainstormStyles = listStyles(library);
  const standards = listStandards(library);
  const author = await defaultAuthor(store);
  const isRepo = existsSync(join(store.root, '.git'));
  const found = findKeelDocuments(store.root);
  const pick = (options: { ref: string }[], wanted: string) => (options.some((o) => o.ref === wanted) ? wanted : options[0]?.ref);
  const creates: CreatesLibrary = {
    templates: mdFiles(join(library, '.keel', 'templates')),
    agentKit: mdFiles(join(library, '.keel', 'agent-kit')),
    styles: mdFiles(join(library, '.keel', 'styles')),
    standards: standards.map((s) => ({ ref: s.ref, id: s.id, name: s.name })),
    templateNames: Object.fromEntries(listTemplates(library).flatMap((t) => t.versions.map((v) => [`${t.id}@${v}`, templateName(t.id, v)]))),
    styleNames: Object.fromEntries(brainstormStyles.map((s) => [s.ref, s.name])),
  };

  const templateCards = (name: string, options: { ref: string; name: string; sections: string }[], wanted: string) => options.map((t) => (
    <OptionCard key={t.ref} label={t.name} title={t.name} tag={t.ref === wanted ? 'Default' : undefined}
      foot={t.sections ? `Sections: ${t.sections} (* required)` : undefined}
      control={<input type="radio" name={name} value={t.ref} defaultChecked={t.ref === pick(options, wanted)} aria-label={t.name} />} />
  ));

  return (
    <>
      <Topbar title="Initialise" />
      <main className="content narrow">
        <PageHeader title="Initialise this folder"
          description={<>This folder has no <code>.keel/</code> yet. Describe the idea and pick the templates, brainstorm style and standards. Keel copies them into <code>.keel/</code> in this folder, so they are versioned with the project.</>} />
        <ErrorAlert error={error} />
        <Card title="Project folder" label="Folder" actions={<Tag><Icon name="folder" size={16} /> One project per folder</Tag>}>
          <div className={css.stack}>
            <code className={css.path}>{store.root}</code>
            <p className={css.text}>This is also the repository your coding agent builds in. Keel writes its documents to <code>docs/</code>, <code>tasks/</code> and <code>features/</code>, and commits only its own files.</p>
            {!isRepo && <Notice kind="info" title="Not a git repository yet">Keel will run git init here when you initialise.</Notice>}
            <p className={css.note}>API keys and your personal settings stay in your user folder (<code>~/.config/keel</code>), never in this project.</p>
          </div>
        </Card>

        {found && (
          <Card title="Keel documents found">
            <div className={css.stack}>
              <p className={css.text}>This folder already has documents with a Keel header, for project <strong>{found.title}</strong> ({found.id}):</p>
              <ul className={css.list}>
                {found.documents.map((d) => <li key={d.path}><code>{d.path}</code> · {d.id} v{d.version} · {d.status}</li>)}
              </ul>
              <p className={css.note}>Adopt keeps them as they are and takes the project id, title, templates, style and standards from them. New requirement IDs start after REQ-{String(found.maxReq).padStart(3, '0')}.</p>
              <form action={adoptAction} className={css.inline}>
                <Field label="Your name"><input name="author" defaultValue={author || found.author} /></Field>
                <Button type="submit" variant="primary">Adopt</Button>
              </form>
            </div>
          </Card>
        )}

        <WhatKeelCreates formId={FORM_ID} library={creates} />

        <form id={FORM_ID} action={startAction} className={css.form}>
          <Card label="The idea">
            <div className={css.stack}>
              <Field label="Title" required><input name="title" required placeholder="A working title" defaultValue={title} /></Field>
              <Field label="Description" optional><textarea name="description" rows={3} placeholder="What is the problem, and who has it?" defaultValue={description} /></Field>
              <Field label="Your name" required><input name="author" defaultValue={author} required /></Field>
            </div>
          </Card>

          <Card title={<span id="template-heading">Intent template</span>} actions={<LinkButton href="/templates">Manage templates</LinkButton>}>
            <div className={css.stack}>
              <OptionGrid radio labelledBy="template-heading" columns="two">{templateCards('template', intents, DEFAULTS.intent)}</OptionGrid>
              <p className={css.note}>You can change the intent template later in Project setup.</p>
            </div>
          </Card>

          <Card title={<span id="style-heading">Brainstorm style</span>} actions={<LinkButton href="/styles">Manage styles</LinkButton>}>
            <div className={css.stack}>
              <OptionGrid radio labelledBy="style-heading" columns="three">
                {brainstormStyles.map((s, i) => (
                  <OptionCard key={s.id} label={s.name} title={s.name} tag={`${i === 0 ? 'Default · ' : ''}v${s.version}`} summary={s.description}
                    control={<input type="radio" name="style" value={s.ref} defaultChecked={i === 0} aria-label={s.name} />} />
                ))}
              </OptionGrid>
              <p className={css.note}>The style is fixed once the brainstorm starts.</p>
            </div>
          </Card>

          <Card title="Document templates" meta="Used when Keel writes the later documents for this project." actions={<LinkButton href="/templates">Manage templates</LinkButton>}>
            <div className={css.stack}>
              <h3 id="spec-heading" className={css.group}>Spec</h3>
              <OptionGrid radio labelledBy="spec-heading" columns="three">{templateCards('spec', specs, DEFAULTS.spec)}</OptionGrid>
              <h3 id="plan-heading" className={css.group}>Plan</h3>
              <OptionGrid radio labelledBy="plan-heading" columns="three">{templateCards('plan', plans, DEFAULTS.plan)}</OptionGrid>
            </div>
          </Card>

          <Card title="Standards" meta="Conventions and guidelines the spec, plan and code are checked against. They go into the handoff as skills." actions={<LinkButton href="/standards">Manage standards</LinkButton>}>
            <StandardsPicker standards={standards} chosen={[]} />
          </Card>

          <div className={css.inline}>
            <Button type="submit" variant="primary" icon={<Icon name="forum" size={18} />}>Initialise and start brainstorm</Button>
          </div>
        </form>
      </main>
    </>
  );
}
