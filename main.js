'use strict';

// Core runner settings retained from the original game.
const LANES = 3;
const LANE_WIDTH = 47;
const GRAVITY = 2000;
const INIT_GAME_SPEED = 150;
const GAME_ACCELERATION = 6;
const RUNNER_JUMP_SPEED = -600;
const RUNNER_INIT_LANE = 1;
const RUNNER_Z = -410;
const RUNNER_SPEED_X = 300;
const RUNNER_SCALE = 0.2;
const RUNNER_COIN_COLLECTION_DISTANCE = 30;
const RUNNER_Z_INDEX_BEHIND = 100;
const ENTITIES_Z_GAP = 120;
const ENTITIES_PER_LEVEL = 18;
const ENTITIES_PER_LEVEL_SERIES = 3;
const ENTITIES_SPAWN_Z_LAST = 40;
const ENTITIES_SPAWN_Z_FIRST = ENTITIES_SPAWN_Z_LAST + ENTITIES_PER_LEVEL * ENTITIES_Z_GAP;
const ENTITIES_Y_FLOATING = -75;
const ENTITIES_BOMB_CHANCE = 0.3;
const ENTITIES_DEATH_TIME = 0.2;
const LEVEL_LENGTH = ENTITIES_SPAWN_Z_FIRST + 550;
const ROAD_ANGLE = (60 * Math.PI) / 180;
const ROAD_ANGLE_SIN = Math.sin(ROAD_ANGLE);
const ROAD_ANGLE_COS = Math.cos(ROAD_ANGLE);
const ROAD_ANGLE_SIN_COS = ROAD_ANGLE_SIN * ROAD_ANGLE_COS;
const PERSPECTIVE = 600;

const $ = (id) => document.getElementById(id);
const view = {
  game: $('game'), scene: $('scene'), road: $('road'), runner: $('runner'),
  runnerShadow: $('runner-shadow'), score: $('score'), level: $('level'),
  progress: $('progress-bar'), start: $('start-screen'), pause: $('pause-screen'),
  over: $('game-over-screen'), finalScore: $('final-score'), bestScore: $('best-score'),
  entities: [], impact: null
};
for (let i = 0; i < ENTITIES_PER_LEVEL; i++) {
  const node = document.createElement('div');
  node.style.opacity = '0';
  view.scene.append(node);
  view.entities.push(node);
}
let state;
let lastFrameTime = 0;
let animationId = 0;
let touchStart = null;
view.impact = document.createElement('div');
view.impact.className = 'impact-effect';
view.scene.append(view.impact);

