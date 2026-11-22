// Settings (mockup 8): two cards. This project: what .keel/config.yml says (paths, commit mode, read-back).
// You, on this computer: name, models, providers and keys, kept in the user config folder (REQ-009, ADR-0011).
import { saveAuthorAction, saveGithubAction, saveModelAction, saveProviderAction, testProviderAction } from './actions';
import { SubmitButton } from '@/components/SubmitButton';
import { hasGithubToken } from '@/lib/github/auth';
import { ErrorAlert, PageHead, Topbar } from '@/components/Shell';
import { MODEL_TASKS, PROVIDERS } from '@/lib/providers/types';
import { modelChoice, providerView } from '@/lib/settings/settings';
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
  return (
    <>
      <Topbar crumb={store.root} title="Settings" />
      <main className="content">
        <PageHead title="Settings" description="What belongs to this project, and what belongs to you on this computer." />
        <ErrorAlert error={error} />
        {saved && <p role="status" className="notice">Saved.</p>}
        {tested && <p role="status" className="notice">{tested}</p>}

        <section className="card" aria-labelledby="this-project">
          <h2 id="this-project">This project</h2>
          <p className="muted">From <code>.keel/config.yml</code>, committed with the project. Change these in that file.</p>
          {project.ok ? (
            <table aria-label="Project settings">
              <tbody>
                <tr><th scope="row">Folder</th><td><code>{store.root}</code></td></tr>
                <tr><th scope="row">Document folders</th><td><code>{project.value.paths.docs}/</code>, <code>{project.value.paths.tasks}/</code>, <code>{project.value.paths.features}/</code></td></tr>
                <tr><th scope="row">Commit mode</th><td>{project.value.commit === 'auto' ? 'auto: Keel commits its own files' : 'off'}</td></tr>
                <tr><th scope="row">Read-back</th><td>{readbackInterval() === 0 ? 'automatic checks off' : `every ${readbackInterval()} seconds`}, when the Handoff page gets focus, and on Check now (<code>KEEL_READBACK_SECONDS</code>)</td></tr>
              </tbody>
            </table>
          ) : <p>This folder is not initialised yet.</p>}
        </section>

        <h2 id="you">You, on this computer</h2>
        <p className="muted">Kept in <code>{store.user}</code>, never in the project folder. The same for every folder you open.</p>

        <form action={saveAuthorAction} aria-label="Your name" className="card stack">
          <h2 style={{ margin: 0 }}>You</h2>
          <label>Your name <input name="author" defaultValue={typeof userSetting(store.user, 'author') === 'string' ? String(userSetting(store.user, 'author')) : ''} placeholder="Used when git config has no user.name" /></label>
          <div><button type="submit">Save name</button></div>
        </form>

        <section className="card">
          <h2>Model per task</h2>
          <p className="muted">Each task can use a different provider and model.</p>
          {MODEL_TASKS.map(({ task, label }) => {
            const choice = modelChoice(store, task);
            return (
              <form key={task} action={saveModelAction} aria-label={`${label} model`} className="row model-choice">
                <input type="hidden" name="task" value={task} />
                <strong>{label}</strong>
                <label>Provider <select name="provider" defaultValue={choice.provider}>
                  {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select></label>
                <label>Model <input name="model" defaultValue={choice.model} required /></label>
                <button type="submit">Save</button>
              </form>
            );
          })}
        </section>

        <h2>Providers</h2>
        <p className="muted">Keys are stored encrypted on this computer and are never shown again.</p>
        {PROVIDERS.map(({ id, label }) => {
          const view = providerView(store, id);
          return (
            <section key={id} className="card stack" aria-label={label}>
            <form action={saveProviderAction} aria-label={`${label} connection`} className="stack">
              <input type="hidden" name="provider" value={id} />
              <h2 style={{ margin: 0 }}>{label}</h2>
              <label>API key <input name="apiKey" type="password" autoComplete="off" placeholder={view.hasKey ? 'Stored' : 'Not set'} /></label>
              {view.hasKey && <label><input type="checkbox" name="clearKey" /> Remove stored key</label>}
              {id === 'openai-compatible' && (
                <p><label>Base URL <input name="baseUrl" type="url" defaultValue={view.baseUrl} placeholder="http://localhost:11434/v1" /></label></p>
              )}
              {id === 'azure-openai' && (
                <p>
                  <label>Endpoint <input name="endpoint" type="url" defaultValue={view.endpoint} /></label>{' '}
                  <label>Deployment <input name="deployment" defaultValue={view.deployment} /></label>{' '}
                  <label>API version <input name="apiVersion" defaultValue={view.apiVersion} placeholder="2024-10-21" /></label>
                </p>
              )}
              <div><button type="submit" className="primary">Save {label}</button></div>
            </form>
            <form action={testProviderAction} aria-label={`Test ${label}`}>
              <input type="hidden" name="provider" value={id} />
              <SubmitButton label="Test connection" busyLabel="Testing…" />
            </form>
            </section>
          );
        })}

        <form action={saveGithubAction} aria-label="GitHub connection" className="card stack">
          <h2 style={{ margin: 0 }}>GitHub</h2>
          <p className="muted">
            Used to push the handoff and read the coding agent&apos;s changes back. Create a fine-grained personal access token with
            access to the one repository and the permissions <strong>Contents: read and write</strong> and <strong>Actions: read</strong> (for the scenario results from CI), nothing more.
          </p>
          <label>Token <input name="token" type="password" autoComplete="off" placeholder={hasToken ? 'Stored' : 'github_pat_…'} /></label>
          {hasToken && <label><input type="checkbox" name="clear" /> Remove stored token</label>}
          <div><button type="submit" className="primary">Save GitHub token</button></div>
        </form>
      </main>
    </>
  );
}
