import { ESLint } from 'eslint';

const eslint = new ESLint({ fix: true, fixTypes: ['problem', 'suggestion', 'layout'] });
const results = await eslint.lintFiles(['src/api-keys/api-keys.controller.spec.ts']);

for (const r of results) {
  for (const m of r.messages) {
    console.log('ruleId:', m.ruleId);
    console.log('message:', m.message);
    console.log('fix:', JSON.stringify(m.fix));
    if (m.suggestions) {
      console.log('suggestions:', JSON.stringify(m.suggestions.slice(0, 3).map(s => ({desc: s.desc, fix: s.fix}))));
    }
  }
  console.log('has output:', r.output !== undefined && r.output !== r.source);
}
