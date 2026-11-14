const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTS(name) {
  const code = fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }}).outputText;
  const module = { exports: {} };
  new Function("module","exports","require", js)(module, module.exports, require);
  return module.exports;
}
const { restoreSavedData } = loadTS("persistence.ts");
const valid = {
  monthlyIncome: 1800, budget: 500, weeklyLimit: 120, dailyLimit: 24,
  reserve: 650, goalTarget: 1000,
  expenses: [{ id: "1", title: "Mercado", amount: 29.99, category: "Alimentação", date: "2026-11-14T12:00:00.000Z" }],
  goals: []
};
test("primeira inicialização mostra valores vazios", () => {
  const { data, warning } = restoreSavedData(null);
  assert.equal(warning, null);
  assert.equal(data.budget, 0);
  assert.deepEqual(data.expenses, []);
});
test("dados válidos são recuperados sem alteração", () => {
  const { data, warning } = restoreSavedData(JSON.stringify(valid));
  assert.equal(warning, null);
  assert.deepEqual(data, valid);
});
test("JSON corrompido não bloqueia a inicialização", () => {
  const { data, warning } = restoreSavedData('{"expenses":');
  assert.ok(warning);
  assert.deepEqual(data.expenses, []);
});
test("despesas inválidas são descartadas sem derrubar a interface", () => {
  const altered = { ...valid, expenses: [...valid.expenses, {title:"Inválida",date:"not-a-date",amount:"abc"}] };
  const { data, warning } = restoreSavedData(JSON.stringify(altered));
  assert.ok(warning);
  assert.equal(data.expenses.length, 1);
});
test("saldo inválido e estruturas faltantes viram valores seguros", () => {
  const { data, warning } = restoreSavedData('{"budget":-20,"reserve":"segredo","expenses":"none"}');
  assert.ok(warning);
  assert.equal(data.budget, 0);
  assert.equal(data.reserve, 0);
  assert.deepEqual(data.expenses, []);
});
