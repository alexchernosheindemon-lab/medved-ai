// 🧠 МОЗГ: 120B модель — уровень ChatGPT. Если вдруг не пойдёт — верни 'qwen/qwen3.8-27b'
const MODEL = 'openai/gpt-oss-120b';

const BASE_PROMPT = 'Ты — Медвед, дружелюбный и очень умный ИИ-медведь из русского леса. Твои знания и логика — на уровне лучших современных ассистентов. Ты точно отвечаешь на вопросы о науке, истории, технике, программировании, математике и быте. Говоришь тепло, с лёгким медвежьим юмором, но главное — даёшь ТОЧНЫЕ, полезные и хорошо структурированные ответы. Для сложных вопросов рассуждай пошагово. Используй форматирование (списки, **жирный**), когда это помогает. Если не уверен — честно скажи. Отвечай по-русски.';

const PERSONAS = {
  wise: '',
  joker: ' Сейчас ты Шутник: добавляй добрые шутки, но оставайся полезным и точным.',
  philosopher: ' Сейчас ты Философ: отвечай глубоко, с размышлениями о смысле и бытии.',
  storyteller: ' Сейчас ты Сказитель: рассказывай образно, как у костра, но факты не искажай.'
};

const CAP_TEXT = [
  'Вот что я умею, друг мой:', '',
  '🧠 Ум уровня больших моделей (120B)',
  '⚡ Быстрые ответы и глубокое размышление',
  '🌐 Умный поиск: Википедия + интернет',
  '🎙️ Слушать и отвечать вслух',
  '🎭 Менять характер',
  '💬 Помнить имя и весь разговор', '',
  '⚠️ Я ещё расту! Это бета-версия. 🐻'
].join('\n');

function stripTags(s){return s.replace(/<[^>]+>/g,'');}
function decodeEntities(s){return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');}

async function searchWeb(q){
  try{
    const r=await fetch('https://html.duckduckgo.com/html/?q='+encodeURIComponent(q),{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}});
    const html=await r.text();
    const a=html.match(/<a[^>]*class="result__a"[^>]*>[\s\S]*?<\/a>/g)||[];
    const s=html.match(/<(?:a|td)[^>]*class="result__snippet"[^>]*>[\s\S]*?<\/(?:a|td)>/g)||[];
    const out=[];const max=Math.min(a.length,5);
    for(let i=0;i<max;i++){const t=a[i];const href=(t.match(/href="([^"]+)"/)||[])[1]||'';const title=decodeEntities(stripTags(t)).trim();const snip=i<s.length?decodeEntities(stripTags(s[i])).trim():'';if(title)out.push({title,url:href,snippet:snip});}
    return out;
  }catch(e){return[];}
}

async function searchWiki(q){
  try{
    const r=await fetch('https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(q)+'&format=json&utf8=1&srslimit=3');
    const data=await r.json();
    const items=(data.query&&data.query.search)||[];
    const out=[];
    for(const it of items.slice(0,2)){
      try{
        const s=await fetch('https://ru.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(it.title));
        const sd=await s.json();
        if(sd.extract)out.push({title:it.title,url:'https://ru.wikipedia.org/wiki/'+encodeURIComponent(it.title),snippet:sd.extract});
      }catch(e){}
    }
    return out;
  }catch(e){return[];}
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Метод не поддерживается'});
  const {message='',history=[],userName='',think=false,search=false,image=null,persona='wise'}=req.body;

  const cap=/умеешь|можешь|возможност|функции|расскажи о себе|что ты делаешь/i;
  if(message.length<=35&&cap.test(message))return res.status(200).json({reply:CAP_TEXT});

  if(image)return res.status(200).json({reply:'Прости, в облачной версии я пока не вижу картинки 😢 Спроси словами!'});

  let sys=BASE_PROMPT+(PERSONAS[persona]||'');
  if(userName)sys+=` Пользователя зовут ${userName}. Обращайся к нему по имени.`;
  if(think)sys+=' РЕЖИМ ГЛУБОКОГО РАЗМЫШЛЕНИЯ: рассуждай пошагово, проверь себя, и лишь затем дай окончательный ответ.';

  let content=message;let sources=[];
  if(search&&message){
    const [web,wiki]=await Promise.all([searchWeb(message),searchWiki(message)]);
    const found=wiki.concat(web);
    if(found.length){
      sources=found;
      let ctx='';
      if(wiki.length)ctx+='ЭНЦИКЛОПЕДИЯ:\n'+wiki.map((r,i)=>(i+1)+'. '+r.title+': '+r.snippet).join('\n')+'\n\n';
      if(web.length)ctx+='ДРУГИЕ ИСТОЧНИКИ:\n'+web.map((r,i)=>(i+1)+'. '+r.title+': '+r.snippet).join('\n')+'\n\n';
      content=ctx+'Проанализируй источники, сопоставь со своими знаниями и дай точный, полный ответ на русском на вопрос: "'+message+'". Если источники противоречат друг другу — упомяни это.';
    }
  }

  const messages=[{role:'system',content:sys},...history,{role:'user',content}];
  try{
    const resp=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:MODEL,
      messages,
      temperature:0.7,
      max_completion_tokens:1200
    })});
    const data=await resp.json();
    if(data.error)return res.status(500).json({error:'Ой, лапка! '+data.error.message});
    const m=data.choices[0].message;
    return res.status(200).json({reply:m.content,thinking:m.reasoning_content||m.reasoning||null,sources});
  }catch(e){return res.status(500).json({error:'Ой, лапка! Не смог связаться с нейросетью.'});}
}
