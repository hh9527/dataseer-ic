// 安装与部署只调用替身；真实 watcher 的子进程也是不监听端口的替身。
import assert from 'node:assert/strict';
import {hash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {homedir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const REPO=fileURLToPath(new URL('..',import.meta.url));
const TMP=process.env.TMPDIR||path.join(homedir(),'.cache/tmp');
fs.mkdirSync(TMP,{recursive:true});

function writeRelease(dari,version,fs,path){
 for(const [name,entry]of [['dsh-plugin-dari','lib/index.mjs'],['dsh-plugin-dari-client','lib/client.mjs']]){
  const dir=path.join(dari,'dist',name);
  fs.mkdirSync(path.dirname(path.join(dir,entry)),{recursive:true});
  fs.writeFileSync(path.join(dir,entry),'// '+version+'\n');
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'@local/'+name,type:'module'}));
 }
}
const CALL_STUB=String.raw`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const args=process.argv.slice(2),cmd=path.basename(process.argv[1]);
fs.appendFileSync(process.env.CALL_LOG,JSON.stringify({cmd,args,cwd:process.cwd(),home:process.env.DSH_HOME})+'\n');
if(cmd==='npm')throw Error('The test must not invoke a real dependency install');
if(cmd==='watchexec'){
 const at=args.indexOf('--'),result=spawnSync(args[at+1],args.slice(at+2),{stdio:'inherit'});
 process.exit(result.status??1);
}
if(cmd==='pnpm'){
 if(args.join(' ')==='run build'){
  if(process.env.FAIL_BUILD)process.exit(17);
  (${writeRelease.toString()})(path.resolve(process.cwd(),'../..'),'built',fs,path);
 }
 if(args[0]==='install'){
  const bin=path.join(process.cwd(),'node_modules/.bin/dsh');fs.mkdirSync(path.dirname(bin),{recursive:true});
  fs.copyFileSync(path.join(process.env.TEST_TOOLS,'dsh'),bin);fs.chmodSync(bin,0o755);
 }
}else if(args.includes('plugin')){
 const profile=path.join(process.env.DSH_HOME,'profiles',args[args.indexOf('--profile')+1]);
 fs.mkdirSync(profile,{recursive:true});const manifest=path.join(profile,'package.json');
 if(!fs.existsSync(manifest)){
  fs.writeFileSync(manifest,JSON.stringify({dsh:{profile:{bundles:[]}}}));
  fs.writeFileSync(path.join(profile,'cordis.patch.yml'),'# user config\n[]\n');
 }
 const data=JSON.parse(fs.readFileSync(manifest,'utf8'));
 for(const [name,value]of Object.entries(data.dependencies??{})){
  const link=path.join(profile,'node_modules',name);fs.mkdirSync(path.dirname(link),{recursive:true});
  fs.rmSync(link,{recursive:true,force:true});fs.symlinkSync(value.replace(/^link:/,''),link);
 }
}
`;
const SLEEPER=String.raw`#!/usr/bin/env node
const fs=require('node:fs');
fs.appendFileSync(process.env.RESTART_LOG,JSON.stringify({pid:process.pid,cwd:process.cwd(),home:process.env.DSH_HOME})+'\n');
process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},50);
`;
function writeTool(file,content){fs.writeFileSync(file,content,{mode:0o755});}
function readCalls(file){return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];}
function fixture(){
 const root=fs.mkdtempSync(path.join(TMP,'ic-install-')),repo=path.join(root,"author's source repo"),dari=path.join(repo,'vendors/dari');
 fs.mkdirSync(path.join(repo,'runtime'),{recursive:true});
 fs.copyFileSync(path.join(REPO,'justfile'),path.join(repo,'justfile'));
 for(const file of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml'])fs.copyFileSync(path.join(REPO,'runtime',file),path.join(repo,'runtime',file));
 fs.cpSync(path.join(REPO,'runtime/patches'),path.join(repo,'runtime/patches'),{recursive:true});
 fs.mkdirSync(path.join(dari,'packages/dsh/node_modules'),{recursive:true});fs.mkdirSync(path.join(dari,'node_modules'));
 fs.cpSync(path.join(REPO,'vendors/dari/packages/dsh/dsh-preset-dari'),path.join(dari,'packages/dsh/dsh-preset-dari'),{recursive:true,filter:p=>path.basename(p)!=='node_modules'});
 fs.mkdirSync(path.join(dari,'scripts'));
 fs.writeFileSync(path.join(dari,'scripts/package-runtime.mjs'),String.raw`
import fs from 'node:fs';import path from 'node:path';
fs.appendFileSync(process.env.CALL_LOG,JSON.stringify({cmd:'package-runtime',args:process.argv.slice(2)})+'\n');
fs.mkdirSync(process.argv[2],{recursive:true});fs.writeFileSync(path.join(process.argv[2],'service.mjs'),'// packaged runtime');
`);
 writeRelease(dari,'initial',fs,path);
 fs.mkdirSync(path.join(dari,'dist/dari'));fs.writeFileSync(path.join(dari,'dist/dari/service.mjs'),'// initial runtime');
 const tools=path.join(root,'tools');fs.mkdirSync(tools);
 for(const name of ['pnpm','dsh','watchexec','npm'])writeTool(path.join(tools,name),CALL_STUB);
 const log=path.join(root,'calls.jsonl'),env={...process.env,PATH:tools+':'+process.env.PATH,CALL_LOG:log,TEST_TOOLS:tools,JUST_TEMPDIR:root};
 for(const key of ['DSH_CMD','DSH_HOME','DSH_PROFILE','DEPLOY_ROOT','DARI_REPO','FAIL_BUILD'])delete env[key];
 const invoke=(args,extra={})=>spawnSync('just',['--justfile',path.join(repo,'justfile'),...args],{cwd:root,env:{...env,...extra},encoding:'utf8'});
 return {root,repo,dari,tools,log,env,invoke,target:(port,base=path.join(repo,'.deploy'))=>path.join(base,port,'dsh'),cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
const success=result=>assert.equal(result.status,0,result.stdout+result.stderr);
const manifest=target=>JSON.parse(fs.readFileSync(path.join(target,'profiles/web/package.json'),'utf8'));
const published=target=>path.join(target,'packages/dsh-plugin-dari/lib/index.mjs');

test('install-profile refreshes releases, links current bundles and preserves user state',()=>{
 const f=fixture();try{
  const base=path.join(f.root,"user's deployments"),target=f.target('10924',base),env={DEPLOY_ROOT:base};
  success(f.invoke(['install-profile','10924'],env));
  const workspace=path.join(target,'demo-ws'),patch=path.join(target,'profiles/web/cordis.patch.yml');
  fs.writeFileSync(path.join(workspace,'analysis.dari'),'# user analysis\n');
  fs.writeFileSync(path.join(target,'.ctrl'),'checkpoint');
  fs.appendFileSync(patch,'\n# user setting\n');
  writeRelease(f.dari,'upgraded',fs,path);
  success(f.invoke(['install-profile','10924'],env));
  const m=manifest(target);
  assert.deepEqual(m.dsh.profile.bundles,['@deepseek-ai/dsh-web-app','@local/dsh-plugin-dari-client','@local/dsh-preset-dari']);
  for(const name of ['dsh-plugin-dari','dsh-plugin-dari-client','dsh-preset-dari']){
   const dir=path.join(target,'packages',name);
   assert.equal(m.dependencies['@local/'+name],'link:'+dir);
   assert.equal(fs.realpathSync(path.join(target,'profiles/web/node_modules/@local',name)),dir);
  }
  assert.equal(fs.readFileSync(published(target),'utf8'),'// upgraded\n');
  assert.equal(fs.readFileSync(path.join(workspace,'analysis.dari'),'utf8'),'# user analysis\n');
  assert.equal(fs.readFileSync(path.join(target,'.ctrl'),'utf8'),'checkpoint');
  const yaml=fs.readFileSync(patch,'utf8');
  assert(yaml.includes('# user config')&&yaml.includes('# user setting'));
  assert(!yaml.split('\n').some(line=>line.trim()==='[]'));
  assert.equal(yaml.split('id: llm-deepseek\n').length-1,1);assert(yaml.includes('MALFORMED_RESPONSE'));
  assert(!yaml.includes('id: preset-dari\n'),'The preset patch belongs to its package, not the profile patch');
  assert.deepEqual(fs.readFileSync(path.join(target,'packages/dsh-preset-dari/cordis.patch.yml')),fs.readFileSync(path.join(f.dari,'packages/dsh/dsh-preset-dari/cordis.patch.yml')));
  assert.deepEqual(fs.readFileSync(path.join(target,'runtime/pnpm-lock.yaml')),fs.readFileSync(path.join(f.repo,'runtime/pnpm-lock.yaml')));
  assert(readCalls(f.log).filter(c=>c.cmd==='pnpm').every(c=>c.args.join(' ')==='install --frozen-lockfile --reporter=append-only'));
  assert(readCalls(f.log).every(c=>c.cmd!=='watchexec'&&c.args[0]!=='web'),'Installation must not launch a service');
  assert(!fs.existsSync(path.join(workspace,'dari.json')));
  for(const file of ['run.sh','run-dsh.sh','.ctrl','justfile','dari/service.mjs'])assert(fs.existsSync(path.join(target,file)),file);
  const result=spawnSync('just',['--justfile',path.join(target,'justfile'),'run-dsh','--host','127.0.0.1'],{cwd:f.root,env:f.env,encoding:'utf8'});success(result);
  const direct=readCalls(f.log).at(-1);assert.deepEqual(direct.args,['web','--port','10924','--host','127.0.0.1']);assert.equal(direct.cwd,workspace);assert.equal(direct.home,target);
 }finally{f.cleanup();}
});

test('explicit ports are required and invalid ports fail before external calls',()=>{
 const f=fixture();try{
  for(const recipe of ['install-profile','deploy']){
   assert.notEqual(f.invoke([recipe]).status,0);
   for(const port of ['0','65536','bad','010924']){
    const result=f.invoke([recipe,port]);assert.notEqual(result.status,0);assert.match(result.stderr,/1\.\.65535/);
   }
  }
  assert(!fs.existsSync(f.log));assert(!fs.existsSync(path.join(f.repo,'.deploy')));
 }finally{f.cleanup();}
});

test('missing release rejects installation before replacing installed assets',()=>{
 const f=fixture();try{
  success(f.invoke(['install-profile','10924']));const target=f.target('10924'),before=fs.readFileSync(published(target)),count=readCalls(f.log).length;
  fs.rmSync(path.join(f.dari,'dist/dsh-plugin-dari/package.json'));
  const result=f.invoke(['install-profile','10924']);assert.notEqual(result.status,0);assert.match(result.stderr,/先运行 just build/);
  assert.deepEqual(fs.readFileSync(published(target)),before);assert.equal(readCalls(f.log).length,count);
 }finally{f.cleanup();}
});

test('deploy isolates ports, preserves workspaces and leaves releases intact on build failure',()=>{
 const f=fixture();try{
  const model=path.join(f.repo,'vendors/lab-ontology/dist/ic-model.wasm');
  fs.mkdirSync(path.dirname(model),{recursive:true});
  fs.writeFileSync(model,'model');
  const source=path.join(f.root,'external.sqlite');
  const metadata={anchor_utc:'2026-11-25T02:44:00Z',sha256:hash('sha256','database')};
  fs.mkdirSync(path.join(f.repo,'exam'));
  fs.writeFileSync(path.join(f.repo,'exam/justfile'),`generate output *args:
    mkdir -p "{{output}}"
    printf database > "{{output}}/icloud.sqlite"
    printf '%s' '${JSON.stringify({window:{endExclusive:metadata.anchor_utc},database:{sha256:metadata.sha256}})}' > "{{output}}/manifest.json"
    printf 'generated\\n' >> generation.log
`);
  for(const port of ['10924','10925']){
   success(f.invoke(['deploy',port]));const target=f.target(port);
   for(const file of ['run.sh','run-dsh.sh','.ctrl','demo-ws','runtime/pnpm-lock.yaml','packages/dsh-plugin-dari/lib/index.mjs','packages/dsh-plugin-dari-client/lib/client.mjs'])assert(fs.existsSync(path.join(target,file)),file);
   assert.equal(fs.readFileSync(path.join(target,'db.sqlite'),'utf8'),'database');
   assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target,'db.sqlite.json'))),metadata);
   assert.equal(JSON.parse(fs.readFileSync(path.join(target,'demo-ws/dari.json'))).dataFile,path.join(target,'db.sqlite'));
  }
  assert.equal(fs.readFileSync(path.join(f.repo,'exam/generation.log'),'utf8'),'generated\ngenerated\n');
  assert.equal(readCalls(f.log).filter(c=>c.cmd==='pnpm'&&c.args.join(' ')==='run build').length,2);
  assert(readCalls(f.log).every(c=>c.cmd!=='watchexec'&&c.args[0]!=='web'));
  const target=f.target('10924'),workspace=path.join(target,'demo-ws');
  const config=fs.readFileSync(path.join(workspace,'dari.json'),'utf8');
  fs.writeFileSync(path.join(workspace,'analysis.dari'),'# keep');
  fs.writeFileSync(path.join(target,'.ctrl'),'checkpoint');
  success(f.invoke(['deploy','10924']));
  assert.equal(fs.readFileSync(path.join(workspace,'dari.json'),'utf8'),config);
  assert.equal(fs.readFileSync(path.join(workspace,'analysis.dari'),'utf8'),'# keep');
  assert.equal(fs.readFileSync(path.join(target,'.ctrl'),'utf8'),'checkpoint');
  const before=fs.readFileSync(published(target));
  const failed=f.invoke(['deploy','10924'],{FAIL_BUILD:'1'});
  assert.notEqual(failed.status,0);assert.match(failed.stderr,/构建失败/);
  assert.deepEqual(fs.readFileSync(published(target)),before);
  assert.equal(fs.readFileSync(path.join(f.repo,'exam/generation.log'),'utf8'),'generated\ngenerated\n');
  fs.writeFileSync(source,'bad copy');
  fs.writeFileSync(source+'.json',JSON.stringify(metadata));
  const corrupt=f.invoke(['deploy','10924',model,source]);
  assert.notEqual(corrupt.status,0);assert.match(corrupt.stderr,/摘要/);
  assert.equal(fs.readFileSync(path.join(target,'db.sqlite'),'utf8'),'database');
  assert.equal(fs.readFileSync(path.join(workspace,'dari.json'),'utf8'),config);
  const watched=spawnSync(path.join(target,'run.sh'),['--host','127.0.0.1','two words'],{cwd:f.root,env:f.env,encoding:'utf8'});success(watched);
  const [watcher,server]=readCalls(f.log).slice(-2);
  assert.equal(watcher.cmd,'watchexec');assert.deepEqual(watcher.args,['--restart','--ignore-nothing','--shell=none','-w',path.join(target,'.ctrl'),'--',path.join(target,'run-dsh.sh'),'--host','127.0.0.1','two words']);
  assert.deepEqual(server.args,['web','--port','10924','--host','127.0.0.1','two words']);assert.equal(server.cwd,workspace);assert.equal(server.home,target);
 }finally{f.cleanup();}
});

