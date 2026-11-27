import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
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
writeFileSync(mock,`
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const args=process.argv.slice(2);
if(args[0]==='data/ic/generate.mjs'){
 const output=args[2];
 mkdirSync(output,{recursive:true});
 writeFileSync(join(output,'icloud.sqlite'),'fixture');
 writeFileSync(join(output,'manifest.json'),JSON.stringify({
  window:{endExclusive:args.at(-1)},database:{sha256:'fixture-digest'}
 }));
}
console.log(JSON.stringify({args,cwd:process.cwd(),state:process.env.TESTER_STATE_DIR??null}));
`);
const shellQuote=s=>"'"+s.replaceAll("'","'\\''")+"'";
writeFileSync(join(bin,'node'),'#!/bin/sh\nif [ "$1" = "--input-type=module" ]; then exec '+shellQuote(process.execPath)+' "$@"; fi\nexec '+shellQuote(process.execPath)+' '+shellQuote(mock)+' "$@"\n',{mode:0o755});
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
 for(const [recipe,args]of [['ask',['--from','/path with spaces/task.md','--dry-run']],['new-session',['--clear']],['submit',['第一项；第二项']],['approve',['reject']],['wait',['--timeout','180']]]){
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
test('generation forwards options and publishes the database and metadata at fixed paths',()=>{
 const env={...process.env,PATH:bin+':'+process.env.PATH,JUST_TEMPDIR:temporary,DEPLOY_ROOT:join(root,'custom deploy')};
 const result=spawnSync('just',['--justfile',join(root,'justfile'),'generate-data','10924','--anchor-utc','2026-11-25T02:44:00Z'],{cwd:root,encoding:'utf8',env});
 assert.equal(result.status,0,result.stderr);
 const {args}=JSON.parse(result.stdout.split('\n')[0]);
 assert.match(args[2],/custom deploy\/10924\/dsh\/\.generate-[^/]+\/generated$/);
 assert.deepEqual(args.slice(-2),['--anchor-utc','2026-11-25T02:44:00Z']);
 writeFileSync(join(root,'custom deploy/10924/dsh/db.sqlite'),'stale');
 const refreshed=spawnSync('just',['--justfile',join(root,'justfile'),'generate-data','10924','--anchor-utc','2026-11-26T02:44:00Z'],{cwd:root,encoding:'utf8',env});
 assert.equal(refreshed.status,0,refreshed.stderr);
 assert.equal(readFileSync(join(root,'custom deploy/10924/dsh/db.sqlite'),'utf8'),'fixture');
 assert.deepEqual(JSON.parse(readFileSync(join(root,'custom deploy/10924/dsh/db.sqlite.json'),'utf8')),
  {anchor_utc:'2026-11-26T02:44:00Z',sha256:'fixture-digest'});
});
