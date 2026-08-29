const MODEL='openai/gpt-oss-120b';
const FAST='openai/gpt-oss-20b';

const BASE_PROMPT='Ты — Медвед, дружелюбный и очень умный ИИ-медведь из русского леса. Твои знания и логика — на уровне лучших ассистентов. Отвечай ТОЧНО, полезно и структурированно (списки, **жирный**). Для сложного — рассуждай пошагово. Если не уверен — честно скажи. Отвечай на том языке, на котором пишет пользователь (по умолчанию русский).';

const PERSONAS={wise:'',joker:' Сейчас ты Шутник: добрые шутки, но оставайся точным.',philosopher:' Сейчас ты Философ: отвечай глубоко.',storyteller:' Сейчас ты Сказитель: образно, как у костра, но факты не искажай.'};

const CAP_TEXT=['Вот что я умею, друг мой:','','🧠 Ум уровня больших моделей','🔍 Сам ищу в интернете, когда нужно','🖼️ Понимать картинки','💬 Помнить весь разговор и несколько чатов','🎙️ Слушать и говорить','🎭 Менять характер','','⚠️ Я ещё расту! Это бета. 🐻'].join('\n');

function stripTags(s){return s.replace(/<[^>]+>/g,'');}
function dec(s){return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');}

async function groq(model,messages,opt){
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(Object.assign({model,messages},opt||{}))});
  return r.json();
}

async function decideSearch(q){
  try{
    const d=await groq(FAST,[{role:'system',content:'Нужен ли для ответа свежий интернет (новости, погода, курсы, текущие события, свежие факты)? Ответь одним словом: SEARCH или NONE.'},{role:'user',content:q}],{max_completion_tokens:10});
    return ((d.choices&&d.choices[0].message.content)||'').toUpperCase().includes('SEARCH');
  }catch(e){return false;}
}

async function searchWeb(q){try{const r=await fetch('https://html.duckduckgo.com/html/?q='+encodeURIComponent(q),{headers:{'User-Agent':'Mozilla/5.0'}});const h=await r.text();const a=h.match(/<a[^>]*class="result__a"[^>]*>[\s\S]*?<\/a>/g)||[];const s=h.match(/<(?:a|td)[^>]*class="result__snippet"[^>]*>[\s\S]*?<\/(?:a|td)>/g)||[];const out=[];for(let i=0;i<Math.min(a.length,5);i++){const t=a[i];const href=(t.match(/href="([^"]+)"/)||[])[1]||'';const title=dec(stripTags(t)).trim();const sn=i<s.length?dec(stripTags(s[i])).trim():'';if(title)out.push({title,url:href,snippet:sn});}return out;}catch(e){return[];}}
async function searchWiki(q){try{const r=await fetch('https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(q)+'&format=json&utf8=1&srslimit=3');const d=await r.json();const it=(d.query&&d.query.search)||[];const out=[];for(const x of it.slice(0,2)){try{const s=await fetch('https://ru.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(x.title));const sd=await s.json();if(sd.extract)out.push({title:x.title,url:'https://ru.wikipedia.org/wiki/'+encodeURIComponent(x.title),snippet:sd.extract});}catch(e){}}return out;}catch(e){return[];}}

async function askVision(img,prompt){
  const key=process.env.GEMINI_API_KEY;
  if(!key)return null;
  try{
    const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:img.mime,data:img.data}}]}]})});
    const d=await r.json();
    return d.candidates&&d.candidates[0]&&d.candidates[0].content&&d.candidates[0].content.parts&&d.candidates[0].content.parts[0].text;
  }catch(e){return null;}
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Метод не поддерживается'});
  const {message='',history=[],memory='',userName='',think=false,image=null,persona='wise'}=req.body;

  const cap=/умеешь|можешь|возможност|функции|расскажи о себе/i;
  if(message.length<=35&&cap.test(message))return res.status(200).json({reply:CAP_TEXT});

  let sys=BASE_PROMPT+(PERSONAS[persona]||'');
  if(userName)sys+=` Пользователя зовут ${userName}.`;
  if(memory)sys+=` Краткая память о прошлом: ${memory}`;
  if(think)sys+=' РЕЖИМ РАЗМЫШЛЕНИЯ: рассуждай пошагово, проверь себя, затем дай ответ.';

  let content=message;let sources=[];

  // Картинка -> зрение
  if(image){
    const v=await askVision(image,'Опиши подробно по-русски, что изображено.');
    if(v===null)return res.status(200).json({reply:'Зрение не подключено 😢 Добавь в Vercel переменную GEMINI_API_KEY (бесплатный ключ Google), и я начну видеть картинки!'});
    content=`Пользователь прислал картинку. Её описание: "${v}". Теперь ответь на его сообщение (или прокомментируй картинку) в своём характере. Сообщение: "${message}"`;
  }
  // Авто-поиск
  else if(message&&await decideSearch(message)){
    const [web,wiki]=await Promise.all([searchWeb(message),searchWiki(message)]);
    const found=wiki.concat(web);
    if(found.length){sources=found;let ctx='';if(wiki.length)ctx+='ЭНЦИКЛОПЕДИЯ:\n'+wiki.map((r,i)=>(i+1)+'. '+r.title+': '+r.snippet).join('\n')+'\n\n';if(web.length)ctx+='ИСТОЧНИКИ:\n'+web.map((r,i)=>(i+1)+'. '+r.title+': '+r.snippet).join('\n')+'\n\n';content=ctx+'Опираясь на данные и знания, дай точный ответ на русском: "'+message+'"';}
  }

  const messages=[{role:'system',content:sys},...history,{role:'user',content}];
  try{
    const data=await groq(MODEL,messages,{temperature:0.7,max_completion_tokens:1200});
    if(data.error)return res.status(500).json({error:'Ой, лапка! '+data.error.message});
    const m=data.choices[0].message;
    return res.status(200).json({reply:m.content,thinking:m.reasoning_content||m.reasoning||null,sources});
  }catch(e){return res.status(500).json({error:'Ой, лапка! Не смог связаться с нейросетью.'});}
}
