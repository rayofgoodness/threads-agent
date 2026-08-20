# App Review — `threads_keyword_search` (Advanced Access)

Заявка на розширений доступ до `keyword_search`. Meta читає **англійською**,
тож блоки, позначені «→ у форму», копіюються дослівно. Решта — робочі нотатки.

Статус базового рівня, перевірено 19 серпня 2026 живим токеном: ендпоїнт
відповідає `200`, але у видачі лише пости `@calendarsync`. Запити `beauty`,
`crm`, `салон` повернули власні пости, `манікюр` — порожньо.

---

## 0. Передумова, без якої заявку відхилять

Рев'ювер має **на власні очі побачити, як користувач Threads підключає свій
акаунт**. Зараз цього в застосунку немає:

- `docs/callback.html` друкує `authorization code` у `<pre>` — це технічний
  дамп для розробника, не user flow;
- `AccessGate.vue` питає `THREADS_AGENT_TOKEN`, тобто пароль до дашборду, а не
  вхід через Threads;
- сам токен лежить у `.env` і потрапляє в застосунок повз будь-який екран.

Що додати перед записом скрінкасту — мінімум:

1. Кнопку **«Connect Threads account»** на порожньому дашборді.
2. Редірект на `https://threads.net/oauth/authorize` з `client_id`
   = `1860340038261236` (Threads App ID, не Meta App ID), `scope` зі списком
   дозволів, `redirect_uri` = зареєстрований у Use Case.
3. Обмін `code` на токен на сервері, а не в браузері.
4. Після повернення — дашборд із іменем акаунта в `AccountBar`.

Технічно обмін уже реалізований у `src/threads/`; бракує саме екрана.

Пастка з `CLAUDE.md`: authorize-URL віддає `error_code: 1`, а отриманий ним код
несе дозволи на момент **первинної** авторизації. Для щоденної роботи токен
беруть у User Token Generator. Але **для скрінкасту потрібен саме OAuth-екран** —
рев'ювер оцінює flow, а не спосіб, яким ви дістаєте токен собі.

---

## 1. Опис use case → у форму

**App name:** Threads PR Manager
**Permission:** `threads_keyword_search`

> Threads PR Manager is a content assistant for small service businesses —
> beauty salons, nail technicians, barbershops and independent masters — who run
> their own Threads presence without a marketing team.
>
> The app helps the account owner decide what to post next. It reads the
> owner's own published posts and their engagement, keeps a content plan, and
> drafts posts in the owner's voice for the owner to review before anything is
> published.
>
> `keyword_search` supplies the missing half of that loop: what the audience is
> already talking about. The account owner configures a short list of topic
> keywords relevant to their business (for example «манікюр», «салон»,
> «запис» — Ukrainian for manicure, salon, booking). The app queries
> `keyword_search` for each keyword, filters out the owner's own posts, and
> shows the remaining public posts in an «Inbound» panel alongside replies the
> owner has received.
>
> The owner uses that panel in two ways. First, to see which questions and
> complaints are recurring in their niche, so the next post answers a real
> question instead of a guessed one. Second, to find conversations where a
> helpful reply from a practitioner is welcome, and reply from their own
> account.
>
> Without Advanced Access the endpoint returns only the authorizing account's
> own posts, which the app filters out as self-noise, so the panel is empty and
> the feature cannot function.
>
> The app does not store search results in a database. Results are fetched on
> demand when the owner presses «Перевірити» (Check) and are held only in
> `content/monitor-state.json`, a local deduplication file recording the ids
> already shown, so the same post is not surfaced twice. No search data is
> shared with third parties, used for advertising, or resold. Data deletion is
> documented at
> <https://rayofgoodness.github.io/threads-agent/data-deletion.html>.

**Скорочена версія**, якщо поле обмежене довжиною:

> The app shows a small business owner what their audience is discussing.
> The owner sets topic keywords for their niche; the app queries
> `keyword_search`, removes the owner's own posts, and lists the remaining
> public posts in an «Inbound» panel. The owner uses it to choose what to post
> next and to reply from their own account where a helpful answer fits. At the
> basic access level the endpoint returns only the owner's own posts, so the
> feature is empty and unusable.

### Чого не писати

- «to monitor competitors», «track brand mentions at scale», «analytics» —
  читається як data harvesting;
- «automatically reply», «bot» — Meta шукає ознаки автоматизованої взаємодії;
- «collect posts into a dataset» — прямий шлях у відмову.

Формулювання по всій заявці одне: **власник акаунта дивиться сам і діє сам**.

---

## 2. Сценарій скрінкасту

Вимоги Meta: без монтажних склейок, читабельний текст, видно повний шлях від
логіну до використання даних. Тривалість 2–3 хв. Мова інтерфейсу українська —
додати англійські субтитри або накладний текст на кожному кроці.

Записувати на чистому профілі браузера. Перед стартом: `npm run server` і
`npm run dev`, вікно 1280×800, масштаб інтерфейсу 110–125 %.

