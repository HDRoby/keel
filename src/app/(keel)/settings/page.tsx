// Settings (mock source Settings.dc.html): two sections. You, on this computer: name, review timing, models, providers
// and keys, kept in the user config folder (REQ-009, ADR-0011). This project: what .keel/config.yml says.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { saveAuthorAction, saveExploreTimingAction, saveGithubAction, saveMockGateAction, saveModelAction, saveProviderAction, testProviderAction, useTheseSettingsAction } from './actions';
import { SETTINGS_FILE } from '@/lib/settings/user-dir';
import { SubmitButton } from '@/components/SubmitButton';
import { hasGithubToken } from '@/lib/github/auth';
import { ErrorAlert, Topbar } from '@/components/Shell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { MetaGrid } from '@/components/ui/MetaGrid';
import { Notice } from '@/components/ui/Notice';
import { ChangeTemplatesForm } from '@/components/ChangeTemplatesForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tag } from '@/components/ui/Tag';
import css from './settings.module.css';
import { ModelChoiceFields } from './ModelChoiceFields';
import { MODEL_TASKS, PROVIDERS } from '@/lib/providers/types';
import { exploreTiming, providerView } from '@/lib/settings/settings';
import { effectiveChoice, localModels } from '@/lib/providers/local';
import { DEFAULT_OLLAMA_URL, goodFor, SUGGESTED_OLLAMA_MODEL } from '@/lib/providers/ollama';
import { userDirProblem, userSetting } from '@/lib/settings/user-dir';
import { serverStore } from '@/lib/store/server-store';
import { readProject } from '@/lib/store/workspace';
import { readbackInterval } from '@/lib/readback/schedule';

export const dynamic = 'force-dynamic';

const formatBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; tested?: string }> }) {
  const { error, saved, tested } = await searchParams;
  const store = serverStore();
  const hasToken = hasGithubToken(store);
  const project = readProject(store.root);
  const author = userSetting(store.user, 'author');
  const timing = exploreTiming(store);
  const local = await localModels(store);
  const choices = Object.fromEntries(await Promise.all(MODEL_TASKS.map(async ({ task }) => [task, await effectiveChoice(store, task)] as const)));
  const ollamaView = providerView(store, 'ollama');
  return (
    <>
      <Topbar title="Settings" />
      <main className="content">
        <PageHeader title="Settings" description="Two places. Your keys and models stay on this computer, outside the project. Project settings live in .keel/config.yml and are committed with the project." />
        <ErrorAlert error={error} />
        {(() => {
          // When Keel cannot write the user config folder, saving would fail: say which folder and how to fix it.
          const blocked = userDirProblem(store.user);
          return blocked && !error ? <Notice kind="danger" title="Keel cannot save settings on this computer">{blocked.message} {blocked.fix}</Notice> : null;
        })()}
        {!existsSync(join(store.user, SETTINGS_FILE)) && (
          <Notice kind="info" title="Set up Keel first" actions={<form action={useTheseSettingsAction}><Button type="submit" variant="primary" small>Use these settings and check</Button></form>}>
            Keel needs a model provider before it can comment, draft or review. Ollama on this computer is preselected; check the models below, then save.
          </Notice>
        )}
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

        <Card title={<span id="ollama-title">Ollama (on this computer)</span>} label="Ollama (on this computer)" meta="The default provider. No API key needed: nothing leaves this computer."
          actions={local.status === 'running' ? <Tag tone="ok">Running · {local.models.length} model{local.models.length === 1 ? '' : 's'}</Tag> : local.status === 'no-models' ? <Tag tone="warn">No models yet</Tag> : <Tag tone="danger">Not running</Tag>}>
          <div className={css.form}>
            {local.status === 'not-running' && (
              <Notice kind="warning" title="Ollama is not running">
                Keel cannot reach Ollama at <code>{local.base}</code>. Open the Ollama app, or run <code>ollama serve</code> in a terminal, then Check again. Or pick another provider under Model per task.
              </Notice>
            )}
            {local.status === 'no-models' && (
              <Notice kind="warning" title="No models yet">
                Ollama is running but has no models. Run <code>ollama pull {SUGGESTED_OLLAMA_MODEL}</code> for a model that suits Keel, then Check again. Until then, actions that need a model are unavailable.
              </Notice>
            )}
            {local.models.length > 0 && (
              <DataTable label="Models on this computer" columns={['Model', 'Size on disk', 'Parameters', 'Context', 'Good for']}
                rows={[...local.models].sort((a, b) => b.billions - a.billions).map((m) => ({ key: m.name, label: m.name, cells: [
                  <code key="n">{m.name}</code>, formatBytes(m.sizeBytes), m.parameters || '—', m.contextLength ? `${Math.round(m.contextLength / 1024)}K tokens` : '—', goodFor(m),
                ] }))} />
            )}
            <form action={saveProviderAction} aria-label="Ollama (on this computer) connection" className={css.inlineForm}>
              <input type="hidden" name="provider" value="ollama" />
              <Field label="Server address" hint="Ollama's default address. No API key needed."><input name="baseUrl" type="url" defaultValue={ollamaView.baseUrl ?? ''} placeholder={DEFAULT_OLLAMA_URL} /></Field>
              <Button type="submit" small>Save address</Button>
              <ButtonLink href="/settings" small>Check again</ButtonLink>
            </form>
          </div>
        </Card>

        <Card title="Model per task" meta="Each task can use a different provider and model. With nothing saved, Keel uses Ollama and picks from the models on this computer: the largest for spec, plan and feasibility, a mid-size one for section comments.">
          <div className={css.tasks}>
            {MODEL_TASKS.map(({ task, label }) => {
              const choice = choices[task] ?? { provider: 'ollama', model: '' };
              return (
                <form key={task} action={saveModelAction} aria-label={`${label} model`} className={css.task}>
                  <input type="hidden" name="task" value={task} />
                  <strong className={css.taskName}>{label}</strong>
                  <ModelChoiceFields providers={PROVIDERS.map((p) => ({ id: p.id, label: p.label }))} provider={choice.provider} model={choice.model}
                    local={[...local.models].filter((m) => !/embed/i.test(m.name)).sort((a, b) => b.billions - a.billions).map((m) => ({ name: m.name, parameters: m.parameters ?? '' }))} />
                  <Button type="submit" small>Save</Button>
                </form>
              );
            })}
          </div>
        </Card>

        <Card title="Other providers" meta="Your own key. Usage is billed by the provider. Keys are stored encrypted in your user folder and are never shown again, never written to the project folder, documents, git or logs.">
          <div className={css.providers}>
            {PROVIDERS.filter((p) => p.id !== 'ollama').map(({ id, label }) => {
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
        {project.ok && <ChangeTemplatesForm root={store.root} project={project.value} back="/settings" />}
        {project.ok && (
          <Card title="Clickable mock before the plan" meta="Applies only when the Form decision has a UI (a web, desktop or mobile app).">
            <form action={saveMockGateAction} aria-label="Clickable mock before the plan" className={css.inlineForm}>
              <Field label="Clickable mock before the plan">
                <select name="mockGate" defaultValue={project.value.mockGate}>
                  <option value="recommended">Recommended: warn if missing or out of date</option>
                  <option value="required">Required: Generate plan stays locked</option>
                  <option value="off">Off</option>
                </select>
              </Field>
              <Button type="submit" small>Save</Button>
            </form>
          </Card>
        )}
      </main>
    </>
  );
}
