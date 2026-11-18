'use server';

export type {{name.pascal}}State = { ok: true } | { ok: false; error: string };

// Signature fits useActionState: const [state, formAction, pending] = useActionState({{name.camel}}Action, initialState)
{{#if exportIs.function}}
export async function {{name.camel}}Action(prevState: {{name.pascal}}State, formData: FormData): Promise<{{name.pascal}}State> {
{{else}}
{{#if exportIs.inline}}export {{/if}}const {{name.camel}}Action = async (prevState: {{name.pascal}}State, formData: FormData): Promise<{{name.pascal}}State> => {
{{/if}}
  // TODO(codegen): validate formData with the repo's schema library; never trust client input
  // TODO(codegen): check authentication and authorization before mutating
  // TODO(codegen): perform the mutation, then revalidatePath()/revalidateTag() what changed
  void prevState;
  void formData;
  return { ok: true };
}{{#unless exportIs.function}};{{/unless}}
{{#if exportIs.const}}

export { {{name.camel}}Action };
{{/if}}
