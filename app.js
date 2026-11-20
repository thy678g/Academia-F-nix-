import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Configuração pública do projeto Supabase da Fênix Academia.
// A chave publishable/anon é própria para uso no navegador; nunca coloque service_role aqui.
const SUPABASE_URL = "https://zsnsygarbkkfdrlrrbow.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_5Afmlh_cvDbL41befC7-3g_J4fUjZMb";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
let currentProfile = null;
let exerciseCache = [];
let completionCache = new Set();

const weekdayNames = {1:"Segunda-feira",2:"Terça-feira",3:"Quarta-feira",4:"Quinta-feira",5:"Sexta-feira",6:"Sábado",7:"Domingo"};
function showMessage(id, msg){ $(id).textContent = msg || ""; }
function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function tuitionAlertMarkup(rows, isTeacher=false){
  const today=new Date(); today.setHours(0,0,0,0);
  const alerts=(rows||[]).filter(s=>s.tuition_due_date && !(s.tuition_paid_at && new Date(s.tuition_paid_at+"T12:00:00").getFullYear()===new Date(s.tuition_due_date+"T00:00:00").getFullYear() && new Date(s.tuition_paid_at+"T12:00:00").getMonth()===new Date(s.tuition_due_date+"T00:00:00").getMonth())) .map(s=>{
    const due=new Date(s.tuition_due_date+"T00:00:00"); const days=Math.ceil((due-today)/86400000);
    return {...s,days};
  }).filter(s=>s.days<=5);
  if(!alerts.length)return "";
  const lines=alerts.map(s=>{
    const status=s.days<0?`Vencida há ${Math.abs(s.days)} dia(s)`:s.days===0?"Vence hoje":`Vence em ${s.days} dia(s)`;
    return `<li>${isTeacher?`<strong>${escapeHtml(s.full_name)}</strong> — `:""}${status} (${new Date(s.tuition_due_date+"T12:00:00").toLocaleDateString("pt-BR")})</li>`;
  }).join("");
  return `<strong>⚠️ ${isTeacher?"Alertas de mensalidade":"Lembrete de mensalidade"}</strong><ul>${lines}</ul>`;
}
function renderStudentTuitionAlert(){
  const el=$("tuitionAlert"); if(!el)return;
  if(currentProfile?.role==="student") el.innerHTML=tuitionAlertMarkup([currentProfile],false);
  el.classList.toggle("hidden",!el.innerHTML);
}

async function startSession(session){
  const {data: profileData,error} = await supabase.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
  if(error) throw error;
  if(!profileData){throw new Error("Seu cadastro ainda não foi liberado pela equipe. Peça ajuda à professora.");}
  if(profileData.status !== "active") throw new Error("Seu acesso está bloqueado. Procure a professora.");
  currentProfile = profileData;
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("userName").textContent = (profileData.full_name || "atleta").split(" ")[0];
  $("welcomeRole").textContent = profileData.role === "admin" ? "ÁREA DA PROFESSORA" : "ÁREA DO ALUNO";
  if(profileData.role === "student") renderStudentTuitionAlert();
  if(profileData.role === "admin"){
    $("adminView").classList.remove("hidden");
    $("adminBanner").classList.remove("hidden");
    $("teacherMenuBtn").classList.remove("hidden");
    await loadAdmin();
  }
  await loadWorkouts();
}

