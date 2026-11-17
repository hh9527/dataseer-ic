#!/bin/bash
# 用法: sample-guard.sh <label> <tasks文件> <provider/model>
set -eu
LABEL=$1; TASKS=$2; MODEL=$3
LAB=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
TMPROOT="$LAB/.tester"
: "${TESTER_STATE_DIR:=$TMPROOT/10924}"
export TESTER_STATE_DIR
mkdir -p "$TESTER_STATE_DIR"
TESTER_STATE_DIR=$(cd -- "$TESTER_STATE_DIR" && pwd)
export TESTER_STATE_DIR
CAND=${TESTER_CWD:?请设置 TESTER_CWD 为考生工作区绝对路径}
RUN_LOG="$TESTER_STATE_DIR/sample-guard.log"
 node "$LAB/tester-cli.mjs" sample --cwd "$CAND" --tasks "$TASKS" --label "$LABEL" --model "$MODEL" > "$RUN_LOG" 2>&1 &
SAMPLE_PID=$!
sleep 40
ACTUAL=$(TESTER_STATE_DIR="$TESTER_STATE_DIR" node -e '
const fs=require("node:fs");const dir=process.env.TESTER_STATE_DIR||".tester";const st=JSON.parse(fs.readFileSync(dir+"/state.json","utf8"));
const rpc=async(m,a,p)=>{const r=await fetch(st.base+"/api/"+m,{method:"POST",headers:{"content-type":"application/json",cookie:st.cookie},body:JSON.stringify({type:"client-request",rpcId:crypto.randomUUID(),method:m,payload:{args:{[p]:a}}})});const j=await r.json();if(!j.result.ok)throw new Error("rpc");return j.result.value};
(async()=>{const items=(await rpc("session/list",{},"_request")).items;const it=items.find(i=>i.sessionId===st.sessionId);
if(!it){console.log("NOSESSION");return;}
const m=it.projections?.values?.modelSelection?.next||{};
if(m.provider)return console.log(m.provider+"/"+m.model);
const page=await rpc("session/page",{address:{kind:"session",sessionId:st.sessionId},throughSeq:it.projections.asOfSeq,maxMessages:300}, "request");
const hdr=(page.records??[]).map(r=>r.event).find(e=>e?.type==="request/header");
const c=hdr?.data?.header?.config||{};console.log((c.provider??"?")+"/"+(c.model??"?"));})();' 2>/dev/null)
echo "期望模型: $MODEL"
echo "实际模型: $ACTUAL"
if [ "$ACTUAL" != "$MODEL" ]; then
  echo "✗ 模型不符或会话未建立，终止本次采样"
  kill $SAMPLE_PID 2>/dev/null
  exit 2
fi
echo "✓ 模型已核对，继续采样"
wait $SAMPLE_PID
tail -45 "$RUN_LOG"
