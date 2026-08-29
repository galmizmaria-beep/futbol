(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`);
  const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  const I18N = {
    ru: {locker:'Раздевалка', training:'Тренировка', first:'Тайм 1', second:'Тайм 2', begin:'Выйти на поле', continue:'Продолжить', submit:'Ответить', ready:'Готово', correct:'Верно! Отличная игра!', incorrect:'Неверно. Продолжаем матч!', partial:'Частично верно', points:'Очки', score:'Счёт', question:'Задание', shoot:'Потяните мяч назад и отпустите', goal:'ГОЛ!', saved:'СЕЙВ!', next:'Дальше', results:'Матч завершён', accuracy:'Точность', right:'Верных', again:'Сыграть ещё раз', hint:'Подсказка', oral:'Ответьте устно, затем нажмите «Готово»', halftime:'Перерыв', halftimeText:'Первый тайм завершён. Время перевести дух!', startSecond:'Начать второй тайм'},
    en: {locker:'Locker room', training:'Training', first:'First half', second:'Second half', begin:'Enter the pitch', continue:'Continue', submit:'Submit', ready:'Ready', correct:'Correct! Great play!', incorrect:'Not quite. Keep playing!', partial:'Partly correct', points:'Points', score:'Score', question:'Question', shoot:'Pull the ball back and release', goal:'GOAL!', saved:'SAVED!', next:'Continue', results:'Full time', accuracy:'Accuracy', right:'Correct', again:'Play again', hint:'Hint', oral:'Answer aloud, then press “Ready”', halftime:'Half-time', halftimeText:'The first half is over. Take a breather!', startSecond:'Start second half'}
  };

  const sectionDefaults = () => [
    {id:'locker', enabled:true, title:{ru:'Раздевалка',en:'Locker room'}, intro:{ru:'Добро пожаловать! Собери команду и приготовься к учебному матчу.',en:'Welcome! Get your team ready for the learning match.'}, background:'', character:''},
    {id:'training', enabled:true, title:{ru:'Тренировка',en:'Training'}, intro:{ru:'Разомнись: ответь на вопрос и потренируй точный пас.',en:'Warm up: answer a question and practise an accurate pass.'}, background:'', character:''},
    {id:'first', enabled:true, title:{ru:'Тайм 1',en:'First half'}, intro:{ru:'Первый тайм начинается. Каждый верный ответ приближает команду к воротам!',en:'The first half begins. Every correct answer brings the team closer to goal!'}, background:'', character:''},
    {id:'second', enabled:true, title:{ru:'Тайм 2',en:'Second half'}, intro:{ru:'Решающий тайм. Покажи всё, чему научился!',en:'The deciding half. Show what you have learned!'}, background:'', character:''}
  ];

  const makeQuestion = (sectionId, index = 0) => ({
    id:uid(), sectionId, type:'single', text:`Какой ответ верный?`, options:[{id:uid(),text:'Первый вариант',correct:true},{id:uid(),text:'Второй вариант',correct:false},{id:uid(),text:'Третий вариант',correct:false}], accepted:['Ответ'], hint:'Вспомни материал урока', explanation:'', points:100, event:index % 2 ? 'pass' : 'penalty', partial:false
  });

  const defaultProject = () => ({
    schemaVersion:1, appVersion:'1.0.0', meta:{title:'Мой футбольный урок',author:'Гальмиз Мария Александровна'}, locale:'ru', difficulty:'normal', teamName:'Команда знаний', basePoints:100, goalPoints:50, shuffleAnswers:false, soundEnabled:true, reducedMotion:false, publicUrl:'', theme:{accent:'#b7f34a',card:'#102a22',text:'#ffffff',questionSize:28,answerSize:17,glow:18}, sections:sectionDefaults(), questions:[]
  });

  let project = defaultProject();
  project.questions = [makeQuestion('training'), makeQuestion('first'), makeQuestion('second')];
  project.questions[0].text = 'Сколько игроков одной команды обычно находится на футбольном поле?';
  project.questions[0].options = [{id:uid(),text:'9',correct:false},{id:uid(),text:'11',correct:true},{id:uid(),text:'14',correct:false}];
  let activeSectionId = 'locker';
  let activeQuestionId = null;
  let history = [JSON.stringify(project)];
  let historyIndex = 0;
  let commitTimer;
  let saveTimer;

  const gameState = {screen:'intro', sectionIndex:0, questionIndex:0, points:0, goalsFor:0, goalsAgainst:0, correct:0, checked:0, selected:new Set(), order:[], feedback:'', feedbackClass:'', locked:false};

  function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove('show'),2200); }
  function t(key) { return (I18N[project.locale] || I18N.ru)[key] || key; }
  function localized(value) { return typeof value === 'string' ? value : value?.[project.locale] || value?.ru || Object.values(value || {})[0] || ''; }
  function activeSection() { return project.sections.find(s => s.id === activeSectionId); }
  function sectionQuestions(id = activeSectionId) { return project.questions.filter(q => q.sectionId === id); }
  function activeQuestion() { return project.questions.find(q => q.id === activeQuestionId); }

  function markChanged(immediate = false) {
    $('#saveState').textContent = 'Есть изменения';
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commitHistory, immediate ? 0 : 450);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem('football-editor-draft', JSON.stringify(project)); $('#saveState').textContent='Сохранено локально'; } catch {} }, 700);
    renderGame(false);
  }

  function commitHistory() {
    const value=JSON.stringify(project); if (history[historyIndex]===value) return;
    history=history.slice(0,historyIndex+1); history.push(value); if(history.length>100) history.shift(); else historyIndex++; updateHistoryButtons();
  }
  function updateHistoryButtons(){ $('#undoBtn').disabled=historyIndex<=0; $('#redoBtn').disabled=historyIndex>=history.length-1; }
  function restoreHistory(index){ if(index<0||index>=history.length)return; historyIndex=index; project=JSON.parse(history[index]); syncControls(); renderEditor(); renderGame(false); updateHistoryButtons(); }

  function syncControls(){
    $('#projectTitle').value=project.meta.title; $('#localeSelect').value=project.locale; $('#difficultySelect').value=project.difficulty;
    $('#accentColor').value=project.theme.accent; $('#cardColor').value=project.theme.card; $('#textColor').value=project.theme.text;
    $('#questionSize').value=project.theme.questionSize; $('#answerSize').value=project.theme.answerSize; $('#glow').value=project.theme.glow;
    $('#questionSizeOut').value=`${project.theme.questionSize}px`; $('#answerSizeOut').value=`${project.theme.answerSize}px`; $('#glowOut').value=`${project.theme.glow}px`;
    $('#teamName').value=project.teamName; $('#basePoints').value=project.basePoints; $('#goalPoints').value=project.goalPoints;
    $('#shuffleAnswers').checked=project.shuffleAnswers; $('#soundEnabled').checked=project.soundEnabled; $('#reducedMotion').checked=project.reducedMotion; $('#publicUrl').value=project.publicUrl || '';
  }

  function renderEditor(){
    const sec=activeSection() || project.sections[0]; if(!sec)return;
    $('#sectionTabs').innerHTML=project.sections.map(s=>`<button data-section="${s.id}" class="${s.id===activeSectionId?'active':''}">${escapeHtml(localized(s.title))}</button>`).join('');
    $('#sectionEnabled').checked=sec.enabled; $('#sectionTitle').value=localized(sec.title); $('#sectionIntro').value=localized(sec.intro);
    const qs=sectionQuestions(); if(activeQuestionId&&!qs.some(q=>q.id===activeQuestionId)) activeQuestionId=null;
    $('#questionList').innerHTML=qs.map((q,i)=>`<button class="question-chip ${q.id===activeQuestionId?'active':''} ${validQuestion(q)?'':'invalid'}" data-question="${q.id}" title="${escapeHtml(q.text)}">${i+1}</button>`).join('') || '<span class="save-state">В разделе пока нет заданий</span>';
    renderQuestionEditor(); renderAssetPreviews();
  }

  function validQuestion(q){ if(!q.text.trim())return false; if(q.type==='oral')return true; if(q.type==='text')return q.accepted.some(a=>a.trim()); if(q.type==='order')return q.options.length>=2; return q.options.length>=2&&q.options.some(o=>o.correct); }

  function renderQuestionEditor(){
    const q=activeQuestion(), root=$('#questionEditor');
    if(!q){root.className='question-editor empty';root.innerHTML='<p>Выберите задание или добавьте новое.</p>';return;}
    root.className='question-editor';
    const optionMode=q.type==='multiple'?'checkbox':'radio';
    let details='';
    if(['single','multiple','order'].includes(q.type)) details=`<div class="options-editor">${q.options.map((o,i)=>`<div class="option-row"><input class="correct-toggle" data-index="${i}" type="${q.type==='order'?'hidden':optionMode}" ${o.correct?'checked':''} aria-label="Правильный вариант"><input class="option-text" data-index="${i}" value="${escapeHtml(o.text)}" aria-label="Вариант ${i+1}"><button class="remove-option" data-index="${i}" aria-label="Удалить">×</button></div>`).join('')}<button id="addOption" class="add-option">＋ Добавить вариант</button></div>`;
    if(q.type==='text') details=`<label>Допустимые ответы (каждый с новой строки)<textarea id="acceptedAnswers" rows="4">${escapeHtml(q.accepted.join('\n'))}</textarea></label>`;
    if(q.type==='oral') details='<div class="info-box">Ответ не проверяется автоматически и не влияет на точность.</div>';
    root.innerHTML=`<div class="editor-head"><h3>Задание</h3><div class="mini-actions"><button id="duplicateQuestion" title="Копировать">⧉</button><button id="moveQuestionLeft" title="Назад">←</button><button id="moveQuestionRight" title="Вперёд">→</button><button id="deleteQuestion" class="remove-option" title="Удалить">🗑</button></div></div><label>Тип задания<select id="questionType"><option value="single">Один ответ</option><option value="multiple">Множественный выбор</option><option value="text">Ввод ответа</option><option value="oral">Устный вопрос</option><option value="order">Расставить по порядку</option></select></label><label>Текст вопроса<textarea id="questionText" rows="3" maxlength="700">${escapeHtml(q.text)}</textarea></label>${details}<div class="field-row"><label>Баллы<input id="questionPoints" type="number" min="0" max="10000" value="${q.points}"></label><label>Эпизод<select id="questionEvent"><option value="penalty">Пенальти</option><option value="pass">Точный пас</option></select></label></div><label>Подсказка<input id="questionHint" value="${escapeHtml(q.hint||'')}"></label><label>Объяснение после ответа<textarea id="questionExplanation" rows="2">${escapeHtml(q.explanation||'')}</textarea></label>`;
    $('#questionType').value=q.type; $('#questionEvent').value=q.event;
  }

  function renderAssetPreviews(){const s=activeSection(); const bg=$('#backgroundPreview'),ch=$('#characterPreview');bg.style.backgroundImage=s.background?`url("${s.background}")`:'';bg.textContent=s.background?'':'Фон не загружен';ch.style.backgroundImage=s.character?`url("${s.character}")`:'';ch.textContent=s.character?'':'Персонаж не загружен';}

  function enabledSections(){return project.sections.filter(s=>s.enabled);}
  function currentRuntimeSection(){return enabledSections()[gameState.sectionIndex];}
  function runtimeQuestions(){return project.questions.filter(q=>q.sectionId===currentRuntimeSection()?.id);}

  function resetGame(){Object.assign(gameState,{screen:'intro',sectionIndex:0,questionIndex:0,points:0,goalsFor:0,goalsAgainst:0,correct:0,checked:0,selected:new Set(),order:[],feedback:'',feedbackClass:'',locked:false});renderGame(true);}

  function renderGame(){
    const root=$('#game'); root.classList.toggle('reduced',project.reducedMotion); root.style.setProperty('--accent',project.theme.accent);root.style.setProperty('--card',project.theme.card);root.style.setProperty('--gameText',project.theme.text);root.style.setProperty('--qsize',`${project.theme.questionSize}px`);root.style.setProperty('--asize',`${project.theme.answerSize}px`);root.style.setProperty('--glow',`${project.theme.glow}px`);
    const sections=enabledSections(); if(!sections.length){root.innerHTML='<div class="results-card"><h2>Включите хотя бы один раздел</h2></div>';return;}
    if(gameState.sectionIndex>=sections.length) gameState.screen='results';
    const sec=currentRuntimeSection()||sections[0];
    const nav=sections.map((s,i)=>`<span class="${i===gameState.sectionIndex?'active':''}">${escapeHtml(localized(s.title))}</span>`).join('');
    let content='';
    if(gameState.screen==='intro') content=`<div class="hero-copy"><div class="eyebrow">${escapeHtml(project.teamName)}</div><h1>${escapeHtml(localized(sec.title))}</h1><p>${escapeHtml(localized(sec.intro))}</p><button class="game-button" data-game-action="start">${t(sec.id==='locker'?'begin':'continue')} →</button></div>${sec.character?`<img class="character-img" alt="Игровой персонаж" src="${sec.character}">`:'<div class="character-img" style="font-size:140px" aria-hidden="true">⚽</div>'}`;
    else if(gameState.screen==='question') content=questionMarkup();
    else if(gameState.screen==='football') content=footballMarkup();
    else if(gameState.screen==='halftime') content=`<div class="results-card"><div class="eyebrow">${t('halftime')}</div><h1>${gameState.goalsFor} : ${gameState.goalsAgainst}</h1><p>${t('halftimeText')}</p><button class="game-button" data-game-action="next-section">${t('startSecond')} →</button></div>`;
    else content=resultsMarkup();
    const bg=sec?.background||'';
    root.innerHTML=`<div class="game-bg" style="${bg?`background-image:url('${bg}')`:''}"></div><div class="pitch-lines"></div><header class="game-top"><div class="game-logo">⚽ FOOTBALL</div><div class="game-nav">${nav}</div><div class="scoreboard"><span>${t('score')} ${gameState.goalsFor}:${gameState.goalsAgainst}</span><span>${t('points')} ${gameState.points}</span></div></header><main class="game-content">${content}</main>`;
  }

  function questionMarkup(){
    const q=runtimeQuestions()[gameState.questionIndex]; if(!q){setTimeout(advanceSection,0);return '<div class="results-card">Загрузка…</div>';}
    let body='';
    if(['single','multiple'].includes(q.type)) body=`<div class="answers">${q.options.map(o=>`<button class="answer-btn ${gameState.selected.has(o.id)?'selected':''}" data-answer="${o.id}">${escapeHtml(o.text)}</button>`).join('')}</div>`;
    if(q.type==='text') body='<input id="runtimeTextAnswer" class="text-answer" autocomplete="off" placeholder="Введите ответ…">';
    if(q.type==='oral') body=`<p>${t('oral')}</p>`;
    if(q.type==='order'){if(!gameState.order.length)gameState.order=q.options.map(o=>o.id).sort(()=>Math.random()-.5);body=`<div class="sort-list">${gameState.order.map((id,i)=>{const o=q.options.find(x=>x.id===id);return `<div class="sort-item"><span>${escapeHtml(o?.text||'')}</span><button data-order-up="${i}" aria-label="Вверх">↑</button><button data-order-down="${i}" aria-label="Вниз">↓</button></div>`}).join('')}</div>`;}
    return `<section class="question-view ${gameState.feedbackClass}"><div class="question-meta"><span>${t('question')} ${gameState.questionIndex+1}/${runtimeQuestions().length}</span><span>+${q.points||project.basePoints}</span></div><h2>${escapeHtml(q.text)}</h2>${body}<div class="submit-row"><span class="feedback">${escapeHtml(gameState.feedback)}</span><button class="game-button" data-game-action="submit" ${gameState.locked?'disabled':''}>${q.type==='oral'?t('ready'):t('submit')}</button></div></section>`;
  }

  function footballMarkup(){return `<div class="football-view" id="footballField"><div class="goal"></div><div class="keeper"></div><div class="ball" role="button" tabindex="0" aria-label="Мяч">⚽</div><div class="aim-line" hidden></div><div class="shot-hint">${t('shoot')}</div></div>`;}
  function resultsMarkup(){const accuracy=gameState.checked?Math.round(gameState.correct/gameState.checked*100):0;return `<div class="results-card"><div class="eyebrow">${t('results')}</div><div class="result-score">${gameState.goalsFor} : ${gameState.goalsAgainst}</div><h2>${escapeHtml(project.teamName)}</h2><div class="stats"><div><b>${gameState.points}</b><span>${t('points')}</span></div><div><b>${accuracy}%</b><span>${t('accuracy')}</span></div><div><b>${gameState.correct}/${gameState.checked}</b><span>${t('right')}</span></div></div><button class="game-button" data-game-action="restart">↻ ${t('again')}</button></div>`;}

  function startSection(){const qs=runtimeQuestions();if(qs.length){gameState.screen='question';gameState.questionIndex=0;clearQuestionState();renderGame();}else advanceSection();}
  function clearQuestionState(){gameState.selected=new Set();gameState.order=[];gameState.feedback='';gameState.feedbackClass='';gameState.locked=false;}
  function submitAnswer(){
    if(gameState.locked)return; const q=runtimeQuestions()[gameState.questionIndex]; if(!q)return;
    let result='correct';
    if(q.type==='single'){const selected=[...gameState.selected];if(!selected.length)return toast('Выберите ответ');result=q.options.find(o=>o.id===selected[0])?.correct?'correct':'incorrect';}
    if(q.type==='multiple'){if(!gameState.selected.size)return toast('Выберите ответы');const expected=q.options.filter(o=>o.correct).map(o=>o.id).sort().join();const actual=[...gameState.selected].sort().join();result=expected===actual?'correct':'incorrect';}
    if(q.type==='text'){const value=$('#runtimeTextAnswer')?.value.trim().toLocaleLowerCase().replace(/ё/g,'е');if(!value)return toast('Введите ответ');result=q.accepted.some(a=>a.trim().toLocaleLowerCase().replace(/ё/g,'е')===value)?'correct':'incorrect';}
    if(q.type==='order'){const expected=q.options.map(o=>o.id);const count=gameState.order.filter((id,i)=>id===expected[i]).length;result=count===expected.length?'correct':count>0&&q.partial?'partial':'incorrect';}
    if(q.type!=='oral'){gameState.checked++;if(result==='correct')gameState.correct++;}
    const factor = result === 'correct' ? 1 : (result === 'partial' ? 0.5 : 0);
    gameState.points+=Math.round((q.points||project.basePoints)*factor);gameState.feedback=t(result);gameState.feedbackClass=result;gameState.locked=true;playTone(result);
    renderGame();setTimeout(()=>{gameState.screen='football';renderGame();requestAnimationFrame(setupFootball);},900);
  }

  function playTone(kind){if(!project.soundEnabled)return;try{const ctx=new (window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=kind==='correct'?620:220;gain.gain.setValueAtTime(.06,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.18);osc.start();osc.stop(ctx.currentTime+.2);}catch{}}

  function setupFootball(){
    const field=$('#footballField');if(!field)return;const ball=$('.ball',field),line=$('.aim-line',field),keeper=$('.keeper',field);let dragging=false,start=null;
    const point=e=>{const r=field.getBoundingClientRect(),p=e.touches?.[0]||e;return{x:p.clientX-r.left,y:p.clientY-r.top}};
    const begin=e=>{e.preventDefault();dragging=true;start=point(e);line.hidden=false;line.style.left=`${start.x}px`;line.style.top=`${start.y}px`;};
    const move=e=>{if(!dragging)return;e.preventDefault();const p=point(e),dx=start.x-p.x,dy=start.y-p.y,len=Math.min(130,Math.hypot(dx,dy)),angle=Math.atan2(dy,dx)*180/Math.PI;line.style.width=`${len}px`;line.style.transform=`rotate(${angle}deg)`;};
    const end=e=>{if(!dragging)return;dragging=false;const p=point(e.changedTouches?.[0]||e),dx=start.x-p.x,dy=start.y-p.y,power=Math.min(1,Math.hypot(dx,dy)/100);line.hidden=true;if(power<.15)return;animateShot(dx,dy,power,field,ball,keeper);};
    ball.addEventListener('pointerdown',begin);field.addEventListener('pointermove',move);field.addEventListener('pointerup',end);field.addEventListener('pointercancel',()=>dragging=false);
    ball.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();animateShot(100,(Math.random()-.5)*90,.8,field,ball,keeper);}});
  }

  function animateShot(dx,dy,power,field,ball,keeper){
    const q=runtimeQuestions()[gameState.questionIndex],wasCorrect=gameState.feedbackClass==='correct';let x=18,y=50;const targetY=Math.max(31,Math.min(69,50+dy*.3));const keeperChance={easy:.2,normal:.38,hard:.55}[project.difficulty];keeper.style.top=`${targetY+(Math.random()-.5)*35}%`;let startTime;
    function frame(ts){if(!startTime)startTime=ts;const p=Math.min(1,(ts-startTime)/(650/power));x=18+p*76;y=50+(targetY-50)*p-20*Math.sin(Math.PI*p);ball.style.left=`${x}%`;ball.style.top=`${y}%`;if(p<1)requestAnimationFrame(frame);else finish();}requestAnimationFrame(frame);
    function finish(){const saved=!wasCorrect||Math.random()<keeperChance;const label=saved?t('saved'):t('goal');if(saved)gameState.goalsAgainst+=wasCorrect?0:1;else{gameState.goalsFor++;gameState.points+=project.goalPoints;}field.insertAdjacentHTML('beforeend',`<div class="event-result">${label}</div>`);playTone(saved?'incorrect':'correct');setTimeout(nextQuestion,900);}
  }

  function nextQuestion(){gameState.questionIndex++;if(gameState.questionIndex<runtimeQuestions().length){gameState.screen='question';clearQuestionState();renderGame();}else advanceSection();}
  function advanceSection(){const sections=enabledSections(),current=sections[gameState.sectionIndex];if(current?.id==='first'&&sections.some(s=>s.id==='second')){gameState.screen='halftime';renderGame();return;}gameState.sectionIndex++;if(gameState.sectionIndex>=sections.length)gameState.screen='results';else gameState.screen='intro';clearQuestionState();renderGame();}

  function updateProjectFromControls(){project.meta.title=$('#projectTitle').value;project.locale=$('#localeSelect').value;project.difficulty=$('#difficultySelect').value;project.teamName=$('#teamName').value;project.basePoints=+$(' #basePoints').value||0;project.goalPoints=+$('#goalPoints').value||0;project.shuffleAnswers=$('#shuffleAnswers').checked;project.soundEnabled=$('#soundEnabled').checked;project.reducedMotion=$('#reducedMotion').checked;project.publicUrl=$('#publicUrl').value;project.theme={accent:$('#accentColor').value,card:$('#cardColor').value,text:$('#textColor').value,questionSize:+$('#questionSize').value,answerSize:+$('#answerSize').value,glow:+$('#glow').value};syncControls();markChanged();}

  function bindEvents(){
    $$('.editor-tabs button').forEach(b=>b.addEventListener('click',()=>{$$('.editor-tabs button').forEach(x=>x.classList.toggle('active',x===b));$$('.tab-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===b.dataset.tab));}));
    $('#sectionTabs').addEventListener('click',e=>{const b=e.target.closest('[data-section]');if(!b)return;activeSectionId=b.dataset.section;activeQuestionId=null;renderEditor();});
    $('#questionList').addEventListener('click',e=>{const b=e.target.closest('[data-question]');if(!b)return;activeQuestionId=b.dataset.question;renderEditor();});
    $('#addQuestion').addEventListener('click',()=>{const q=makeQuestion(activeSectionId,sectionQuestions().length);project.questions.push(q);activeQuestionId=q.id;renderEditor();markChanged(true);});
    ['projectTitle','localeSelect','difficultySelect','teamName','basePoints','goalPoints','shuffleAnswers','soundEnabled','reducedMotion','publicUrl','accentColor','cardColor','textColor','questionSize','answerSize','glow'].forEach(id=>$('#'+id).addEventListener(id.includes('Color')||['localeSelect','difficultySelect','shuffleAnswers','soundEnabled','reducedMotion'].includes(id)?'change':'input',updateProjectFromControls));
    $('#sectionEnabled').addEventListener('change',e=>{activeSection().enabled=e.target.checked;markChanged();renderGame();});
    $('#sectionTitle').addEventListener('input',e=>{activeSection().title[project.locale]=e.target.value;renderEditorTabsOnly();markChanged();});
    $('#sectionIntro').addEventListener('input',e=>{activeSection().intro[project.locale]=e.target.value;markChanged();});
    $('#questionEditor').addEventListener('input',questionEditorInput);$('#questionEditor').addEventListener('change',questionEditorInput);$('#questionEditor').addEventListener('click',questionEditorClick);
    $('#restartPreview').addEventListener('click',resetGame);$('#game').addEventListener('click',gameClick);
    $('#undoBtn').addEventListener('click',()=>restoreHistory(historyIndex-1));$('#redoBtn').addEventListener('click',()=>restoreHistory(historyIndex+1));
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();restoreHistory(historyIndex+(e.shiftKey?1:-1));}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();restoreHistory(historyIndex+1);}});
    $('#newBtn').addEventListener('click',()=>{if(!confirm('Создать новый проект? Нескачанные изменения будут заменены.'))return;project=defaultProject();project.questions=[makeQuestion('training'),makeQuestion('first'),makeQuestion('second')];activeSectionId='locker';activeQuestionId=null;history=[JSON.stringify(project)];historyIndex=0;syncControls();renderEditor();resetGame();markChanged(true);});
    $('#saveBtn').addEventListener('click',downloadProject);$('#loadBtn').addEventListener('click',()=>$('#projectFile').click());$('#projectFile').addEventListener('change',loadProject);
    $('#htmlBtn').addEventListener('click',()=>downloadHtml(false));$('#minifyBtn').addEventListener('click',showExportDialog);$('#embedBtn').addEventListener('click',showExportDialog);$('#downloadLight').addEventListener('click',()=>downloadHtml(true));$('#copyCode').addEventListener('click',copyExportCode);
    $('.dialog-close').addEventListener('click',()=>$('#exportDialog').close());
    $('#backgroundFile').addEventListener('change',e=>loadMedia(e,'background'));$('#characterFile').addEventListener('change',e=>loadMedia(e,'character'));$('#clearMedia').addEventListener('click',()=>{activeSection().background='';activeSection().character='';renderAssetPreviews();markChanged(true);});
    $$('.preview-toolbar [data-scale]').forEach(b=>b.addEventListener('click',()=>{$$('.preview-toolbar [data-scale]').forEach(x=>x.classList.toggle('active',x===b));$('#game').style.transform=`scale(${b.dataset.scale})`;}));$('#fullscreenBtn').addEventListener('click',()=>$('#game').requestFullscreen?.());
    $$('.mobile-switch button').forEach(b=>b.addEventListener('click',()=>{$$('.mobile-switch button').forEach(x=>x.classList.toggle('active',x===b));document.body.dataset.mobileView=b.dataset.view;}));document.body.dataset.mobileView='editor';
  }

  function renderEditorTabsOnly(){$$('#sectionTabs button').forEach(b=>{const s=project.sections.find(x=>x.id===b.dataset.section);b.textContent=localized(s.title);});}
  function questionEditorInput(e){const q=activeQuestion();if(!q)return;const el=e.target;if(el.id==='questionType'){q.type=el.value;if(q.type==='order')q.options.forEach(o=>o.correct=false);renderQuestionEditor();}else if(el.id==='questionText')q.text=el.value;else if(el.id==='questionPoints')q.points=+el.value||0;else if(el.id==='questionEvent')q.event=el.value;else if(el.id==='questionHint')q.hint=el.value;else if(el.id==='questionExplanation')q.explanation=el.value;else if(el.id==='acceptedAnswers')q.accepted=el.value.split('\n').filter(Boolean);else if(el.classList.contains('option-text'))q.options[+el.dataset.index].text=el.value;else if(el.classList.contains('correct-toggle')){if(q.type==='single')q.options.forEach((o,i)=>o.correct=i===+el.dataset.index);else q.options[+el.dataset.index].correct=el.checked;renderQuestionEditor();}renderQuestionChips();markChanged();}
  function renderQuestionChips(){const qs=sectionQuestions();$$('.question-chip').forEach((b,i)=>b.classList.toggle('invalid',!validQuestion(qs[i])));}
  function questionEditorClick(e){const q=activeQuestion();if(!q)return;if(e.target.id==='addOption'){q.options.push({id:uid(),text:`Вариант ${q.options.length+1}`,correct:false});renderQuestionEditor();markChanged(true);}if(e.target.closest('.remove-option')?.dataset.index){q.options.splice(+e.target.closest('.remove-option').dataset.index,1);renderQuestionEditor();markChanged(true);}if(e.target.id==='deleteQuestion'){if(confirm('Удалить задание?')){project.questions=project.questions.filter(x=>x.id!==q.id);activeQuestionId=null;renderEditor();markChanged(true);}}if(e.target.id==='duplicateQuestion'){const copy=clone(q);copy.id=uid();copy.options=copy.options.map(o=>({...o,id:uid()}));const idx=project.questions.findIndex(x=>x.id===q.id);project.questions.splice(idx+1,0,copy);activeQuestionId=copy.id;renderEditor();markChanged(true);}if(e.target.id==='moveQuestionLeft'||e.target.id==='moveQuestionRight'){const qs=sectionQuestions(),i=qs.findIndex(x=>x.id===q.id),swap=i+(e.target.id.endsWith('Left')?-1:1);if(swap>=0&&swap<qs.length){const a=project.questions.indexOf(q),b=project.questions.indexOf(qs[swap]);[project.questions[a],project.questions[b]]=[project.questions[b],project.questions[a]];renderEditor();markChanged(true);}}}

  function gameClick(e){const action=e.target.closest('[data-game-action]')?.dataset.gameAction;if(action==='start')startSection();if(action==='submit')submitAnswer();if(action==='restart')resetGame();if(action==='next-section'){gameState.sectionIndex++;gameState.screen='intro';clearQuestionState();renderGame();}const answer=e.target.closest('[data-answer]');if(answer&&!gameState.locked){const q=runtimeQuestions()[gameState.questionIndex];if(q.type==='single')gameState.selected=new Set([answer.dataset.answer]);else gameState.selected.has(answer.dataset.answer)?gameState.selected.delete(answer.dataset.answer):gameState.selected.add(answer.dataset.answer);renderGame();}const up=e.target.closest('[data-order-up]'),down=e.target.closest('[data-order-down]');if(up||down){const i=+(up?.dataset.orderUp??down.dataset.orderDown),j=i+(up?-1:1);if(j>=0&&j<gameState.order.length){[gameState.order[i],gameState.order[j]]=[gameState.order[j],gameState.order[i]];renderGame();}}}

  function loadMedia(e,key){const file=e.target.files[0];if(!file)return;if(file.size>8*1024*1024)return toast('Файл больше 8 МБ. Выберите более лёгкое изображение.');const reader=new FileReader();reader.onload=()=>{activeSection()[key]=reader.result;renderAssetPreviews();markChanged(true);};reader.readAsDataURL(file);e.target.value='';}
  function safeName(){return(project.meta.title||'football-game').trim().replace(/[^a-zа-яё0-9_-]+/gi,'-').replace(/^-|-$/g,'')||'football-game';}
  function downloadBlob(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function downloadProject(){commitHistory();downloadBlob(JSON.stringify(project,null,2),`${safeName()}.football-project.json`,'application/json');toast('Проект скачан');}
  async function loadProject(e){const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.schemaVersion!==1||!Array.isArray(data.sections)||!Array.isArray(data.questions))throw new Error('Неподдерживаемая структура');project={...defaultProject(),...data,theme:{...defaultProject().theme,...data.theme}};activeSectionId=project.sections[0]?.id||'locker';activeQuestionId=null;history=[JSON.stringify(project)];historyIndex=0;syncControls();renderEditor();resetGame();toast('Проект загружен');}catch(err){toast(`Не удалось загрузить: ${err.message}`);}e.target.value='';}

  function standaloneHtml(minified=false){
    const data=JSON.stringify(project).replace(/</g,'\\u003c');const css=document.querySelector('link[href="styles.css"]')?'': ''; // stylesheet is fetched below by caller when possible
    const runtime=`<!doctype html><html lang="${project.locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.meta.title)}</title><style>body{margin:0;background:#071c17;color:#fff;font-family:system-ui;display:grid;min-height:100vh;place-items:center}.wrap{width:min(100%,1000px);min-height:560px;background:#184f36;padding:30px;box-sizing:border-box}.top{display:flex;justify-content:space-between}.card{background:${project.theme.card};padding:28px;border-radius:18px;margin:8vh auto;max-width:720px;box-shadow:0 0 ${project.theme.glow}px ${project.theme.accent}66}button{font:inherit;padding:12px 18px;border:0;border-radius:9px;background:${project.theme.accent};color:#102018;font-weight:800;cursor:pointer}.answers{display:grid;gap:10px}.answers button{background:#ffffff18;color:#fff;text-align:left}.answers button.on{background:${project.theme.accent};color:#102018}.score{font-weight:800}h1{font-size:${project.theme.questionSize}px}.feedback{font-weight:900}.green{background:#0d5d38}.red{background:#79292e}footer{position:fixed;bottom:0;padding:8px;font-size:11px;color:#9ab1a7}</style><body><div id="game" class="wrap"></div><footer>Все права защищены и принадлежат Гальмиз Марии Александровне</footer><script>const P=${data},T=${JSON.stringify(I18N)},G={s:0,q:0,p:0,g:0,c:0,n:0,sel:null};const root=document.getElementById('game');function tx(k){return(T[P.locale]||T.ru)[k]||k}function secs(){return P.sections.filter(x=>x.enabled)}function qs(){return P.questions.filter(x=>x.sectionId===secs()[G.s]?.id)}function draw(){const S=secs()[G.s];if(!S)return root.innerHTML='<h1>No sections</h1>';if(G.s>=secs().length)return result();const Q=qs()[G.q];root.innerHTML='<div class="top"><b>⚽ '+P.teamName+'</b><span class="score">'+tx('score')+' '+G.g+':0 · '+tx('points')+' '+G.p+'</span></div>'+(Q?'<div class="card"><small>'+tx('question')+' '+(G.q+1)+'/'+qs().length+'</small><h1>'+esc(Q.text)+'</h1>'+question(Q)+'</div>':'<div class="card"><h1>'+esc(S.title[P.locale]||S.title.ru)+'</h1><p>'+esc(S.intro[P.locale]||S.intro.ru)+'</p><button onclick="nextSection()">'+tx('continue')+' →</button></div>')}function question(Q){if(Q.type==='oral')return '<p>'+tx('oral')+'</p><button onclick="check()">'+tx('ready')+'</button>';if(Q.type==='text')return '<input id="text" style="padding:12px;width:90%"><br><br><button onclick="check()">'+tx('submit')+'</button>';if(Q.type==='order')return '<div class="answers">'+Q.options.map((o,i)=>'<button onclick="this.parentNode.insertBefore(this,this.previousElementSibling)">'+(i+1)+'. '+esc(o.text)+'</button>').join('')+'</div><br><button onclick="check()">'+tx('submit')+'</button>';return '<div class="answers">'+Q.options.map(o=>'<button data-id="'+o.id+'" onclick="choose(this,\''+Q.type+'\')">'+esc(o.text)+'</button>').join('')+'</div><br><button onclick="check()">'+tx('submit')+'</button>'}function choose(b,type){if(type==='single')document.querySelectorAll('.answers button').forEach(x=>x.classList.remove('on'));b.classList.toggle('on')}function check(){const Q=qs()[G.q];let ok=true;if(Q.type==='single'||Q.type==='multiple'){const got=[...document.querySelectorAll('.answers .on')].map(x=>x.dataset.id).sort().join();ok=got&&got===Q.options.filter(x=>x.correct).map(x=>x.id).sort().join()}else if(Q.type==='text'){const v=document.getElementById('text').value.trim().toLowerCase().replace(/ё/g,'е');ok=Q.accepted.some(x=>x.trim().toLowerCase().replace(/ё/g,'е')===v)}else if(Q.type==='order'){ok=[...document.querySelectorAll('.answers button')].every((b,i)=>b.textContent.slice(b.textContent.indexOf('.')+2)===Q.options[i].text)}if(Q.type!=='oral'){G.n++;if(ok)G.c++}if(ok){G.p+=Q.points||P.basePoints;G.g++}const c=document.querySelector('.card');c.classList.add(ok?'green':'red');c.insertAdjacentHTML('beforeend','<p class="feedback">'+tx(ok?'correct':'incorrect')+'</p>');setTimeout(next,900)}function next(){G.q++;if(G.q>=qs().length)nextSection();else draw()}function nextSection(){G.s++;G.q=0;draw()}function result(){const a=G.n?Math.round(G.c/G.n*100):0;root.innerHTML='<div class="card"><h1>'+tx('results')+'</h1><h2>'+G.g+' : 0</h2><p>'+tx('points')+': '+G.p+' · '+tx('accuracy')+': '+a+'%</p><button onclick="location.reload()">'+tx('again')+'</button></div>'}function esc(s){return String(s||'').replace(/[&<>\"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]))}draw();<\/script></body></html>`;
    return minified?runtime.replace(/\n\s*/g,'').replace(/>\s+</g,'><'):runtime;
  }
  function downloadHtml(minified){downloadBlob(standaloneHtml(minified),`${safeName()}${minified?'-light':''}.html`,'text/html');toast(minified?'Облегчённый HTML скачан':'HTML-игра скачана');}
  function embedCode(){const url=project.publicUrl.trim();return url?`<div style="position:relative;width:100%;padding-top:56.25%;overflow:hidden"><iframe src="${escapeHtml(url)}" title="${escapeHtml(project.meta.title)}" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="autoplay; fullscreen" loading="lazy" allowfullscreen></iframe></div>`:'Сначала укажите публичный HTTPS-адрес игры во вкладке «Настройки». Затем скачайте HTML, разместите его на HTTPS-хостинге и вернитесь за готовым iframe-кодом.';}
  function showExportDialog(){$('#dialogTitle').textContent='Код для Genially';$('#dialogText').textContent=project.publicUrl?'Скопируйте адаптивный iframe-код и вставьте его в блок встраивания Genially.':'Для надёжного встраивания Genially игре нужен публичный HTTPS-адрес. Облегчённый HTML можно скачать уже сейчас.';$('#exportCode').value=embedCode();$('#copyStatus').textContent='';$('#exportDialog').showModal();}
  async function copyExportCode(){try{await navigator.clipboard.writeText($('#exportCode').value);$('#copyStatus').textContent='Код скопирован';}catch{$('#exportCode').select();document.execCommand('copy');$('#copyStatus').textContent='Код выделен для копирования';}}

  syncControls();bindEvents();renderEditor();resetGame();updateHistoryButtons();
})();
