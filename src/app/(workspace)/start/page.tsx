// Start a new idea (mockup: start.png): intent template, brainstorm style and standards (REQ-001, REQ-011).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { startAction } from '@/app/projects/actions';
import { ErrorAlert, PageHead, Topbar } from '@/components/Shell';
import { StandardsPicker } from '@/components/StandardsPicker';
import { parseSections } from '@/lib/brainstorm/sections';
import { listStyles } from '@/lib/brainstorm/styles';
import { previewRoot } from '@/lib/seed';
import { isInitialised } from '@/lib/store/workspace';
import { listStandards } from '@/lib/standards/library';
import { gitUserName } from '@/lib/store/git';
import { serverStore } from '@/lib/store/server-store';
import { parseTemplateRef, readTemplate, templateOptions } from '@/lib/templates/library';

export const dynamic = 'force-dynamic';

const DEFAULT_TEMPLATE = 'standard-intent@3';

export default async function StartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { root } = serverStore();
  if (isInitialised(root)) redirect('/');
  const home = previewRoot();
  const problems: string[] = [];
  const templates = templateOptions(home, 'intent', 'latest').map((t) => {
    const ref = parseTemplateRef(t.ref);
    const content = ref ? readTemplate(home, ref.id, ref.version) : undefined;
    const sections = content?.ok ? parseSections(content.value.content) : [];
    return { ...t, sections: sections.map((s) => `${s.heading}${s.required ? '*' : ''}`).join(', ') };
  });
  const styles = listStyles(home);
  const author = (await gitUserName()) ?? '';
  const defaultTemplate = templates.some((t) => t.ref === DEFAULT_TEMPLATE) ? DEFAULT_TEMPLATE : templates[0]?.ref;

  return (
    <>
      <Topbar crumb={`Single-user workspace${author ? ` · ${author}` : ''}`} title="New idea" />
      <main className="content narrow">
        <PageHead title="Start a new idea"
          description="Pick the intent template and the brainstorm style. The template decides what gets captured; the style decides how the assistant asks." />
        {problems.map((p) => <ErrorAlert key={p} error={p} />)}
        <ErrorAlert error={error} />
        <form action={startAction}>
          <section className="card stack">
            <label>Title <input name="title" required placeholder="A working title" /></label>
            <label>The idea in a sentence or two <textarea name="idea" rows={3} placeholder="What is the problem, and who has it?" /></label>
            <label>Your name <input name="author" defaultValue={author} required /></label>
          </section>

          <section className="card" aria-labelledby="template-heading">
            <div className="section-head"><h2 id="template-heading">Intent template</h2><Link href="/templates">Manage templates</Link></div>
            <div className="options" role="radiogroup" aria-labelledby="template-heading">
              {templates.map((t) => (
                <label key={t.ref} className="option">
                  {t.ref === DEFAULT_TEMPLATE && <span className="option-tag">Default</span>}
                  <input type="radio" name="template" value={t.ref} defaultChecked={t.ref === defaultTemplate} aria-label={t.name} />
                  <span className="option-title">{t.name}</span>
                  <span className="option-foot">Sections: {t.sections} (* required)</span>
                </label>
              ))}
            </div>
            <p className="muted space-above">The template is fixed once the brainstorm starts; you can change it in Project setup.</p>
          </section>

          <section className="card" aria-labelledby="style-heading">
            <div className="section-head"><h2 id="style-heading">Brainstorm style</h2><Link href="/styles">Manage styles</Link></div>
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
            <p className="muted">Conventions the spec and plan are checked against. They go into the handoff.</p>
            <StandardsPicker standards={listStandards(home)} chosen={[]} />
          </section>

          <div className="row">
            <button type="submit" className="primary">Start brainstorm</button>
            <Link href="/">Cancel</Link>
          </div>
        </form>
      </main>
    </>
  );
}