function getBestScore() {
  try { return Number(localStorage.getItem('neonTrailBest') || 0); }
  catch (_) { return 0; }
}
function saveBestScore(score) {
  try { localStorage.setItem('neonTrailBest', String(Math.max(score, getBestScore()))); }
  catch (_) { /* Storage may be disabled; the game still works. */ }
}
function getInitialState() {
  const next = {
    game: { isOver: false, isPaused: false, isStarted: false, level: 0,
      levelProgress: 0, score: 0, speed: INIT_GAME_SPEED, progress: 0, overTimer: 0, showGameOver: false },
    runner: { position: { x: getLaneX(RUNNER_INIT_LANE), y: 0, z: RUNNER_Z },
      lane: RUNNER_INIT_LANE, ySpeed: 0 },
    entities: new Array(ENTITIES_PER_LEVEL)
  };
  spawnLevelEntities(next);
  return next;
}
function project({x,y,z}, rescale=1) {
  const rY = y * ROAD_ANGLE_SIN - z * ROAD_ANGLE_COS;
  const rZ = y * ROAD_ANGLE_COS + z * ROAD_ANGLE_SIN;
  const scale = PERSPECTIVE / (PERSPECTIVE + rZ);
  return {x:x*scale,y:rY*scale,scale:rescale*scale};
}
function getTransform({x,y,scale}) { return `translateX(${x}px) translateY(${y}px) scale(${scale})`; }
function getLaneX(lane) { return (lane - Math.floor(LANES/2)) * LANE_WIDTH; }
function getAdjacentLanes(lane) { return [lane-1,lane+1].filter(x=>x>=0&&x<LANES); }
function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z); }
function changeSpawnPosition(position) {
  const lanes = getAdjacentLanes(position.lane);
  const direction = Math.floor(Math.random()*(lanes.length+1));
  if (direction===0) position.y = position.y===0 ? ENTITIES_Y_FLOATING : 0;
  else position.lane = lanes[direction-1];
}
function spawnLevelEntities(current) {
  const spawnPosition = {lane:1,y:0,z:ENTITIES_SPAWN_Z_FIRST};
  current.game.level++;
  current.game.levelProgress=0;
  for(let i=0;i<ENTITIES_PER_LEVEL;i++){
    if(i%ENTITIES_PER_LEVEL_SERIES===0) changeSpawnPosition(spawnPosition);
    const roll=Math.random();
    const type=roll<0.68?'coin':roll<0.79?'bomb':roll<0.90?'rock':'bush';
    const {lane,z}=spawnPosition;
    const y=type==='coin'?spawnPosition.y:0;
    current.entities[i]={index:i,type,position:{x:getLaneX(lane),y,z},deathTimer:0};
    const el=view.entities[i];
    el.className=type;el.style.opacity='1';el.style.zIndex='0';
    el.style.transform='translate(-9999px,-9999px)';
    spawnPosition.z-=ENTITIES_Z_GAP;
  }
}
function moveLane(direction) {
  if(!state || !state.game.isStarted || state.game.isOver || state.game.isPaused) return;
  state.runner.lane=Math.max(0,Math.min(LANES-1,state.runner.lane+direction));
}
function jump() {
  if(!state || !state.game.isStarted || state.game.isOver || state.game.isPaused) return;
  if(state.runner.position.y===0) state.runner.ySpeed=RUNNER_JUMP_SPEED;
}
function startGame() {
  if(!state) state=getInitialState();
  state.game.isStarted=true;state.game.isPaused=false;state.game.isOver=false;
  view.start.classList.add('hidden');view.pause.classList.add('hidden');view.over.classList.add('hidden');
  view.runner.className='';view.impact.classList.remove('active');
  lastFrameTime=performance.now();
}
function pauseGame() {
  if(!state || !state.game.isStarted || state.game.isOver) return;
  state.game.isPaused=true;view.pause.classList.remove('hidden');
}
function resumeGame() {
  if(!state || state.game.isOver) return;
  state.game.isPaused=false;view.pause.classList.add('hidden');lastFrameTime=performance.now();
}
function restartGame() {
  state=getInitialState();
  view.runner.className='';view.impact.classList.remove('active');
  view.score.textContent='0';view.level.textContent='1';view.progress.style.width='0%';
  startGame();
}
function handleKey(event) {
  const key=event.key.toLowerCase();
  if(['arrowleft','arrowright','arrowup',' ','a','d','w'].includes(key)) event.preventDefault();
  if(key==='arrowleft'||key==='a') moveLane(-1);
  else if(key==='arrowright'||key==='d') moveLane(1);
  else if(key==='arrowup'||key==='w') jump();
  else if(key==='p'||key==='escape') state?.game.isPaused ? resumeGame() : pauseGame();
  else if(key===' ' && state?.game.isOver) restartGame();
  else if(key==='enter' && !state?.game.isStarted) startGame();
}
function handleGameEvents() {
  document.addEventListener('keydown',handleKey);
  $('start-button').addEventListener('click',startGame);
  $('resume-button').addEventListener('click',resumeGame);
  $('restart-button').addEventListener('click',restartGame);
  $('pause-button').addEventListener('click',pauseGame);
  document.querySelectorAll('[data-action]').forEach(button=>{
    const act=()=>{const action=button.dataset.action;if(action==='left')moveLane(-1);if(action==='right')moveLane(1);if(action==='jump')jump();};
    button.addEventListener('pointerdown',e=>{e.preventDefault();act();});
  });
  view.game.addEventListener('touchstart',e=>{
    const t=e.changedTouches[0];touchStart={x:t.clientX,y:t.clientY};
  },{passive:true});
  view.game.addEventListener('touchend',e=>{
    if(!touchStart)return;
    const t=e.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;
    if(Math.max(Math.abs(dx),Math.abs(dy))>24){
      if(Math.abs(dx)>Math.abs(dy))moveLane(dx>0?1:-1);else if(dy<0)jump();
    }
    touchStart=null;
  },{passive:true});
}
function update(current,dt) {
  const {game,runner,entities}=current;
  if(!game.isStarted||game.isPaused)return;
  if(game.isOver){
    game.overTimer+=dt;
    if(game.overTimer>=0.75)game.showGameOver=true;
    return;
  }
  if(game.levelProgress>=LEVEL_LENGTH)spawnLevelEntities(current);
  const speed=game.speed*dt;
  game.levelProgress+=speed;game.progress+=speed;game.speed+=GAME_ACCELERATION*dt;
  updateRunner(runner,dt);
  for(const entity of entities)updateEntity(game,runner,entity,dt);
}
function updateRunner(runner,dt) {
  const p=runner.position,destinationX=getLaneX(runner.lane);
  if(p.x<destinationX)p.x=Math.min(p.x+RUNNER_SPEED_X*dt,destinationX);
  else if(p.x>destinationX)p.x=Math.max(p.x-RUNNER_SPEED_X*dt,destinationX);
  if(p.y<0)runner.ySpeed+=GRAVITY*dt;
  p.y=Math.min(p.y+runner.ySpeed*dt,0);
  if(p.y===0)runner.ySpeed=0;
}
function updateEntity(game,runner,entity,dt) {
  if(entity.deathTimer>0){entity.deathTimer+=dt;return;}
  entity.position.z-=game.speed*dt;
  if(entity.type==='coin'){
    if(distance(entity.position,runner.position)<=RUNNER_COIN_COLLECTION_DISTANCE){
      game.score++;entity.deathTimer=dt;
    }
  }else if(['bomb','rock','bush'].includes(entity.type)&&checkBombCollision(runner.position,entity.position)){
    if(entity.type==='rock'){
      entity.deathTimer=0.001;
      entity.deathType='rock';
      entity.position.y=0;
      const el=view.entities[entity.index];
      el.classList.remove('rock-hit');
      void el.offsetWidth;
      el.classList.add('rock-hit');
    }else{
      game.isOver=true;
      game.overTimer=0;
      if(entity.type==='bomb'){
        view.runner.classList.add('blast');
        view.impact.classList.remove('active');void view.impact.offsetWidth;view.impact.classList.add('active');
        view.impact.style.transform=`translate(${project(entity.position).x}px, ${project(entity.position).y}px)`;
      }
    }
  }
}
function checkBombCollision(runner,bomb) {
  return Math.abs(runner.z-bomb.z)<=4&&Math.abs(runner.y-bomb.y)<=30&&Math.abs(runner.x-bomb.x)<=25;
}
function endGame() {
  if (state.game.overShown) return;
  state.game.overShown = true;
  view.runner.className='dead';
  const score=state.game.score;
  saveBestScore(score);
  view.finalScore.textContent=score;
  view.bestScore.textContent=getBestScore();
  view.over.classList.remove('hidden');
}
function draw(current) {
  const {game,runner,entities}=current;
  if(game.isOver){if(game.showGameOver)endGame();return;}
  view.score.textContent=game.score;view.level.textContent=game.level;
  view.road.style.backgroundPositionY=`${game.progress/ROAD_ANGLE_SIN_COS}px`;
  view.progress.style.width=`${Math.min(100,(game.levelProgress/LEVEL_LENGTH)*100)}%`;
  const rp=project(runner.position,RUNNER_SCALE);
  view.runner.style.transform=getTransform(rp);
  view.runner.style.animationPlayState=runner.position.y<0?'paused':'running';
  view.runnerShadow.style.transform=`translateX(${rp.x}px) translateY(${rp.y+15}px) scale(${Math.max(.45,rp.scale)})`;
  view.runnerShadow.style.opacity=String(Math.max(.25,1+runner.position.y/180));
  for(const entity of entities)drawEntity(runner,entity);
}
function drawEntity(runner,entity) {
  const el=view.entities[entity.index];
  if(entity.deathTimer>0){
    if(entity.deathType==='rock'){
      const t=Math.min(1,entity.deathTimer/1.05);
      // Fall quickly, bounce once on the road, then crumble away.
      const fall=Math.min(1,t/0.42);
      const fallEase=1-Math.pow(1-fall,3);
      const bounce=t>0.42?Math.sin(Math.min(1,(t-0.42)/0.18)*Math.PI)*5:0;
      const crumble=t<0.68?0:(t-0.68)/0.32;
      const opacity=1-Math.min(1,crumble);
      const projected=project(entity.position);
      const drop=fallEase*20+bounce;
      const rotation=fallEase*18+Math.sin(t*24)*2;
      const scale=1+fallEase*.08-crumble*.35;
      el.style.opacity=String(opacity);
      el.style.transform=`${getTransform(projected)} translateY(${drop}px) rotate(${rotation}deg) scale(${scale})`;
      if(t>=1){
        el.style.opacity='0';
        entity.deathTimer=0;
        entity.deathType=null;
        entity.position.z=-9999;
        el.classList.remove('rock-hit');
      }
    }else{
      const opacity=Math.max(0,1-entity.deathTimer/ENTITIES_DEATH_TIME);
      const p={x:entity.position.x+300*entity.deathTimer,y:entity.position.y-1000*entity.deathTimer,z:entity.position.z};
      const projected=project(p,1+entity.deathTimer*3);
      el.style.opacity=String(opacity);
      el.style.transform=`${getTransform(projected)} rotateY(${Math.floor(entity.deathTimer*1000)}deg)`;
      if(entity.deathTimer>=ENTITIES_DEATH_TIME){el.style.opacity='0';entity.deathTimer=0;entity.position.z=-9999;}
    }
    return;
  }
  if(entity.position.z < runner.position.z)el.style.zIndex=String(RUNNER_Z_INDEX_BEHIND);
  else el.style.zIndex='0';
  const p=project(entity.position);
  el.style.opacity=p.scale>0?'1':'0';
  el.style.transform=getTransform(p);
}
function resizeGame() {
  const scale=Math.min(1,(window.innerWidth-24)/520);
  // Scale the complete playfield (background, HUD, overlays and 3D scene) as one unit.
  view.game.style.width='500px';
  view.game.style.height='600px';
  view.game.style.transform=`scale(${scale})`;
  view.game.style.transformOrigin='top left';
  const wrap=document.querySelector('.game-wrap');
  wrap.style.width=`${500*scale}px`;
  wrap.style.height=`${600*scale}px`;
}
function loop(time) {
  const dt=Math.min((time-lastFrameTime)/1000,0.04);
  lastFrameTime=time;
  if(state){update(state,dt);draw(state);}
  animationId=requestAnimationFrame(loop);
}
function init() {
  state=getInitialState();
  handleGameEvents();resizeGame();
  window.addEventListener('resize',resizeGame);
  view.bestScore.textContent=getBestScore();
  lastFrameTime=performance.now();
  animationId=requestAnimationFrame(loop);
}
init();