function realWatchexec(){
 const probe=spawnSync('which',['watchexec'],{encoding:'utf8'});if(probe.status!==0)return;
 let value=probe.stdout.trim();if(path.basename(path.dirname(value))==='shims'){
  const resolved=spawnSync('mise',['which','watchexec'],{encoding:'utf8'});if(resolved.status!==0)return;value=resolved.stdout.trim();
 }return value;
}
const realWatcher=realWatchexec();
test('only touching .ctrl restarts the isolated fake runtime',{skip:!realWatcher},async()=>{
 const f=fixture();try{
  success(f.invoke(['install-profile','10924']));const target=f.target('10924'),workspace=path.join(target,'demo-ws');
  fs.rmSync(path.join(f.tools,'watchexec'));fs.symlinkSync(realWatcher,path.join(f.tools,'watchexec'));
  writeTool(path.join(target,'runtime/node_modules/.bin/dsh'),SLEEPER);
  const restartLog=path.join(f.root,'restarts.jsonl'),watcherLog=path.join(f.root,'watcher.log'),fd=fs.openSync(watcherLog,'w');
  const child=spawn(path.join(target,'run.sh'),[],{cwd:f.root,env:{...f.env,RESTART_LOG:restartLog},detached:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);
  const waitRuns=async count=>{
   const until=Date.now()+10000;
   while(Date.now()<until){assert.equal(child.exitCode,null,fs.readFileSync(watcherLog,'utf8'));if(readCalls(restartLog).length>=count)return;await new Promise(r=>setTimeout(r,50));}
   assert.fail(fs.readFileSync(watcherLog,'utf8'));
  };
  try{
   await waitRuns(1);for(const n of [2,3]){fs.writeFileSync(path.join(target,'.ctrl'),'');await waitRuns(n);}
   const runs=readCalls(restartLog);assert.equal(new Set(runs.map(r=>r.pid)).size,3);assert(runs.every(r=>r.cwd===workspace&&r.home===target));
   fs.writeFileSync(path.join(workspace,'unrelated.txt'),'no restart');await new Promise(r=>setTimeout(r,400));assert.equal(readCalls(restartLog).length,3);
  }finally{
   try{process.kill(-child.pid,'SIGTERM');}catch{}
   await new Promise(r=>setTimeout(r,300));try{process.kill(-child.pid,'SIGKILL');}catch{}
  }
 }finally{f.cleanup();}
});
