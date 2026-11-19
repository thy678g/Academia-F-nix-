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
  $("studentsList").innerHTML = students.length ? students.map(s=>`<div class="student-row"><strong>${escapeHtml(s.full_name)}</strong><div class="muted">${escapeHtml(s.phone||"Telefone não informado")} • ${escapeHtml(s.status)}</div></div>`).join("") : '<div class="empty">Nenhum aluno cadastrado ainda.</div>';
  $("studentSelect").innerHTML = '<option value="">Selecione um aluno</option>'+students.filter(s=>s.status==="active").map(s=>`<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join("");
  const {data: exs} = await supabase.from("exercises").select("id,name,muscle_group").eq("is_active",true).order("muscle_group").order("name");
  exerciseCache = exs || [];
}

async function loadWorkouts(){
  const {data: plans,error} = await supabase.from("workout_plans").select("id,title,weekday,notes,workout_items(id,order_index,sets,reps,load,rest_seconds,notes,exercises(id,name,muscle_group,instructions,safety_notes,stages))").eq("student_id",currentProfile.id).eq("is_active",true).order("weekday");
  if(error){$("workouts").innerHTML=`<div class="empty">Não foi possível carregar os treinos: ${escapeHtml(error.message)}</div>`;return;}
  if(!plans?.length){$("workouts").innerHTML='<div class="empty">Seus treinos aparecerão aqui quando a professora fizer sua programação.</div>';return;}
  $("workouts").innerHTML=plans.map(p=>`<button class="day-card" data-plan="${p.id}"><span class="day">${weekdayNames[p.weekday]||"TREINO"}</span><strong>${escapeHtml(p.title)}</strong><small>${(p.workout_items||[]).length} exercício(s) • Toque para abrir</small></button>`).join("");
  $("workouts").querySelectorAll("[data-plan]").forEach(btn=>btn.addEventListener("click",()=>showPlan(plans.find(p=>p.id===btn.dataset.plan))));
}

function showPlan(plan){
  const items=(plan.workout_items||[]).sort((a,b)=>a.order_index-b.order_index);
  $("exerciseDetail").classList.remove("hidden");
  $("exerciseDetail").innerHTML=`<div class="eyebrow">${weekdayNames[plan.weekday]||"TREINO"}</div><h2>${escapeHtml(plan.title)}</h2><p class="muted">${escapeHtml(plan.notes||"Siga as orientações da professora.")}</p>`+
  (items.length?items.map((it,i)=>`<div class="exercise-row"><div><span class="badge">${i+1}. ${escapeHtml(it.exercises?.muscle_group||"EXERCÍCIO")}</span><h3>${escapeHtml(it.exercises?.name||"Exercício")}</h3><p class="muted">${it.sets?`${it.sets} série(s)`:""} ${it.reps?"• "+escapeHtml(it.reps):""} ${it.load?"• "+escapeHtml(it.load):""} ${it.rest_seconds!=null?"• descanso "+it.rest_seconds+"s":""}</p></div><button data-ex="${i}">Ver detalhes</button></div>`).join(""):'<div class="empty">A professora ainda não adicionou exercícios a este treino.</div>');
  $("exerciseDetail").querySelectorAll("[data-ex]").forEach(b=>b.addEventListener("click",()=>showExercise(items[Number(b.dataset.ex)].exercises)));
  $("exerciseDetail").scrollIntoView({behavior:"smooth",block:"start"});
}
function showExercise(ex){
  if(!ex)return;
  const stages=Array.isArray(ex.stages)?ex.stages:[];
  const detail=document.createElement("div");detail.className="stage";
  detail.innerHTML=`<h3>${escapeHtml(ex.name)}</h3><p>${escapeHtml(ex.instructions||"Siga a demonstração e a orientação da professora.")}</p>`+
    stages.map((s,i)=>`<p><b>Etapa ${i+1}:</b> ${escapeHtml(typeof s==="string"?s:(s.title||s.description||JSON.stringify(s)))}</p>`).join("")+
    (ex.safety_notes?`<p><b>Atenção:</b> ${escapeHtml(ex.safety_notes)}</p>`:"")+
    `<p class="muted">Demonstração ilustrada com a mascote original será adicionada na próxima etapa, após inserir a imagem oficial.</p>`;
  $("exerciseDetail").appendChild(detail);
}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();showMessage("loginMessage","Entrando…");
  const {data,error}=await supabase.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
  if(error){showMessage("loginMessage",error.message);return;}
  try{await startSession(data.session);}catch(err){await supabase.auth.signOut();showMessage("loginMessage",err.message);}
});
$("logoutBtn").addEventListener("click",async()=>{await supabase.auth.signOut();location.reload();});

$("planForm").addEventListener("submit",async e=>{
  e.preventDefault();showMessage("planMessage","Salvando treino…");
  const studentId=$("studentSelect").value;
  const {data:plan,error}=await supabase.from("workout_plans").insert({student_id:studentId,title:$("planTitle").value.trim(),weekday:Number($("weekday").value),notes:$("planNotes").value.trim()||null,created_by:currentProfile.id}).select().single();
  if(error){showMessage("planMessage","Não foi possível criar: "+error.message);return;}
  showMessage("planMessage","Treino criado! Para adicionar exercícios e séries, a próxima etapa do painel será ativada.");
  $("planTitle").value="";$("planNotes").value="";
});

supabase.auth.getSession().then(async({data:{session}})=>{
  if(session){try{await startSession(session);}catch(e){showMessage("loginMessage",e.message);}}
});
supabase.auth.onAuthStateChange(async(_event,session)=>{
  if(!session){$("appView").classList.add("hidden");$("loginView").classList.remove("hidden");$("logoutBtn").classList.add("hidden");}
});

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}
// CADASTRO DE ALUNOS - FÊNIX ACADEMIA
const studentForm = document.createElement("form");
studentForm.id = "studentInviteForm";
studentForm.className = "stack";
studentForm.innerHTML = `
  <hr>
  <h2>Cadastrar aluno</h2>
  <label>Nome do aluno
    <input id="newStudentName" required placeholder="Nome completo">
  </label>
  <label>E-mail
    <input id="newStudentEmail" type="email" required placeholder="E-mail do aluno">
  </label>
  <label>WhatsApp
    <input id="newStudentPhone" type="tel" required placeholder="DDD + número">
  </label>
  <button class="primary" type="submit">Gerar convite pelo WhatsApp</button>
  <p id="studentInviteMessage" class="message"></p>
`;

$("studentsList").insertAdjacentElement("afterend", studentForm);

studentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = $("newStudentName").value.trim();
  const email = $("newStudentEmail").value.trim();
  const phone = $("newStudentPhone").value.trim();

  const message = $("studentInviteMessage");
  message.textContent = "Gerando convite...";

  const { data, error } = await supabase.functions.invoke(
    "create-student-invite",
    {
      body: {
        full_name: name,
        email: email,
        phone: phone
      }
    }
  );

  if (error || !data?.action_link) {
    message.textContent =
      data?.error || error?.message || "Não foi possível gerar o convite.";
    return;
  }

  let number = phone.replace(/\D/g, "");
  if (number.length === 10 || number.length === 11) {
    number = "55" + number;
  }

  const text = `Olá, ${name}! Você foi convidado(a) para acessar a Fênix Academia. Abra este link para criar sua senha e entrar: ${data.action_link}`;

  message.textContent = "Convite gerado. Abrindo o WhatsApp...";
  window.open(
    "https://wa.me/" + number + "?text=" + encodeURIComponent(text),
    "_blank"
  );
});
