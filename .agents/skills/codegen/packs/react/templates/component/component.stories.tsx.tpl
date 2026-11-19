import type { Meta, StoryObj } from '{{storybookImport}}';

import { {{name.pascal}} } from './{{file.base}}';

const meta = {
  component: {{name.pascal}},
  args: {
    children: '{{name.pascal}}',
{{#if elementIs.a}}
    href: '/',
{{/if}}
  },
} satisfies Meta<typeof {{name.pascal}}>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// TODO(codegen): add one story per meaningful visual state (variants, disabled, loading, empty)