async function loadAdmin(){
  const {data: students,error} = await supabase.from("profiles").select("id,full_name,phone,status,weight_kg,monthly_fee,tuition_due_date,tuition_paid_at").eq("role","student").order("full_name");
  if(error){$("studentsList").innerHTML=`<p class="muted">Não foi possível carregar os alunos: ${escapeHtml(error.message)}</p>`;return;}
  $("tuitionAlert").innerHTML=tuitionAlertMarkup(students,true); $("tuitionAlert").classList.toggle("hidden",!$("tuitionAlert").innerHTML);
  $("studentsList").innerHTML = students.length ? students.map(s=>`<div class="student-card"><div class="student-card-top"><button type="button" class="student-name-button" data-student-details="${s.id}"><strong>${escapeHtml(s.full_name)}</strong><span>Ver informações　⌄</span></button><button type="button" class="delete-student" data-delete-student="${s.id}" aria-label="Excluir ${escapeHtml(s.full_name)}">Excluir</button></div><div class="student-details hidden" id="student-details-${s.id}"><div><small>WHATSAPP</small><strong>${escapeHtml(s.phone||"Não informado")}</strong></div><div><small>SITUAÇÃO</small><strong>${escapeHtml(s.status==="active"?"Ativo":"Bloqueado")}</strong></div><div class="student-management"><label>Peso atual (kg)<input type="number" min="0" max="500" step="0.1" data-weight="${s.id}" value="${s.weight_kg??""}" placeholder="Ex.: 68,5"></label><label>Mensalidade (R$)<input type="number" min="0" step="0.01" data-fee="${s.id}" value="${s.monthly_fee??""}" placeholder="Ex.: 120,00"></label><label>Vencimento<input type="date" data-due="${s.id}" value="${s.tuition_due_date||""}"></label><div class="tuition-status"><small>STATUS DA MENSALIDADE</small><strong>${s.tuition_paid_at&&s.tuition_due_date&&new Date(s.tuition_paid_at).getFullYear()===new Date(s.tuition_due_date).getFullYear()&&new Date(s.tuition_paid_at).getMonth()===new Date(s.tuition_due_date).getMonth()?"Pago neste mês":"Pendente"}</strong><span>Último pagamento: ${s.tuition_paid_at?new Date(s.tuition_paid_at+"T12:00:00").toLocaleDateString("pt-BR"):"Não registrado"}</span></div><button type="button" class="primary student-save-btn" data-save-student="${s.id}">Salvar informações</button><button type="button" class="student-paid-btn" data-paid-student="${s.id}">Registrar pagamento recebido</button><p class="message" data-student-message="${s.id}" aria-live="polite"></p></div></div></div>`).join("") : '<div class="empty">Nenhum aluno cadastrado ainda.</div>';
  $("studentsList").querySelectorAll("[data-student-details]").forEach(button=>button.addEventListener("click",()=>{const details=$("student-details-"+button.dataset.studentDetails);const opening=details.classList.contains("hidden");details.classList.toggle("hidden");button.querySelector("span").textContent=opening?"Ocultar informações　⌃":"Ver informações　⌄";}));
  $("studentsList").querySelectorAll("[data-save-student]").forEach(button=>button.addEventListener("click",async()=>{
    const id=button.dataset.saveStudent; const msg=document.querySelector(`[data-student-message="${id}"]`);
    const weight=document.querySelector(`[data-weight="${id}"]`).value;
    const fee=document.querySelector(`[data-fee="${id}"]`).value;
    const due=document.querySelector(`[data-due="${id}"]`).value;
    button.disabled=true; msg.textContent="Salvando…";
    const {error}=await supabase.from("profiles").update({weight_kg:weight===""?null:Number(weight),monthly_fee:fee===""?null:Number(fee),tuition_due_date:due||null}).eq("id",id);
    button.disabled=false; msg.textContent=error?`Não foi possível salvar: ${error.message}`:"Informações salvas!";
    if(!error) await loadAdmin();
  }));
  $("studentsList").querySelectorAll("[data-paid-student]").forEach(button=>button.addEventListener("click",async()=>{
    const id=button.dataset.paidStudent; const msg=document.querySelector(`[data-student-message="${id}"]`);
    button.disabled=true; msg.textContent="Registrando pagamento…";
    const {error}=await supabase.from("profiles").update({tuition_paid_at:new Date().toISOString().slice(0,10)}).eq("id",id);
    button.disabled=false; msg.textContent=error?`Não foi possível registrar: ${error.message}`:"Pagamento registrado!";
    if(!error) await loadAdmin();
  }));
  $("studentsList").querySelectorAll("[data-delete-student]").forEach(button=>button.addEventListener("click",async()=>{
    const studentId=button.dataset.deleteStudent;
    const student=students.find(s=>s.id===studentId);
    if(!student)return;
    if(!confirm(`Excluir ${student.full_name}? Esta ação também apaga os treinos e o histórico desse aluno. Não pode ser desfeita.`))return;
    button.disabled=true;button.textContent="Excluindo…";
    const {data,error}=await supabase.functions.invoke("delete-student",{body:{student_id:studentId}});
    if(error||!data?.success){alert(data?.error||error?.message||"Não foi possível excluir o aluno.");button.disabled=false;button.textContent="Excluir";return;}
    await loadAdmin();
  }));
  $("studentSelect").innerHTML = '<option value="">Selecione um aluno</option>'+students.filter(s=>s.status==="active").map(s=>`<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join("");
  const {data: exs} = await supabase.from("exercises").select("id,name,muscle_group").eq("is_active",true).order("muscle_group").order("name");
  exerciseCache = exs || [];
  const exerciseOptions = '<option value="">Selecione um exercício</option>' +
    exerciseCache.map(ex=>`<option value="${ex.id}">${escapeHtml(ex.name)} — ${escapeHtml(ex.muscle_group)}</option>`).join("");
  $("adminExerciseSelect").innerHTML = exerciseOptions;
  $("existingExerciseMediaSelect").innerHTML = exerciseOptions;
  await loadAdminWorkoutPlans(students);
}

async function loadAdminWorkoutPlans(students){
  const {data: plans,error} = await supabase.from("workout_plans")
    .select("id,title,weekday,student_id,workout_items(id,order_index,exercise_id,sets,reps,load,load_type,rest_seconds,notes,exercises(name))")
    .eq("is_active",true).order("created_at",{ascending:false});
  if(error){$("adminPlanSelect").innerHTML='<option value="">Não foi possível carregar os treinos</option>';return;}
  const studentNames = new Map(students.map(s=>[s.id,s.full_name]));
  $("adminPlanSelect").innerHTML = '<option value="">Selecione um treino</option>' +
    (plans||[]).map(p=>`<option value="${p.id}">${escapeHtml(studentNames.get(p.student_id)||"Aluno")} — ${escapeHtml(p.title)} (${weekdayNames[p.weekday]||"Treino"})</option>`).join("");
  if(plans?.length){
    $("adminPlanSelect").value=plans[0].id;
    renderAdminPlanItems(plans[0]);
  }else{
    $("adminPlanItems").innerHTML='<div class="empty">Crie um treino primeiro para adicionar exercícios.</div>';
  }
  $("adminPlanSelect").dataset.plans=JSON.stringify(plans||[]);
}
function renderAdminPlanItems(plan){
  const items=plan?.workout_items||[];
  $("adminPlanItems").innerHTML = `<h3>Exercícios neste treino</h3>` +
    (items.length ? items.sort((a,b)=>a.order_index-b.order_index).map((it,i)=>
      `<div class="student-row"><div><strong>${i+1}. ${escapeHtml(it.exercises?.name||"Exercício")}</strong><div class="muted">${it.sets||"—"} série(s) • ${escapeHtml(it.reps||"Repetições não informadas")} • ${escapeHtml(it.load?`${({dumbbell:"Halter",barbell:"Barra",plate:"Anilha",machine:"Máquina",bodyweight:"Peso corporal",other:"Carga"}[it.load_type]||"Carga")}: "Sem carga")} ${escapeHtml(it.load||"")} • descanso ${it.rest_seconds??"—"}s</div></div></div>`
    ).join("") : '<div class="empty">Este treino ainda não tem exercícios.</div>');
}
$("adminPlanSelect").addEventListener("change",()=>{
  const plans=JSON.parse($("adminPlanSelect").dataset.plans||"[]");
  renderAdminPlanItems(plans.find(p=>p.id===$("adminPlanSelect").value));
});

async function loadWorkouts(){
  const {data: plans,error} = await supabase.from("workout_plans").select("id,title,weekday,notes,workout_items(id,order_index,sets,reps,load,load_type,rest_seconds,notes,exercises(id,name,muscle_group,instructions,safety_notes,stages,demo_media_url,demo_media_type,demo_media))").eq("student_id",currentProfile.id).eq("is_active",true).order("weekday");
  if(error){$("workouts").innerHTML=`<div class="empty">Não foi possível carregar os treinos: ${escapeHtml(error.message)}</div>`;return;}
  const allItemIds=(plans||[]).flatMap(p=>(p.workout_items||[]).map(i=>i.id));
  completionCache=new Set();
  if(allItemIds.length){
    const {data: completed}=await supabase.from("workout_completions").select("workout_item_id").eq("student_id",currentProfile.id).in("workout_item_id",allItemIds);
    (completed||[]).forEach(row=>completionCache.add(row.workout_item_id));
  }
  if(!plans?.length){$("workouts").innerHTML='<div class="empty">Seus treinos aparecerão aqui quando a professora fizer sua programação.</div>';return;}
  $("workouts").innerHTML=plans.map(p=>{const items=p.workout_items||[];const done=items.length>0&&items.every(i=>completionCache.has(i.id));return `<button class="day-card ${done?'day-card-done':''}" data-plan="${p.id}"><span class="day">${weekdayNames[p.weekday]||"TREINO"}</span><strong>${escapeHtml(p.title)}</strong><small>${done?'✓ Treino concluído':`${items.length} exercício(s) • Toque para abrir`}</small></button>`}).join("");
  $("workouts").querySelectorAll("[data-plan]").forEach(btn=>btn.addEventListener("click",()=>showPlan(plans.find(p=>p.id===btn.dataset.plan))));
}

function exerciseMediaMarkup(ex){
  let media=Array.isArray(ex.demo_media)?ex.demo_media:[];
  if(!media.length && ex.demo_media_url){
    media=[{url:ex.demo_media_url,type:ex.demo_media_type||"image"}];
  }
  if(!media.length) return '<p class="muted">A professora ainda não adicionou fotos ou vídeos demonstrativos.</p>';
  return `<div class="exercise-media-gallery">${media.map((item,i)=>{
    const url=escapeHtml(item.url||item.publicUrl||"");
    const type=item.type||item.media_type||(String(item.mimeType||"").startsWith("video/")?"video":"image");
    if(!url)return "";
    return type==="video"
      ? `<video class="exercise-demo-media" src="${url}" controls playsinline preload="metadata">Seu navegador não reproduz este vídeo.</video>`
      : `<img class="exercise-demo-media" src="${url}" alt="Demonstração ${i+1} de ${escapeHtml(ex.name||"exercício")}" loading="lazy">`;
  }).join("")}</div>`;
}
function showPlan(plan){
  const items=(plan.workout_items||[]).sort((a,b)=>a.order_index-b.order_index);
  $("exerciseDetail").classList.remove("hidden");
  $("exerciseDetail").innerHTML=`<div class="eyebrow">${weekdayNames[plan.weekday]||"TREINO"}</div><h2>${escapeHtml(plan.title)}</h2><p class="muted">${escapeHtml(plan.notes||"Siga as orientações da professora.")}</p>`+
  (items.length?items.map((it,i)=>{
    const ex=it.exercises||{};
    const stages=Array.isArray(ex.stages)?ex.stages:[];
    const details=`<div class="stage hidden" id="exerciseInfo${i}"><h3>${escapeHtml(ex.name||"Exercício")}</h3>`+
      exerciseMediaMarkup(ex)+
      `<p>${escapeHtml(ex.instructions||"Siga a demonstração e a orientação da professora.")}</p>`+
      stages.map((s,n)=>`<p><b>Etapa ${n+1}:</b> ${escapeHtml(typeof s==="string"?s:(s.title||s.description||JSON.stringify(s)))}</p>`).join("")+
      (ex.safety_notes?`<p><b>Atenção:</b> ${escapeHtml(ex.safety_notes)}</p>`:"")+
      `</div>`;
    return `<div class="exercise-card"><div class="exercise-row"><div><span class="badge">${i+1}. ${escapeHtml(ex.muscle_group||"EXERCÍCIO")}</span><h3>${escapeHtml(ex.name||"Exercício")}</h3><p class="muted">${it.sets?`${it.sets} série(s)`:""} ${it.reps?"• "+escapeHtml(it.reps):""} ${it.load?"• "+escapeHtml(({dumbbell:"Halter",barbell:"Barra",plate:"Anilha",machine:"Máquina",bodyweight:"Peso corporal",other:"Carga"}[it.load_type]||"Carga")+": "+it.load):""} ${it.rest_seconds!=null?"• descanso "+it.rest_seconds+"s":""}</p></div><button type="button" data-ex-toggle="${i}" aria-expanded="false">Ver detalhes</button></div>${details}</div>`;
  }).join(""):'<div class="empty">A professora ainda não adicionou exercícios a este treino.</div>')+
  (items.length?`<button type="button" class="primary complete-workout-btn" id="completeWorkoutBtn">${items.every(it=>completionCache.has(it.id))?'Treino já concluído ✓':'Concluir treino'}</button>`:'');
  const completeBtn=$("completeWorkoutBtn");
  if(completeBtn){
    const alreadyDone=items.every(it=>completionCache.has(it.id));
    completeBtn.disabled=alreadyDone;
    completeBtn.addEventListener("click",()=>completeWorkout(plan,items,completeBtn));
  }
  $("exerciseDetail").querySelectorAll("[data-ex-toggle]").forEach(button=>button.addEventListener("click",()=>{
    const detail=$("exerciseInfo"+button.dataset.exToggle);
    if(!detail)return;
    const opening=detail.classList.contains("hidden");
    detail.classList.toggle("hidden",!opening);
    button.textContent=opening?"Ocultar detalhes":"Ver detalhes";
    button.setAttribute("aria-expanded",String(opening));
  }));
  $("exerciseDetail").scrollIntoView({behavior:"smooth",block:"start"});
}

async function completeWorkout(plan,items,button){
  if(!currentProfile||currentProfile.role!=="student"||!items.length)return;
  button.disabled=true;button.textContent="Registrando conclusão…";
  const pending=items.filter(item=>!completionCache.has(item.id));
  if(pending.length){
    const rows=pending.map(item=>({workout_item_id:item.id,student_id:currentProfile.id,completed_at:new Date().toISOString(),notes:null}));
    const {error}=await supabase.from("workout_completions").insert(rows);
    if(error){button.disabled=false;button.textContent="Tentar novamente";alert("Não foi possível registrar o treino: "+error.message);return;}
    pending.forEach(item=>completionCache.add(item.id));
  }
  const studentName=currentProfile.full_name||"Atleta";
  const card=`<article class="achievement-card" id="achievementCard"><div class="achievement-spark">✦</div><div class="achievement-kicker">TREINO CONCLUÍDO! 🔥</div><div class="achievement-name">${escapeHtml(studentName)}</div><div class="achievement-phrase">1% melhor que ontem.</div><p>Um passo de cada vez. Uma evolução todos os dias.</p><strong>EU FIZ A MINHA PARTE HOJE. 💪</strong><small>FÊNIX ACADEMIA</small></article><button type="button" class="primary share-achievement-btn" id="shareAchievementBtn">Compartilhar no WhatsApp</button>`;
  const old=$("achievementCard");if(old)old.remove();
  button.insertAdjacentHTML("afterend",card);
  button.textContent="Treino concluído ✓";
  button.disabled=true;
  $("shareAchievementBtn").addEventListener("click",async()=>{
    const shareText=`${studentName}\nTREINO CONCLUÍDO! 🔥\n1% MELHOR QUE ONTEM.\nUm passo de cada vez. Uma evolução todos os dias.\nEU FIZ A MINHA PARTE HOJE. 💪\nFÊNIX ACADEMIA`;
    try{
      const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1350;
      const ctx=canvas.getContext("2d");
      const bg=ctx.createLinearGradient(0,0,1080,1350);bg.addColorStop(0,"#3a1d10");bg.addColorStop(.48,"#17110e");bg.addColorStop(1,"#090909");ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1350);
      ctx.strokeStyle="#f47721";ctx.lineWidth=4;ctx.strokeRect(34,34,1012,1282);
      ctx.textAlign="center";ctx.fillStyle="#ff9a45";ctx.font="bold 76px Arial";ctx.fillText("✦",540,180);
      ctx.font="bold 66px Arial";ctx.fillText("TREINO CONCLUÍDO!",540,330);ctx.fillText("🔥",540,420);
      ctx.fillStyle="#ffffff";let name=studentName.toLocaleUpperCase("pt-BR");
      let nameFont= name.length>22?58:name.length>15?72:92;ctx.font=`bold ${nameFont}px Arial`;
      const words=name.split(/\s+/);let lines=[],line="";for(const word of words){const test=line?line+" "+word:word;if(ctx.measureText(test).width>900&&line){lines.push(line);line=word;}else line=test;}if(line)lines.push(line);
      let y=570-(lines.length-1)*48;lines.forEach(txt=>{ctx.fillText(txt,540,y);y+=nameFont+18;});
      ctx.fillStyle="#ffb477";ctx.font="bold 58px Arial";ctx.fillText("1% MELHOR QUE ONTEM.",540,820);
      ctx.fillStyle="#eee4db";ctx.font="36px Arial";ctx.fillText("Um passo de cada vez.",540,920);ctx.fillText("Uma evolução todos os dias.",540,970);
      ctx.fillStyle="#ffffff";ctx.font="bold 34px Arial";ctx.fillText("EU FIZ A MINHA PARTE HOJE. 💪",540,1100);
      ctx.fillStyle="#a99b90";ctx.font="bold 24px Arial";ctx.fillText("FÊNIX ACADEMIA",540,1250);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      const file=new File([blob],"treino-concluido-fenix.png",{type:"image/png"});
      if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:"Treino concluído — Fênix Academia",text:shareText,files:[file]});}
      else if(navigator.share){await navigator.share({title:"Treino concluído — Fênix Academia",text:shareText});}
      else{await navigator.clipboard.writeText(shareText);alert("Seu cartão está pronto na tela. A mensagem foi copiada para você compartilhar no Status do WhatsApp.");}
    }catch(err){if(err?.name!=="AbortError")alert("Não foi possível compartilhar neste aparelho. O cartão continua disponível na tela.");}
  });
  await loadWorkouts();
}