| # | Кадр | Що в кадрі | Субтитр |
|---|------|-----------|---------|
| 1 | 0:00–0:10 | URL-рядок з адресою дашборду, порожній стан, кнопка «Connect Threads account» | *A salon owner opens the app for the first time.* |
| 2 | 0:10–0:25 | Клік по кнопці → екран авторизації Threads зі списком дозволів. **Затримати 4–5 с, щоб було видно рядок про keyword search.** | *The owner signs in with their Threads account and grants the permissions.* |
| 3 | 0:25–0:35 | Повернення на дашборд, у `AccountBar` видно `@calendarsync` і аватар | *After authorization the app shows the connected account.* |
| 4 | 0:35–0:50 | Прокрутка до налаштувань ключових слів, ввід слова «манікюр», збереження | *The owner enters keywords for their niche: manicure, salon, booking.* |
| 5 | 0:50–1:05 | Картка «Вхідні», клік «Перевірити», спінер | *The owner checks what people are posting about these topics.* |
| 6 | 1:05–1:30 | Список результатів. **Курсором показати мітку «ключове слово · манікюр» і `@username` чужого акаунта.** Повільно проскролити 3–4 записи | *Each result shows which keyword matched and who posted it. The owner's own posts are filtered out.* |
| 7 | 1:30–1:45 | Клік «Відкрити» на одному результаті → відкривається `permalink` у Threads | *The owner opens a post to read the full conversation.* |
| 8 | 1:45–2:05 | Назад у дашборд, у `PlanCard` дописується тема, що постала з побаченого | *What the audience asks becomes the next topic in the content plan.* |
| 9 | 2:05–2:30 | `GeneratorCard`: генерація чернетки на цю тему, показ результату, **явний клік «У чернетки»** — не «У чергу» | *The app drafts a post. Nothing is published without the owner's review.* |
| 10 | 2:30–2:40 | Картка «Вхідні» ще раз: повторна перевірка не показує вже бачені записи | *Previously seen posts are not shown again.* |

Кадри 5–7 — головні. Якщо рев'ювер зупинить перегляд, він має вже побачити
чужий `@username` у видачі.

### Проблема курки і яйця

На базовому доступі кадр 6 покаже порожній список — саме через це подається
заявка. Варіанти, у порядку переваги:

1. **Записати як є**, а порожній стан підписати: *«At the current access level
   the endpoint returns only our own posts, which the app filters out. This is
   the limitation this request is about.»* Чесно і не суперечить решті заявки.
2. Поруч показати вкладку **replies** з реальними вхідними коментарями — вони
   працюють і доводять, що панель «Вхідні» жива, а не макет.
3. Мокнутий екран **тільки з явним написом** *«mock data — illustrating the
   intended result»*. Без напису це виглядає як спроба ввести в оману.

Ніколи не показувати мок без позначки.

---

## 3. Інструкції для рев'ювера → у форму

> **Test credentials:** the app is single-tenant and runs against the reviewer's
> own Threads account. No test user is needed — sign in with any Threads
> account at step 2.
>
> 1. Open the app URL and press **«Connect Threads account»**.
> 2. Sign in with a Threads account and accept the permission dialog.
> 3. The dashboard loads and shows the connected account in the top bar.
> 4. Scroll to the **«Вхідні» (Inbound)** card.
> 5. In the keyword settings, enter a keyword — for example `beauty`.
> 6. Press **«Перевірити» (Check)**.
> 7. The card lists public posts matching the keyword. Each entry is labelled
>    «ключове слово» (keyword) with the matched term and the author's username.
>    Posts from the connected account itself are filtered out.
> 8. Press **«Відкрити» (Open)** on any entry to view the original post on
>    Threads.
>
> The interface is in Ukrainian. English labels are given in brackets above.

Розглянути перемикач мови на англійську перед подачею — рев'ювер не зобов'язаний
читати українську, і незрозумілий інтерфейс сам по собі є причиною відмови.

---

## 4. Чек-лист перед подачею

- [ ] OAuth-екран «Connect Threads account» працює, обмін коду на сервері
- [ ] Privacy Policy у ефірі: <https://rayofgoodness.github.io/threads-agent/privacy.html>
- [ ] Data Deletion у ефірі: <https://rayofgoodness.github.io/threads-agent/data-deletion.html>
- [ ] Terms: <https://rayofgoodness.github.io/threads-agent/terms.html>
- [ ] Redirect URI в Use Case збігається з тим, що в коді
- [ ] Скрінкаст без склейок, текст читабельний, є англійські субтитри
- [ ] У use case жодного слова про автоматичні відповіді або збір датасету
- [ ] Порожня видача чесно підписана, мок (якщо є) позначений

## 5. Строки

App Review 2–4 тижні на дозвіл. Заявку на `threads_manage_mentions`
(`/me/mentions` → `code 10`, subcode 4279067) подавати **окремо**: відмова по
одному дозволу не тягне за собою другий, а спільна заявка ускладнює опис.
