import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Configuração pública do projeto Supabase da Fênix Academia.
// A chave publishable/anon é própria para uso no navegador; nunca coloque service_role aqui.
const SUPABASE_URL = "https://zsnsygarbkkfdrlrrbow.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_5Afmlh_cvDbL41befC7-3g_J4fUjZMb";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
let currentProfile = null;
let exerciseCache = [];

const weekdayNames = {1:"Segunda-feira",2:"Terça-feira",3:"Quarta-feira",4:"Quinta-feira",5:"Sexta-feira",6:"Sábado",7:"Domingo"};
function showMessage(id, msg){ $(id).textContent = msg || ""; }
function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

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
  if(profileData.role === "admin"){
    $("adminView").classList.remove("hidden");
    $("adminBanner").classList.remove("hidden");
    await loadAdmin();
  }
  await loadWorkouts();
}

async function loadAdmin(){
  const {data: students,error} = await supabase.from("profiles").select("id,full_name,phone,status").eq("role","student").order("full_name");
  if(error){$("studentsList").innerHTML=`<p class="muted">Não foi possível carregar os alunos: ${escapeHtml(error.message)}</p>`;return;}
  $("studentsList").innerHTML = students.length ? students.map(s=>`<div class="student-row"><div><strong>${escapeHtml(s.full_name)}</strong><div class="muted">${escapeHtml(s.phone||"Telefone não informado")} • ${escapeHtml(s.status)}</div></div><button type="button" class="delete-student" data-delete-student="${s.id}" aria-label="Excluir ${escapeHtml(s.full_name)}">Excluir</button></div>`).join("") : '<div class="empty">Nenhum aluno cadastrado ainda.</div>';
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
    .select("id,title,weekday,student_id,workout_items(id,exercise_id,sets,reps,load,rest_seconds,notes,exercises(name))")
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
      `<div class="student-row"><div><strong>${i+1}. ${escapeHtml(it.exercises?.name||"Exercício")}</strong><div class="muted">${it.sets||"—"} série(s) • ${escapeHtml(it.reps||"Repetições não informadas")} • ${escapeHtml(it.load||"Sem carga")} • descanso ${it.rest_seconds??"—"}s</div></div></div>`
    ).join("") : '<div class="empty">Este treino ainda não tem exercícios.</div>');
}
$("adminPlanSelect").addEventListener("change",()=>{
  const plans=JSON.parse($("adminPlanSelect").dataset.plans||"[]");
  renderAdminPlanItems(plans.find(p=>p.id===$("adminPlanSelect").value));
});

async function loadWorkouts(){
  const {data: plans,error} = await supabase.from("workout_plans").select("id,title,weekday,notes,workout_items(id,order_index,sets,reps,load,rest_seconds,notes,exercises(id,name,muscle_group,instructions,safety_notes,stages,demo_media_url,demo_media_type))").eq("student_id",currentProfile.id).eq("is_active",true).order("weekday");
  if(error){$("workouts").innerHTML=`<div class="empty">Não foi possível carregar os treinos: ${escapeHtml(error.message)}</div>`;return;}
  if(!plans?.length){$("workouts").innerHTML='<div class="empty">Seus treinos aparecerão aqui quando a professora fizer sua programação.</div>';return;}
  $("workouts").innerHTML=plans.map(p=>`<button class="day-card" data-plan="${p.id}"><span class="day">${weekdayNames[p.weekday]||"TREINO"}</span><strong>${escapeHtml(p.title)}</strong><small>${(p.workout_items||[]).length} exercício(s) • Toque para abrir</small></button>`).join("");
  $("workouts").querySelectorAll("[data-plan]").forEach(btn=>btn.addEventListener("click",()=>showPlan(plans.find(p=>p.id===btn.dataset.plan))));
}