function showExercise(ex){
  if(!ex)return;
  const stages=Array.isArray(ex.stages)?ex.stages:[];
  const detail=document.createElement("div");detail.className="stage";
  const media = exerciseMediaMarkup(ex);
  detail.innerHTML=`<h3>${escapeHtml(ex.name)}</h3>${media}<p>${escapeHtml(ex.instructions||"Siga a demonstração e a orientação da professora.")}</p>`+
    stages.map((s,i)=>`<p><b>Etapa ${i+1}:</b> ${escapeHtml(typeof s==="string"?s:(s.title||s.description||JSON.stringify(s)))}</p>`).join("")+
    (ex.safety_notes?`<p><b>Atenção:</b> ${escapeHtml(ex.safety_notes)}</p>`:"");
  $("exerciseDetail").appendChild(detail);
}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();showMessage("loginMessage","Entrando…");
  const loginId=$("loginId").value.trim();
  const password=$("password").value;
  // Alunos informam o WhatsApp, mas autenticam por um e-mail interno
  // determinístico. Assim, o login não depende do provedor de SMS/Phone.
  const credentials = loginId.includes("@")
    ? { email: loginId.toLowerCase(), password }
    : { email: phoneLoginEmail(loginId), password };
  const {data,error}=await supabase.auth.signInWithPassword(credentials);
  if(error){showMessage("loginMessage",error.message);return;}
  try{await startSession(data.session);}catch(err){console.error("Falha ao abrir a área autenticada:",err);showMessage("loginMessage","Login realizado, mas não foi possível carregar a área: "+(err?.message||"erro inesperado")+". Sua sessão foi preservada; tente atualizar a página.");}
});
$("logoutBtn").addEventListener("click",async()=>{await supabase.auth.signOut();location.reload();});

