Можна оформити як `/threads-pr-manager` skill в існуючому 34-агентному
Claude Code сетапі.

### G. Джерело контенту (tone of voice + knowledge base)
- Дай агенту 5-10 реальних постів (якщо вже є в Threads/іншому каналі
  Casy) — не інструкцію "пиши як я"
- Якщо є записи демо/дзвінків з клієнтами Casy — транскрибувати і
  скидати в Knowledge Base

### H. Terms of Service — окремий документ
Зараз дублює privacy.html. Створити окремий `terms.html` в тому ж
GitHub Pages репо `rayofgoodness.github.io/threads-agent/`.

### I. (Пізніше, для multi-account) Tech Provider verification
Якщо колись захочеш давати доступ іншим Threads-акаунтам (не тільки
calendarsync) — окрема Tech Provider верифікація (~тиждень) + App
Review по кожному permission (2-4 тижні кожен, зі скрінкастом user
flow). Поки не потрібно — Threads Tester достатньо для роботи на
власному акаунті.

## Важливі нотатки з процесу
- `dev.meta.ai` (Model API) — окремий, geo-заблокований продукт, не
  плутати з `developers.facebook.com` (Threads API)
- Redirect/Callback URLs налаштовуються не в загальних App Settings, а
  всередині **Use Case → Access the Threads API → Settings**
- `.env` не підхоплюється автоматично — треба `source .env` в кожній
  новій сесії термінала, або додати в `~/.zshrc`
- **Ніколи не вставляти access token / app secret в чат чи git** —
  зберігати лише в `.env`, доданому в `.gitignore`