'use server';

export type {{name.pascal}}State = { ok: true } | { ok: false; error: string };

export async function {{name.camel}}Action(formData: FormData): Promise<{{name.pascal}}State> {
  // TODO(codegen): validate formData with the repo's schema library; never trust client input
  // TODO(codegen): check authentication and authorization before mutating
  // TODO(codegen): perform the mutation, then revalidatePath()/revalidateTag() what changed
  void formData;
  return { ok: true };
}