$("planForm").addEventListener("submit",async e=>{
  e.preventDefault();showMessage("planMessage","Salvando treino…");
  const studentId=$("studentSelect").value;
  const {data:plan,error}=await supabase.from("workout_plans").insert({student_id:studentId,title:$("planTitle").value.trim(),weekday:Number($("weekday").value),notes:$("planNotes").value.trim()||null,created_by:currentProfile.id}).select().single();
  if(error){showMessage("planMessage","Não foi possível criar: "+error.message);return;}
  showMessage("planMessage","Treino criado! Agora você já pode adicionar exercícios abaixo.");
  $("planTitle").value="";$("planNotes").value="";
  await loadAdmin();
});

$("customExerciseForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const name=$("customExerciseName").value.trim();
  const group=$("customExerciseGroup").value.trim();
  const instructions=$("customExerciseInstructions").value.trim();
  const safety=$("customExerciseSafety").value.trim();
  const files=Array.from($("customExerciseMedia").files||[]);
  if(!name||!group||!instructions){showMessage("customExerciseMessage","Preencha nome, grupo muscular e modo de execução.");return;}
  const allowed=["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime"];
  if(files.some(f=>f.size>25*1024*1024)){showMessage("customExerciseMessage","Cada arquivo deve ter no máximo 25 MB.");return;}
  if(files.some(f=>!allowed.includes(f.type))){showMessage("customExerciseMessage","Use JPG, PNG, WEBP, GIF, MP4, WEBM ou MOV.");return;}
  showMessage("customExerciseMessage",files.length?"Enviando fotos/vídeos e salvando exercício…":"Salvando exercício…");
  const uploaded=[];
  for(const file of files){
    const ext=(file.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"");
    const path=`${crypto.randomUUID()}.${ext}`;
    const {error:uploadError}=await supabase.storage.from("exercise-demos").upload(path,file,{
      cacheControl:"3600",upsert:false,contentType:file.type
    });
    if(uploadError){
      if(uploaded.length) await supabase.storage.from("exercise-demos").remove(uploaded.map(x=>x.path));
      showMessage("customExerciseMessage","Não foi possível enviar a mídia: "+uploadError.message);return;
    }
    const {data:publicData}=supabase.storage.from("exercise-demos").getPublicUrl(path);
    uploaded.push({path,url:publicData.publicUrl,type:file.type.startsWith("video/")?"video":"image"});
  }
  const slugBase=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"exercicio";
  const slug=slugBase+"-"+crypto.randomUUID().slice(0,8);
  const {data,error}=await supabase.from("exercises").insert({
    slug,name,muscle_group:group,instructions,safety_notes:safety||null,
    demo_media:uploaded.map(({url,type})=>({url,type})),
    demo_media_url:uploaded[0]?.url||null,demo_media_type:uploaded[0]?.type||null,is_active:true
  }).select("id,name,muscle_group").single();
  if(error){
    if(uploaded.length) await supabase.storage.from("exercise-demos").remove(uploaded.map(x=>x.path));
    showMessage("customExerciseMessage","Não foi possível salvar: "+error.message);return;
  }
  showMessage("customExerciseMessage",files.length?"Exercício cadastrado com fotos/vídeos!":"Exercício cadastrado! Agora ele já pode ser selecionado no treino.");
  $("customExerciseForm").reset();
  const {data: exs}=await supabase.from("exercises").select("id,name,muscle_group").eq("is_active",true).order("muscle_group").order("name");
  exerciseCache=exs||[];
  const exerciseOptions='<option value="">Selecione um exercício</option>'+
    exerciseCache.map(ex=>`<option value="${ex.id}">${escapeHtml(ex.name)} — ${escapeHtml(ex.muscle_group)}</option>`).join("");
  $("adminExerciseSelect").innerHTML=exerciseOptions;
  $("existingExerciseMediaSelect").innerHTML=exerciseOptions;
  $("adminExerciseSelect").value=data.id;
  $("existingExerciseMediaSelect").value=data.id;
});

