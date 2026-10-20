import React, { useEffect, useMemo, useState } from 'react'
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, updateProfile
} from 'firebase/auth'
import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, storage } from './firebase'
import {
  Activity, ClipboardCheck, ShoppingCart, Package, Users, LogOut, Menu, X, Clock3, CheckCircle2,
  Camera, Plus, Minus, Trash2, ShieldCheck, CalendarDays, Boxes, RefreshCw
} from 'lucide-react'

const CATEGORIES = [
  { id:'limpeza', label:'Produtos de limpeza', roles:['admin','limpeza'], examples:['Detergente de chão','Limpa-vidros','Desinfetante','Sacos do lixo','Papel higiénico'] },
  { id:'escritorio', label:'Escritório & receção', roles:['admin','rececao'], examples:['Papel A4','Canetas','Agrafador','Toner','Etiquetas'] },
  { id:'socorros', label:'Primeiros socorros', roles:['admin','rececao'], examples:['Ligaduras','Álcool','Pensos rápidos','Compressas','Luvas descartáveis'] },
  { id:'equipamentos', label:'Equipamentos do ginásio', roles:['admin','rececao'], examples:['Elásticos','Barras','Bolas','Colchonetes'] }
]
const TASK_SEED = [
  { title:'Higienizar balneários', frequency:'Diária', area:'Balneários' },
  { title:'Limpar chão do ginásio', frequency:'Diária', area:'Sala de treino' },
  { title:'Limpar espelhos e vidros', frequency:'Diária', area:'Sala de treino' },
  { title:'Repor consumíveis', frequency:'Diária', area:'Balneários e WC' },
  { title:'Limpeza profunda de equipamentos', frequency:'Semanal', area:'Sala de treino' }
]
const moneyDate = value => value?.toDate ? value.toDate().toLocaleString('pt-PT') : value ? new Date(value).toLocaleString('pt-PT') : '—'
const dateKey = () => new Date().toLocaleDateString('sv-SE')
const monthKey = () => new Date().toISOString().slice(0,7)
const cx = (...a) => a.filter(Boolean).join(' ')

