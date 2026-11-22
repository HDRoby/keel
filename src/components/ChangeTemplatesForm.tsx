// Templates for change packages (REQ-003, REQ-015, CR-0013): Task, Change request, Prompt for the coding agent and
// Changes index, plus the code map for planning changes and keeping changes/README.md up to date. Saved in
// .keel/config.yml; shown in Settings › This project and in Project setup.
import { saveChangeTemplatesAction } from '@/app/(project)/actions';
import type { Project } from '@/lib/store/workspace';
import { CHANGE_TEMPLATE_KINDS, kindOptions } from '@/lib/templates/library';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Field } from './ui/Field';
import { LinkButton } from './ui/LinkButton';
import styles from './ChangeTemplatesForm.module.css';

export function ChangeTemplatesForm({ root, project, back }: { root: string; project: Project; back: string }) {
  return (
    <Card title={<span id="change-templates">Templates for new documents</span>} meta="Change requests: the request, the prompt for the coding agent, the tasks and the changes index; and the AI readiness report. A document keeps the template version that produced it."
      actions={<LinkButton href="/templates">Manage templates</LinkButton>}>
      <form action={saveChangeTemplatesAction} aria-label="Templates for new documents" className={styles.form}>
        <input type="hidden" name="back" value={back} />
        <div className={styles.grid}>
          {CHANGE_TEMPLATE_KINDS.map(({ key, kind, label }) => {
            const options = kindOptions(root, kind);
            return (
              <Field key={key} label={label}>
                <select name={key} defaultValue={project.templates[key] ?? options[0]?.ref ?? ''}>
                  {options.map((o) => <option key={o.ref} value={o.ref}>{o.name}</option>)}
                </select>
              </Field>
            );
          })}
          <Field label="Code map for planning changes" hint="What the assistant may read to say which files a change touches.">
            <select name="codeMap" defaultValue={project.codeMap}>
              <option value="off">Off</option>
              <option value="names">File and folder names only</option>
              <option value="files">Names, plus files I choose each time</option>
            </select>
          </Field>
          <Field label="Keep changes/README.md up to date" hint="Off keeps your own file as it is.">
            <select name="changesIndex" defaultValue={project.changesIndex}>
              <option value="auto">On: rewrite it when a request is raised, approved, rejected or applied</option>
              <option value="off">Off</option>
            </select>
          </Field>
        </div>
        <div><Button type="submit" small>Save templates</Button></div>
      </form>
    </Card>
  );
}