$("existingExerciseMediaForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const exerciseId=$("existingExerciseMediaSelect").value;
  const files=Array.from($("existingExerciseMediaFile").files||[]);
  if(!exerciseId||!files.length){showMessage("existingExerciseMediaMessage","Escolha o exercício e pelo menos um arquivo.");return;}
  const allowed=["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime"];
  if(files.some(f=>f.size>25*1024*1024)){showMessage("existingExerciseMediaMessage","Cada arquivo deve ter no máximo 25 MB.");return;}
  if(files.some(f=>!allowed.includes(f.type))){showMessage("existingExerciseMediaMessage","Use JPG, PNG, WEBP, GIF, MP4, WEBM ou MOV.");return;}
  showMessage("existingExerciseMediaMessage","Enviando fotos/vídeos…");
  const {data:current,error:readError}=await supabase.from("exercises").select("demo_media,demo_media_url,demo_media_type").eq("id",exerciseId).single();
  if(readError){showMessage("existingExerciseMediaMessage","Não foi possível abrir o exercício: "+readError.message);return;}
  let currentMedia=Array.isArray(current.demo_media)?current.demo_media:[];
  if(!currentMedia.length&&current.demo_media_url){
    currentMedia=[{url:current.demo_media_url,type:current.demo_media_type||"image"}];
  }
  const uploaded=[];
  for(const file of files){
    const ext=(file.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"");
    const path=`${crypto.randomUUID()}.${ext}`;
    const {error:uploadError}=await supabase.storage.from("exercise-demos").upload(path,file,{
      cacheControl:"3600",upsert:false,contentType:file.type
    });
    if(uploadError){
      if(uploaded.length) await supabase.storage.from("exercise-demos").remove(uploaded.map(x=>x.path));
      showMessage("existingExerciseMediaMessage","Não foi possível enviar: "+uploadError.message);return;
    }
    const {data:publicData}=supabase.storage.from("exercise-demos").getPublicUrl(path);
    uploaded.push({path,url:publicData.publicUrl,type:file.type.startsWith("video/")?"video":"image"});
  }
  const allMedia=[...currentMedia,...uploaded.map(({url,type})=>({url,type}))];
  const {error:updateError}=await supabase.from("exercises").update({
    demo_media:allMedia,
    demo_media_url:allMedia[0]?.url||null,
    demo_media_type:allMedia[0]?.type||null
  }).eq("id",exerciseId);
  if(updateError){
    await supabase.storage.from("exercise-demos").remove(uploaded.map(x=>x.path));
    showMessage("existingExerciseMediaMessage","Não foi possível salvar no exercício: "+updateError.message);return;
  }
  showMessage("existingExerciseMediaMessage","Fotos e vídeos adicionados! O aluno verá todos ao abrir os detalhes.");
  $("existingExerciseMediaForm").reset();
});

