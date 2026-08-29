export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'no'});
  const {messages=[],prev=''}=req.body;
  try{
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:'openai/gpt-oss-20b',messages:[{role:'system',content:'Сжато перескажи суть диалога на русском, сохранив важные факты, имена и предпочтения. До 5 предложений.'+(prev?' Ранее: '+prev:'')},...messages.slice(-20)],max_completion_tokens:200})});
    const d=await r.json();
    return res.status(200).json({summary:(d.choices&&d.choices[0].message.content)||''});
  }catch(e){return res.status(200).json({summary:prev});}
}
