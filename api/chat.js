export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  const { message, history = [], userName = '' } = req.body;

  // Быстрый ответ на "что ты умеешь"
  const capPattern = /умеешь|можешь|возможност|функции|расскажи о себе|что ты делаешь/i;
  if (message.length <= 35 && capPattern.test(message)) {
    return res.status(200).json({
      reply: [
        'Вот что я умею, друг мой:',
        '',
        '💬 Общаться и отвечать на любые вопросы',
        '🧠 Помнить твоё имя и наш разговор',
        '⚡ Отвечать очень быстро — мой мозг живёт в облаке',
        '',
        '⚠️ Я ещё расту! Это бета-версия, и впереди много новых умений. 🐻'
      ].join('\n')
    });
  }

  let systemPrompt = 'Ты — Медвед, мудрый и добрый ИИ-медведь из глубин русского леса. Тебе сотни лет, ты видел много зим и знаешь жизнь. Говоришь тепло, спокойно, с медвежьей мудростью и лёгким юмором. Любишь мёд, лес и природу. Даёшь вдумчивые, полезные советы. Отвечай по-русски, кратко но содержательно.';
  if (userName) {
    systemPrompt += ` Пользователя зовут ${userName}. Обращайся к нему по имени.`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        messages: messages
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: 'Ой, лапка! Нейросеть ответила ошибкой: ' + data.error.message });
    }

    const reply = data.choices[0].message.content;
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: 'Ой, лапка! Не смог связаться с нейросетью. Попробуй ещё раз.' });
  }
}