$("workoutItemForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const planId=$("adminPlanSelect").value;
  const exerciseId=$("adminExerciseSelect").value;
  if(!planId||!exerciseId){showMessage("itemMessage","Selecione o treino e o exercício.");return;}
  showMessage("itemMessage","Adicionando exercício…");
  const {count,error:countError}=await supabase.from("workout_items").select("id",{count:"exact",head:true}).eq("plan_id",planId);
  if(countError){showMessage("itemMessage","Não foi possível consultar o treino: "+countError.message);return;}
  const sets=$("itemSets").value.trim();
  const rest=$("itemRest").value.trim();
  const payload={
    plan_id:planId,
    exercise_id:exerciseId,
    order_index:count||0,
    sets:sets?Number(sets):null,
    reps:$("itemReps").value.trim()||null,
    load:$("itemLoad").value.trim()||null,
    load_type:$("itemLoadType").value,
    rest_seconds:rest?Number(rest):null,
    notes:$("itemNotes").value.trim()||null
  };
  const {error}=await supabase.from("workout_items").insert(payload);
  if(error){showMessage("itemMessage","Não foi possível adicionar: "+error.message);return;}
  showMessage("itemMessage","Exercício adicionado ao treino!");
  $("itemSets").value="";$("itemReps").value="";$("itemLoad").value="";$("itemLoadType").value="dumbbell";
  $("itemRest").value="";$("itemNotes").value="";
  await loadAdmin();
});

