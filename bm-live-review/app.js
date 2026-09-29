import {joinRoom as trysteroJoinRoom} from 'https://esm.run/trystero@0.24.0';
import U1 from './data/unit1.js';
import U2 from './data/unit2.js';
import U3 from './data/unit3.js';
import U4 from './data/unit4.js';
import U5 from './data/unit5.js';

const BANK=[...U1,...U2,...U3,...U4,...U5];
const UNIT_NAMES={1:'Business organization & environment',2:'Human resource management',3:'Finance & accounts',4:'Marketing',5:'Operations management'};
const APP_ID='caesar-bm-live-review-2026-v1';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const toast=msg=>{const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1700)};
const roomCode=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('')};
let screen='home';
function show(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$(id).classList.add('active');screen=id;scrollTo({top:0,behavior:'smooth'});if(id==='host')renderRecentReports()}
$('homeBtn').onclick=()=>{if(['lobby','hostGame','studentGame','waiting'].includes(screen)&&!confirm('Leave the current live room?'))return;leaveLive();show('home')};
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go));

// Unit controls
const selectedUnits=new Set(['1']);
function buildPills(){
  $('hostUnits').innerHTML='';
  for(let u=1;u<=5;u++){
    const b=document.createElement('button');b.className='pill'+(selectedUnits.has(String(u))?' active':'');b.textContent=`Unit ${u}`;b.onclick=()=>{const k=String(u);if(selectedUnits.has(k)&&selectedUnits.size===1){toast('Keep at least one unit selected');return}selectedUnits.has(k)?selectedUnits.delete(k):selectedUnits.add(k);buildPills()};$('hostUnits').appendChild(b)
  }
}
buildPills();

// Flashcards
let flashUnit='1',flashDeck=[],flashIndex=0;
function initFlash(){
 $('flashUnits').innerHTML='';
 for(let u=1;u<=5;u++){const b=document.createElement('button');b.className='btn '+(flashUnit===String(u)?'primary':'secondary');b.textContent=`Unit ${u} · ${UNIT_NAMES[u]}`;b.onclick=()=>{flashUnit=String(u);flashIndex=0;initFlash();renderFlash()};$('flashUnits').appendChild(b)}
 flashDeck=BANK.filter(x=>x.unit===flashUnit);renderFlash();
}
function renderFlash(){if(!flashDeck.length)return;const c=flashDeck[flashIndex];$('flashCard').classList.remove('flipped');$('flashUnitLabel').textContent=`Unit ${c.unit}`;$('flashTerm').textContent=c.term;$('flashDefinition').textContent=c.definition;$('flashPos').textContent=`${flashIndex+1} / ${flashDeck.length}`;$('flashCount').textContent=`${flashDeck.length} terms · Unit ${flashUnit}`}
$('flashCard').onclick=()=>$('flashCard').classList.toggle('flipped');$('prevCard').onclick=()=>{flashIndex=(flashIndex-1+flashDeck.length)%flashDeck.length;renderFlash()};$('nextCard').onclick=()=>{flashIndex=(flashIndex+1)%flashDeck.length;renderFlash()};$('shuffleCards').onclick=()=>{flashDeck=shuffle(flashDeck);flashIndex=0;renderFlash();toast('Deck shuffled')};
initFlash();

