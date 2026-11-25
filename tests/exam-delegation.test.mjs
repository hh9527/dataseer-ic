import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const source=dirname(dirname(fileURLToPath(import.meta.url)));
const tmpBase=process.env.TMPDIR||join(homedir(),'.cache/tmp');
mkdirSync(tmpBase,{recursive:true});
const temporary=mkdtempSync(join(tmpBase,'exam-delegation-'));
const root=join(temporary,'product with spaces'),bin=join(temporary,'bin');
mkdirSync(join(root,'exam'),{recursive:true});mkdirSync(bin);
copyFileSync(join(source,'justfile'),join(root,'justfile'));
copyFileSync(join(source,'exam/justfile'),join(root,'exam/justfile'));
const mock=join(temporary,'mock-node.mjs');
writeFileSync(mock,'console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),state:process.env.TESTER_STATE_DIR??null}));\n');
const shellQuote=s=>"'"+s.replaceAll("'","'\\''")+"'";
writeFileSync(join(bin,'node'),'#!/bin/sh\nexec '+shellQuote(process.execPath)+' '+shellQuote(mock)+' "$@"\n',{mode:0o755});
const run=(args,overrides={})=>{
 const env={...process.env,PATH:bin+':'+process.env.PATH,JUST_TEMPDIR:temporary};
 delete env.DEPLOY_ROOT;delete env.TESTER_STATE_DIR;
 const result=spawnSync('just',['--justfile',join(root,'justfile'),...args],{cwd:root,encoding:'utf8',env:{...env,...overrides}});
 assert.equal(result.status,0,result.stderr);
 return JSON.parse(result.stdout);
};
test.after(()=>rmSync(temporary,{recursive:true,force:true}));

test('exam owns list and the argument boundaries survive forwarding',()=>{
 const out=run(['list','--json']);
 assert.deepEqual(out.args,['tools/exam.mjs','list','--json']);assert.equal(out.cwd,join(root,'exam'));
});
test('all stateful commands keep the product state directory',()=>{
 for(const [recipe,args]of [['ask',['--from','/path with spaces/task.md','--dry-run']],['new-session',['--clear']],['submit',['第一项；第二项']],['wait',['--timeout','180']]]){
  const out=run([recipe,'10924',...args]);
  assert.deepEqual(out.args,['tools/exam.mjs',recipe,...args]);
  assert.equal(out.state,join(root,'.deploy/10924/tester'));
 }
});
test('relative deployment roots and explicit state overrides remain anchored to the product',()=>{
 const out=run(['ask','10924','text'],{DEPLOY_ROOT:'custom deploy'});
 assert.equal(out.state,join(root,'custom deploy/10924/tester'));
 const override=run(['wait','10924'],{TESTER_STATE_DIR:'/custom state'});
 assert.equal(override.state,'/custom state');
});
test('run-tester receives the product deployment root without starting a service',()=>{
 const out=run(['run-tester','10924','--cwd','/workspace with spaces']);
 assert.deepEqual(out.args,['tools/run-tester.mjs','10924','--deploy-root',join(root,'.deploy'),'--cwd','/workspace with spaces']);
});
test('generation flags live in exam and relative outputs are resolved before changing directory',()=>{
 const out=run(['generate-data','out with spaces','--anchor-utc','2026-11-25T02:44:00Z']);
 assert.deepEqual(out.args,['data/ic/generate.mjs','--output',join(root,'out with spaces'),'--contract',join(root,'vendors/lab-ontology/icloud_model/data/generation-contract.json'),'--catalog',join(root,'vendors/lab-ontology/icloud_model/data/source_catalog.json'),'--resources','150','--tenants','30','--days','93','--interval-minutes','60','--exam-profile','--anchor-utc','2026-11-25T02:44:00Z']);
});
