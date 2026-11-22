// "/" (CR-0004, mockup 1b): a folder without .keel opens on Initialise; an initialised one goes to its
// current stage. Initialise sets title, description, author, templates per kind, style and standards.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { startAction } from '@/app/(project)/actions';
import { ErrorAlert, PageHead, Topbar } from '@/components/Shell';
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

const DEFAULTS = { intent: 'standard-intent@3', spec: 'requirements-and-design-spec@2', plan: 'implementation-plan@2' };
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
  const intents = templateOptions(library, 'intent', 'latest').map((t) => {
    const ref = parseTemplateRef(t.ref);
    const content = ref ? readTemplate(library, ref.id, ref.version) : undefined;
    const sections = content?.ok ? parseSections(content.value.content) : [];
    return { ...t, sections: sections.map((s) => `${s.heading}${s.required ? '*' : ''}`).join(', ') };
  });
  const specs = templateOptions(library, 'spec', 'latest');
  const plans = templateOptions(library, 'plan', 'latest').filter((t) => !t.ref.startsWith('task@'));
  const styles = listStyles(library);
  const standards = listStandards(library);
  const author = await defaultAuthor(store);
  const isRepo = existsSync(join(store.root, '.git'));
  const pick = (options: { ref: string }[], wanted: string) => (options.some((o) => o.ref === wanted) ? wanted : options[0]?.ref);
  const creates: CreatesLibrary = {
    templates: mdFiles(join(library, '.keel', 'templates')),
    agentKit: mdFiles(join(library, '.keel', 'agent-kit')),
    styles: mdFiles(join(library, '.keel', 'styles')),
    standards: standards.map((s) => ({ ref: s.ref, id: s.id, name: s.name })),
    templateNames: Object.fromEntries(listTemplates(library).flatMap((t) => t.versions.map((v) => [`${t.id}@${v}`, templateName(t.id, v)]))),
    styleNames: Object.fromEntries(styles.map((s) => [s.ref, s.name])),
  };

  return (
    <>
      <Topbar crumb={store.root} title="Initialise" />
      <main className="content narrow">
        <PageHead title="Initialise this folder"
          description={<>Keel will create <code>.keel/</code> here. Nothing else changes until you approve documents.</>} />
        <ErrorAlert error={error} />
        <section className="card" aria-label="Folder">
          <p className="tight"><strong>Folder</strong> <code>{store.root}</code></p>
          {!isRepo && <p className="muted">This folder is not a git repository. Keel will run git init.</p>}
        </section>

        <WhatKeelCreates formId={FORM_ID} library={creates} />

        <form id={FORM_ID} action={startAction}>
          <section className="card stack">
            <label>Title <input name="title" required placeholder="A working title" defaultValue={title} /></label>
            <label>Description <textarea name="description" rows={3} placeholder="What is the problem, and who has it?" defaultValue={description} /></label>
            <label>Your name <input name="author" defaultValue={author} required /></label>
          </section>

          <section className="card" aria-labelledby="template-heading">
            <div className="section-head"><h2 id="template-heading">Intent template</h2><Link href="/templates">Templates</Link></div>
            <div className="options" role="radiogroup" aria-labelledby="template-heading">
              {intents.map((t) => (
                <label key={t.ref} className="option">
                  {t.ref === DEFAULTS.intent && <span className="option-tag">Default</span>}
                  <input type="radio" name="template" value={t.ref} defaultChecked={t.ref === pick(intents, DEFAULTS.intent)} aria-label={t.name} />
                  <span className="option-title">{t.name}</span>
                  <span className="option-foot">Sections: {t.sections} (* required)</span>
                </label>
              ))}
            </div>
            <div className="row space-above">
              <label>Spec template <select name="spec" defaultValue={pick(specs, DEFAULTS.spec)}>
                {specs.map((t) => <option key={t.ref} value={t.ref}>{t.name}</option>)}
              </select></label>
              <label>Plan template <select name="plan" defaultValue={pick(plans, DEFAULTS.plan)}>
                {plans.map((t) => <option key={t.ref} value={t.ref}>{t.name}</option>)}
              </select></label>
            </div>
            <p className="muted space-above">You can change the intent template later in Project setup.</p>
          </section>

          <section className="card" aria-labelledby="style-heading">
            <div className="section-head"><h2 id="style-heading">Brainstorm style</h2><Link href="/styles">Brainstorm styles</Link></div>
            <div className="options" role="radiogroup" aria-labelledby="style-heading">
              {styles.map((s, i) => (
                <label key={s.id} className="option">
                  <span className="option-tag">{i === 0 ? 'Default · ' : ''}v{s.version}</span>
                  <input type="radio" name="style" value={s.ref} defaultChecked={i === 0} aria-label={s.name} />
                  <span className="option-title">{s.name}</span>
                  <span className="option-text">{s.description}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="standards-heading">
            <h2 id="standards-heading" className="tight">Standards</h2>
            <p className="muted">Conventions the spec and plan are checked against. They go into the handoff as skills.</p>
            <StandardsPicker standards={standards} chosen={[]} />
          </section>

          <div className="row">
            <button type="submit" className="primary">Initialise and start brainstorm</button>
          </div>
        </form>
      </main>
    </>
  );
}
