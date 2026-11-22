// Settings (mock source Settings.dc.html): two sections. You, on this computer: name, review timing, models, providers
// and keys, kept in the user config folder (REQ-009, ADR-0011). This project: what .keel/config.yml says.
import { saveAuthorAction, saveExploreTimingAction, saveGithubAction, saveModelAction, saveProviderAction, testProviderAction } from './actions';
import { SubmitButton } from '@/components/SubmitButton';
import { hasGithubToken } from '@/lib/github/auth';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { MetaGrid } from '@/components/ui/MetaGrid';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tag } from '@/components/ui/Tag';
import css from './settings.module.css';
import { MODEL_TASKS, PROVIDERS } from '@/lib/providers/types';
import { exploreTiming, modelChoice, providerView } from '@/lib/settings/settings';
import { userSetting } from '@/lib/settings/user-dir';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';
import { readbackInterval } from '@/lib/readback/schedule';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; tested?: string }> }) {
  const { error, saved, tested } = await searchParams;
  const store = serverStore();
  const hasToken = hasGithubToken(store);
  const project = readProject(store.root);
  const author = userSetting(store.user, 'author');
  const timing = exploreTiming(store);
  return (
    <>
      <Topbar title="Settings" />
      <main className="content">
        <PageHeader title="Settings" description="Two places. Your keys and models stay on this computer, outside the project. Project settings live in .keel/config.yml and are committed with the project." />
        <ErrorAlert error={error} />
        {saved && <Notice kind="success" role="status">Saved.</Notice>}
        {tested && <Notice kind="info" role="status">{tested}</Notice>}

        <div className={css.section}>
          <h2 id="you" className={css.sectionTitle}>You, on this computer</h2>
          <p className={css.path}>{store.user.replace(process.env.HOME ?? '\0', '~')} · used by every folder you open · never committed</p>
        </div>

        <Card title="You and Explore reviews">
          <div className={css.grid}>
            <form action={saveAuthorAction} aria-label="Your name" className={css.form}>
              <Field label="Author name" hint="Used when git config has no user.name.">
                <input name="author" aria-label="Your name" defaultValue={typeof author === 'string' ? author : ''} placeholder="Your name" />
              </Field>
              <div><Button type="submit" small>Save name</Button></div>
            </form>
            <form action={saveExploreTimingAction} aria-label="Explore reviews" className={css.form}>
              <div className={css.pair}>
                <Field label="Pause before a review (seconds)"><input name="pauseSeconds" type="number" min={0.5} max={60} step={0.5} defaultValue={timing.pauseSeconds} /></Field>
                <Field label="At most one review every (seconds)"><input name="intervalSeconds" type="number" min={0} max={300} step={1} defaultValue={timing.intervalSeconds} /></Field>
              </div>
              <p className={css.hint}>The assistant reviews all sections when you leave a changed section, and after a pause in typing. At most one review runs at a time.</p>
              <div><Button type="submit" small>Save</Button></div>
            </form>
          </div>
        </Card>

        <Card title="Model per task" meta="Each task can use a different provider and model.">
          <div className={css.tasks}>
            {MODEL_TASKS.map(({ task, label }) => {
              const choice = modelChoice(store, task);
              return (
                <form key={task} action={saveModelAction} aria-label={`${label} model`} className={css.task}>
                  <input type="hidden" name="task" value={task} />
                  <strong className={css.taskName}>{label}</strong>
                  <Field label="Provider"><select name="provider" defaultValue={choice.provider}>
                    {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select></Field>
                  <Field label="Model"><input name="model" defaultValue={choice.model} required /></Field>
                  <Button type="submit" small>Save</Button>
                </form>
              );
            })}
          </div>
        </Card>

        <Card title="Model providers" meta="Your own key. Usage is billed by the provider. Keys are stored encrypted in your user folder and are never shown again, never written to the project folder, documents, git or logs.">
          <div className={css.providers}>
            {PROVIDERS.map(({ id, label }) => {
              const view = providerView(store, id);
              return (
                <section key={id} aria-label={label} className={css.provider}>
                  <div className={css.providerHead}>
                    <h3 className={css.providerTitle}>{label}</h3>
                    {view.hasKey ? <Tag tone="ok">Key stored</Tag> : <Tag>No key</Tag>}
                  </div>
                  <form action={saveProviderAction} aria-label={`${label} connection`} className={css.form}>
                    <input type="hidden" name="provider" value={id} />
                    <div className={css.pair}>
                      <Field label="API key"><input name="apiKey" type="password" autoComplete="off" placeholder={view.hasKey ? 'Stored' : 'Not set'} /></Field>
                      {id === 'openai-compatible' && <Field label="Base URL"><input name="baseUrl" type="url" defaultValue={view.baseUrl} placeholder="http://localhost:11434/v1" /></Field>}
                      {id === 'azure-openai' && (
                        <>
                          <Field label="Endpoint"><input name="endpoint" type="url" defaultValue={view.endpoint} /></Field>
                          <Field label="Deployment"><input name="deployment" defaultValue={view.deployment} /></Field>
                          <Field label="API version"><input name="apiVersion" defaultValue={view.apiVersion} placeholder="2024-10-21" /></Field>
                        </>
                      )}
                    </div>
                    {view.hasKey && <label className={css.check}><input type="checkbox" name="clearKey" /> Remove stored key</label>}
                    <div className={css.actions}>
                      <Button type="submit" variant="primary" small>Save {label}</Button>
                    </div>
                  </form>
                  <form action={testProviderAction} aria-label={`Test ${label}`}>
                    <input type="hidden" name="provider" value={id} />
                    <SubmitButton label="Test connection" busyLabel="Testing…" />
                  </form>
                </section>
              );
            })}
          </div>
        </Card>

        <Card title="GitHub (CI results)" meta="Optional, only to show the acceptance scenario results from CI on the Handoff page. Pushing uses your own git credentials, not this token.">
          <form action={saveGithubAction} aria-label="GitHub connection" className={css.form}>
            <Field label="Token" hint={<>A fine-grained personal access token with access to the one repository and the permission <strong>Actions: read</strong>, nothing more.</>}>
              <input name="token" type="password" autoComplete="off" placeholder={hasToken ? 'Stored' : 'github_pat_…'} />
            </Field>
            {hasToken && <label className={css.check}><input type="checkbox" name="clear" /> Remove stored token</label>}
            <div><Button type="submit" variant="primary" small>Save GitHub token</Button></div>
          </form>
        </Card>

        <div className={css.section}>
          <h2 id="this-project" className={css.sectionTitle}>This project</h2>
          <p className={css.path}>{store.root}/.keel/config.yml · committed with the project</p>
        </div>
        <Card title="Folder, git and read-back" meta="From .keel/config.yml. Change these in that file.">
          {project.ok ? (
            <MetaGrid label="Project settings" items={[
              { key: 'Folder', value: store.root, mono: true },
              { key: 'Documents folder', value: project.value.paths.docs, mono: true },
              { key: 'Tasks folder', value: project.value.paths.tasks, mono: true },
              { key: 'Scenarios folder', value: project.value.paths.features, mono: true },
              { key: 'Commits', value: project.value.commit === 'auto' ? 'Commit Keel\'s files automatically' : 'Write files, I commit myself' },
              { key: 'Check this folder for agent changes', value: readbackInterval() === 0 ? 'Automatic checks off; when the Handoff page gets focus and on Check now' : `Every ${readbackInterval()} seconds, when the Handoff page gets focus, and on Check now` },
            ]} />
          ) : <p className={css.hint}>This folder is not initialised yet.</p>}
        </Card>
      </main>
    </>
  );
}