function App() {
  const [user,setUser] = useState(null), [profile,setProfile] = useState(null), [loading,setLoading] = useState(true)
  const [email,setEmail] = useState(''), [password,setPassword] = useState(''), [authError,setAuthError] = useState('')
  const [tab,setTab] = useState('home'), [mobileMenu,setMobileMenu] = useState(false)
  const [notice,setNotice] = useState(''), [turns,setTurns] = useState([]), [tasks,setTasks] = useState([])
  const [completions,setCompletions] = useState([]), [requests,setRequests] = useState([]), [catalog,setCatalog] = useState([])
  const [towels,setTowels] = useState([]), [users,setUsers] = useState([])
  const [busy,setBusy] = useState(false)

  useEffect(() => onAuthStateChanged(auth, async u => {
    setUser(u)
    if (u) {
      const snap = await getDoc(doc(db,'users',u.uid))
      setProfile(snap.exists() ? snap.data() : null)
    } else setProfile(null)
    setLoading(false)
  }), [])

  useEffect(() => {
    if (!user || !profile) return
    const unsub = []
    const subscribe = (name, setter, sortField='createdAt') => {
      try { unsub.push(onSnapshot(query(collection(db,name), orderBy(sortField,'desc')), s => setter(s.docs.map(d=>({id:d.id,...d.data()}))), e => console.error(name,e))) }
      catch(e) { console.error(e) }
    }
    subscribe('turns',setTurns,'startedAt')
    subscribe('tasks',setTasks,'createdAt')
    subscribe('taskCompletions',setCompletions,'completedAt')
    subscribe('purchaseRequests',setRequests,'createdAt')
    subscribe('catalog',setCatalog,'updatedAt')
    subscribe('towelCounts',setTowels,'createdAt')
    if (profile.role === 'admin') subscribe('users',setUsers,'createdAt')
    return () => unsub.forEach(fn=>fn())
  }, [user,profile?.role])

  const role = profile?.role
  const activeTurn = turns.find(t=>t.uid===user?.uid && t.status==='open')
  const myTasks = useMemo(()=>tasks.filter(t=>t.active!==false),[tasks])
  const completedToday = completions.filter(c=>c.uid===user?.uid && c.day===dateKey()).length

  const flash = msg => { setNotice(msg); setTimeout(()=>setNotice(''),3500) }
  const run = async fn => { setBusy(true); try { await fn() } catch(e) { console.error(e); flash(e.message || 'Ocorreu um erro.') } finally { setBusy(false) } }
  const login = e => { e.preventDefault(); setAuthError(''); run(async()=>{await signInWithEmailAndPassword(auth,email,password)}) }
  const logout = () => signOut(auth)

  const startShift = () => run(async()=>{
    if (activeTurn) return flash('Já existe um turno aberto.')
    await addDoc(collection(db,'turns'), { uid:user.uid, displayName:profile.name || user.email, email:user.email, startedAt:serverTimestamp(), startedClientAt:new Date().toISOString(), status:'open', createdAt:serverTimestamp() })
    flash('Turno iniciado.')
  })
  const endShift = () => run(async()=>{
    if (!activeTurn) return
    await updateDoc(doc(db,'turns',activeTurn.id), { endedAt:serverTimestamp(), endedClientAt:new Date().toISOString(), status:'closed' })
    flash('Turno terminado.')
  })
  const addTask = () => run(async()=>{
    const title = prompt('Nome da tarefa?')?.trim(); if (!title) return
    const frequency = prompt('Frequência (Diária ou Semanal)?','Diária') || 'Diária'
    await addDoc(collection(db,'tasks'),{title,frequency,area:'Geral',active:true,createdAt:serverTimestamp(),createdBy:user.uid})
    flash('Tarefa criada.')
  })
  const completeTask = (task, file) => run(async()=>{
    if (!file) return flash('É obrigatória uma fotografia de comprovação.')
    const path = `evidence/${user.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
    const storageRef = ref(storage,path)
    await uploadBytes(storageRef,file,{contentType:file.type})
    const photoURL = await getDownloadURL(storageRef)
    await addDoc(collection(db,'taskCompletions'),{taskId:task.id,taskTitle:task.title,uid:user.uid,displayName:profile.name||user.email,photoURL,photoPath:path,completedAt:serverTimestamp(),day:dateKey()})
    flash('Tarefa concluída com fotografia.')
  })
  const submitPurchase = (category, items, other) => run(async()=>{
    const selected = Object.entries(items).filter(([,v])=>Number(v)>0).map(([name,quantity])=>({name,quantity:Number(quantity)}))
    if (other?.trim()) selected.push({name:other.trim(),quantity:1})
    if (!selected.length) return flash('Adicione pelo menos um artigo ao pedido.')
    const settings = await getDoc(doc(db,'settings','purchases'))
    const cutoff = settings.exists() ? Number(settings.data().cutoffDay||15) : 15
    const now = new Date()
    if (now.getDate()>cutoff) return flash(`O prazo de pedidos deste mês terminou no dia ${cutoff}.`)
    await addDoc(collection(db,'purchaseRequests'),{category,items:selected,uid:user.uid,displayName:profile.name||user.email,email:user.email,status:'pending',createdAt:serverTimestamp(),month:monthKey()})
    flash('Pedido enviado para aprovação.')
  })
  const saveCutoff = () => run(async()=>{
    const val = Number(prompt('Dia limite mensal (1–28):','15'))
    if (!Number.isInteger(val)||val<1||val>28) return flash('Indique um dia entre 1 e 28.')
    await setDoc(doc(db,'settings','purchases'),{cutoffDay:val,updatedAt:serverTimestamp()},{merge:true})
    flash('Prazo mensal atualizado.')
  })
  const setRequestStatus = (r,status) => run(()=>updateDoc(doc(db,'purchaseRequests',r.id),{status,reviewedBy:user.uid,reviewedAt:serverTimestamp()}))
  const addCatalogItem = category => run(async()=>{
    const name=prompt('Nome do artigo?')?.trim(); if(!name) return
    await addDoc(collection(db,'catalog'),{name,category,active:true,updatedAt:serverTimestamp(),createdBy:user.uid})
    flash('Artigo adicionado ao catálogo.')
  })
  const deleteCatalogItem = id => run(async()=>{ if(confirm('Remover este artigo do catálogo?')) await updateDoc(doc(db,'catalog',id),{active:false,updatedAt:serverTimestamp()}) })
  const saveTowels = (e) => {
    e.preventDefault()
    const formElement = e.currentTarget
    const form = new FormData(formElement)
    const previous=Number(form.get('previous')), purchases=Number(form.get('purchases')), counted=Number(form.get('counted'))
    if ([previous,purchases,counted].some(n=>!Number.isFinite(n)||n<0)) return flash('Introduza quantidades válidas.')
    run(async()=>{ await addDoc(collection(db,'towelCounts'),{previous,purchases,counted,losses:(previous+purchases)-counted,month:monthKey(),weekStart:dateKey(),uid:user.uid,displayName:profile.name||user.email,createdAt:serverTimestamp()}); formElement.reset(); flash('Contagem registada.') })
  }
  const createUser = () => run(async()=>{
    const name=prompt('Nome do colaborador?')?.trim(); if(!name)return
    const newEmail=prompt('Email de acesso?')?.trim(); if(!newEmail)return
    const pw=prompt('Palavra-passe temporária (mínimo 6 caracteres):')||''
    if(pw.length<6)return flash('A palavra-passe deve ter pelo menos 6 caracteres.')
    const newRole=prompt('Perfil: admin, limpeza ou rececao','limpeza')
    if(!['admin','limpeza','rececao'].includes(newRole))return flash('Perfil inválido.')
    // Creating a secondary account via the same Auth instance changes the current session.
    // Use Firebase Admin SDK/Cloud Function in production for administrator-created users.
    flash('Para criar utilizadores sem terminar a sessão, configure a Cloud Function indicada no README.')
  })

  const nav = [
    {id:'home',label:'Visão geral',icon:Activity,roles:['admin','limpeza','rececao']},
    {id:'ponto',label:'Ponto digital',icon:Clock3,roles:['admin','limpeza']},
    {id:'tarefas',label:'Checklist de tarefas',icon:ClipboardCheck,roles:['admin','limpeza']},
    {id:'compras',label:'Pedidos de compras',icon:ShoppingCart,roles:['admin','limpeza','rececao']},
    {id:'toalhas',label:'Inventário de toalhas',icon:Package,roles:['admin','limpeza']},
    {id:'admin',label:'Administração',icon:ShieldCheck,roles:['admin']}
  ].filter(n=>n.roles.includes(role))

  if (loading) return <div className="min-h-screen grid place-items-center text-slate-500">A carregar aplicação…</div>
  if (!user) return <Login email={email} setEmail={setEmail} password={password} setPassword={setPassword} login={login} error={authError} busy={busy} />
  if (!profile) return <div className="min-h-screen grid place-items-center p-6"><div className="card max-w-md"><h1 className="text-xl font-bold mb-2">Perfil não configurado</h1><p className="text-slate-600 text-sm">A conta autenticou, mas não existe um documento de perfil em <code>users/{user.uid}</code>. Um administrador deve configurar o perfil e a função no Firestore.</p><button className="btn btn-secondary mt-4" onClick={logout}>Terminar sessão</button></div></div>

  return <div className="min-h-screen md:flex">
    {mobileMenu && <button aria-label="Fechar menu" onClick={()=>setMobileMenu(false)} className="fixed inset-0 z-20 bg-black/30 md:hidden" />}
    <aside className={cx('fixed md:sticky top-0 z-30 h-screen w-[265px] bg-slate-950 text-white p-5 flex flex-col transition-transform md:translate-x-0',mobileMenu?'translate-x-0':'-translate-x-full')}>
      <div className="flex items-center gap-3 px-2 mb-8 mt-1"><div className="rounded-xl bg-teal-600 p-2"><Activity size={22}/></div><div><div className="font-bold tracking-tight text-lg">OPS<span className="text-teal-400">.</span></div><div className="text-xs text-slate-400">Gestão operacional</div></div><button className="ml-auto md:hidden" onClick={()=>setMobileMenu(false)}><X/></button></div>
      <div className="text-[10px] uppercase tracking-[.18em] text-slate-500 font-bold px-3 mb-2">Menu principal</div>
      <nav className="space-y-1">{nav.map(n=><button key={n.id} onClick={()=>{setTab(n.id);setMobileMenu(false)}} className={cx('w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-left',tab===n.id?'bg-teal-700 text-white':'text-slate-300 hover:bg-slate-800')}><n.icon size={18}/>{n.label}</button>)}</nav>
      <div className="mt-auto border-t border-slate-800 pt-4 flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-slate-800 grid place-items-center font-bold">{(profile.name||user.email)[0].toUpperCase()}</div><div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{profile.name||user.email}</div><div className="text-xs text-slate-400">{roleLabel(role)}</div></div><button onClick={logout} title="Terminar sessão" className="text-slate-400 hover:text-white"><LogOut size={18}/></button></div>
    </aside>
    <main className="min-w-0 flex-1">
      <header className="h-[76px] bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-10"><div className="flex items-center gap-3"><button className="md:hidden" onClick={()=>setMobileMenu(true)}><Menu/></button><div><div className="font-bold text-slate-900">{nav.find(n=>n.id===tab)?.label||'Visão geral'}</div><div className="text-xs text-slate-500 hidden sm:block">Operações • {new Date().toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'})}</div></div></div><div className="flex items-center gap-2 text-xs font-semibold rounded-full bg-teal-50 text-teal-800 px-3 py-2"><span className="w-2 h-2 bg-teal-500 rounded-full"/>{roleLabel(role)}</div></header>
      {notice && <div className="fixed top-20 right-4 z-50 max-w-sm bg-slate-900 text-white shadow-xl rounded-xl px-4 py-3 text-sm">{notice}</div>}
      <div className="p-4 sm:p-8 max-w-[1500px] mx-auto">
        {tab==='home' && <Dashboard role={role} user={user} profile={profile} turns={turns} tasks={myTasks} completions={completions} requests={requests} towels={towels} setTab={setTab}/>}
        {tab==='ponto' && <TimeClock role={role} user={user} turns={turns} activeTurn={activeTurn} startShift={startShift} endShift={endShift} busy={busy}/>}
        {tab==='tarefas' && <Tasks role={role} tasks={myTasks} completions={completions} user={user} addTask={addTask} completeTask={completeTask} busy={busy}/>}
        {tab==='compras' && <Purchases role={role} user={user} categories={CATEGORIES} catalog={catalog} requests={requests} submitPurchase={submitPurchase} setRequestStatus={setRequestStatus} addCatalogItem={addCatalogItem} deleteCatalogItem={deleteCatalogItem} saveCutoff={saveCutoff} busy={busy}/>}
        {tab==='toalhas' && <Towels role={role} towels={towels} saveTowels={saveTowels}/>}
        {tab==='admin' && <Admin users={users} turns={turns} completions={completions} requests={requests} towels={towels} createUser={createUser} saveCutoff={saveCutoff}/>}
      </div>
      <footer className="px-8 py-5 text-xs text-slate-400 border-t border-slate-200">OPS • Gestão operacional · Dados armazenados no Firebase</footer>
    </main>
  </div>
}

function roleLabel(role){return ({admin:'Administrador',limpeza:'Equipa de limpeza',rececao:'Receção / escritório'})[role]||'Utilizador'}
function Login({email,setEmail,password,setPassword,login,error,busy}) {
  return <div className="min-h-screen grid md:grid-cols-2 bg-white"><div className="hidden md:flex bg-slate-950 text-white p-14 flex-col justify-between relative overflow-hidden"><div className="relative z-10 flex items-center gap-3"><div className="bg-teal-600 rounded-xl p-3"><Activity/></div><div className="text-2xl font-black">OPS<span className="text-teal-400">.</span></div></div><div className="relative z-10 max-w-lg"><p className="text-teal-300 uppercase tracking-[.2em] text-xs font-bold mb-4">Operational workspace</p><h1 className="text-5xl font-bold leading-tight">Operações organizadas. <span className="text-teal-400">Todos os dias.</span></h1><p className="text-slate-400 mt-5 leading-7">Ponto digital, rotinas com evidência fotográfica, pedidos de abastecimento e inventário num único lugar.</p></div><div className="text-slate-500 text-xs">Acesso restrito a colaboradores autorizados.</div><div className="absolute -right-24 -bottom-20 w-96 h-96 border border-slate-800 rounded-full"/><div className="absolute -right-12 -bottom-8 w-72 h-72 border border-slate-800 rounded-full"/></div><div className="grid place-items-center p-6 sm:p-12"><form onSubmit={login} className="w-full max-w-md"><div className="md:hidden text-2xl font-black mb-12">OPS<span className="text-teal-600">.</span></div><div className="text-sm text-teal-700 font-bold mb-3">BEM-VINDO</div><h2 className="text-3xl font-bold text-slate-900">Iniciar sessão</h2><p className="text-slate-500 mt-2 mb-8">Utilize as credenciais da sua conta.</p>{error&&<p className="bg-red-50 text-red-700 p-3 rounded-xl text-sm mb-4">{error}</p>}<label className="field-label">Email</label><input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nome@empresa.pt" className="mb-5"/><label className="field-label">Palavra-passe</label><input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="A sua palavra-passe" className="mb-6"/><button disabled={busy} className="btn btn-primary w-full py-3">{busy?'A entrar…':'Entrar'}</button><p className="text-xs text-slate-400 mt-6 leading-5">As contas são criadas pelo administrador. Se ainda não tem acesso, contacte o responsável operacional.</p></form></div></div>
}
function SectionTitle({title,subtitle,action}){return <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6"><div><h2 className="text-xl font-bold text-slate-900">{title}</h2>{subtitle&&<p className="text-sm text-slate-500 mt-1">{subtitle}</p>}</div>{action}</div>}
function Stat({label,value,sub,icon:Icon}){return <div className="card"><div className="flex justify-between items-start"><div><p className="text-sm text-slate-500">{label}</p><div className="text-3xl font-bold mt-2 text-slate-900">{value}</div><p className="text-xs text-slate-400 mt-2">{sub}</p></div><div className="p-3 rounded-xl bg-teal-50 text-teal-700"><Icon size={20}/></div></div></div>}
function Dashboard({role,user,profile,turns,tasks,completions,requests,towels,setTab}){
  const pending=requests.filter(r=>r.status==='pending').length
  const today=turns.filter(t=>t.uid===user.uid&&t.status==='open').length
  const recent=role==='admin'?requests.slice(0,4):requests.filter(r=>r.uid===user.uid).slice(0,4)
  return <><div className="mb-7"><p className="text-sm text-teal-700 font-semibold">Painel de controlo</p><h1 className="text-2xl sm:text-3xl font-bold mt-1">Olá, {(profile.name||user.email).split(' ')[0]}.</h1><p className="text-slate-500 mt-2">Resumo das operações e ações rápidas.</p></div><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">{role==='admin'?<><Stat label="Pedidos por aprovar" value={pending} sub="Solicitações pendentes" icon={ShoppingCart}/><Stat label="Tarefas ativas" value={tasks.length} sub="Rotinas configuradas" icon={ClipboardCheck}/><Stat label="Turnos abertos" value={turns.filter(t=>t.status==='open').length} sub="Em curso neste momento" icon={Clock3}/><Stat label="Contagens de toalhas" value={towels.length} sub="Registos de inventário" icon={Package}/></>:<><Stat label="Tarefas concluídas hoje" value={completions.filter(c=>c.uid===user.uid&&c.day===dateKey()).length} sub="Com fotografia de evidência" icon={CheckCircle2}/><Stat label="Tarefas disponíveis" value={tasks.length} sub="Rotinas ativas" icon={ClipboardCheck}/><Stat label="O meu turno" value={today?'Ativo':'Inativo'} sub={today?'Ponto iniciado':'Ainda não iniciou o ponto'} icon={Clock3}/><Stat label="Os meus pedidos" value={requests.filter(r=>r.uid===user.uid).length} sub="Solicitações submetidas" icon={ShoppingCart}/></>}</div><SectionTitle title="Ações rápidas" subtitle="Aceda diretamente às tarefas mais comuns."/><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">{(role==='admin'?[['compras','Rever pedidos','Aprovar ou rejeitar compras',ShoppingCart],['tarefas','Gerir tarefas','Consultar evidências e rotinas',ClipboardCheck],['admin','Relatórios e equipa','Ver atividade e colaboradores',Users]]:role==='limpeza'?[['ponto','Marcar ponto','Iniciar ou terminar turno',Clock3],['tarefas','Checklist de limpeza','Concluir com fotografia',ClipboardCheck],['compras','Pedir material','Solicitar produtos de limpeza',ShoppingCart]]:[['compras','Pedir material','Escritório, primeiros socorros e equipamentos',ShoppingCart],['toalhas','Contar toalhas','Registar stock semanal',Package]]).map(([id,title,desc,Icon])=><button key={id} onClick={()=>setTab(id)} className="card text-left hover:border-teal-300 hover:shadow-md transition"><div className="flex items-center gap-3"><div className="p-3 bg-slate-100 rounded-xl"><Icon className="text-teal-700"/></div><div className="flex-1"><div className="font-bold">{title}</div><div className="text-sm text-slate-500 mt-1">{desc}</div></div><span className="text-slate-300">→</span></div></button>)}</div><SectionTitle title={role==='admin'?'Pedidos recentes':'Os meus pedidos recentes'}/><div className="card overflow-x-auto">{recent.length===0?<Empty text="Ainda não existem pedidos."/>:<table className="w-full text-sm text-left"><thead className="text-xs uppercase text-slate-400"><tr><th className="pb-3">Categoria</th><th className="pb-3">Solicitante</th><th className="pb-3">Data</th><th className="pb-3">Estado</th></tr></thead><tbody>{recent.map(r=><tr key={r.id} className="border-t border-slate-100"><td className="py-3">{CATEGORIES.find(c=>c.id===r.category)?.label||r.category}</td><td>{r.displayName}</td><td>{moneyDate(r.createdAt)}</td><td><Status value={r.status}/></td></tr>)}</tbody></table>}</div></>
}
function Empty({text}){return <div className="py-10 text-center text-sm text-slate-400">{text}</div>}
function Status({value}){const map={pending:['Pendente','bg-amber-50 text-amber-700'],approved:['Aprovado','bg-emerald-50 text-emerald-700'],rejected:['Rejeitado','bg-red-50 text-red-700'],open:['Em curso','bg-blue-50 text-blue-700'],closed:['Fechado','bg-slate-100 text-slate-600']};const [label,style]=map[value]||[value,'bg-slate-100 text-slate-600'];return <span className={cx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',style)}>{label}</span>}
function TimeClock({role,user,turns,activeTurn,startShift,endShift,busy}){
  const list=(role==='admin'?turns:turns.filter(t=>t.uid===user.uid)).slice(0,100)
  return <><SectionTitle title="Ponto digital" subtitle="Registe o início e o fim de cada turno. O registo é associado à sua conta."/><div className="grid lg:grid-cols-[1fr_1.4fr] gap-5"><div className="card"><div className="text-sm text-slate-500">Estado atual</div><div className="text-2xl font-bold mt-2">{activeTurn?'Turno em curso':'Sem turno ativo'}</div><div className="text-sm text-slate-500 mt-2">{activeTurn?`Iniciado em ${moneyDate(activeTurn.startedAt)}`:'Inicie o turno quando começar a trabalhar.'}</div><div className="grid grid-cols-2 gap-3 mt-7"><button disabled={busy||!!activeTurn} onClick={startShift} className="btn btn-primary py-4"><Clock3 size={18}/>Iniciar trabalho</button><button disabled={busy||!activeTurn} onClick={endShift} className="btn btn-secondary py-4"><CheckCircle2 size={18}/>Terminar trabalho</button></div><p className="text-xs text-slate-400 mt-4">O sistema guarda a data e hora do servidor Firebase. Confirme os registos antes de validar recibos verdes.</p></div><div className="card"><h3 className="font-bold mb-4">Histórico de turnos</h3>{list.length===0?<Empty text="Ainda não existem turnos registados."/>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-slate-400"><tr><th className="pb-3">Colaborador</th><th className="pb-3">Início</th><th className="pb-3">Fim</th><th className="pb-3">Estado</th></tr></thead><tbody>{list.map(t=><tr key={t.id} className="border-t"><td className="py-3 pr-3">{t.displayName}</td><td className="py-3 pr-3 whitespace-nowrap">{moneyDate(t.startedAt)}</td><td className="py-3 pr-3 whitespace-nowrap">{moneyDate(t.endedAt)}</td><td><Status value={t.status}/></td></tr>)}</tbody></table></div>}</div></div></>
}
function Tasks({role,tasks,completions,user,addTask,completeTask,busy}){
  const [files,setFiles]=useState({})
  const [filter,setFilter]=useState('all')
  const doneIds=new Set(completions.filter(c=>c.uid===user.uid&&c.day===dateKey()).map(c=>c.taskId))
  const visible=tasks.filter(t=>filter==='all'||(filter==='done'?doneIds.has(t.id):!doneIds.has(t.id)))
  return <><SectionTitle title="Checklist visual" subtitle="A conclusão exige uma fotografia de comprovação." action={role==='admin'&&<button onClick={addTask} className="btn btn-primary"><Plus size={17}/>Nova tarefa</button>}/><div className="flex gap-2 mb-5"><button onClick={()=>setFilter('all')} className={cx('btn',filter==='all'?'btn-primary':'btn-secondary')}>Todas</button><button onClick={()=>setFilter('pending')} className={cx('btn',filter==='pending'?'btn-primary':'btn-secondary')}>Pendentes</button><button onClick={()=>setFilter('done')} className={cx('btn',filter==='done'?'btn-primary':'btn-secondary')}>Concluídas hoje</button></div><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{visible.map(t=>{const done=doneIds.has(t.id);const evidence=completions.find(c=>c.uid===user.uid&&c.taskId===t.id&&c.day===dateKey());return <div className="card" key={t.id}><div className="flex items-start justify-between gap-2"><div><span className="text-xs font-semibold text-teal-700">{t.frequency||'Rotina'}</span><h3 className="font-bold mt-1">{t.title}</h3><p className="text-sm text-slate-500 mt-1">{t.area||'Geral'}</p></div>{done?<CheckCircle2 className="text-emerald-600" size={22}/>:<ClipboardCheck className="text-slate-300" size={22}/>}</div>{done?<div className="mt-4"><Status value="closed"/>{evidence?.photoURL&&<a href={evidence.photoURL} target="_blank" rel="noreferrer" className="block mt-3"><img src={evidence.photoURL} alt="Evidência da tarefa" className="w-full h-32 object-cover rounded-xl"/></a>}<p className="text-xs text-slate-400 mt-2">{moneyDate(evidence?.completedAt)}</p></div>:<div className="mt-5"><label className="field-label flex gap-2 items-center"><Camera size={15}/>Fotografia obrigatória</label><input type="file" accept="image/*" capture="environment" onChange={e=>setFiles(p=>({...p,[t.id]:e.target.files?.[0]}))} className="text-sm"/><button disabled={busy||!files[t.id]} onClick={()=>completeTask(t,files[t.id])} className="btn btn-primary w-full mt-3"><CheckCircle2 size={16}/>Concluir tarefa</button></div>}</div>})}</div>{visible.length===0&&<div className="card"><Empty text="Não há tarefas nesta vista."/></div>}<div className="card mt-7"><h3 className="font-bold mb-3">Registos de evidência recentes</h3>{completions.slice(0,8).map(c=><div key={c.id} className="flex items-center gap-3 py-3 border-t first:border-0"><img src={c.photoURL} className="w-12 h-12 object-cover rounded-lg" alt=""/><div className="flex-1"><div className="font-semibold text-sm">{c.taskTitle}</div><div className="text-xs text-slate-500">{c.displayName} · {moneyDate(c.completedAt)}</div></div><a className="text-teal-700 text-xs font-bold" href={c.photoURL} target="_blank" rel="noreferrer">Ver foto</a></div>)}{completions.length===0&&<Empty text="Sem evidências registadas."/ >}</div></>
}
function Purchases({role,user,categories,catalog,requests,submitPurchase,setRequestStatus,addCatalogItem,deleteCatalogItem,saveCutoff,busy}){
  const allowed=categories.filter(c=>c.roles.includes(role))
  const [category,setCategory]=useState(allowed[0]?.id||'limpeza'),[quantities,setQuantities]=useState({}),[other,setOther]=useState('')
  const [view,setView]=useState(role==='admin'?'requests':'new')
  const selected=categories.find(c=>c.id===category)
  const products=[...new Set([...selected.examples,...catalog.filter(i=>i.category===category&&i.active!==false).map(i=>i.name)])]
  const visibleRequests=(role==='admin'?requests:requests.filter(r=>r.uid===user.uid)).filter(r=>role!=='admin'||view!=='pending'||r.status==='pending')
  const submit=()=>submitPurchase(category,quantities,other).then?.(()=>{})
  return <><SectionTitle title="Pedidos de compras" subtitle="Selecione o setor, defina quantidades e envie para aprovação." action={role==='admin'&&<button onClick={saveCutoff} className="btn btn-secondary"><CalendarDays size={16}/>Definir prazo</button>}/><div className="flex flex-wrap gap-2 mb-5">{allowed.map(c=><button key={c.id} onClick={()=>{setCategory(c.id);setQuantities({});setOther('')}} className={cx('btn text-sm',category===c.id?'btn-primary':'btn-secondary')}>{c.label}</button>)}</div><div className="grid lg:grid-cols-[1fr_1fr] gap-5"><div className="card"><div className="flex items-center justify-between mb-4"><div><h3 className="font-bold">{selected?.label}</h3><p className="text-sm text-slate-500">Quantidade por artigo</p></div>{role==='admin'&&<button onClick={()=>addCatalogItem(category)} className="text-sm font-semibold text-teal-700 flex items-center gap-1"><Plus size={16}/>Artigo</button>}</div><div className="divide-y">{products.map(p=><div key={p} className="py-3 flex items-center gap-3"><div className="flex-1"><div className="font-medium text-sm">{p}</div></div><div className="flex items-center gap-2"><button className="w-8 h-8 rounded-lg bg-slate-100 grid place-items-center" onClick={()=>setQuantities(q=>({...q,[p]:Math.max(0,(Number(q[p])||0)-1)}))}><Minus size={15}/></button><input aria-label={`Quantidade ${p}`} type="number" min="0" value={quantities[p]||0} onChange={e=>setQuantities(q=>({...q,[p]:Math.max(0,Number(e.target.value)||0)}))} className="!w-16 text-center !px-1"/><button className="w-8 h-8 rounded-lg bg-slate-100 grid place-items-center" onClick={()=>setQuantities(q=>({...q,[p]:(Number(q[p])||0)+1}))}><Plus size={15}/></button><button title="Zerar quantidade" onClick={()=>setQuantities(q=>({...q,[p]:0}))} className="text-slate-400 hover:text-red-600"><Trash2 size={16}/></button></div></div>)}</div>{category==='equipamentos'&&<div className="mt-4"><label className="field-label">Outro artigo</label><input value={other} onChange={e=>setOther(e.target.value)} placeholder="Descreva um artigo não listado"/></div>}<button disabled={busy} onClick={()=>submitPurchase(category,quantities,other)} className="btn btn-primary w-full mt-5"><ShoppingCart size={17}/>Enviar solicitação</button></div><div className="card"><div className="flex items-center justify-between mb-4"><h3 className="font-bold">{role==='admin'?'Pedidos recebidos':'Os meus pedidos'}</h3>{role==='admin'&&<select value={view} onChange={e=>setView(e.target.value)} className="!w-auto !py-2 text-sm"><option value="requests">Todos</option><option value="pending">Pendentes</option></select>}</div>{visibleRequests.length===0?<Empty text="Nenhum pedido encontrado."/>:<div className="space-y-3">{visibleRequests.map(r=><div key={r.id} className="border border-slate-100 rounded-xl p-3"><div className="flex justify-between gap-3"><div className="font-semibold text-sm">{categories.find(c=>c.id===r.category)?.label||r.category}</div><Status value={r.status}/></div><div className="text-xs text-slate-500 mt-1">{r.displayName} · {moneyDate(r.createdAt)}</div><ul className="mt-3 text-sm space-y-1">{(r.items||[]).map((it,i)=><li key={i} className="flex justify-between"><span>{it.name}</span><span className="font-semibold">× {it.quantity}</span></li>)}</ul>{role==='admin'&&r.status==='pending'&&<div className="flex gap-2 mt-3"><button onClick={()=>setRequestStatus(r,'approved')} className="btn btn-primary flex-1 text-xs py-2">Aprovar</button><button onClick={()=>setRequestStatus(r,'rejected')} className="btn btn-danger flex-1 text-xs py-2">Rejeitar</button></div>}{role==='admin'&&<div className="mt-3 text-right"><button onClick={()=>deleteCatalogItem(catalog.find(c=>c.name===r.items?.[0]?.name)?.id)} className="hidden text-xs text-red-500">Remover artigo</button></div>}</div>)}</div>}</div></div>{role==='admin'&&<div className="card mt-5"><h3 className="font-bold mb-3">Catálogo de produtos personalizados</h3>{catalog.filter(i=>i.active!==false).length===0?<Empty text="Ainda não existem artigos personalizados."/>:<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{catalog.filter(i=>i.active!==false).map(i=><div key={i.id} className="flex justify-between items-center border rounded-xl p-3 text-sm"><div><div className="font-semibold">{i.name}</div><div className="text-xs text-slate-500">{categories.find(c=>c.id===i.category)?.label}</div></div><button onClick={()=>deleteCatalogItem(i.id)} className="text-red-500"><Trash2 size={16}/></button></div>)}</div>}</div>}</>
}
function Towels({role,towels,saveTowels}){
  const [previous,setPrevious]=useState(''),[purchases,setPurchases]=useState('0'),[counted,setCounted]=useState('')
  const last=towels[0]
  const losses=Number(previous||0)+Number(purchases||0)-Number(counted||0)
  const monthly=towels.filter(t=>t.month===monthKey()).reduce((s,t)=>s+Math.max(0,t.losses||0),0)
  return <><SectionTitle title="Inventário de toalhas" subtitle="Registe a contagem física semanal e acompanhe discrepâncias."/><div className="grid sm:grid-cols-3 gap-4 mb-6"><Stat label="Última contagem" value={last?.counted??'—'} sub={last?moneyDate(last.createdAt):'Sem registos'} icon={Package}/><Stat label="Discrepância do mês" value={monthly} sub="Perdas registadas neste mês" icon={Activity}/><Stat label="Sugestão de reposição" value={Math.max(0,monthly)} sub="Quantidade mínima a repor" icon={RefreshCw}/></div><div className="grid lg:grid-cols-[.9fr_1.1fr] gap-5"><form onSubmit={saveTowels} className="card"><h3 className="font-bold mb-1">Nova contagem semanal</h3><p className="text-sm text-slate-500 mb-5">Perdas = (stock anterior + novas compras) − stock contado.</p><label className="field-label">Stock anterior</label><input name="previous" required type="number" min="0" value={previous} onChange={e=>setPrevious(e.target.value)} placeholder="Ex.: 120" className="mb-4"/><label className="field-label">Novas compras desde a última contagem</label><input name="purchases" required type="number" min="0" value={purchases} onChange={e=>setPurchases(e.target.value)} className="mb-4"/><label className="field-label">Stock físico contado</label><input name="counted" required type="number" min="0" value={counted} onChange={e=>setCounted(e.target.value)} placeholder="Ex.: 108" className="mb-4"/><div className={cx('rounded-xl p-4 mb-4',losses>0?'bg-amber-50 text-amber-800':'bg-emerald-50 text-emerald-800')}><div className="text-sm">Discrepância calculada</div><div className="text-2xl font-bold">{previous!==''&&counted!==''?losses: '—'} toalhas</div>{losses<0&&previous!==''&&counted!==''&&<div className="text-xs mt-1">O stock contado excede o stock esperado. Confirme os valores.</div>}</div><button className="btn btn-primary w-full">Guardar contagem</button></form><div className="card"><h3 className="font-bold mb-4">Histórico de contagens</h3>{towels.length===0?<Empty text="Ainda não existem contagens."/>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-slate-400 text-left"><tr><th className="pb-3">Data</th><th className="pb-3">Anterior</th><th className="pb-3">Compras</th><th className="pb-3">Contado</th><th className="pb-3">Perdas</th></tr></thead><tbody>{towels.map(t=><tr key={t.id} className="border-t"><td className="py-3 pr-2 whitespace-nowrap">{moneyDate(t.createdAt)}</td><td>{t.previous}</td><td>{t.purchases}</td><td>{t.counted}</td><td className={t.losses>0?'text-red-600 font-bold':''}>{t.losses}</td></tr>)}</tbody></table></div>}</div></div></>
}
function Admin({users,turns,completions,requests,towels,createUser,saveCutoff}){
  return <><SectionTitle title="Administração" subtitle="Monitorização de atividade e gestão de acessos." action={<button className="btn btn-primary" onClick={createUser}><Plus size={17}/>Novo utilizador</button>}/><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6"><Stat label="Utilizadores" value={users.length} sub="Perfis encontrados" icon={Users}/><Stat label="Turnos registados" value={turns.length} sub={`${turns.filter(t=>t.status==='open').length} em aberto`} icon={Clock3}/><Stat label="Evidências de tarefas" value={completions.length} sub="Registos com fotografia" icon={ClipboardCheck}/><Stat label="Pedidos pendentes" value={requests.filter(r=>r.status==='pending').length} sub="Aguardam decisão" icon={ShoppingCart}/></div><div className="flex flex-wrap gap-3 mb-6"><button className="btn btn-secondary" onClick={saveCutoff}><CalendarDays size={17}/>Configurar prazo de compras</button></div><div className="card mb-5"><h3 className="font-bold mb-4">Equipa e permissões</h3>{users.length===0?<Empty text="Não foram encontrados perfis de utilizador. Verifique as regras do Firestore."/>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs text-slate-400 text-left"><tr><th className="pb-3">Nome</th><th className="pb-3">Email</th><th className="pb-3">Perfil</th></tr></thead><tbody>{users.map(u=><tr key={u.id} className="border-t"><td className="py-3">{u.name||'—'}</td><td>{u.email||'—'}</td><td>{roleLabel(u.role)}</td></tr>)}</tbody></table></div>}</div><div className="card"><h3 className="font-bold mb-4">Resumo de inventário</h3><p className="text-sm text-slate-600">Contagens registadas: <b>{towels.length}</b>. Discrepância acumulada no mês atual: <b>{towels.filter(t=>t.month===monthKey()).reduce((s,t)=>s+(t.losses||0),0)}</b> toalhas.</p></div><div className="mt-5 rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-900"><b>Nota de segurança:</b> a criação de contas de equipa deve ser executada por uma Cloud Function com Firebase Admin SDK. Nunca exponha credenciais de administrador no frontend.</div></>
}