function showPlan(plan){
  const items=(plan.workout_items||[]).sort((a,b)=>a.order_index-b.order_index);
  $("exerciseDetail").classList.remove("hidden");
  $("exerciseDetail").innerHTML=`<div class="eyebrow">${weekdayNames[plan.weekday]||"TREINO"}</div><h2>${escapeHtml(plan.title)}</h2><p class="muted">${escapeHtml(plan.notes||"Siga as orientações da professora.")}</p>`+
  (items.length?items.map((it,i)=>{
    const ex=it.exercises||{};
    const stages=Array.isArray(ex.stages)?ex.stages:[];
    const details=`<div class="stage hidden" id="exerciseInfo${i}"><h3>${escapeHtml(ex.name||"Exercício")}</h3><p>${escapeHtml(ex.instructions||"Siga a demonstração e a orientação da professora.")}</p>`+
      stages.map((s,n)=>`<p><b>Etapa ${n+1}:</b> ${escapeHtml(typeof s==="string"?s:(s.title||s.description||JSON.stringify(s)))}</p>`).join("")+
      (ex.safety_notes?`<p><b>Atenção:</b> ${escapeHtml(ex.safety_notes)}</p>`:"")+
      `</div>`;
    return `<div class="exercise-card"><div class="exercise-row"><div><span class="badge">${i+1}. ${escapeHtml(ex.muscle_group||"EXERCÍCIO")}</span><h3>${escapeHtml(ex.name||"Exercício")}</h3><p class="muted">${it.sets?`${it.sets} série(s)`:""} ${it.reps?"• "+escapeHtml(it.reps):""} ${it.load?"• "+escapeHtml(it.load):""} ${it.rest_seconds!=null?"• descanso "+it.rest_seconds+"s":""}</p></div><button type="button" data-ex-toggle="${i}" aria-expanded="false">Ver detalhes</button></div>${details}</div>`;
  }).join(""):'<div class="empty">A professora ainda não adicionou exercícios a este treino.</div>');
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
function showExercise(ex){
  if(!ex)return;
  const stages=Array.isArray(ex.stages)?ex.stages:[];
  const detail=document.createElement("div");detail.className="stage";
  const media = ex.demo_media_url
    ? (ex.demo_media_type==="video"
      ? `<video class="exercise-demo-media" src="${escapeHtml(ex.demo_media_url)}" controls playsinline preload="metadata"></video>`
      : `<img class="exercise-demo-media" src="${escapeHtml(ex.demo_media_url)}" alt="Demonstração de ${escapeHtml(ex.name)}" loading="lazy">`)
    : `<p class="muted">A professora ainda não adicionou foto ou vídeo demonstrativo para este exercício.</p>`;
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
  try{await startSession(data.session);}catch(err){await supabase.auth.signOut();showMessage("loginMessage",err.message);}
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
  const mediaFile=$("customExerciseMedia").files?.[0]||null;
  if(!name||!group||!instructions){showMessage("customExerciseMessage","Preencha nome, grupo muscular e modo de execução.");return;}
  if(mediaFile && mediaFile.size>25*1024*1024){
    showMessage("customExerciseMessage","O arquivo deve ter no máximo 25 MB.");return;
  }
  const allowedTypes=["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime"];
  if(mediaFile && !allowedTypes.includes(mediaFile.type)){
    showMessage("customExerciseMessage","Envie uma imagem JPG, PNG, WEBP, GIF ou vídeo MP4, WEBM, MOV.");return;
  }

  showMessage("customExerciseMessage",mediaFile?"Enviando foto/vídeo e salvando exercício…":"Salvando exercício…");
  let demoMediaUrl=null, demoMediaType=null, uploadedPath=null;
  if(mediaFile){
    const extension=(mediaFile.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"");
    uploadedPath=`${crypto.randomUUID()}.${extension}`;
    const {error:uploadError}=await supabase.storage.from("exercise-demos").upload(uploadedPath,mediaFile,{
      cacheControl:"3600",upsert:false,contentType:mediaFile.type
    });
    if(uploadError){showMessage("customExerciseMessage","Não foi possível enviar a mídia: "+uploadError.message);return;}
    const {data:publicData}=supabase.storage.from("exercise-demos").getPublicUrl(uploadedPath);
    demoMediaUrl=publicData.publicUrl;
    demoMediaType=mediaFile.type.startsWith("video/")?"video":"image";
  }

  const slugBase=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"exercicio";
  const slug=slugBase+"-"+crypto.randomUUID().slice(0,8);
  const {data,error}=await supabase.from("exercises").insert({
    slug,name,muscle_group:group,instructions,safety_notes:safety||null,
    demo_media_url:demoMediaUrl,demo_media_type:demoMediaType,is_active:true
  }).select("id,name,muscle_group").single();

  if(error){
    if(uploadedPath) await supabase.storage.from("exercise-demos").remove([uploadedPath]);
    showMessage("customExerciseMessage","Não foi possível salvar: "+error.message);return;
  }
  showMessage("customExerciseMessage",mediaFile?"Exercício cadastrado com demonstração!":"Exercício cadastrado! Agora ele já pode ser selecionado no treino.");
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
  const file=$("existingExerciseMediaFile").files?.[0]||null;
  if(!exerciseId||!file){showMessage("existingExerciseMediaMessage","Escolha o exercício e o arquivo.");return;}
  if(file.size>25*1024*1024){showMessage("existingExerciseMediaMessage","O arquivo deve ter no máximo 25 MB.");return;}
  const allowed=["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime"];
  if(!allowed.includes(file.type)){showMessage("existingExerciseMediaMessage","Formato não aceito. Use JPG, PNG, WEBP, GIF, MP4, WEBM ou MOV.");return;}
  showMessage("existingExerciseMediaMessage","Enviando demonstração…");
  const ext=(file.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"");
  const path=`${crypto.randomUUID()}.${ext}`;
  const {error:uploadError}=await supabase.storage.from("exercise-demos").upload(path,file,{
    cacheControl:"3600",upsert:false,contentType:file.type
  });
  if(uploadError){showMessage("existingExerciseMediaMessage","Não foi possível enviar: "+uploadError.message);return;}
  const {data:publicData}=supabase.storage.from("exercise-demos").getPublicUrl(path);
  const mediaType=file.type.startsWith("video/")?"video":"image";
  const {error:updateError}=await supabase.from("exercises").update({
    demo_media_url:publicData.publicUrl,demo_media_type:mediaType
  }).eq("id",exerciseId);
  if(updateError){
    await supabase.storage.from("exercise-demos").remove([path]);
    showMessage("existingExerciseMediaMessage","Não foi possível salvar no exercício: "+updateError.message);return;
  }
  showMessage("existingExerciseMediaMessage","Demonstração salva! O aluno verá a mídia ao abrir os detalhes do exercício.");
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
    rest_seconds:rest?Number(rest):null,
    notes:$("itemNotes").value.trim()||null
  };
  const {error}=await supabase.from("workout_items").insert(payload);
  if(error){showMessage("itemMessage","Não foi possível adicionar: "+error.message);return;}
  showMessage("itemMessage","Exercício adicionado ao treino!");
  $("itemSets").value="";$("itemReps").value="";$("itemLoad").value="";
  $("itemRest").value="";$("itemNotes").value="";
  await loadAdmin();
});

supabase.auth.getSession().then(async({data:{session}})=>{
  if(session){try{await startSession(session);}catch(e){showMessage("loginMessage",e.message);}}
});
supabase.auth.onAuthStateChange(async(_event,session)=>{
  if(!session){$("appView").classList.add("hidden");$("loginView").classList.remove("hidden");$("logoutBtn").classList.add("hidden");}
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