// Live state
let liveRoom=null, actions={}, role=null, code=null, hostState=null, playerKey=null, playerName=null, myAnswered=false, myChoice=null, localTimer=null, localDeadline=0;
function leaveLive(){if(liveRoom){try{liveRoom.leave()}catch(e){}}liveRoom=null;actions={};role=null;code=null;hostState=null;clearInterval(localTimer)}
function setupActions(){
 const names=['hello','state','answer','reveal','finish','kick'];
 for(const n of names){const [send,onMessage]=liveRoom.makeAction(n);actions[n]={send,onMessage}}
}
function unitPool(units){return BANK.filter(x=>units.includes(x.unit))}
function makeQuestion(card,pool){
 const distractors=shuffle(pool.filter(x=>x.id!==card.id && x.unit===card.unit)).slice(0,3);
 while(distractors.length<3){const extras=shuffle(pool.filter(x=>x.id!==card.id&&!distractors.some(d=>d.id===x.id))).slice(0,3-distractors.length);distractors.push(...extras)}
 const opts=shuffle([card,...distractors]).map(x=>x.term);return {id:card.id,unit:card.unit,prompt:card.definition,options:opts,correct:opts.indexOf(card.term),term:card.term}
}
function buildQuiz(){const units=[...selectedUnits];const pool=unitPool(units);const n=Math.min(+$('questionCount').value,pool.length);return shuffle(pool).slice(0,n).map(c=>makeQuestion(c,pool))}
function connect(roomId){liveRoom=trysteroJoinRoom({appId:APP_ID},roomId,{onJoinError:({error})=>{console.error(error);if(role==='student')$('joinStatus').textContent='Connection issue. Check the code/network and try again.'}});setupActions();}

// Host create/lobby
$('createRoom').onclick=()=>{
 leaveLive();role='host';code=roomCode();connect(code);hostState={quiz:buildQuiz(),index:-1,time:+$('questionTime').value,scoring:$('scoringMode').value,players:{},peerToKey:{},answers:{},revealed:false,started:false,sessionId:`${Date.now()}-${code}`,classLabel:$('hostName').value.trim()||'BM Class',selectedUnits:[...selectedUnits]};
 actions.hello.onMessage=(data,{peerId})=>hostHello(data,peerId);actions.answer.onMessage=(data,{peerId})=>hostAnswer(data,peerId);liveRoom.onPeerLeave=peerId=>{const k=hostState.peerToKey[peerId];if(k&&hostState.players[k]){hostState.players[k].connected=false;renderLobbyPlayers();renderLeaderboard()}};
 $('roomCodeText').textContent=code;const url=new URL(location.href);url.searchParams.set('join',code);$('roomJoinUrl').textContent=url.toString();$('startGame').disabled=true;renderLobbyPlayers();show('lobby')
};
function hostHello(data,peerId){
 const key=String(data?.key||peerId);const name=String(data?.name||'Student').slice(0,24);
 hostState.peerToKey[peerId]=key;let p=hostState.players[key];if(!p)p=hostState.players[key]={key,name,score:0,correct:0,total:0,totalResponseMs:0,missed:[],connected:true,peerId};else Object.assign(p,{name,connected:true,peerId});
 actions.state.send(hostPublicState(),{target:peerId});renderLobbyPlayers();renderLeaderboard();
}
function hostPublicState(){
 const q=hostState.index>=0?hostState.quiz[hostState.index]:null;return {phase:hostState.started?(hostState.index>=hostState.quiz.length?'finished':hostState.revealed?'revealed':'question'):'lobby',code,index:hostState.index,total:hostState.quiz.length,time:hostState.time,question:q?{id:q.id,unit:q.unit,prompt:q.prompt,options:q.options}:null,deadline:localDeadline,leaderboard:leaderboardData()}
}
function renderLobbyPlayers(){if(!hostState)return;const ps=Object.values(hostState.players);$('playerCount').textContent=ps.length;$('startGame').disabled=ps.length===0;$('playerGrid').innerHTML=ps.map(p=>`<div class="player-chip"><span class="dot" style="background:${p.connected?'var(--green)':'var(--muted)'}"></span>${esc(p.name)}</div>`).join('')}
$('copyJoinLink').onclick=async()=>{await navigator.clipboard.writeText($('roomJoinUrl').textContent);toast('Student link copied')};$('closeRoom').onclick=()=>{leaveLive();show('host')};$('startGame').onclick=()=>{hostState.started=true;hostState.index=-1;nextHostQuestion()};

