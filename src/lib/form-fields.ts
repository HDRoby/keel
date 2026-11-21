// Turns a server action's FormData into a plain object for zod, without Next's internal $ACTION fields.
// Keys in `lists` (such as checkboxes) are collected into arrays, also when empty.
export function formFields(form: FormData, lists: string[] = []): Record<string, unknown> {
  const fields: Record<string, unknown> = Object.fromEntries(
    [...form.entries()].filter(([key]) => !key.startsWith('$ACTION') && !lists.includes(key)),
  );
  for (const key of lists) fields[key] = form.getAll(key);
  return fields;
}