// Menu compacto da professora e navegação entre áreas do painel.
$("teacherMenuBtn").addEventListener("click",()=>{
  const nav=$("teacherNav"); const opening=nav.classList.contains("hidden");
  nav.classList.toggle("hidden"); $("teacherMenuBtn").setAttribute("aria-expanded",String(opening));
});
$("teacherNav").querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{
  $("teacherNav").classList.add("hidden"); $("teacherMenuBtn").setAttribute("aria-expanded","false");
  const target=link.getAttribute("href");
  document.querySelectorAll("#adminView .admin-section").forEach(section=>section.classList.toggle("hidden", "#"+section.id!==target));
  document.querySelector(target)?.scrollIntoView({behavior:"smooth",block:"start"});
}));
// Mostra apenas a área de alunos ao entrar; as demais ficam acessíveis pelo menu.
function showTeacherSection(id){document.querySelectorAll("#adminView .admin-section").forEach(section=>section.classList.toggle("hidden",section.id!==id));}
showTeacherSection("studentSection");
document.querySelectorAll("[data-exercise-mode]").forEach(button=>button.addEventListener("click",()=>{
  const media=button.dataset.exerciseMode==="media";
  $("newExercisePane").classList.toggle("hidden",media);
  $("existingMediaPane").classList.toggle("hidden",!media);
  document.querySelectorAll("[data-exercise-mode]").forEach(tab=>tab.classList.toggle("active",tab===button));
}));

