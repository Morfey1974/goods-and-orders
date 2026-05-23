# WEB Order Management — учёт заказов (עוסק פטור)

Веб-приложение для малого бизнеса в Израиле: клиенты, каталог, склад, заказы, документы (הצעת מחיר / חשבון חיוב / קבלה), профиль עוסק פטור.

Подробный план: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)  
Палитра цветов: [docs/color-palette.html](docs/color-palette.html)

**Удалённый репозиторий:** https://github.com/Morfey1974/goods-and-orders

---

## Требования

| Компонент | Версия |
|-----------|--------|
| Windows 10/11 | |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | PostgreSQL + API в контейнерах |
| [.NET 9 SDK](https://dotnet.microsoft.com/download) | локальный запуск API (опционально) |
| [Node.js 20+](https://nodejs.org/) | фронтенд |

---

## Быстрый старт

### 1. Клонировать и запустить API + БД (Docker)

```powershell
git clone https://github.com/Morfey1974/goods-and-orders.git
cd goods-and-orders

copy .env.example .env   # опционально: JWT_SECRET

docker compose up -d --build
```

Дождитесь готовности (30–60 с). **Миграции БД применяются автоматически** при старте API.

| Сервис | URL |
|--------|-----|
| API | http://localhost:8080 |
| Swagger | http://localhost:8080/swagger |
| Health | http://localhost:8080/api/health |
| PostgreSQL | `localhost:5432` — `ordermgmt` / `ordermgmt_dev` / `ordermgmt` |

### 2. Фронтенд

В **новом** окне PowerShell:

```powershell
cd src\order-management-web
npm install
npm run dev
```

| Сервис | URL |
|--------|-----|
| Веб-интерфейс | http://localhost:5173 |

Прокси `/api` → `http://localhost:8080` задан в `vite.config.ts`.

### 3. Первый вход

1. http://localhost:5173 → **Регистрация**  
2. **Настройки** — профиль, контакты, банк, логотип, подпись, PDF для клиентов  
3. Язык: עברית / Русский / English (RTL для иврита)

---

## После обновления кода (`git pull`)

Обязательно **пересоберите контейнер API**, иначе новые эндпоинты (загрузка файлов и т.д.) вернут 404:

```powershell
docker compose up -d --build api
```

Фронтенд при изменениях UI:

```powershell
cd src\order-management-web
npm install
npm run dev
```

---

## Запуск с рабочего стола (Windows)

| Ярлык | Действие |
|-------|----------|
| **Zapusk - Uchet zakazov** | Docker + API + веб + браузер |
| **Ostanovit - Uchet zakazov** | Остановка |

Перед запуском: **Docker Desktop** → Engine running.  
Ярлыки: `scripts\Установить ярлыки на рабочий стол.bat`

---

## Настройки бизнеса (вкладка «Настройки»)

| Раздел | Содержание |
|--------|------------|
| Общие данные | Название, ת.ז., עוסק, категория, адрес |
| Контакты | Email (редактируемый), телефоны, сайт, язык |
| Логотип и подпись | JPG/PNG/WebP → для будущих PDF-документов |
| Документы для клиентов | PDF: אישור חשבון, כרטיס חברה, ניהול ספרים, ניכוי מס — загрузка и **отправка по email** |
| Банковские реквизиты | Код банка (справочник IL), филиал, счёт, SWIFT/ABA/IBAN |

Файлы хранятся в Docker-volume `ordermgmt_uploads` (путь в контейнере: `/app/uploads`).

---

## Email (SMTP) — пока заглушка

В `src/OrderManagement.Api/appsettings.json`:

```json
"Email": {
  "Enabled": false
}
```

При `Enabled: false` кнопка «Отправить файлы по email» **не шлёт письмо**, а показывает сообщение о режиме заглушки (запрос логируется на сервере).  
Когда будут данные SMTP — установите `Enabled: true` и заполните `SmtpHost`, `SmtpPort`, `SmtpUser`, `SmtpPassword`, `FromAddress` (реализация отправки в `TenantEmailService`).

---

## Подписка / trial

```json
"Subscription": {
  "EnforcementEnabled": false,
  "TrialDays": 30
}
```

Docker: `SUBSCRIPTION_ENFORCEMENT=false` в `.env`.

---

## Остановка Docker

```powershell
docker compose down
```

Удалить **все** данные (БД + загруженные файлы):

```powershell
docker compose down -v
```

---

## Структура проекта

```
├── docker-compose.yml
├── docs/
├── scripts/                    # ярлыки запуска
├── src/
│   ├── OrderManagement.Api/    # .NET 9 Web API
│   └── order-management-web/   # React + Vite + i18n (ru/en/he)
└── README.md
```

---

## API (основное)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/register`, `/login` | Регистрация / вход |
| GET/PUT | `/api/tenant/profile` | Профиль |
| PUT | `/api/tenant/bank-details` | Банк |
| GET | `/api/tenant/assets` | Сводка: лого, подпись, PDF |
| POST/DELETE | `/api/tenant/assets/logo`, `/signature` | Брендинг |
| POST/DELETE | `/api/tenant/assets/compliance/{kind}` | PDF (`AccountOwnership`, `BusinessCard`, `BooksManagement`, `WithholdingTax`) |
| POST | `/api/tenant/assets/compliance/send-email` | Отправка PDF (SMTP stub) |
| … | `/api/customers`, `/products`, `/orders`, `/documents` | Справочники и документы |

Полный список — Swagger: http://localhost:8080/swagger

---

## Устранение неполадок

| Проблема | Решение |
|----------|---------|
| Ошибка при загрузке PDF / 404 на `/api/tenant/assets` | `docker compose up -d --build api` |
| `Only PDF files are allowed` при корректном PDF | Обновите API (см. выше); допускается `application/octet-stream` |
| Docker не стартует | Запустите Docker Desktop |
| API недоступен | `docker compose ps` — сервис `api` Up |
| CORS | Добавьте origin в `Cors:Origins` в `appsettings.json` |
| Порт 5432 занят | Смените порт в `docker-compose.yml` или остановите другой PostgreSQL |

---

## Лицензия / разработка

Частный проект. Вопросы и доработки — через issues в GitHub-репозитории.