function nextHostQuestion(){
 clearInterval(localTimer);hostState.index++;hostState.answers={};hostState.revealed=false;
 if(hostState.index>=hostState.quiz.length){finishGame();return}
 const q=hostState.quiz[hostState.index];localDeadline=Date.now()+hostState.time*1000;show('hostGame');renderHostQuestion();actions.state.send(hostPublicState());startHostTimer();
}
function renderHostQuestion(){
 const q=hostState.quiz[hostState.index];$('hostQNum').textContent=`Question ${hostState.index+1} of ${hostState.quiz.length} · Unit ${q.unit}`;$('hostQuestion').textContent=q.prompt;$('hostAnswers').innerHTML=q.options.map((o,i)=>`<button class="answer ${'abcd'[i]}" disabled><span class="letter">${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('');$('hostProgressBar').style.width=`${(hostState.index/hostState.quiz.length)*100}%`;updateAnswerProgress();renderLeaderboard();$('hostGameActions').innerHTML='';
}
function startHostTimer(){
 clearInterval(localTimer);const tick=()=>{const rem=Math.max(0,localDeadline-Date.now());const sec=Math.ceil(rem/1000);$('hostTimer').querySelector('span').textContent=sec;$('hostTimer').style.setProperty('--p',rem/(hostState.time*1000));if(rem<=0){clearInterval(localTimer);revealQuestion()}};tick();localTimer=setInterval(tick,200)
}
function hostAnswer(data,peerId){
 if(!hostState||hostState.revealed)return;const key=hostState.peerToKey[peerId];const p=hostState.players[key];const q=hostState.quiz[hostState.index];if(!p||!q||data?.qId!==q.id||hostState.answers[key])return;
 const choice=+data.choice;const elapsed=Math.max(0,Math.min(hostState.time*1000,+data.elapsed||0));const correct=choice===q.correct;let points=0;if(correct)points=hostState.scoring==='accuracy'?1000:500+Math.round(500*(1-elapsed/(hostState.time*1000)));
 hostState.answers[key]={choice,elapsed,correct,points};p.score+=points;p.total++;p.totalResponseMs+=elapsed;if(correct)p.correct++;else p.missed.push(q.term);updateAnswerProgress();renderLeaderboard();
 const connected=Object.values(hostState.players).filter(x=>x.connected).length;if(Object.keys(hostState.answers).length>=connected&&connected>0)setTimeout(()=>{if(!hostState.revealed)revealQuestion()},650)
}
function updateAnswerProgress(){if(!hostState)return;const a=Object.keys(hostState.answers).length;const c=Object.values(hostState.players).filter(x=>x.connected).length;$('answerProgress').textContent=`${a}/${c} answered`}
function revealQuestion(){
 if(hostState.revealed)return;hostState.revealed=true;clearInterval(localTimer);const q=hostState.quiz[hostState.index];for(const p of Object.values(hostState.players)){if(p.connected&&!hostState.answers[p.key]){p.total++;p.totalResponseMs+=hostState.time*1000;p.missed.push(q.term);hostState.answers[p.key]={choice:null,elapsed:hostState.time*1000,correct:false,points:0}}}document.querySelectorAll('#hostAnswers .answer').forEach((b,i)=>{if(i===q.correct)b.classList.add('correct');else b.classList.add('wrong')});actions.reveal.send({qId:q.id,correct:q.correct,term:q.term,leaderboard:leaderboardData()});$('hostGameActions').innerHTML=`<button class="btn primary" id="nextQuestionBtn">${hostState.index===hostState.quiz.length-1?'Finish game':'Next question'}</button>`;$('nextQuestionBtn').onclick=nextHostQuestion;renderLeaderboard();updateAnswerProgress()
}
function leaderboardData(){if(!hostState)return[];return Object.values(hostState.players).sort((a,b)=>b.score-a.score||b.correct-a.correct).map((p,i)=>({rank:i+1,key:p.key,name:p.name,score:p.score,correct:p.correct,total:p.total}))}
function renderLeaderboard(){if(!hostState||!$('hostLeaderboard'))return;const rows=leaderboardData();$('hostLeaderboard').innerHTML=rows.length?rows.slice(0,10).map(r=>`<div class="rank-row"><div class="rank">${r.rank}</div><div>${esc(r.name)}</div><div class="score">${r.score}</div></div>`).join(''):'<div class="muted">Waiting for players…</div>'}

// Student join
const prefill=new URLSearchParams(location.search).get('join');if(prefill){$('studentRoom').value=prefill.toUpperCase();show('join')}
$('joinRoom').onclick=()=>{
 const nm=$('studentName').value.trim(),rc=$('studentRoom').value.trim().toUpperCase();if(!nm){$('joinStatus').textContent='Enter your name first.';return}if(rc.length!==6){$('joinStatus').textContent='Enter the six-character room code.';return}
 leaveLive();role='student';code=rc;playerName=nm;playerKey=localStorage.getItem('bm-player-key')||crypto.randomUUID();localStorage.setItem('bm-player-key',playerKey);connect(code);$('joinStatus').textContent='Connecting…';
 actions.state.onMessage=(data)=>studentState(data);actions.reveal.onMessage=(data)=>studentReveal(data);actions.finish.onMessage=(data)=>studentFinish(data);liveRoom.onPeerJoin=()=>{actions.hello.send({name:playerName,key:playerKey})};setTimeout(()=>actions.hello.send({name:playerName,key:playerKey}),700);$('waitingRoom').textContent=`Room ${code}`;show('waiting')
};
function studentState(s){
 if(!s)return;if(s.phase==='lobby'){show('waiting');return}if(s.phase==='question'){showStudentQuestion(s);return}if(s.phase==='revealed'){if(s.question)showStudentQuestion(s);return}if(s.phase==='finished'){studentFinish({leaderboard:s.leaderboard});return}
}
let studentQuestionStart=0;
function showStudentQuestion(s){
 const q=s.question;if(!q)return;show('studentGame');myAnswered=false;myChoice=null;studentQuestionStart=Date.now();localDeadline=s.deadline||Date.now()+s.time*1000;$('studentQNum').textContent=`Question ${s.index+1} of ${s.total} · Unit ${q.unit}`;const me=(s.leaderboard||[]).find(x=>x.key===playerKey);$('studentScore').textContent=`Score ${me?.score||0}`;$('studentQuestion').textContent=q.prompt;$('studentResult').innerHTML='';$('studentAnswers').innerHTML=q.options.map((o,i)=>`<button class="answer ${'abcd'[i]}" data-choice="${i}"><span class="letter">${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('');document.querySelectorAll('#studentAnswers .answer').forEach(b=>b.onclick=()=>submitStudentAnswer(q,b));startStudentTimer(s.time)
}
function startStudentTimer(duration){clearInterval(localTimer);const tick=()=>{const rem=Math.max(0,localDeadline-Date.now());$('studentTimer').querySelector('span').textContent=Math.ceil(rem/1000);$('studentTimer').style.setProperty('--p',rem/(duration*1000));if(rem<=0){clearInterval(localTimer);document.querySelectorAll('#studentAnswers .answer').forEach(b=>b.disabled=true)}};tick();localTimer=setInterval(tick,200)}
function submitStudentAnswer(q,b){if(myAnswered)return;myAnswered=true;myChoice=+b.dataset.choice;document.querySelectorAll('#studentAnswers .answer').forEach(x=>x.disabled=true);b.classList.add('selected');actions.answer.send({qId:q.id,choice:myChoice,elapsed:Math.max(0,Date.now()-studentQuestionStart)})}
function studentReveal(data){clearInterval(localTimer);document.querySelectorAll('#studentAnswers .answer').forEach((b,i)=>{b.disabled=true;if(i===data.correct)b.classList.add('correct');else if(myChoice===i)b.classList.add('wrong')});const mine=(data.leaderboard||[]).find(x=>x.key===playerKey);const ok=myChoice===data.correct;$('studentResult').innerHTML=`<div class="result-banner ${ok?'good':'bad'}">${ok?'✓ Correct':'✕ Not this time'}${mine?` · ${mine.score} pts · rank #${mine.rank}`:''}</div>`;$('studentScore').textContent=`Score ${mine?.score||0}`}
function studentFinish(data){clearInterval(localTimer);const mine=(data.leaderboard||[]).find(x=>x.key===playerKey);show('studentFinish');$('studentFinishText').textContent=mine?`${mine.correct} correct answers · ${mine.score} points`:'Thanks for playing!';$('studentFinalRank').textContent=mine?`#${mine.rank}`:'🏁'}

// Finish/report
function finishGame(){
 clearInterval(localTimer);hostState.index=hostState.quiz.length;const lb=leaderboardData();actions.finish.send({leaderboard:lb});const report={id:hostState.sessionId,date:new Date().toISOString(),classLabel:hostState.classLabel,code,units:hostState.selectedUnits,questions:hostState.quiz.map(q=>({id:q.id,term:q.term,unit:q.unit})),players:Object.values(hostState.players).map(p=>({name:p.name,score:p.score,correct:p.correct,total:p.total,accuracy:p.total?Math.round(p.correct/p.total*100):0,avgResponseMs:p.total?Math.round(p.totalResponseMs/p.total):0,missed:p.missed}))};saveReport(report);renderReport(report);show('report')
}
function saveReport(r){const all=JSON.parse(localStorage.getItem('bm-reports')||'[]');all.unshift(r);localStorage.setItem('bm-reports',JSON.stringify(all.slice(0,20)))}
function renderRecentReports(){const all=JSON.parse(localStorage.getItem('bm-reports')||'[]');if(!all.length){$('recentReports').innerHTML='';return}$('recentReports').innerHTML=`<div class="panel"><h3>Recent reports on this device</h3>${all.slice(0,5).map(r=>`<div class="rank-row"><div>📄</div><div><strong>${esc(r.classLabel)}</strong><div class="tiny muted">${new Date(r.date).toLocaleString()} · ${r.players.length} students</div></div><button class="btn ghost tiny" data-report="${esc(r.id)}">Open</button></div>`).join('')}</div>`;document.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>{const r=all.find(x=>x.id===b.dataset.report);if(r){renderReport(r);show('report')}})}
let currentReport=null;
function renderReport(r){currentReport=r;const ps=[...r.players].sort((a,b)=>b.score-a.score);const avg=ps.length?Math.round(ps.reduce((s,p)=>s+p.accuracy,0)/ps.length):0;const totalMissed={};ps.forEach(p=>p.missed.forEach(t=>totalMissed[t]=(totalMissed[t]||0)+1));const weak=Object.entries(totalMissed).sort((a,b)=>b[1]-a[1]).slice(0,8);$('reportContent').innerHTML=`<div class="report-grid"><div class="metric"><div class="num">${ps.length}</div><div class="lbl">Students</div></div><div class="metric"><div class="num">${r.questions.length}</div><div class="lbl">Questions</div></div><div class="metric"><div class="num">${avg}%</div><div class="lbl">Class accuracy</div></div><div class="metric"><div class="num">${r.units.map(u=>'U'+u).join(' · ')}</div><div class="lbl">Units</div></div></div><div class="panel"><h3>Most-missed terms</h3>${weak.length?weak.map(([t,n])=>`<span class="weak-tag">${esc(t)} · ${n}</span>`).join(''):'<span class="muted">No missed terms recorded.</span>'}</div><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Rank</th><th>Student</th><th>Score</th><th>Correct</th><th>Accuracy</th><th>Avg response</th><th>Needs review</th></tr></thead><tbody>${ps.map((p,i)=>`<tr><td>${i+1}</td><td><strong>${esc(p.name)}</strong></td><td>${p.score}</td><td>${p.correct}/${p.total}</td><td>${p.accuracy}%</td><td>${(p.avgResponseMs/1000).toFixed(1)}s</td><td>${p.missed.length?p.missed.map(t=>`<span class="weak-tag">${esc(t)}</span>`).join(''):'—'}</td></tr>`).join('')}</tbody></table></div>`}
$('downloadCsv').onclick=()=>{if(!currentReport)return;const rows=[['Rank','Student','Score','Correct','Total','Accuracy %','Avg response sec','Missed terms']];[...currentReport.players].sort((a,b)=>b.score-a.score).forEach((p,i)=>rows.push([i+1,p.name,p.score,p.correct,p.total,p.accuracy,(p.avgResponseMs/1000).toFixed(1),p.missed.join(' | ')]));const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`BM-review-${currentReport.code}-${currentReport.date.slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)};
$('newGame').onclick=()=>{leaveLive();show('host')};