supabase.auth.getSession().then(async({data:{session}})=>{
  if(session){try{await startSession(session);}catch(e){console.error("Falha ao restaurar sessão:",e);showMessage("loginMessage","Sua sessão continua ativa, mas a área não carregou: "+(e?.message||"erro inesperado")+". Atualize a página para tentar novamente.");}}
});
supabase.auth.onAuthStateChange(async(_event,session)=>{
  if(!session){$("appView").classList.add("hidden");$("loginView").classList.remove("hidden");$("logoutBtn").classList.add("hidden");$("teacherMenuBtn").classList.add("hidden");$("teacherNav").classList.add("hidden");}
});

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}
function normalizePhone(value){
  let digits=String(value||"").replace(/\D/g,"");
  if(digits.length===10||digits.length===11) digits="55"+digits;
  return digits.startsWith("+")?digits:"+"+digits;
}
function phoneLoginEmail(value){
  const phone=normalizePhone(value);
  const digits=phone.replace(/\D/g,"");
  return `aluno.${digits}@acesso.fenixacademia.com`;
}

// Cadastro de alunos: nome e WhatsApp, sem exigir e-mail.
const studentForm = document.createElement("form");
studentForm.id = "studentInviteForm";
studentForm.className = "stack";
studentForm.innerHTML = `
  <hr><h2>Cadastrar aluno</h2>
  <label>Nome do aluno<input id="newStudentName" required placeholder="Nome completo"></label>
  <label>WhatsApp<input id="newStudentPhone" type="tel" inputmode="tel" required placeholder="DDD + número"></label>
  <button class="primary" type="submit">Enviar convite pelo WhatsApp</button>
  <p id="studentInviteMessage" class="message" aria-live="polite"></p>`;
$("studentsList").insertAdjacentElement("afterend", studentForm);

studentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name=$("newStudentName").value.trim();
  const phone=normalizePhone($("newStudentPhone").value);
  const message=$("studentInviteMessage");
  message.textContent="Gerando convite…";
  const {data,error}=await supabase.functions.invoke("create-student-invite",{body:{full_name:name,phone}});
  if(error||!data?.invite_url){message.textContent=data?.error||error?.message||"Não foi possível gerar o convite.";return;}
  const digits=phone.replace(/\D/g,"");
  const text=`Olá, ${name}! Você foi convidado(a) para acessar a Fênix Academia. Abra este link para criar sua senha: ${data.invite_url}`;
  message.textContent="Convite criado. Abrindo o WhatsApp…";
  window.open("https://wa.me/"+digits+"?text="+encodeURIComponent(text),"_blank");
  $("newStudentName").value="";$("newStudentPhone").value="";
});

// O convite é validado no servidor; o aluno define a própria senha.
const inviteToken=new URLSearchParams(location.search).get("convite");
if(inviteToken){
  $("claimInvite").classList.remove("hidden");
  $("claimInvite").scrollIntoView({behavior:"smooth",block:"center"});
  $("claimForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const password=$("claimPassword").value;
    if(password!==$("claimPasswordConfirm").value){showMessage("claimMessage","As senhas não conferem.");return;}
    showMessage("claimMessage","Ativando seu acesso…");
    const {data,error}=await supabase.functions.invoke("claim-student-invite",{body:{token:inviteToken,password}});
    if(error||!data?.success){showMessage("claimMessage",data?.error||error?.message||"Não foi possível ativar o convite.");return;}
    showMessage("claimMessage","Acesso criado! Agora entre com seu WhatsApp e a senha que acabou de cadastrar.");
    $("loginId").value=data.phone||"";
    $("claimForm").reset();
    history.replaceState({},"",location.pathname);
  });
}


// Botão para mostrar ou ocultar a senha digitada.
document.querySelectorAll("[data-toggle-password]").forEach(button=>{
  button.addEventListener("click",()=>{
    const field=$(button.dataset.togglePassword);
    if(!field)return;
    const showing=field.type==="password";
    field.type=showing?"text":"password";
    button.setAttribute("aria-label",showing?"Ocultar senha":"Mostrar senha");
    button.textContent=showing?"🙈":"👁️";
  });
});
